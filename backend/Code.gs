/* Survey back end on Google Apps Script + Google Sheets. One web app, called by the research website.
   Every request is a POST with a JSON body {action, token?, ...}. A body without action but with meta is a survey record (online answers).
   Script properties (Project Settings → Script properties):
     PHASE     "test" | "pilot" | "live" — set by an admin from the survey page (codes pilot / begin / test), with the EC approval number.
               test: only test records are saved · pilot: field pilot (Stage 1.2) records go to the pilot sheets · live: main survey (Stage 1.3)
     ACCEPT    kept in step with PHASE ("1" only when live) for older pages
     DELETE_BY date by which phone numbers must be deleted, e.g. 2570-06-30
     SECRET    created by setup(); signs sign-in tokens. Changing it signs everyone out.
     SHEET_ID  optional; leave empty when this script is bound to the spreadsheet
   Modes (meta.mode): 0 paper keyed by a collector · 1 read aloud by a collector · 2 online, no collector (code digit 9)
                      3 online on the respondent's own phone from a collector's one-time QR (code digit = that collector) */

var SHEETS = { responses: "คำตอบ", conjoint: "คู่ผู้สมัคร", contacts: "เบอร์ติดต่อ (ลบหลังสัมภาษณ์)", log: "บันทึกระบบ" };
var PILOT_SHEETS = { responses: "คำตอบ (นำร่อง)", conjoint: "คู่ผู้สมัคร (นำร่อง)" };   // pilot answers never mix with the main data
function phase_() { var p = props_(), v = p.getProperty("PHASE"); if (v === "pilot" || v === "live" || v === "test") return v; return p.getProperty("ACCEPT") === "1" ? "live" : "test"; }
var RESP_HEADER = ["code", "rid", "collector", "inv", "received", "test", "flag", "json"];
var CONTACT_HEADER = ["code", "phone", "best_time", "consented", "delete_by"];
var TZ = "Asia/Bangkok";

function props_() { return PropertiesService.getScriptProperties(); }
function book_() { var id = props_().getProperty("SHEET_ID"); return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name, header) {
  var b = book_(), s = b.getSheetByName(name);
  if (!s) { s = b.insertSheet(name); s.appendRow(header); s.setFrozenRows(1); s.getRange(1, 1, 1, header.length).setFontWeight("bold"); }
  return s;
}
function log_(who, what) { sheet_(SHEETS.log, ["เวลา", "ผู้ใช้", "รายการ"]).appendRow([new Date(), who || "-", what]); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function todayISO_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd"); }

/** Run once from the editor: creates the sheets, the signing key, and the first admin account (password printed in the execution log). */
function setup() {
  sheet_(SHEETS.responses, RESP_HEADER);
  sheet_(SHEETS.conjoint, ["code", "test", "task", "pair", "item", "chosen_side", "chosen_name", "left_name", "right_name", "left_look", "right_look", "ms"]);
  sheet_(SHEETS.contacts, CONTACT_HEADER);
  sheet_(SHEETS.log, ["เวลา", "ผู้ใช้", "รายการ"]);
  usersSheet_();
  var p = props_();
  if (!p.getProperty("ACCEPT")) p.setProperty("ACCEPT", "0");
  if (!p.getProperty("DELETE_BY")) p.setProperty("DELETE_BY", "2570-06-30");
  secret_();
  log_("editor", "setup");
  if (!readUsers_().some(function (u) { return u.role === "admin"; })) return resetAdminPassword();
  Logger.log("มีบัญชีผู้ดูแลอยู่แล้ว ถ้าลืมรหัสผ่าน ให้เรียกใช้ resetAdminPassword");
}

/* ---------------- router ---------------- */
var API = {
  submit: apiSubmit_, login: apiLogin_, me: apiMe_, changePassword: apiChangePassword_, mine: apiMine_,
  data: apiData_, detail: apiDetail_, contacts: apiContacts_, deleteContacts: apiDeleteContacts_, exportCsv: apiExport_,
  users: apiUsers_, addUser: apiAddUser_, resetPassword: apiResetPassword_, setUser: apiSetUser_,
  seedTest: apiSeedTest_, clearTest: apiClearTest_, invite: apiInvite_, invites: apiInvites_, cancelInvite: apiCancelInvite_, checkInvite: apiCheckInvite_,
  progress: apiProgress_, calendar: apiCalendar_, setDay: apiSetDay_, setPhase: apiSetPhase_,
};
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    var body = JSON.parse(e.postData.contents);
    var action = body.action || (body.meta ? "submit" : "");
    if (!API[action]) return out_({ ok: false, error: "ไม่รู้จักคำสั่ง" });
    var res = API[action](body) || {};
    res.ok = true;
    return out_(res);
  } catch (err) {
    return out_({ ok: false, auth: !!(err && err.auth), forbidden: !!(err && err.forbidden), error: String(err && err.message || err) });
  } finally { try { lock.releaseLock(); } catch (x) {} }
}
/** Opening the web app URL in a browser shows nothing but a status line: the data is reached only through the website after signing in. */
function doGet() { var ph = phase_(); return out_({ ok: true, service: "buriram-survey", accept: ph === "live", phase: ph }); }

/* ---------------- collection ---------------- */
function validDate_(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) throw new Error("วันที่เก็บข้อมูลไม่ถูกต้อง");
  var d = new Date(iso + "T12:00:00+07:00").getTime(), now = Date.now();
  if (isNaN(d) || d > now + 36 * 3600e3) throw new Error("วันที่เก็บข้อมูลเป็นวันในอนาคต");
  if (d < now - 120 * 24 * 3600e3) throw new Error("วันที่เก็บข้อมูลเก่ากว่า 120 วัน ตรวจวันที่อีกครั้ง");
  return iso;
}

/** Saves one record. The respondent code is issued here, after the form is complete. */
function apiSubmit_(body) {
  var rec = body.rec || body, m = rec.meta = rec.meta || {};
  var isTest = !!m.test, ph = phase_(), pilot = !isTest && m.phase === "pilot";
  if (pilot && ph !== "pilot") throw new Error("ระบบไม่ได้อยู่ในช่วงนำร่องแล้ว คำตอบนำร่องชุดนี้จึงไม่ถูกบันทึก");
  if (!isTest && !pilot && ph !== "live") throw new Error(ph === "pilot" ? "ตอนนี้เป็นช่วงนำร่อง ยังไม่เปิดเก็บข้อมูลจริง" : "ระบบยังไม่เปิดรับข้อมูลจริง");
  if (!m.id || String(m.id).length < 6) throw new Error("คำตอบไม่มีเลขอ้างอิง");
  var mode = +m.mode, enumr, collector = "", cdate;
  if (mode === 3) {                                     // answered on the respondent's own phone from a collector's QR
    var o = readInvite_(body.invite, INVITE_GRACE_MIN), used = inviteUsed_(o.i);
    if (used && used !== String(m.id)) throw new Error("QR นี้ถูกใช้ตอบไปแล้ว หนึ่ง QR ใช้ได้หนึ่งคน");
    enumr = o.e; collector = o.u; cdate = todayISO_(); m.inv = o.i; m.venue = o.v;
  }
  else if (mode === 2) throw new Error("ปิดการตอบออนไลน์ทางไกลแล้ว ทุกชุดต้องตอบต่อหน้าผู้เก็บข้อมูล");
  else if (mode === 0 || mode === 1) { var u = auth_(body.token, "collector"); enumr = u.enumerator; collector = u.username; cdate = validDate_(m.cdate); }
  else throw new Error("ไม่ทราบวิธีตอบ");
  return saveRecord_(rec, enumr, collector, cdate, pilot);
}
function saveRecord_(rec, enumr, collector, cdate, pilot) {
  var m = rec.meta, isTest = !!m.test, SH = pilot ? PILOT_SHEETS : SHEETS;
  if (pilot) delete rec.contact;                             // pilot respondents are not invited to Phase 2: no phone number is kept
  var R = sheet_(SH.responses, RESP_HEADER);
  var data = R.getDataRange().getValues(), header = data[0].map(String), ci = header.indexOf("code"), ri = header.indexOf("rid"), ji = header.indexOf("json");
  for (var i = 1; i < data.length; i++) if (ri >= 0 && String(data[i][ri]) === String(m.id)) return { code: String(data[i][ci]), again: true };   // the same form sent twice
  var codes = data.slice(1).map(function (r) { return String(r[ci]); });

  var code = issueCode(rec, LGUS, cdate, enumr, codes.map(function (c) { return c.replace(/^P-/, ""); }));
  m.code = code; m.enumerator = enumr; m.collector = collector; m.cdate = cdate; m.collectedBE = +cdate.slice(0, 4) + 543;
  var errs = checkCode(code, LGUS, rec);
  if (errs.length) throw new Error(errs.join(" · "));
  if (pilot) { code = "P-" + code; m.code = code; m.phase = "pilot"; }

  var others = [];
  data.slice(1).forEach(function (r) { try { var j = JSON.parse(r[ji]); if (j.answers && j.answers["1"] === rec.answers["1"]) others.push({ code: String(r[ci]), answers: j.answers }); } catch (x) {} });
  var dupOf = findLikelyDuplicate(rec, others);

  var contact = rec.contact; delete rec.contact;            // phone numbers never enter the responses sheet
  var flat = flattenRecord(rec);
  flat.received = new Date(); flat.flag = dupOf ? "อาจซ้ำกับ " + dupOf : "";
  flat.json = JSON.stringify({ answers: rec.answers, text: rec.text, ipc: rec.ipc });
  var row = rowForHeader(header, flat);
  if (header.length > data[0].length) R.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight("bold");
  R.appendRow(row);

  var C = sheet_(SH.conjoint, ["code"]);
  (rec.conjoint || []).forEach(function (t) {
    var side = t.chosen === "L" ? t.left : t.chosen === "R" ? t.right : null;
    C.appendRow([code, isTest ? 1 : 0, t.task, t.pair, t.item || "", t.chosen || "", side ? side.name : "", t.left ? t.left.name : "", t.right ? t.right.name : "",
      JSON.stringify(t.left ? t.left.look : ""), JSON.stringify(t.right ? t.right.look : ""), t.ms || ""]);
  });
  if (contact && contact.phone) {
    sheet_(SHEETS.contacts, CONTACT_HEADER).appendRow([code, "'" + String(contact.phone).replace(/\D/g, ""), contact.time || "", new Date(), props_().getProperty("DELETE_BY") || ""]);
  }
  return { code: code, flag: flat.flag };
}

/** An enumerator's own recent forms: code and time only, never answers. Used to write codes onto paper forms. */
function apiMine_(b) {
  var u = auth_(b.token, "any");
  var v = sheet_(SHEETS.responses, RESP_HEADER).getDataRange().getValues(), h = v[0].map(String);
  var c = { code: h.indexOf("code"), rid: h.indexOf("rid"), who: h.indexOf("collector"), rec: h.indexOf("received"), test: h.indexOf("test") };
  var rows = v.slice(1).filter(function (r) { return String(r[c.who]) === u.username; }).slice(-60).reverse()
    .map(function (r) { return { code: String(r[c.code]), ref: String(r[c.rid]), received: r[c.rec] ? new Date(r[c.rec]).toISOString() : "", test: +r[c.test] === 1 }; });
  return { rows: rows };
}

/* ---------------- progress for the field map (any signed-in account) ----------------
   Counts only: per LAO code, [Gen Z men, Gen Z women, other men, other women, sex not counted in the quota]. No answers, codes or names leave the sheet. */
function apiProgress_(b) {
  auth_(b.token, "any");
  var v = sheet_(SHEETS.responses, RESP_HEADER).getDataRange().getValues(), h = v[0].map(String);
  var ci = h.indexOf("code"), ti = h.indexOf("test"), si = h.indexOf("q2");
  var real = {}, test = {};
  v.slice(1).forEach(function (r) {
    var m = CODE_RE.exec(String(r[ci])); if (!m) return;
    var t = +r[ti] === 1 ? test : real, lc = m[2] + m[3];
    var a = t[lc] || (t[lc] = [0, 0, 0, 0, 0]);
    var cell = quotaCell(m[1] === "Z" ? "Z" : "O", si >= 0 ? +r[si] : 0);
    a[cell >= 0 ? cell : 4]++;
  });
  return { real: real, test: test, accept: phase_() === "live", phase: phase_(), at: new Date().toISOString() };
}

/* ---------------- team calendar: who is free on which day (any signed-in account) ----------------
   Sheet "ตารางว่าง": one row per account per day. Everyone signed in sees the whole team; each account edits only its own days.
   Range: from the first day of the current month to CAL_END. Past days cannot be changed. */
var CAL_SHEET = "ตารางว่าง", CAL_HEADER = ["date", "username", "name", "status", "note", "updated"], CAL_END = "2027-04-30";
var CAL_STATUS = { free: "ว่าง", busy: "ไม่ว่าง", half: "ว่างบางช่วง" };
function calISO_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, "yyyy-MM-dd") : String(v || "").slice(0, 10); }
function calRows_() {
  var sh = sheet_(CAL_SHEET, CAL_HEADER), v = sh.getDataRange().getValues();
  return v.slice(1).map(function (r, k) { return { row: k + 2, d: calISO_(r[0]), u: String(r[1]).toLowerCase(), n: String(r[2] || ""), s: String(r[3] || ""), t: String(r[4] || "") }; });
}
function apiCalendar_(b) {
  var me = auth_(b.token, "any"), today = todayISO_(), from = today.slice(0, 8) + "01";
  var rows = calRows_().filter(function (o) { return o.d >= from && o.d <= CAL_END && (o.s || o.t); })
    .map(function (o) { return { d: o.d, u: o.u, s: o.s, t: o.t }; });
  var members = readUsers_().filter(function (u) { return u.active; })
    .map(function (u) { return { u: u.username, n: String(u.name || u.username), role: u.role, e: u.enumerator || 0 }; });
  return { me: me.username, today: today, from: from, to: CAL_END, members: members, rows: rows };
}
function apiSetDay_(b) {
  var me = auth_(b.token, "any"), today = todayISO_();
  var days = [].concat(b.days || b.d || []).map(String).filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); });
  if (!days.length) throw new Error("ไม่ได้เลือกวัน");
  if (days.length > 62) throw new Error("เลือกได้ครั้งละไม่เกิน 62 วัน");
  var s = String(b.s || ""), t = String(b.t || "").replace(/[\r\n]+/g, " ").trim().slice(0, 200);
  if (s && !CAL_STATUS[s]) throw new Error("สถานะไม่ถูกต้อง");
  days.forEach(function (d) {
    if (d < today) throw new Error("วันที่ " + d + " ผ่านไปแล้ว แก้ไม่ได้");
    if (d > CAL_END) throw new Error("ปฏิทินเปิดถึง " + CAL_END + " เท่านั้น");
  });
  var sh = sheet_(CAL_SHEET, CAL_HEADER), rows = calRows_(), idx = {};
  rows.forEach(function (o) { if (o.u === me.username) idx[o.d] = o.row; });
  var stamp = new Date(), name = String(me.name || me.username);
  days.forEach(function (d) {
    var vals = ["'" + d, me.username, name, s, t, stamp];
    if (idx[d]) sh.getRange(idx[d], 1, 1, vals.length).setValues([vals]);
    else sh.appendRow(vals);
  });
  log_(me.username, "ปฏิทิน: " + (s ? CAL_STATUS[s] : "ล้าง") + " " + days.length + " วัน");
  return apiCalendar_(b);
}

/* ---------------- phase switch (admin only): typed on the survey page as pilot / begin / test ----------------
   Pilot and main collection start only after EC approval, so the approval number is required and written to the log. */
function apiSetPhase_(b) {
  var u = auth_(b.token, "admin"), to = String(b.phase || ""), ec = String(b.ec || "").trim().slice(0, 60);
  if (["test", "pilot", "live"].indexOf(to) < 0) throw new Error("ไม่รู้จักโหมดนี้");
  if (to !== "test" && ec.length < 3) throw new Error("ใส่เลขที่หนังสือรับรองจริยธรรม (EC) ก่อนเปิดเก็บข้อมูล");
  var p = props_(), from = phase_();
  p.setProperty("PHASE", to); p.setProperty("ACCEPT", to === "live" ? "1" : "0");
  if (to !== "test") p.setProperty("EC_NO", ec);
  p.setProperty("PHASE_AT", new Date().toISOString());
  log_(u.username, "เปลี่ยนโหมด " + from + " → " + to + (ec ? " · EC " + ec : ""));
  return { phase: to, from: from, ec: p.getProperty("EC_NO") || "" };
}

/* ---------------- data (admin only) ---------------- */
function apiData_(b) {
  var me = auth_(b.token, "admin");
  var R = sheet_(SHEETS.responses, RESP_HEADER);
  var v = R.getDataRange().getValues(), h = v[0].map(String);
  var col = function (n) { return h.indexOf(n); };
  var c = { code: col("code"), who: col("collector"), rec: col("received"), test: col("test"), flag: col("flag"), sex: col("q2"), d: col("q3_district"), t: col("q3_tambon"), mode: col("mode"), P: col("ipc_P"), I: col("ipc_I"), C: col("ipc_C"), q63: col("q63"), q75: col("q75") };   // q63 = phase-2 consent in v1.8 (q75 in v1.5)
  var rows = v.slice(1).map(function (r) {
    var g = function (k) { return c[k] >= 0 ? r[c[k]] : ""; };
    return { code: String(g("code")), collector: String(g("who")), received: g("rec") ? new Date(g("rec")).toISOString() : "", test: +g("test") === 1, flag: g("flag"), sex: +g("sex") || 0, district: g("d"), tambon: g("t"),
      mode: g("mode"), P: g("P"), I: g("I"), C: g("C"), phase2: +g("q63") === 1 || +g("q75") === 1 };
  });
  var K = sheet_(SHEETS.contacts, CONTACT_HEADER).getLastRow() - 1;
  return { rows: rows, lgus: LGUS, district: DISTRICT_TARGET, contacts: Math.max(0, K), accept: phase_() === "live", phase: phase_(), ec: props_().getProperty("EC_NO") || "",
    deleteBy: props_().getProperty("DELETE_BY") || "", sheetUrl: book_().getUrl(), me: publicUser_(me) };
}
function apiDetail_(b) {
  auth_(b.token, "admin");
  var v = sheet_(SHEETS.responses, RESP_HEADER).getDataRange().getValues(), h = v[0].map(String), ci = h.indexOf("code"), ji = h.indexOf("json");
  for (var i = 1; i < v.length; i++) if (String(v[i][ci]) === String(b.code)) return { json: v[i][ji] };
  return { json: null };
}
function apiContacts_(b) {
  var me = auth_(b.token, "admin");
  var v = sheet_(SHEETS.contacts, CONTACT_HEADER).getDataRange().getValues();
  log_(me.username, "เปิดดูรายชื่อเบอร์ติดต่อ");
  return { contacts: v.slice(1).map(function (r) { return { code: String(r[0]), phone: String(r[1]).replace(/^'/, ""), time: String(r[2] || ""), consented: r[3] ? new Date(r[3]).toISOString() : "", deleteBy: String(r[4] || "") }; }) };
}
function apiDeleteContacts_(b) {
  var me = auth_(b.token, "admin");
  if (b.confirm !== "ลบเบอร์ทั้งหมด") throw new Error("พิมพ์ข้อความยืนยันไม่ตรง");
  var K = sheet_(SHEETS.contacts, CONTACT_HEADER), n = K.getLastRow() - 1;
  if (n > 0) K.deleteRows(2, n);
  log_(me.username, "ลบเบอร์ติดต่อทั้งหมด " + n + " รายการ");
  return { deleted: Math.max(0, n) };
}

/** Data set as CSV. Phone numbers are never part of it. which = "responses" | "conjoint"; test rows only when asked. */
function apiExport_(b) {
  var me = auth_(b.token, "admin");
  var which = b.which === "conjoint" ? SHEETS.conjoint : SHEETS.responses;
  var v = sheet_(which, ["code"]).getDataRange().getValues(), h = v[0].map(String), ti = h.indexOf("test"), ji = h.indexOf("json");
  var keep = h.map(function (_, i) { return i !== ji; });
  var cell = function (x) { if (x instanceof Date) x = Utilities.formatDate(x, TZ, "yyyy-MM-dd HH:mm:ss"); x = x === null || x === undefined ? "" : String(x); return /[",\n\r]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
  var rows = v.filter(function (r, i) { return i === 0 || b.includeTest || +r[ti] !== 1; });
  var csv = rows.map(function (r) { return r.filter(function (_, i) { return keep[i]; }).map(cell).join(","); }).join("\r\n");
  log_(me.username, "ดาวน์โหลดชุดข้อมูล " + which + " " + (rows.length - 1) + " แถว");
  return { csv: "﻿" + csv, rows: rows.length - 1, name: (b.which === "conjoint" ? "conjoint" : "responses") + "_" + Utilities.formatDate(new Date(), TZ, "yyyyMMdd-HHmm") + ".csv" };
}

/** Fake records for testing the pipeline before EC approval. They carry test = 1. */
function apiSeedTest_(b) {
  var me = auth_(b.token, "admin");
  var n = Math.min(+b.n || 20, 100), made = 0, cdate = todayISO_(), BE = +cdate.slice(0, 4) + 543;
  for (var i = 0; i < n; i++) {
    var L = LGUS[Math.floor(Math.random() * LGUS.length)], y = BE - (18 + Math.floor(Math.random() * 60)), enumr = 1 + Math.floor(Math.random() * 4);
    var ans = { "1": y, "2": 1 + Math.floor(Math.random() * 2), "3": { a: L.d, t: L.t[0] }, "4": L.n, "5": 1, "6": 1, "63": Math.random() < .3 ? 1 : 2 };
    var rec = { meta: { id: "seed" + Utilities.getUuid().slice(0, 8), test: true, mode: 1, venue: 1, started: new Date().toISOString(), finished: new Date().toISOString() }, answers: ans, text: {},
      ipc: { I: Math.floor(Math.random() * 19), P: Math.floor(Math.random() * 19), C: Math.floor(Math.random() * 19), complete: true }, conjoint: [] };
    if (ans["63"] === 1) rec.contact = { phone: "08" + Math.floor(10000000 + Math.random() * 89999999), time: "เย็น" };
    try { saveRecord_(rec, enumr, "seed", cdate); made++; } catch (x) {}
  }
  log_(me.username, "สร้างข้อมูลทดสอบ " + made + " ชุด");
  return { made: made };
}
function apiClearTest_(b) {
  var me = auth_(b.token, "admin");
  var n = 0;
  [SHEETS.responses, SHEETS.conjoint].forEach(function (name) {
    var s = sheet_(name, ["code"]), v = s.getDataRange().getValues(), ti = v[0].map(String).indexOf("test");
    for (var i = v.length - 1; i >= 1; i--) if (+v[i][ti] === 1) { s.deleteRow(i + 1); if (name === SHEETS.responses) n++; }
  });
  var keep = sheet_(SHEETS.responses, ["code"]).getDataRange().getValues().slice(1).map(function (r) { return String(r[0]); });
  var K = sheet_(SHEETS.contacts, CONTACT_HEADER), kv = K.getDataRange().getValues();
  for (var j = kv.length - 1; j >= 1; j--) if (keep.indexOf(String(kv[j][0])) < 0) K.deleteRow(j + 1);
  log_(me.username, "ลบข้อมูลทดสอบ " + n + " ชุด");
  return { deleted: n };
}
