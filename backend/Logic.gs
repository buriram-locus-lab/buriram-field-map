/* Pure helpers shared by Code.gs (Apps Script) and the local tests (Node). No Google services in this file. */

// Respondent code: Gen + LGU + DDMM + enumerator + set, e.g. ZT05-1501-103
var CODE_RE = /^([ZYXB])([NMTAU])(\d{2})-(\d{2})(\d{2})-([1-9])(\d{2}|\?\?)$/;
var GEN_LABEL = { Z: "Z 18–29 ปี", Y: "Y 30–45 ปี", X: "X 46–61 ปี", B: "B 62 ปีขึ้นไป" };

function genFromAge(age) { return age <= 29 ? "Z" : age <= 45 ? "Y" : age <= 61 ? "X" : "B"; }

/** Check a code against the LGU table and the respondent's answers. Returns a list of problems (empty = ok). */
function checkCode(code, lgus, rec) {
  var m = CODE_RE.exec(code || "");
  if (!m) return ["รูปแบบรหัสไม่ถูกต้อง ต้องเป็นแบบ ZT05-1501-103"];
  var errs = [];
  var lc = m[2] + m[3];
  if (m[2] === "U") { if (m[3] !== "00") errs.push("อปท. ที่ไม่ทราบต้องเขียน U00"); }
  else {
    var hit = null;
    for (var i = 0; i < lgus.length; i++) if (lgus[i].code === lc) hit = lgus[i];
    if (!hit) errs.push("ไม่มี อปท. รหัส " + lc + " (ตัวอักษรต้องตรงกับประเภทของเลข " + m[3] + ")");
  }
  var dd = +m[4], mm = +m[5];
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) errs.push("วันที่ในรหัสไม่ถูกต้อง");
  if (rec && rec.answers && rec.answers["1"] && rec.meta && rec.meta.collectedBE) {
    var age = rec.meta.collectedBE - rec.answers["1"];
    if (genFromAge(age) !== m[1]) errs.push("รุ่นในรหัส (" + m[1] + ") ไม่ตรงกับปีเกิด " + rec.answers["1"] + " ซึ่งควรเป็น " + genFromAge(age));
  }
  return errs;
}

/** Next free set number for online answers (enumerator 9) on a given DDMM. */
function nextOnlineSeq(existingCodes, ddmm) {
  var max = 0;
  existingCodes.forEach(function (c) {
    var m = CODE_RE.exec(c);
    if (m && m[4] + m[5] === ddmm && m[6] === "9" && m[7] !== "??") max = Math.max(max, +m[7]);
  });
  if (max >= 99) throw new Error("เลขชุดออนไลน์ของวันนี้เต็ม 99 ชุดแล้ว");
  return ("0" + (max + 1)).slice(-2);
}

/** Smallest set number not yet used by this enumerator on this date (key = "DDMM-ESS"). */
function nextFreeSeq(existingCodes, key) {
  var pre = key.slice(0, 6), used = {};
  existingCodes.forEach(function (c) { var k = codeKey(c); if (k.slice(0, 6) === pre) used[+k.slice(6)] = true; });
  for (var n = 1; n <= 99; n++) if (!used[n]) return n;
  return null;
}

/** LGU code from item 4 (name of the LGU), else from item 3 when the tambon belongs to one LGU only, else U00. */
function lguCodeFor(answers, lgus) {
  var name = answers && answers["4"];
  for (var i = 0; i < lgus.length; i++) if (lgus[i].n === name) return lgus[i].code;
  var d = (answers && answers["3"]) || {};
  if (d.a && d.t) {
    var hit = lgus.filter(function (l) { return l.d === d.a && l.t.indexOf(d.t) >= 0; });
    if (hit.length === 1) return hit[0].code;
  }
  return "U00";
}

/** Code issued by the server: Gen from birth year at the collection date, LGU from the answers, set = next free number. */
function issueCode(rec, lgus, cdateISO, enumerator, existingCodes) {
  var y = +(rec.answers && rec.answers["1"]);
  if (!y) throw new Error("ไม่มีปีเกิด (ข้อ 1) จึงออกรหัสไม่ได้");
  if (y > 2551) throw new Error("ผู้ตอบเกิดหลังปี 2551 ไม่มีสิทธิเลือกตั้ง");
  var be = +cdateISO.slice(0, 4) + 543, ddmm = cdateISO.slice(8, 10) + cdateISO.slice(5, 7);
  var seq = nextFreeSeq(existingCodes, ddmm + "-" + enumerator + "00");
  if (!seq) throw new Error("เลขชุดของผู้เก็บ " + enumerator + " วันนี้เต็ม 99 ชุดแล้ว");
  return genFromAge(be - y) + lguCodeFor(rec.answers, lgus) + "-" + ddmm + "-" + enumerator + ("0" + seq).slice(-2);
}

/** Uniqueness key: date + enumerator + set. Gen and LGU only describe the respondent. */
function codeKey(code) { var m = CODE_RE.exec(code); return m ? m[4] + m[5] + "-" + m[6] + m[7] : code; }

/** Share of identical answers between two answer maps over the items both answered. */
function sameAnswerShare(a, b) {
  var n = 0, same = 0;
  Object.keys(a).forEach(function (k) {
    if (k === "3" || b[k] === undefined) return;
    n++; if (JSON.stringify(a[k]) === JSON.stringify(b[k])) same++;
  });
  return n ? same / n : 0;
}

/** Possible duplicate respondent: same birth year, sex and tambon, and ≥ 90 % identical answers. */
function findLikelyDuplicate(rec, others) {
  var A = rec.answers, t = A["3"] && A["3"].t;
  for (var i = 0; i < others.length; i++) {
    var B = others[i].answers;
    if (!B || B["1"] !== A["1"] || B["2"] !== A["2"] || !B["3"] || B["3"].t !== t) continue;
    if (sameAnswerShare(A, B) >= 0.9) return others[i].code;
  }
  return null;
}

/** Flatten one record into a column map for the responses sheet. Contact details never go here. */
function flattenRecord(rec) {
  var row = {}, m = rec.meta || {};
  row.code = m.code; row.rid = m.id; row.collector = m.collector || ""; row.inv = m.inv || ""; row.test = m.test ? 1 : 0; row.started = m.started; row.finished = m.finished; row.seconds = m.seconds;
  row.mode = m.mode; row.venue = m.venue; row.enumerator = m.enumerator; row.version = m.version; row.order = m.order; row.gsize = m.gsize; row.gcode = m.gcode; row.instrument = m.instrument || "";
  var A = rec.answers || {};
  Object.keys(A).forEach(function (k) {
    var v = A[k];
    if (k === "3" && v && typeof v === "object") { row.q3_district = v.a || ""; row.q3_tambon = v.t || ""; row.q3_moo = v.m || ""; return; }
    row["q" + k] = Array.isArray(v) ? v.join(";") : v;
  });
  var T = rec.text || {};
  Object.keys(T).forEach(function (k) { if (T[k]) row["q" + k + "_text"] = T[k]; });
  if (rec.ipc) { row.ipc_I = rec.ipc.I; row.ipc_P = rec.ipc.P; row.ipc_C = rec.ipc.C; }
  return row;
}

/** Ordered values for a header; grows the header with new columns it has not seen. */
function rowForHeader(header, obj) {
  Object.keys(obj).forEach(function (k) { if (header.indexOf(k) < 0) header.push(k); });
  return header.map(function (h) { return obj[h] === undefined || obj[h] === null ? "" : obj[h]; });
}

/** Quota cell of a respondent: 0 Gen Z ชาย · 1 Gen Z หญิง · 2 รุ่นอื่น ชาย · 3 รุ่นอื่น หญิง (sex 3 = ไม่ระบุ → -1) */
function quotaCell(gen, sex) { if (sex !== 1 && sex !== 2) return -1; return (gen === "Z" ? 0 : 2) + (sex === 2 ? 1 : 0); }

if (typeof module !== "undefined") module.exports = { lguCodeFor: lguCodeFor, issueCode: issueCode, CODE_RE: CODE_RE, genFromAge: genFromAge, checkCode: checkCode, nextOnlineSeq: nextOnlineSeq, codeKey: codeKey, nextFreeSeq: nextFreeSeq, sameAnswerShare: sameAnswerShare, findLikelyDuplicate: findLikelyDuplicate, flattenRecord: flattenRecord, rowForHeader: rowForHeader, quotaCell: quotaCell };
