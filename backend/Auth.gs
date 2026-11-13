/* Accounts and sign-in for the research website.
   - Users live in the sheet "ผู้ใช้" (only the spreadsheet owner can open it). Passwords are stored as salted SHA-256 iterated 1,000 times.
   - Signing in returns a token signed with HMAC-SHA256 (key in the SECRET script property). The website keeps it and sends it with each request.
   - Roles: admin = researchers and advisor (see the data, manage accounts) · enumerator = collects data only.
   - An account with an enumerator number (1–8) can submit interviewer-administered forms; the number comes from the account, not the device. */

var USERS = "ผู้ใช้";
var USER_HEADER = ["username", "name", "role", "enumerator", "hash", "ver", "active", "must_change", "created", "last_login"];
var TOKEN_HOURS = { admin: 12, enumerator: 72 }, REMEMBER_DAYS = 30;   // "remember me on this device" keeps the sign-in for 30 days
var MAX_FAILS = 5, LOCK_SECONDS = 900;

function authErr_(msg, forbidden) { var e = new Error(msg); e.auth = !forbidden; e.forbidden = !!forbidden; return e; }

function hex_(bytes) { return bytes.map(function (b) { return ("0" + ((b + 256) % 256).toString(16)).slice(-2); }).join(""); }
function sha_(s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }
function hashPw_(pw, salt, n) {
  n = n || 1000;
  var h = salt + ":" + pw;
  for (var i = 0; i < n; i++) h = sha_(h + pw);
  return "s2$" + n + "$" + salt + "$" + h;
}
function safeEq_(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; var d = 0; for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
function checkPw_(pw, stored) { var p = String(stored || "").split("$"); return p.length === 4 && safeEq_(hashPw_(pw, p[2], +p[1]), stored); }
function randomPassword_() {
  var A = "abcdefghjkmnpqrstuvwxyz23456789", bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid(), Utilities.Charset.UTF_8), s = "";
  for (var i = 0; i < 10; i++) s += A.charAt(((bytes[i] + 256) % 256) % A.length);
  return s.slice(0, 5) + "-" + s.slice(5);
}

function secret_() {
  var p = props_(), s = p.getProperty("SECRET");
  if (!s) { s = sha_(Utilities.getUuid() + Utilities.getUuid() + Date.now()); p.setProperty("SECRET", s); }
  return s;
}
function b64_(s) { return Utilities.base64EncodeWebSafe(s, Utilities.Charset.UTF_8); }
function unb64_(s) { return Utilities.newBlob(Utilities.base64DecodeWebSafe(s)).getDataAsString(); }
function sign_(s) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, secret_())); }

/* ---------- users sheet ---------- */
function usersSheet_() { return sheet_(USERS, USER_HEADER); }
function readUsers_() {
  var v = usersSheet_().getDataRange().getValues(), h = v[0].map(String);
  return v.slice(1).map(function (r, i) {
    var o = { row: i + 2 };
    h.forEach(function (k, j) { o[k] = r[j]; });
    o.username = String(o.username || "").toLowerCase();
    o.enumerator = +o.enumerator || 0; o.ver = +o.ver || 0;
    o.active = o.active === true || String(o.active) === "1" || String(o.active).toUpperCase() === "TRUE";
    o.must_change = o.must_change === true || String(o.must_change) === "1" || String(o.must_change).toUpperCase() === "TRUE";
    return o;
  }).filter(function (u) { return u.username; });
}
function findUser_(name) { name = String(name || "").toLowerCase().trim(); return readUsers_().filter(function (u) { return u.username === name; })[0] || null; }
function saveUser_(u) {
  var s = usersSheet_(), h = s.getDataRange().getValues()[0].map(String);
  var row = h.map(function (k) { return k === "active" || k === "must_change" ? (u[k] ? 1 : 0) : (u[k] === undefined || u[k] === null ? "" : u[k]); });
  if (u.row) s.getRange(u.row, 1, 1, row.length).setValues([row]); else s.appendRow(row);
}
function publicUser_(u) { return { username: u.username, name: String(u.name || ""), role: u.role, enumerator: u.enumerator || 0, active: u.active, mustChange: u.must_change, lastLogin: u.last_login ? new Date(u.last_login).toISOString() : "" }; }

/* ---------- tokens ---------- */
function makeToken_(u, remember) {
  var hrs = remember ? REMEMBER_DAYS * 24 : (TOKEN_HOURS[u.role] || 12), x = Date.now() + hrs * 3600 * 1000;
  var body = b64_(JSON.stringify({ u: u.username, v: u.ver, x: x, r: remember ? 1 : 0 }));
  return body + "." + sign_(body);
}
function session_(u, remember) { var t = makeToken_(u, remember); return { token: t, expires: JSON.parse(unb64_(t.split(".")[0])).x, user: publicUser_(u) }; }
/** Checks a token. need: "any" | "admin" | "collector". allowMustChange lets the change-password call through. */
function auth_(token, need, allowMustChange) {
  if (!token) throw authErr_("กรุณาเข้าสู่ระบบ");
  var p = String(token).split(".");
  if (p.length !== 2 || !safeEq_(sign_(p[0]), p[1])) throw authErr_("การเข้าสู่ระบบไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่");
  var o; try { o = JSON.parse(unb64_(p[0])); } catch (e) { throw authErr_("การเข้าสู่ระบบไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่"); }
  if (o.k) throw authErr_("การเข้าสู่ระบบไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่");          // a QR invite is not a sign-in
  if (!o.x || o.x < Date.now()) throw authErr_("หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่");
  var u = findUser_(o.u);
  if (!u || !u.active || u.ver !== o.v) throw authErr_("บัญชีถูกปิดหรือรหัสผ่านถูกเปลี่ยน กรุณาเข้าสู่ระบบใหม่");
  u._remember = !!o.r;
  if (u.must_change && !allowMustChange) throw authErr_("ต้องตั้งรหัสผ่านใหม่ก่อนใช้งาน", true);
  if (need === "admin" && u.role !== "admin") throw authErr_("บัญชีนี้ไม่มีสิทธิ์ดูข้อมูล", true);
  if (need === "collector" && !u.enumerator) throw authErr_("บัญชีนี้ยังไม่มีเลขผู้เก็บข้อมูล ติดต่อผู้วิจัย", true);
  return u;
}

/* ---------- API: sign-in ---------- */
function apiLogin_(b) {
  var name = String(b.username || "").toLowerCase().trim(), cache = CacheService.getScriptCache(), key = "fail:" + name;
  var fails = +(cache.get(key) || 0);
  if (fails >= MAX_FAILS) throw authErr_("ใส่รหัสผ่านผิดหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่", true);
  var u = findUser_(name);
  if (!u || !u.active || !checkPw_(String(b.password || ""), u.hash)) {
    cache.put(key, String(fails + 1), LOCK_SECONDS);
    throw authErr_("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", true);
  }
  cache.remove(key);
  u.last_login = new Date(); saveUser_(u);
  log_(u.username, "เข้าสู่ระบบ" + (b.remember ? " (จำในเครื่อง " + REMEMBER_DAYS + " วัน)" : ""));
  return session_(u, !!b.remember);
}
function apiMe_(b) { var u = auth_(b.token, "any", true); return { user: publicUser_(u) }; }
function apiChangePassword_(b) {
  var u = auth_(b.token, "any", true);
  if (!checkPw_(String(b.old || ""), u.hash)) throw authErr_("รหัสผ่านเดิมไม่ถูกต้อง", true);
  var pw = String(b.password || "");
  if (pw.length < 8) throw new Error("รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัว");
  if (pw === String(b.old)) throw new Error("รหัสผ่านใหม่ต้องไม่ซ้ำรหัสเดิม");
  u.hash = hashPw_(pw, Utilities.getUuid()); u.ver++; u.must_change = false; saveUser_(u);
  log_(u.username, "เปลี่ยนรหัสผ่าน");
  return session_(u, u._remember);
}

/* ---------- API: account management (admin) ---------- */
function checkEnumFree_(n, except) {
  if (!n) return;
  if (n < 1 || n > 8) throw new Error("เลขผู้เก็บข้อมูลต้องอยู่ระหว่าง 1–8 (เลข 9 สงวนไว้สำหรับตอบเองออนไลน์)");
  var other = readUsers_().filter(function (u) { return u.active && u.enumerator === n && u.username !== except; })[0];
  if (other) throw new Error("เลขผู้เก็บ " + n + " ใช้อยู่แล้วโดย " + other.username);
}
function apiUsers_(b) { auth_(b.token, "admin"); return { users: readUsers_().map(publicUser_) }; }
function apiAddUser_(b) {
  var me = auth_(b.token, "admin");
  var name = String(b.username || "").toLowerCase().trim();
  if (!/^[a-z0-9._-]{3,20}$/.test(name)) throw new Error("ชื่อผู้ใช้ใช้ได้เฉพาะ a–z 0–9 . _ - ยาว 3–20 ตัว");
  if (findUser_(name)) throw new Error("มีชื่อผู้ใช้นี้แล้ว");
  var role = b.role === "admin" ? "admin" : "enumerator", n = +b.enumerator || 0;
  if (role === "enumerator" && !n) throw new Error("ผู้เก็บข้อมูลต้องมีเลขผู้เก็บ 1–8");
  checkEnumFree_(n, "");
  var pw = randomPassword_();
  saveUser_({ username: name, name: String(b.name || "").slice(0, 60), role: role, enumerator: n || "", hash: hashPw_(pw, Utilities.getUuid()), ver: 1, active: true, must_change: true, created: new Date(), last_login: "" });
  log_(me.username, "สร้างบัญชี " + name + " (" + role + (n ? " เลข " + n : "") + ")");
  return { username: name, tempPassword: pw };
}
function apiResetPassword_(b) {
  var me = auth_(b.token, "admin"), u = findUser_(b.username);
  if (!u) throw new Error("ไม่พบชื่อผู้ใช้");
  var pw = randomPassword_();
  u.hash = hashPw_(pw, Utilities.getUuid()); u.ver++; u.must_change = true; saveUser_(u);
  log_(me.username, "ตั้งรหัสผ่านชั่วคราวให้ " + u.username);
  return { username: u.username, tempPassword: pw };
}
function apiSetUser_(b) {
  var me = auth_(b.token, "admin"), u = findUser_(b.username);
  if (!u) throw new Error("ไม่พบชื่อผู้ใช้");
  var admins = readUsers_().filter(function (x) { return x.active && x.role === "admin"; });
  var next = { active: b.active === undefined ? u.active : !!b.active, role: b.role === undefined ? u.role : (b.role === "admin" ? "admin" : "enumerator"), enumerator: b.enumerator === undefined ? u.enumerator : (+b.enumerator || 0) };
  if (u.username === me.username && (!next.active || next.role !== "admin")) throw new Error("ปิดหรือลดสิทธิ์บัญชีของตัวเองไม่ได้");
  if (u.role === "admin" && u.active && (!next.active || next.role !== "admin") && admins.length <= 1) throw new Error("ต้องมีผู้ดูแลอย่างน้อย 1 บัญชี");
  if (next.role === "enumerator" && !next.enumerator) throw new Error("ผู้เก็บข้อมูลต้องมีเลขผู้เก็บ 1–8");
  if (next.active) checkEnumFree_(next.enumerator, u.username);
  if (u.active && !next.active) u.ver++;          // closes every open session of this account
  u.active = next.active; u.role = next.role; u.enumerator = next.enumerator || "";
  if (b.name !== undefined) u.name = String(b.name).slice(0, 60);
  saveUser_(u);
  log_(me.username, "แก้บัญชี " + u.username + " · " + (u.active ? "ใช้งาน" : "ปิด") + " · " + u.role + (u.enumerator ? " เลข " + u.enumerator : ""));
  return { user: publicUser_(findUser_(u.username)) };
}

/** Run from the editor if every admin is locked out: creates or resets "admin" and prints a temporary password in the execution log. */
function resetAdminPassword() {
  var u = findUser_("admin"), pw = randomPassword_();
  if (!u) u = { username: "admin", name: "ผู้ดูแล", role: "admin", enumerator: "", ver: 0, created: new Date(), last_login: "" };
  u.hash = hashPw_(pw, Utilities.getUuid()); u.ver = (+u.ver || 0) + 1; u.active = true; u.must_change = true; u.role = "admin";
  saveUser_(u);
  log_("editor", "ตั้งรหัสผ่านชั่วคราวให้ admin");
  Logger.log("ชื่อผู้ใช้: admin  รหัสผ่านชั่วคราว: " + pw + "  (ระบบจะให้ตั้งรหัสใหม่ตอนเข้าครั้งแรก)");
  return pw;
}

/* ---------- QR invites: a collector shows a one-time QR to a respondent who has just consented, at the venue ----------
   Conditions submitted to the ethics committee (AF12): the respondent answers on the spot in the collector's presence,
   a collector supervises no more than 3 self-completing respondents at a time, and no link is given to answer later. So:
   - a collector can have at most INVITE_MAX QR open at once (open = issued, not yet answered, not cancelled, not timed out)
   - a QR must be opened within INVITE_MINUTES of being issued; answers are accepted for INVITE_GRACE_MIN after that
   Every QR issued is listed in the sheet "QR ที่ออก" (id, collector, times, status); a QR that is not in that sheet does not work. */
var INVITE_MAX = 3, INVITE_MINUTES = 120, INVITE_GRACE_MIN = 60;
var INV_SHEET = "QR ที่ออก", INV_HEADER = ["inv", "collector", "issued", "start_by", "status"];
function invRows_() {
  var v = sheet_(INV_SHEET, INV_HEADER).getDataRange().getValues();
  return v.slice(1).map(function (r, k) { return { row: k + 2, id: String(r[0]), user: String(r[1]), issued: new Date(r[2]).getTime(), x: new Date(r[3]).getTime(), status: String(r[4] || "") }; });
}
function usedInviteIds_() {
  var v = sheet_(SHEETS.responses, RESP_HEADER).getDataRange().getValues(), h = v[0].map(String), ii = h.indexOf("inv"), used = {};
  if (ii >= 0) for (var i = 1; i < v.length; i++) if (v[i][ii]) used[String(v[i][ii])] = true;
  return used;
}
/** The collector's QR that still take up one of the 3 places. */
function openInvites_(username) {
  var used = usedInviteIds_(), now = Date.now();
  return invRows_().filter(function (o) { return o.user === username && !o.status && !used[o.id] && o.x + INVITE_GRACE_MIN * 6e4 > now; })
    .map(function (o) { return { id: o.id, issued: o.issued, startBy: o.x }; });
}
function apiInvite_(b) {
  var u = auth_(b.token, "collector"), venue = Math.max(1, Math.min(3, +b.venue || 1));
  var open = openInvites_(u.username);
  if (open.length >= INVITE_MAX) throw new Error("มี QR ที่ยังเปิดอยู่ครบ " + INVITE_MAX + " ใบแล้ว ผู้เก็บหนึ่งคนดูแลผู้ตอบพร้อมกันได้ไม่เกิน " + INVITE_MAX + " คน รอให้ผู้ตอบส่งคำตอบ หรือยกเลิก QR ใบที่ไม่ได้ใช้ก่อน");
  var id = Utilities.getUuid().replace(/-/g, "").slice(0, 12), now = Date.now(), x = now + INVITE_MINUTES * 6e4;
  var body = b64_(JSON.stringify({ k: "inv", i: id, u: u.username, e: u.enumerator, v: venue, x: x }));
  sheet_(INV_SHEET, INV_HEADER).appendRow([id, u.username, new Date(now), new Date(x), ""]);
  log_(u.username, "สร้าง QR ให้ผู้ตอบ " + id);
  open.push({ id: id, issued: now, startBy: x });
  return { invite: body + "." + sign_(body), id: id, startBy: x, open: open, max: INVITE_MAX, minutes: INVITE_MINUTES };
}
function apiInvites_(b) {
  var u = auth_(b.token, "collector");
  return { open: openInvites_(u.username), max: INVITE_MAX, minutes: INVITE_MINUTES };
}
/** The collector closes a QR that will not be used (the respondent left, the QR was shown by mistake). */
function apiCancelInvite_(b) {
  var u = auth_(b.token, "collector"), hit = null;
  invRows_().forEach(function (o) { if (o.id === String(b.id) && o.user === u.username) hit = o; });
  if (!hit) throw new Error("ไม่พบ QR นี้ในบัญชีของคุณ");
  if (!hit.status) sheet_(INV_SHEET, INV_HEADER).getRange(hit.row, 5).setValue("ยกเลิก");
  log_(u.username, "ยกเลิก QR " + hit.id);
  return { open: openInvites_(u.username), max: INVITE_MAX, minutes: INVITE_MINUTES };
}
/** Checks an invite; returns its payload, or throws. graceMin: extra minutes allowed when the answers are sent. */
function readInvite_(t, graceMin) {
  var p = String(t || "").split(".");
  if (p.length !== 2 || !safeEq_(sign_(p[0]), p[1])) throw new Error("QR นี้ไม่ถูกต้อง ขอ QR ใหม่จากผู้เก็บข้อมูลที่อยู่ตรงนั้น");
  var o; try { o = JSON.parse(unb64_(p[0])); } catch (e) { throw new Error("QR นี้ไม่ถูกต้อง ขอ QR ใหม่จากผู้เก็บข้อมูลที่อยู่ตรงนั้น"); }
  if (o.k !== "inv") throw new Error("QR นี้ไม่ถูกต้อง ขอ QR ใหม่จากผู้เก็บข้อมูลที่อยู่ตรงนั้น");
  if (o.x + (graceMin || 0) * 6e4 < Date.now()) throw new Error("QR นี้หมดเวลาแล้ว ขอ QR ใหม่จากผู้เก็บข้อมูลที่อยู่ตรงนั้น");
  var row = null; invRows_().forEach(function (r) { if (r.id === String(o.i)) row = r; });
  if (!row) throw new Error("QR นี้ใช้ไม่ได้แล้ว ขอ QR ใหม่จากผู้เก็บข้อมูลที่อยู่ตรงนั้น");
  if (row.status) throw new Error("ผู้เก็บข้อมูลยกเลิก QR นี้แล้ว");
  var u = findUser_(o.u);
  if (!u || !u.active || u.enumerator !== o.e) throw new Error("ผู้เก็บข้อมูลที่ให้ QR นี้ไม่ได้อยู่ในระบบแล้ว ขอ QR ใหม่");
  return o;
}
function inviteUsed_(id) {
  var v = sheet_(SHEETS.responses, RESP_HEADER).getDataRange().getValues(), h = v[0].map(String), ii = h.indexOf("inv"), ri = h.indexOf("rid");
  if (ii < 0) return null;
  for (var i = 1; i < v.length; i++) if (String(v[i][ii]) === String(id)) return String(v[i][ri]);
  return null;
}
/** Before the respondent starts: is this QR still good? Answers only yes/no and the collector number, nothing else. */
function apiCheckInvite_(b) {
  var o = readInvite_(b.invite);
  if (inviteUsed_(o.i)) throw new Error("QR นี้ถูกใช้ตอบไปแล้ว หนึ่ง QR ใช้ได้หนึ่งคน ขอ QR ใหม่จากผู้เก็บข้อมูล");
  return { enumerator: o.e, venue: o.v, startBy: o.x, minutes: INVITE_MINUTES };
}
