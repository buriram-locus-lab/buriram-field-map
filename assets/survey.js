/* Web survey (questionnaire v1.9). Demo mode saves nothing; live mode posts one JSON record to CONFIG.endpoint after EC approval.
   Every form is completed in front of a collector: read aloud (1), keyed from paper (0), or on the respondent's phone from a collector's QR (3).
   Remote online answering (mode 2) is closed. Knowledge items 29–33 carry no answer key here: scoring happens only in analysis.
   Items may carry `when` (shown only if the rule holds; hidden answers are dropped) and `auto` (value recorded while hidden). */
(function () {
  "use strict";
  const CONFIG = window.SURVEY_CONFIG || { live: false, endpoint: "" };
  const DEMO = !CONFIG.live;                 // demo: nothing leaves the browser
  /* Collection phase, set on the server by an admin (codes pilot / begin / test typed on this page) and read when the page opens:
     test  → records saved but marked test = 1 · pilot → field pilot (Stage 1.2), kept in separate sheets · live → main survey */
  let PHASE = (() => { try { const v = JSON.parse(localStorage.getItem("bfm.phase")); if (["test", "pilot", "live"].includes(v)) return v; } catch (e) {} return CONFIG.test ? "test" : "live"; })();
  /* The dataset of this form (test / pilot / live) is chosen on the first screen. The server phase decides which are open:
     test always · pilot only while the phase is pilot · live only while the phase is live. A QR form takes its dataset from the QR. */
  const SETS = { test: "ทดสอบ", pilot: "นำร่อง", live: "เก็บจริง" };
  const setOpen = k => k === "test" || k === PHASE;
  const curSet = () => { const k = st && st.meta && st.meta.dataset; return k && SETS[k] ? k : PHASE; };
  const isTestRun = () => curSet() === "test", isPilot = () => curSet() === "pilot";
  const PH_LABEL = { test: "โหมดทดสอบระบบ", pilot: "โหมดนำร่อง (ขั้น 1.2 · อ.ชุมพลบุรี)", live: "เก็บข้อมูลจริง (ขั้น 1.3)" };
  const store = {
    get(k, d) { try { const v = localStorage.getItem("bfm." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("bfm." + k, JSON.stringify(v)); } catch (e) {} },
  };
  const S = window.SURVEY;
  const DN = n => (S.dn && S.dn[n]) || n;   // printed item number (v1.9 renumbered after cuts); internal keys keep the v1.8 numbers
  // a one-time QR from a collector: ?q=<invite>. The respondent answers on their own phone; the code carries that collector's number.
  const INV = new URLSearchParams(location.search).get("q");
  let invInfo = null;          // {enumerator, venue} once checked
  const PARTS = S.parts;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const app = $("#app");
  const R = Math.random;
  const pick = (a) => a[Math.floor(R() * a.length)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const st = {
    screen: "intro", part: 0, ans: {}, txt: {}, warned: {},
    meta: { id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12), version: R() < .5 ? "A" : "B", order: 1, design: "fixed", mode: null, venue: null, started: null, enumerator: null, collector: null, cdate: null, code: null, group: { size: 1, code: "" } },
    cj: { stage: "intro", i: 0, tasks: null, fails: 0, follow: {} },
  };

  /* ---------- respondent code: Gen + LGU + DDMM + enumerator + set, e.g. ZT05-1501-103 ---------- */
  const LGU_CODE = Object.fromEntries(S.lgus.map(l => [l.n, l.code]));
  const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const beYear = iso => +iso.slice(0, 4) + 543;
  const ddmmOf = iso => iso.slice(8, 10) + iso.slice(5, 7);
  const genFromAge = a => a <= 29 ? "Z" : a <= 45 ? "Y" : a <= 61 ? "X" : "B";
  /** Preview of the code in demo mode only. With the back end connected, the server issues the code when the form arrives. */
  function makeCode() {
    const iso = st.meta.cdate || todayISO(), y = st.ans["1"];
    const gen = y ? genFromAge(beYear(iso) - y) : "Z";
    let lc = LGU_CODE[st.ans["4"]];
    if (!lc) { const d = st.ans["3"] || {}; const L = S.lgus.filter(l => l.d === d.a && d.t && l.t.includes(d.t)); lc = L.length === 1 ? L[0].code : "U00"; }
    return `${gen}${lc}-${ddmmOf(iso)}-${st.meta.enumerator || 1}01`;     // mode 3 (QR) uses the collector's own number
  }
  const refOf = (id = st.meta.id) => String(id).replace(/-/g, "").slice(0, 8).toUpperCase();
  const validPhone = p => /^0\d{8,9}$/.test(String(p || "").replace(/\D/g, ""));

  /* ---------- helpers for item text ---------- */
  const optText = t => t.replace(/\s*_{2,}\s*/g, "").trim();
  function issueText() {
    const c = st.ans["21"];
    if (!c) return `ปัญหาที่ท่านเลือกไว้ในข้อ ${DN("21")}`;
    if (c === 12) return (st.txt["21"] || "").trim() || "เรื่องที่ท่านระบุ";
    return PARTS[2].items.find(i => i.n === "21").o.find(o => o.c === c).t;
  }
  const otherIssue = () => st.ans["21"] === 4 ? "การดูแลผู้สูงอายุและเบี้ยยังชีพ" : "ถนน ไฟฟ้า น้ำประปา";
  const fill = s => s.replace(/“เรื่องของท่าน”/g, `“${issueText()}”`).replace(/“เรื่องอื่น”/g, `“${otherIssue()}”`);

  /* ---------- skip rules: an item with `when` is asked only if the rule holds ---------- */
  const ALL = PARTS.flatMap(p => p.items);
  const itemOf = n => ALL.find(i => i.n === n);
  function visible(it) {
    const w = it.when; if (!w) return true;
    if (w.mode) return w.mode.includes(st.meta.mode);
    const v = st.ans[w.n];
    if (w.not) return v === undefined || !w.not.includes(v);
    if (w.any) return Array.isArray(v) && v.some(x => w.any.includes(x));
    return true;
  }
  /** Drops answers to items that are now skipped, records `auto` values, and shows or hides their fieldsets. */
  function applySkips() {
    for (const it of ALL) {
      if (!it.when) continue;
      const on = visible(it), el = $(`#q-${it.n}`);
      if (!on) { if (it.auto) st.ans[it.n] = it.auto.value; else delete st.ans[it.n]; delete st.txt[it.n]; if (it.parts) it.parts.forEach(p => delete st.ans[p.k]); }
      else if (it.auto && st.ans[it.n] === it.auto.value) delete st.ans[it.n];
      if (el && el.hidden === on) { el.hidden = !on; if (on) { const qa = $(".qa", el); if (qa) qa.innerHTML = body(it); } }
    }
  }

  /* ---------- progress ---------- */
  const STEPS = ["พื้นฐาน", "เศรษฐกิจ", "การเมือง", "ผู้สมัคร", "ความเสี่ยง", "ความเชื่อ", "ชุมชน"];
  function progress() {
    const cur = st.screen === "part" ? st.part : st.screen === "done" ? 7 : -1;
    return `<ol class="steps" aria-label="ความคืบหน้า">${STEPS.map((s, i) =>
      `<li class="${i < cur ? "done" : i === cur ? "now" : ""}" ${i === cur ? 'aria-current="step"' : ""}><b class="num">${i + 1}</b><span>${s}</span></li>`).join("")}</ol>`;
  }

  /* ---------- item renderers ---------- */
  function opts(it, kind, list = it.o) {
    const name = "q_" + it.n;
    return list.map(o => `<label class="opt"><input type="${kind}" name="${name}" value="${o.c}" ${chk(it, o.c)}><span class="box" aria-hidden="true"></span><span class="ot">${esc(optText(o.t))}${it.skipNote && it.skipNote[o.c] ? ` <small class="skipto">→ ${esc(it.skipNote[o.c])}</small>` : ""}</span></label>`).join("");
  }
  const optsOf = it => it.swapB && st.meta.version === "B" ? it.o.slice().reverse() : it.o;       // forced choice: order follows set A/B
  const BEAN = (on, k) => `<svg class="bean${on ? " on" : ""}" viewBox="0 0 24 32" aria-hidden="true"><path d="M12 2c6 0 9 6 8.6 14.5C20.2 25 16.6 30 11.4 30 6 30 3.4 25 3.6 17 3.8 8 6.4 2 12 2z"/><path class="hl" d="M11 7c-2.6 1.6-3.6 5-3.4 8.6" fill="none"/></svg>`;
  const beanRow = (n, size = "") => `<span class="beanrow ${size}" role="img" aria-label="${n} ใน 10">${Array.from({ length: 10 }, (_, k) => BEAN(k < n, k)).join("")}</span>`;
  function chk(it, c) {
    const v = st.ans[it.n];
    return (Array.isArray(v) ? v.includes(c) : v === c) ? "checked" : "";
  }
  function otherBox(it) {
    if (!it.other) return "";
    const show = st.ans[it.n] === it.other;
    return `<input class="txt other" data-txt="${it.n}" placeholder="โปรดระบุ" value="${esc(st.txt[it.n] || "")}" ${show ? "" : "hidden"}>`;
  }
  function body(it) {
    switch (it.type) {
      case "radio":
        if (it.cards) return `<div class="moneycards">${it.o.map((o, k) => `<label class="mcard"><input type="radio" name="q_${it.n}" value="${o.c}" ${chk(it, o.c)}><span class="mc-ico" aria-hidden="true">${bagIcon(k)}</span><span class="mc-t">${esc(o.t)}</span>${k ? beanRow(5, "sm") : ""}</label>`).join("")}</div>`;
        return `<div class="opts${it.o.length <= 3 && it.o.every(o => o.t.length < 14) ? " row" : ""}">${opts(it, "radio", optsOf(it))}</div>${otherBox(it)}`;
      case "scale":
        return `<div class="scale" role="radiogroup">${it.o.map(o => `<label class="sc"><input type="radio" name="q_${it.n}" value="${o.c}" ${chk(it, o.c)}><b class="num">${o.c}</b><span>${esc(o.t)}</span></label>`).join("")}</div>`;
      case "check":
        return `<div class="opts">${opts(it, "checkbox")}</div>`;
      case "year": {
        const v = st.ans["1"] || "", m = st.ans["1m"];
        return `<div class="inrow"><span class="pre">พ.ศ.</span><input class="txt short num" type="number" inputmode="numeric" name="q_1" min="2460" max="2569" placeholder="เช่น 2530" value="${v}"></div><p class="live small muted" id="agefb">${ageMsg(v)}</p>
          <div id="monthbox" ${+v === 2551 ? "" : "hidden"}><p class="sub">ท่านเกิดเดือนใดของปี 2551</p><div class="opts row">${MONTHS.map(([c, t]) => `<label class="opt"><input type="radio" name="q_1m" value="${c}" ${m === c ? "checked" : ""}><span class="box" aria-hidden="true"></span><span class="ot">${t}</span></label>`).join("")}</div></div>`;
      }
      case "income": {
        const v = st.ans["12"], b = st.ans["12b"];
        return `<div class="inrow"><input class="txt short num" type="number" inputmode="numeric" name="q_12" min="${it.min}" max="${it.max}" value="${typeof v === "number" ? v : ""}" ${b != null ? "disabled" : ""}><span class="post">${it.unitLabel}</span></div>
          <details class="brk" ${b != null ? "open" : ""}><summary>ไม่ทราบตัวเลข เลือกเป็นช่วง (บาทต่อเดือน)</summary><div class="opts slim">${it.o.map(o => `<label class="opt"><input type="radio" name="q_12b" value="${o.c}" ${b === o.c ? "checked" : ""}><span class="box" aria-hidden="true"></span><span class="ot">${esc(o.t)}</span></label>`).join("")}
          <label class="opt"><input type="radio" name="q_12b" value="10" ${b === 10 ? "checked" : ""}><span class="box" aria-hidden="true"></span><span class="ot">ไม่ประสงค์ตอบ</span></label></div>
          ${b != null ? `<button type="button" class="btn ghost small" id="brkclear">ใส่เป็นตัวเลขแทน</button>` : ""}</details>`;
      }
      case "conf": {                     // advisor (9 Nov 2026): respondents say any number 0–100, not 10 beans
        const v = st.ans[it.n];
        return `<div class="inrow"><span class="unit">ร้อยละ</span><input class="txt short num" type="number" inputmode="numeric" name="q_${it.n}" min="0" max="100" step="1" value="${v != null ? v : ""}" aria-label="ความเชื่อมั่น ร้อยละ 0 ถึง 100"></div>
          <p class="small muted">ตัวเลขใดก็ได้ตั้งแต่ 0 ถึง 100 · 0 = ไม่เชื่อมั่นเลย · 100 = เชื่อมั่นเต็มที่</p>`;
      }
      case "enum": {
        return it.parts.filter(p => !p.group || st.meta.group.size > 1).map(p => `<p class="sub">${esc(p.t)}</p><div class="opts row">${p.o.map(o => {
          const v = st.ans[p.k], on = Array.isArray(v) ? v.includes(o.c) : v === o.c;
          return `<label class="opt"><input type="${p.type === "check" ? "checkbox" : "radio"}" name="q_${p.k}" value="${o.c}" ${on ? "checked" : ""}><span class="box" aria-hidden="true"></span><span class="ot">${esc(o.t)}</span></label>`; }).join("")}</div>`).join("") +
          `<label class="fld"><span>จ. บันทึกอื่น ๆ <em>(ไม่บังคับ)</em></span><input class="txt" data-txt="64" value="${esc(st.txt["64"] || "")}"></label>`;
      }
      case "num": {
        const v = st.ans[it.n];
        const isOpt = typeof v === "string";
        return `<div class="inrow"><input class="txt short num" type="number" inputmode="numeric" name="q_${it.n}" min="${it.min}" max="${it.max}" value="${!isOpt && v != null ? v : ""}" ${isOpt ? "disabled" : ""}><span class="post">${it.unitLabel}</span></div>` +
          (it.optOut ? `<div class="opts row slim">${it.optOut.map(o => `<label class="opt"><input type="checkbox" name="oo_${it.n}" value="${o}" ${v === o ? "checked" : ""}><span class="box" aria-hidden="true"></span><span class="ot">${o}</span></label>`).join("")}</div>` : "");
      }
      case "residence": {
        const d = st.ans["3"] || {};
        if (isPilot()) return `<div class="opts row"><label class="opt"><input type="radio" name="res_a" value="ชุมพลบุรี" ${d.a === "ชุมพลบุรี" ? "checked" : ""}><span class="box" aria-hidden="true"></span><span class="ot">อ.ชุมพลบุรี จ.สุรินทร์</span></label></div>
          <p class="small muted">ช่วงนำร่อง: ผู้ตอบทุกคนต้องมีชื่อในทะเบียนบ้านและอาศัยใน อ.ชุมพลบุรี</p>
          <div class="grid2"><label class="fld"><span>ตำบล</span><input class="txt" name="res_t" value="${esc(d.t || "")}" ${d.a ? "" : "disabled"}></label>
            <label class="fld"><span>หมู่ที่หรือชื่อชุมชน <em>(ไม่บังคับ)</em></span><input class="txt" name="res_m" value="${esc(d.m || "")}"></label></div>`;
        const ds = ["เมืองบุรีรัมย์", "สตึก", "บ้านด่าน", "แคนดง"];
        const tb = d.a ? S.tambons.filter(t => t.a === d.a) : [];
        return `<div class="opts row">${ds.map((x, k) => `<label class="opt"><input type="radio" name="res_a" value="${x}" ${d.a === x ? "checked" : ""}><span class="box" aria-hidden="true"></span><span class="ot">อ.${x}</span></label>`).join("")}</div>
          <div class="grid2">
            <label class="fld"><span>ตำบล</span><select name="res_t" ${d.a ? "" : "disabled"}><option value="">${d.a ? "เลือกตำบล" : "เลือกอำเภอก่อน"}</option>${tb.map(t => `<option ${d.t === t.t ? "selected" : ""}>${t.t}</option>`).join("")}</select></label>
            <label class="fld"><span>หมู่ที่หรือชื่อชุมชน <em>(ไม่บังคับ)</em></span><input class="txt" name="res_m" value="${esc(d.m || "")}"></label>
          </div>`;
      }
      case "lgu": {
        const d = st.ans["3"] || {};
        let L = S.lgus.filter(l => l.d === d.a && (!d.t || l.t.includes(d.t)));
        if (!d.a) return `<p class="muted small">เลือกอำเภอและตำบลในข้อ 3 ก่อน</p>`;
        const v = st.ans["4"];
        if (isPilot()) return `<div class="opts">${[["pilot:tb", "เทศบาล (เทศบาลตำบลหรือเทศบาลเมือง)"], ["pilot:ao", "องค์การบริหารส่วนตำบล (อบต.)"], ["unsure", "ไม่แน่ใจ"]].map(([c, t]) => `<label class="opt"><input type="radio" name="q_4" value="${c}" ${v === c ? "checked" : ""}><span class="box" aria-hidden="true"></span><span class="ot">${t}</span></label>`).join("")}</div>`;
        const kind = { nk: "เทศบาลนคร", mg: "เทศบาลเมือง", tb: "เทศบาลตำบล", ao: "อบต." };
        const nm = n => n.replace(/^ทน\.|^ทม\.|^ทต\.|^อบต\./, "");
        return `<div class="opts">${L.map(l => `<label class="opt"><input type="radio" name="q_4" value="${l.n}" ${v === l.n ? "checked" : ""}><span class="box" aria-hidden="true"></span><span class="ot">${kind[l.k]}${nm(l.n)}</span></label>`).join("")}
          <label class="opt"><input type="radio" name="q_4" value="unsure" ${v === "unsure" ? "checked" : ""}><span class="box" aria-hidden="true"></span><span class="ot">ไม่แน่ใจ</span></label></div>
          ${d.t && L.length > 1 ? `<p class="small muted">ตำบล${d.t}มี 2 อปท. ดูแลคนละพื้นที่ เลือกตามที่ท่านมีสิทธิเลือกตั้ง</p>` : ""}`;
      }
      case "occ": {
        const main = it.o.filter(o => !o.g), not = it.o.filter(o => o.g), sec = st.ans["8b"];
        return `<p class="sub">ทำงาน</p><div class="opts">${opts(it, "radio", main)}</div>${otherBox(it)}
          <p class="sub">ไม่ได้ทำงาน</p><div class="opts">${opts(it, "radio", not)}</div>
          <label class="fld"><span>อาชีพรอง <em>(ถ้ามี)</em></span><select name="q_8b"><option value="">ไม่มีอาชีพรอง</option>${main.filter(o => o.c !== 12).map(o => `<option value="${o.c}" ${sec === o.c ? "selected" : ""}>${esc(o.t)}</option>`).join("")}</select></label>`;
      }
      case "phase2": {
        const v = st.ans["63"], c = st.contact || {};
        return `<div class="opts row">${it.o.map(o => `<label class="opt"><input type="radio" name="q_63" value="${o.c}" ${v === o.c ? "checked" : ""}><span class="box" aria-hidden="true"></span><span class="ot">${o.t}</span></label>`).join("")}</div>
          <div class="grid2" id="phonebox" ${v === 1 ? "" : "hidden"}>
            <label class="fld"><span>เบอร์โทรศัพท์</span><input class="txt num" type="tel" inputmode="tel" autocomplete="off" name="ph" value="${esc(c.phone || "")}" placeholder="08x-xxx-xxxx"></label>
            <label class="fld"><span>ช่วงเวลาที่สะดวกให้โทร <em>(ไม่บังคับ)</em></span><select name="pht"><option value="">ไม่ระบุ</option>${["เช้า", "บ่าย", "เย็น", "เสาร์–อาทิตย์"].map(t => `<option ${c.time === t ? "selected" : ""}>${t}</option>`).join("")}</select></label>
          </div>`;
      }
      case "ipc": {
        const L = [[-3, "ไม่เห็นด้วยมาก"], [-2, "ไม่เห็นด้วยปานกลาง"], [-1, "ไม่เห็นด้วยเล็กน้อย"], [1, "เห็นด้วยเล็กน้อย"], [2, "เห็นด้วยปานกลาง"], [3, "เห็นด้วยมาก"]];   // same labels as the paper form and the read-aloud instruction
        return `<div class="ipc" role="radiogroup">${L.map(([c, t]) => `<label class="ip${c < 0 ? " neg" : " pos"}"><input type="radio" name="q_${it.n}" value="${c}" ${st.ans[it.n] === c ? "checked" : ""}><span>${t}</span></label>`).join("")}</div>`;
      }
    }
    return "";
  }
  function bagIcon(k) {
    return k === 0
      ? `<svg viewBox="0 0 48 48"><path d="M17 12 L31 12 L27 18 L21 18 Z" fill="currentColor" opacity=".6"/><path d="M21 18 C9 24 8 42 24 42 C40 42 39 24 27 18 Z" fill="currentColor"/><text x="24" y="35" text-anchor="middle" font-size="10" fill="var(--surface)" font-family="IBM Plex Mono">100%</text></svg>`
      : `<svg viewBox="0 0 48 48"><path d="M17 12 L31 12 L27 18 L21 18 Z" fill="currentColor" opacity=".6"/><path d="M21 18 C9 24 8 42 24 42 C40 42 39 24 27 18 Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-dasharray="5 4"/><text x="24" y="35" text-anchor="middle" font-size="10" fill="currentColor" font-family="IBM Plex Mono">50%</text></svg>`;
  }
  const MONTHS = [[1, "มกราคม"], [2, "1–8 กุมภาพันธ์"], [3, "9 กุมภาพันธ์ หรือหลังจากนั้น"]];
  const lateBorn = () => +st.ans["1"] === 2551 && st.ans["1m"] === 3;
  function ageMsg(v) {
    v = +v;
    if (!v) return "";
    if (v > 2551) return `<span class="bad">ยังไม่มีสิทธิเลือกตั้งในวันที่ 8 ก.พ. 2569 (ไม่อยู่ในเกณฑ์)</span>`;
    if (v < 2440) return `<span class="bad">ตรวจปีเกิดอีกครั้ง (ใส่เป็นปี พ.ศ.)</span>`;
    return `อายุประมาณ <b class="num">${2569 - v}</b> ปี${v === 2551 ? " · ต้องเกิดในหรือก่อน 8 ก.พ. 2551 เลือกเดือนเกิดด้านล่าง" : ""}`;
  }

  function itemHTML(it, prev) {
    let pre = "";
    if (it.know && (!prev || !prev.know)) pre = `<div class="notice acc know"><b>${esc(it.lead.replace(/\s*\(.*\)$/, ""))}</b><br><span class="small">บางข้อถูก บางข้อไม่ถูก ถ้าไม่แน่ใจตอบว่าไม่ทราบได้ ไม่ใช่การสอบ และระบบจะไม่แสดงเฉลย</span></div>`;
    else if (it.lead && !it.know && (!prev || prev.lead !== it.lead)) pre = `<div class="notice acc know"><b>${esc(it.lead)}</b><br><span class="small">${it.o === undefined ? "" : esc(it.o.map(o => o.c + " " + o.t).join(" · "))}</span></div>`;
    if (PARTS[5].items[0] === it) pre = `<div class="notice acc"><b>ไม่มีคำตอบถูกหรือผิด</b><br><span class="small">ขอให้บอกก่อนว่าเห็นด้วยหรือไม่เห็นด้วย แล้วบอกว่าเล็กน้อย ปานกลาง หรือมาก ไม่มีตัวเลือกตรงกลาง</span></div>`;
    const hint = it.hint ? `<p class="hint">${esc(it.hint)}</p>` : "";
    const q = esc(it.q).replace(/\(ตอบได้มากกว่า 1 ข้อ\)/, '<span class="tag">ตอบได้หลายข้อ</span>').replace(/\(เลือก 1 ข้อ\)/, '<span class="tag">เลือก 1 ข้อ</span>');
    return `${pre}<fieldset class="q t-${it.type}" id="q-${it.n}" data-n="${it.n}" ${visible(it) ? "" : "hidden"}><legend class="qh"><span class="qn num">${DN(it.n)}</span><span class="qt">${q}</span></legend>${hint}<div class="qa">${body(it)}</div></fieldset>`;
  }

  /* ---------- validation ---------- */
  function answered(it) {
    const v = st.ans[it.n];
    if (!visible(it)) return true;                                   // skipped by a rule
    if (it.type === "residence") return !!(v && v.a && v.t);
    if (it.type === "check") return Array.isArray(v) && v.length > 0;
    if (it.type === "year") return !!v && (+v !== 2551 || !!st.ans["1m"]);
    if (it.type === "income") return typeof v === "number" || st.ans["12b"] != null;
    if (it.type === "enum") return it.parts.every(p => (p.group && st.meta.group.size < 2) || (Array.isArray(st.ans[p.k]) ? st.ans[p.k].length : st.ans[p.k] != null));
    if (it.type === "phase2") return v === 2 || (v === 1 && validPhone(st.contact && st.contact.phone));
    return v !== undefined && v !== null && v !== "";
  }

  /* ---------- screens ---------- */
  function render() {
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    if (st.screen === "intro") return renderIntro();
    if (st.screen === "out") return renderOut();
    if (st.screen === "done") return renderDone();
    if (st.part === 3) return renderConjoint();
    renderPart();
  }

  function renderIntro() {
    app.innerHTML = `
    <section class="panel intro">
      <h2>ก่อนเริ่ม</h2>
      <div class="infogrid">
        <div><b>งานวิจัยนี้ศึกษาอะไร</b><p>วิธีที่ผู้มีสิทธิเลือกตั้งในบุรีรัมย์ชั่งน้ำหนักระหว่างผู้สมัครที่ช่วยเหลือเป็นรายครัวเรือน กับผู้สมัครที่เสนอนโยบาย และความเชื่อของแต่ละคนว่าชีวิตถูกกำหนดโดยอะไร</p></div>
        <div><b>ท่านจะต้องทำอะไร</b><p>ตอบคำถาม 7 ส่วน รวมการเลือกผู้สมัครสมมติ 5 คู่ ใช้เวลาประมาณ 25–30 นาที</p></div>
        <div><b>สิทธิของท่าน</b><p>ไม่ต้องบอกชื่อ ข้ามข้อที่ไม่สบายใจได้ และหยุดได้ทุกเมื่อ แบบสอบถามนี้ไม่ถามว่าท่านเลือกผู้สมัครหรือพรรคใด</p></div>
        <div><b>ข้อมูลของท่าน</b><p>ใช้วิเคราะห์ในภาพรวมเท่านั้น ไม่นำเสนอรายบุคคลหรือรายหมู่บ้าน</p></div>
      </div>
      ${DEMO ? `<div class="notice"><b>โหมดตัวอย่าง:</b> หน้านี้ใช้ดูและทดลองแบบสอบถามเท่านั้น ระบบไม่ส่งหรือบันทึกคำตอบใด ๆ การเก็บข้อมูลจริงจะเปิดหลังคณะกรรมการจริยธรรมการวิจัยในมนุษย์ (EC) อนุมัติ</div>` : ""}
      ${!DEMO ? `<div class="notice ${isPilot() ? "acc" : isTestRun() ? "" : "ok"}" id="phasebox">${phaseNote()}</div>` : ""}
      ${INV ? `<div class="notice acc" id="invbox">กำลังตรวจ QR…</div>` : ""}
      <div class="admin" ${INV ? `style="display:none"` : ""}>
        ${!DEMO ? `<fieldset class="q" id="set-q"><legend class="qh"><span class="qt">ชุดข้อมูล</span><span class="qhint">เลือกก่อนเริ่ม คำตอบชุดนี้จะถูกเก็บแยกตามที่เลือก</span></legend><div class="opts row">
          ${Object.entries(SETS).map(([k, t]) => `<label class="opt${setOpen(k) ? "" : " off"}"><input type="radio" name="dataset" value="${k}" ${curSet() === k ? "checked" : ""} ${setOpen(k) ? "" : "disabled"}><span class="box" aria-hidden="true"></span><span class="ot">${t}${setOpen(k) ? "" : ` <small class="muted">(${k === "pilot" ? "ผู้ดูแลเปิดด้วยรหัส pilot" : "ผู้ดูแลเปิดด้วยรหัส begin"} หลังได้ใบ EC)</small>`}</span></label>`).join("")}</div></fieldset>` : ""}
        <fieldset class="q"><legend class="qh"><span class="qt">วิธีตอบ</span></legend><div class="opts row">
          ${[[1, "ผู้เก็บข้อมูลอ่านให้ฟัง"], [0, "คีย์จากฟอร์มกระดาษ (ผู้ตอบกรอกเอง)"], [3, "ให้ผู้ตอบสแกน QR ทำในโทรศัพท์ตัวเอง ต่อหน้าผู้เก็บข้อมูล"]].map(([c, t]) => `<label class="opt"><input type="radio" name="mode" value="${c}" ${st.meta.mode === c ? "checked" : ""}><span class="box"></span><span class="ot">${t}</span></label>`).join("")}</div></fieldset>
        <fieldset class="q" id="venue-q"><legend class="qh"><span class="qt">สถานที่พบผู้ตอบ <em class="muted">(ผู้เก็บข้อมูลเลือก)</em></span></legend><div class="opts row">
          ${[[1, "ตลาดหรือจุดที่คนพลุกพล่าน"], [2, "จุดรวมตัวของชุมชน (สภากาแฟ)"], [3, "เยี่ยมครัวเรือน"]].map(([c, t]) => `<label class="opt"><input type="radio" name="venue" value="${c}" ${st.meta.venue === c ? "checked" : ""}><span class="box"></span><span class="ot">${t}</span></label>`).join("")}</div></fieldset>

        <fieldset class="q" id="group-q" ${st.meta.mode === 0 || st.meta.mode === 1 ? "" : "hidden"}><legend class="qh"><span class="qt">ตอบพร้อมกันกี่คน <em class="muted">(ไม่เกิน 3 คน ห้ามคุยกันระหว่างตอบ)</em></span></legend>
          <div class="opts row">${[1, 2, 3].map(c => `<label class="opt"><input type="radio" name="gsize" value="${c}" ${st.meta.group.size === c ? "checked" : ""}><span class="box"></span><span class="ot">${c === 1 ? "คนเดียว" : c + " คน"}</span></label>`).join("")}</div>
          <label class="fld" id="gcode" style="max-width:220px" ${st.meta.group.size > 1 ? "" : "hidden"}><span>รหัสกลุ่ม <em>(ใช้รหัสเดียวกันทุกคนในกลุ่ม)</em></span><input class="txt" name="gcode" value="${esc(st.meta.group.code)}" placeholder="เช่น G1"></label></fieldset>
        <fieldset class="q" id="enum-q" ${st.meta.mode == null ? "hidden" : ""}><legend class="qh"><span class="qt">ผู้เก็บข้อมูล <em class="muted">(ต้องเข้าสู่ระบบ ระบบออกรหัสผู้ตอบให้ตอนส่ง)</em></span></legend>
          <div id="who"></div>
        </fieldset>
      </div>
      <p class="consent" id="consent"></p>
      <div class="nav"><span></span><button class="btn primary" id="start">เริ่มตอบ</button></div>
      ${!INV ? `<div class="ipcbox"><p class="small"><b>แบบทดลอง IPC 24 ข้อ</b> <span class="muted">แยกจากแบบสอบถามหลัก ใช้ทดสอบอำนาจจำแนกของมาตรวัด (Levenson, 1981) ใช้ชุดข้อมูลเดียวกับที่เลือกด้านบน</span></p><button type="button" class="btn ghost small" id="ipc24go">เปิดแบบทดลอง IPC 24 ข้อ</button></div>` : ""}
      ${!DEMO && !INV ? `<form class="phasecode" id="phaseform" autocomplete="off"><label class="fld"><span class="small muted">รหัสเปลี่ยนโหมด <em>(สำหรับผู้วิจัย)</em></span>
        <span class="inrow"><input class="txt short" id="phasecode" name="phasecode" autocapitalize="off" spellcheck="false" aria-describedby="phasehelp"><button class="btn ghost small" type="submit">ใช้รหัส</button></span></label>
        <p class="small muted" id="phasehelp">pilot = เปิดเก็บข้อมูลนำร่อง · begin = เปิดเก็บข้อมูลจริง · test = กลับเป็นโหมดทดสอบ ต้องเข้าสู่ระบบด้วยบัญชีผู้ดูแล</p><div id="phaseconfirm"></div></form>` : ""}
    </section>`;
    app.onchange = e => {
      const t = e.target;
      if (t.name === "dataset") { st.meta.dataset = t.value; delete st.ans["3"]; delete st.ans["4"]; render(); return; }
      if (t.name === "mode") { st.meta.mode = +t.value; modeUI(); renderWho(); }
      if (t.name === "venue") st.meta.venue = +t.value;
      if (t.name === "gsize") { st.meta.group.size = +t.value; $("#gcode").hidden = st.meta.group.size < 2; }
      if (t.name === "gcode") st.meta.group.code = t.value.trim().slice(0, 12);
      if (t.name === "cdate") st.meta.cdate = t.value;
    };
    modeUI(); renderWho();
    if (INV) checkInvite();
    const pf = $("#phaseform"); if (pf) pf.onsubmit = e => { e.preventDefault(); phaseCode($("#phasecode").value); };
    const ig = $("#ipc24go"); if (ig) ig.onclick = openIpc24;
    if (!whoSub) { whoSub = true; Auth.onChange(() => { if (st.screen === "intro") renderWho(); }); }
    $("#start").onclick = () => {
      if (INV) {
        if (!invInfo) { toast("QR นี้ใช้ไม่ได้ ขอ QR ใหม่จากผู้เก็บข้อมูล"); return; }
        st.meta.mode = 3; st.meta.venue = invInfo.venue || null; st.meta.enumerator = invInfo.enumerator; st.meta.cdate = todayISO();
        st.meta.started = new Date().toISOString(); st.t0 = performance.now(); st.screen = "part"; st.part = 0; return render();
      }
      if (st.meta.mode == null) { toast("เลือกวิธีตอบก่อนเริ่ม"); return; }
      if (st.meta.mode === 3) {                         // collector hands a QR; no form starts on this device
        const se = Auth.get();
        if (!se || se.user.mustChange) { toast("เข้าสู่ระบบก่อนสร้าง QR"); $("#who").scrollIntoView({ block: "center" }); return; }
        if (!se.user.enumerator) { toast("บัญชีนี้ยังไม่มีเลขผู้เก็บข้อมูล จึงสร้าง QR ไม่ได้"); return; }
        return showQR();
      }
      {
        const se = Auth.get();
        if (!se || se.user.mustChange) { toast("ผู้เก็บข้อมูลต้องเข้าสู่ระบบก่อนเริ่ม"); $("#who").scrollIntoView({ block: "center" }); return; }
        if (!se.user.enumerator) { toast("บัญชีนี้ยังไม่มีเลขผู้เก็บข้อมูล ติดต่อผู้วิจัย"); return; }
        if (st.meta.venue == null) { toast("เลือกสถานที่พบผู้ตอบก่อนเริ่ม"); return; }
        if (st.meta.group.size > 1 && !st.meta.group.code) { toast("ใส่รหัสกลุ่มก่อนเริ่ม"); $("#gcode input").focus(); return; }
        st.meta.enumerator = se.user.enumerator; st.meta.collector = se.user.username; st.meta.cdate = st.meta.cdate || todayISO();
      }
      st.meta.started = new Date().toISOString(); st.t0 = performance.now();
      st.screen = "part"; st.part = 0; render();
    };
  }

  let whoSub = false;
  /* what the intro shows for each way of answering */
  function modeUI() {
    const m = st.meta.mode, e = $("#enum-q"), g = $("#group-q"), go = $("#start"), c = $("#consent");
    if (e) e.hidden = m == null; if (g) g.hidden = !(m === 0 || m === 1);
    if (go && !INV) go.textContent = m === 3 ? "สร้าง QR ให้ผู้ตอบ" : "เริ่มตอบ";
    if (c) c.innerHTML = m === 3 && !INV ? "ให้ QR หลังอธิบายโครงการและผู้ตอบยินยอมแล้วเท่านั้น ผู้ตอบสแกนแล้วทำเองในโทรศัพท์ของเขาต่อหน้าคุณ คำตอบนับเป็นชุดของคุณ หนึ่ง QR ใช้ได้ 1 คน ต้องเริ่มตอบภายใน 2 ชั่วโมง และเปิด QR พร้อมกันได้ไม่เกิน 3 ใบ"
      : "เริ่มได้เมื่อผู้ตอบได้รับเอกสารชี้แจงและยินยอมเข้าร่วมแล้วเท่านั้น";
  }

  async function checkInvite() {
    const box = $("#invbox"), go = $("#start");
    const done = store.get("inv.done", []).includes(INV.slice(-24));
    if (done) { box.className = "notice"; box.innerHTML = "เครื่องนี้ส่งคำตอบจาก QR นี้ไปแล้ว ขอบคุณครับ ถ้าเป็นผู้ตอบคนใหม่ ขอ QR ใหม่จากผู้เก็บข้อมูล"; go.disabled = true; return; }
    if (INV === "demo" || DEMO) { invInfo = { enumerator: 1, venue: 1 }; }
    else {
      const j = await Auth.api("checkInvite", { invite: INV });
      if (!j.ok) { box.className = "notice"; box.innerHTML = `<b>QR นี้ใช้ไม่ได้</b> ${esc(j.error || "")}`; go.disabled = true; return; }
      invInfo = { enumerator: j.enumerator, venue: j.venue }; if (j.dataset && SETS[j.dataset] && st.meta.dataset !== j.dataset) { st.meta.dataset = j.dataset; render(); return; }
    }
    box.innerHTML = `<b>แบบสอบถามนี้ส่งมาจากผู้เก็บข้อมูลเลข ${invInfo.enumerator}</b><br><span class="small">ท่านตอบบนโทรศัพท์ของท่านเองได้เลย ไม่ต้องเข้าสู่ระบบ ใช้เวลาราว 25–30 นาที ขอให้ตอบให้เสร็จตอนนี้ ถ้ามีข้อสงสัยถามผู้เก็บข้อมูลที่อยู่ตรงนี้ได้</span>${INV === "demo" || DEMO ? `<br><span class="small">โหมดตัวอย่าง: QR สาธิต ไม่บันทึกคำตอบ</span>` : ""}`;
    chips();
  }

  /* ---------- collector: QR for a respondent who answers on their own phone, on the spot ----------
     As submitted to the EC: one QR per respondent, shown after consent, answered in the collector's presence,
     no more than 3 respondents at a time per collector, no link handed out. The back end enforces the limit;
     this device keeps the QR it issued (for 2 hours) so a closed dialog can show the same QR again. */
  const QMAX = 3, QMIN = 120;
  const invKey = () => "inv.mine." + ((Auth.get() || {}).user || {}).username;
  const keptQR = () => store.get(invKey(), []).filter(x => x.startBy > Date.now());
  const keepQR = (list) => store.set(invKey(), list.filter(x => x.startBy > Date.now()));
  let qrOpen = null;          // [{id, issued, startBy}] from the back end (or the demo list)
  const isDemoQR = () => { const se = Auth.get(); return DEMO || !se || se.demo; };
  async function qrApi(action, body = {}) {
    if (!isDemoQR()) { const j = await Auth.api(action, body); if (!j.ok) throw new Error(j.error || "ติดต่อระบบไม่ได้"); return j; }
    let open = store.get("inv.demo", []).filter(x => x.startBy + 60 * 6e4 > Date.now());           // demo: the same rule, on this device only
    if (action === "invite") {
      if (open.length >= QMAX) throw new Error(`มี QR ที่ยังเปิดอยู่ครบ ${QMAX} ใบแล้ว ผู้เก็บหนึ่งคนดูแลผู้ตอบพร้อมกันได้ไม่เกิน ${QMAX} คน รอให้ผู้ตอบส่งคำตอบ หรือยกเลิก QR ใบที่ไม่ได้ใช้ก่อน`);
      const it = { id: "demo" + Math.random().toString(36).slice(2, 8), issued: Date.now(), startBy: Date.now() + QMIN * 6e4 };
      open.push(it); store.set("inv.demo", open); return { invite: "demo", id: it.id, startBy: it.startBy, open, max: QMAX, minutes: QMIN };
    }
    if (action === "cancelInvite") { open = open.filter(x => x.id !== body.id); store.set("inv.demo", open); }
    return { open, max: QMAX, minutes: QMIN };
  }
  const hhmm = t => new Date(t).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  function qrDialog() {
    let dlg = $("#qrdlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "qrdlg"; dlg.className = "qrdlg"; document.body.appendChild(dlg); }
    if (!dlg.open) dlg.showModal();
    return dlg;
  }
  function openList() {
    const mine = keptQR();
    if (!qrOpen || !qrOpen.length) return `<p class="small muted">ยังไม่มี QR ที่เปิดอยู่</p>`;
    return `<table class="qrlist"><tbody>${qrOpen.map((o, k) => `<tr><td>ใบที่ ${k + 1}</td><td class="num">ออก ${hhmm(o.issued)} · เริ่มได้ถึง ${hhmm(o.startBy)}</td>
      <td>${mine.some(x => x.id === o.id) ? `<button class="btn ghost small" data-show="${esc(o.id)}">แสดง</button>` : ""}<button class="btn ghost small" data-cancel="${esc(o.id)}">ยกเลิก</button></td></tr>`).join("")}</tbody></table>`;
  }
  function drawQR(it, msg) {
    const dlg = qrDialog(), se = Auth.get(), V = { 1: "ตลาดหรือจุดที่คนพลุกพล่าน", 2: "จุดรวมตัวของชุมชน", 3: "เยี่ยมครัวเรือน" };
    const full = qrOpen && qrOpen.length >= QMAX;
    let qrHtml = "";
    if (it) {
      const url = location.origin + location.pathname + "?q=" + encodeURIComponent(it.t);
      const qr = qrcode(0, "M"); qr.addData(url); qr.make();
      qrHtml = `<h3>ให้ผู้ตอบสแกนด้วยโทรศัพท์ของตัวเอง</h3>
      <div class="qr-img">${qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true })}</div>
      <p class="small">ใช้ได้ <b>1 คน</b> · ต้องเริ่มตอบภายใน ${hhmm(it.startBy)} น. · ผู้เก็บเลข ${se ? se.user.enumerator : 1} · ${V[it.venue] || ""}</p>`;
    } else qrHtml = `<h3>QR สำหรับผู้ตอบที่ตอบเองบนโทรศัพท์</h3>`;
    if (msg) qrHtml += `<p class="notice small" role="alert">${esc(msg)}</p>`;
    dlg.innerHTML = `<div class="qr-in">${qrHtml}
      <p class="small muted">ให้ QR หลังอธิบายโครงการและผู้ตอบยินยอมแล้วเท่านั้น ผู้ตอบทำต่อหน้าคุณจนส่งเสร็จ ห้ามส่งลิงก์หรือรูป QR ให้ไปตอบทีหลัง${it && it.demo ? " · โหมดตัวอย่าง: QR สาธิต" : ""}</p>
      <div class="qrbox"><p class="small"><b>QR ที่เปิดอยู่ ${qrOpen ? qrOpen.length : 0}/${QMAX}</b> <span class="muted">(ดูแลผู้ตอบพร้อมกันได้ไม่เกิน ${QMAX} คน ใบจะปิดเองเมื่อผู้ตอบส่งคำตอบ)</span></p>${openList()}</div>
      <div class="qr-btns"><button class="btn primary" id="qrnext" ${full ? "disabled" : ""}>${full ? `เปิดครบ ${QMAX} ใบแล้ว` : "QR สำหรับผู้ตอบคนถัดไป"}</button><button class="btn ghost" id="qrx">ปิด</button></div></div>`;
    $("#qrx").onclick = () => dlg.close();
    $("#qrnext").onclick = () => showQR(true);
    dlg.querySelectorAll("[data-show]").forEach(b => b.onclick = () => { const k = keptQR().find(x => x.id === b.dataset.show); if (k) drawQR(k); });
    dlg.querySelectorAll("[data-cancel]").forEach(b => b.onclick = async () => {
      if (!confirmCancel(b)) return;
      try { const j = await qrApi("cancelInvite", { id: b.dataset.cancel }); qrOpen = j.open; keepQR(keptQR().filter(x => x.id !== b.dataset.cancel)); drawQR(it && it.id !== b.dataset.cancel ? it : null); }
      catch (e) { drawQR(it, e.message); }
    });
  }
  function confirmCancel(b) { if (b.dataset.sure) return true; b.dataset.sure = "1"; b.textContent = "แตะอีกครั้งเพื่อยกเลิก"; setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = "ยกเลิก"; } }, 4000); return false; }
  async function showQR(fresh) {
    if (st.meta.venue == null || st.meta.venue === 4) { toast("เลือกสถานที่พบผู้ตอบก่อนสร้าง QR"); $("#venue-q").scrollIntoView({ block: "center" }); return; }
    const dlg = qrDialog(); dlg.innerHTML = `<div class="qr-in"><p class="small muted">กำลังสร้าง QR…</p></div>`;
    try {
      if (!fresh) { const j = await qrApi("invites"); qrOpen = j.open; if (qrOpen.length >= QMAX) { drawQR(null); return; } }
      const j = await qrApi("invite", { venue: st.meta.venue, dataset: curSet() });
      qrOpen = j.open;
      const it = { id: j.id, t: j.invite, venue: st.meta.venue, startBy: j.startBy, demo: j.invite === "demo" };
      if (!it.demo) keepQR(keptQR().concat([it]));
      drawQR(it);
    } catch (e) { drawQR(null, e.message); }
  }

  /* ---------- enumerator sign-in inside the intro ---------- */
  function renderWho() {
    const el = $("#who"); if (!el || st.meta.mode == null) return;
    const se = Auth.get();
    if (!se || se.user.mustChange) {
      Auth.form(el, { lead: "ใช้ชื่อผู้ใช้ที่ผู้วิจัยสร้างให้ เลขผู้เก็บข้อมูลผูกกับบัญชี ไม่ต้องเลือกเอง", onDone: () => { renderWho(); chips(); flush(); },
        demo: { label: "ทดลองด้วยบัญชีสาธิต (ผู้เก็บเลข 1)", user: { username: "demo", name: "ผู้เก็บสาธิต", role: "enumerator", enumerator: 1 } } });
      return;
    }
    const u = se.user, sent = store.get("sent", []).filter(x => x.by === u.username).slice(0, 8);
    el.innerHTML = `<div class="whobox">
      <div class="whotop"><span class="avatar" aria-hidden="true">${esc((u.name || u.username).slice(0, 1))}</span>
        <div><b>${esc(u.name || u.username)}</b><p class="small muted">${esc(u.username)} · ${u.enumerator ? "ผู้เก็บเลข " + u.enumerator : "ยังไม่มีเลขผู้เก็บ"}${se.demo ? " · บัญชีสาธิต" : ""}</p></div>
        <button type="button" class="btn ghost small" id="logout">ออกจากระบบ</button></div>
      ${u.enumerator ? "" : `<div class="notice small">บัญชีนี้ดูข้อมูลได้แต่เก็บข้อมูลไม่ได้ เพราะยังไม่มีเลขผู้เก็บ ${u.role === "admin" ? `กำหนดเลขให้ตัวเองได้ที่ <a href="../admin/#users">หน้าผู้ใช้ → บัญชีผู้ใช้</a> แล้วกลับมาหน้านี้` : "ให้ผู้วิจัยกำหนดเลขให้ในหน้าหลังบ้าน"}</div>`}
      ${st.meta.mode === 3 ? `<p class="small muted">วันที่ในรหัสผู้ตอบคือวันที่ผู้ตอบส่งคำตอบจากโทรศัพท์ของเขา</p>` : `
      <label class="fld" style="max-width:220px"><span>วันที่เก็บข้อมูล</span><input class="txt" type="date" name="cdate" value="${st.meta.cdate || todayISO()}" max="${todayISO()}"></label>
      <p class="small muted">คีย์ฟอร์มกระดาษย้อนหลัง ให้ใส่วันที่ที่ผู้ตอบกรอกจริง ระบบออกรหัสผู้ตอบให้หลังส่งสำเร็จ แล้วเขียนรหัสนั้นลงมุมขวาบนของฟอร์มกระดาษ</p>`}
      ${sent.length ? `<details class="sent"><summary>ส่งจากเครื่องนี้ล่าสุด ${sent.length} ชุด</summary><table><thead><tr><th>เวลา</th><th>เลขอ้างอิง</th><th>รหัสผู้ตอบ</th></tr></thead><tbody>${sent.map(x => `<tr><td class="num">${esc(new Date(x.at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</td><td class="num">${esc(x.ref)}</td><td class="num"><b>${esc(x.code)}</b></td></tr>`).join("")}</tbody></table></details>` : ""}
    </div>`;
    $("#logout").onclick = () => { Auth.clear(); renderWho(); chips(); };
  }

  function partHead(i, extra = "") {
    const P = PARTS[i];
    const m = P.title.match(/^ส่วนที่ (\d) (.+?) \((ข้อ .+)\)$/);
    const bar = st.meta.mode === 0 || st.meta.mode === 1 ? `<p class="codebar">เลขอ้างอิงฟอร์ม <b class="num">${refOf()}</b><span>รหัสผู้ตอบจะออกหลังส่ง</span></p>` : "";
    return `${progress()}<header class="phead">${bar}<p class="eyebrow">ส่วนที่ ${m[1]} · ${m[3]}</p><h2>${m[2]}</h2>${extra}</header>`;
  }

  function renderPart() {
    const P = PARTS[st.part];
    const intro = st.part === 1 ? `<p class="lead">“ครัวเรือน” ในส่วนนี้ หมายถึงคนที่อาศัยและกินอยู่ร่วมกับท่านเป็นประจำ ถ้าท่านไปทำงานหรือเรียนที่อื่น ให้นึกถึงครัวเรือนที่บ้านในพื้นที่นี้</p>` : st.part === 6 ? `<p class="lead">ส่วนสุดท้ายเป็นคำถามเกี่ยวกับชุมชนของท่านโดยทั่วไป ไม่ใช่เรื่องของตัวท่าน ไม่ต้องระบุชื่อบุคคลใด</p>` : st.part === 4 ? `<p class="lead">ส่วนนี้อยู่หลังการเลือกผู้สมัครโดยเจตนา เพื่อไม่ให้คำถามเรื่องความเสี่ยงชี้นำการเลือก</p>` : "";
    let html = partHead(st.part, intro) + `<form class="panel" novalidate>`;
    const items = P.items;
    items.forEach((it, k) => html += itemHTML(it, items[k - 1]));
    html += `<div class="nav">${navBtns()}</div></form>`;
    app.innerHTML = html;
    bindForm(items);
  }
  function navBtns(nextLabel = "ถัดไป") {
    return `<button type="button" class="btn ghost" id="back">← ย้อนกลับ</button>
      <span class="navr">${DEMO || isTestRun() ? `<button type="button" class="btn ghost small" id="autofill" title="เติมคำตอบสุ่มเพื่อดูขั้นตอนถัดไป">เติมคำตอบสุ่ม</button>` : ""}<button type="button" class="btn primary" id="next">${nextLabel}</button></span>`;
  }

  function bindForm(items) {
    const form = $("form", app);
    form.onchange = form.oninput = e => onInput(e, items);
    form.onclick = e => { if (e.target.id === "brkclear") { delete st.ans["12b"]; refresh("12"); const i = $('input[name="q_12"]'); if (i) i.focus(); } };
    $("#back").onclick = goBack;
    $("#next").onclick = () => next(items);
    const af = $("#autofill"); if (af) af.onclick = () => { autofill(items); st.part === 3 ? renderConjoint() : renderPart(); };
  }
  function onInput(e, items) {
    const t = e.target;
    if (t.dataset.txt) { st.txt[t.dataset.txt] = t.value; return; }
    if (t.name === "res_a") { st.ans["3"] = { a: t.value }; delete st.ans["4"]; refresh("3"); refresh("4"); return; }
    if (t.name === "res_t") { st.ans["3"].t = t.value; delete st.ans["4"]; refresh("4"); return; }
    if (t.name === "res_m") { st.ans["3"].m = t.value; return; }
    if (t.name === "ph" || t.name === "pht") { st.contact = st.contact || {}; st.contact[t.name === "ph" ? "phone" : "time"] = t.value; clearFlag("63"); return; }
    if (t.name === "q_1m") { st.ans["1m"] = +t.value; clearFlag("1"); return; }
    if (t.name === "q_8b") { st.ans["8b"] = t.value === "" ? undefined : +t.value; return; }
    if (t.name === "q_12b") { st.ans["12b"] = +t.value; delete st.ans["12"]; refresh("12"); return; }
    if (/^q_64[a-d]$/.test(t.name)) {
      const k = t.name.slice(2), p = itemOf("64").parts.find(x => x.k === k), c = +t.value;
      if (p.type === "check") { let v = (st.ans[k] || []).filter(x => x !== c); if (t.checked) v = p.excl.includes(c) ? [c] : v.filter(x => !p.excl.includes(x)).concat(c); st.ans[k] = v.sort((a, b) => a - b); $$(`input[name="${t.name}"]`).forEach(x => x.checked = st.ans[k].includes(+x.value)); }
      else st.ans[k] = c;
      clearFlag("64"); return;
    }
    if (!t.name || !t.name.startsWith("q_")) return;
    const n = t.name.slice(2), it = items.find(i => i.n === n);
    if (!it) return;
    if (it.type === "check") {
      const c = +t.value;
      let v = (st.ans[n] || []).filter(x => x !== c);
      if (t.checked) {
        if (it.excl.includes(c)) v = [c];
        else v = v.filter(x => !it.excl.includes(x)).concat(c);
      }
      st.ans[n] = v.sort((a, b) => a - b);
      $$(`input[name="q_${n}"]`).forEach(x => x.checked = st.ans[n].includes(+x.value));
    } else if (it.type === "year" || it.type === "num") {
      st.ans[n] = t.value === "" ? undefined : +t.value;
      if (it.type === "year") { $("#agefb").innerHTML = ageMsg(t.value); $("#monthbox").hidden = +t.value !== 2551; if (+t.value !== 2551) delete st.ans["1m"]; }
    } else if (it.type === "income") {
      st.ans["12"] = t.value === "" ? undefined : +t.value;
    } else if (it.type === "conf") {
      const x = t.value === "" ? undefined : Math.round(+t.value); st.ans[n] = x == null || isNaN(x) ? undefined : Math.max(0, Math.min(100, x));
    } else if (it.type === "lgu") {
      st.ans[n] = t.value;
    } else {
      st.ans[n] = +t.value;
      if (it.type === "phase2") { const box = $("#phonebox"); box.hidden = st.ans[n] !== 1; if (st.ans[n] !== 1) st.contact = null; else if (e.type === "change") $('input[name="ph"]').focus(); }
      if (it.other) { const o = $(`[data-txt="${n}"]`); o.hidden = st.ans[n] !== it.other; if (o.hidden) delete st.txt[n]; else if (e.type === "change") o.focus(); }
    }
    clearFlag(n);
    applySkips();
  }
  function refresh(n) {
    const it = itemOf(n);
    const el = $(`#q-${n} .qa`); if (el) el.innerHTML = body(it);
    clearFlag(n);
  }
  const clearFlag = n => { const q = $(`#q-${n}`); if (q) q.classList.remove("miss"); };

  const HARD = ["1", "3", "4", "5", "6"];          // needed for eligibility and the respondent code: cannot be skipped
  const yearOK = v => v >= 2440 && v <= 2569;
  function next(items) {
    const hard = items.filter(it => HARD.includes(it.n) && (!answered(it) || (it.n === "1" && !yearOK(st.ans["1"]))));
    if (hard.length) {
      $$(".q.miss").forEach(q => q.classList.remove("miss"));
      hard.forEach(it => { const q = $(`#q-${it.n}`); if (q) q.classList.add("miss"); });
      $(`#q-${hard[0].n}`).scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      toast(`ข้อ ${hard.map(i => i.n).join(", ")} ต้องตอบก่อนไปต่อ ใช้คัดกรองและสร้างรหัสผู้ตอบ`);
      return;
    }
    const miss = items.filter(it => !answered(it));
    $$(".q.miss").forEach(q => q.classList.remove("miss"));
    const key = st.screen + st.part + (st.part === 3 ? st.cj.stage : "");     // warn once per screen
    if (miss.length && !st.warned[key]) {
      miss.forEach(it => { const q = $(`#q-${it.n}`); if (q) q.classList.add("miss"); });
      const first = $(`#q-${miss[0].n}`);
      first.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      toast(`ยังไม่ได้ตอบ ${miss.length} ข้อ${DEMO ? " · กดถัดไปอีกครั้งเพื่อข้าม (โหมดตัวอย่าง)" : " · ถ้าไม่ประสงค์ตอบ กดถัดไปอีกครั้งเพื่อข้าม"}`);
      st.warned[key] = true;
      return;
    }
    advance();
  }
  function advance() {
    if (st.screen === "part" && st.part === 0) {
      const y = st.ans["1"];
      const out = (y && y > 2551) || lateBorn() || st.ans["5"] === 3 || st.ans["6"] === 2;
      if (out) { st.screen = "out"; return render(); }
    }
    if (st.part === 3) return cjAdvance();         // only the follow-up screen (37–41) comes here
    if (st.part === 6) return finish();
    st.part++; if (st.part === 3) st.cj.stage = "intro";
    render();
  }
  function goBack() {
    if (st.part === 3 && st.cj.stage !== "intro") return cjBack();
    if (st.part === 0) { st.screen = "intro"; return render(); }
    st.part--;
    if (st.part === 3) { if (st.ans["34"] === 0) st.cj.stage = "intro"; else { ensureTasks(); st.cj.stage = "task"; st.cj.i = st.cj.tasks.length - 1; } }
    render();
  }

  function autofill(items) {
    for (const it of items) {
      if (answered(it) || (it.type === "check" && Array.isArray(st.ans[it.n]))) continue;
      switch (it.type) {
        case "year": st.ans["1"] = 2500 + Math.floor(R() * 50); break;
        case "residence": { if (isPilot()) { st.ans["3"] = { a: "ชุมพลบุรี", t: "ชุมพลบุรี" }; break; } const a = pick(["เมืองบุรีรัมย์", "สตึก", "บ้านด่าน", "แคนดง"]); st.ans["3"] = { a, t: pick(S.tambons.filter(t => t.a === a)).t }; break; }
        case "lgu": { if (isPilot()) { st.ans["4"] = pick(["pilot:tb", "pilot:ao"]); break; } const d = st.ans["3"] || {}; const L = S.lgus.filter(l => l.d === d.a && (!d.t || l.t.includes(d.t))); st.ans["4"] = L.length ? pick(L).n : "unsure"; break; }
        case "num": st.ans[it.n] = 1 + Math.floor(R() * 6); break;
        case "income": if (R() < .7) st.ans["12"] = 3000 + Math.floor(R() * 40) * 1000; else st.ans["12b"] = 1 + Math.floor(R() * 9); break;
        case "conf": st.ans[it.n] = Math.floor(R() * 101); break;
        case "enum": it.parts.forEach(p => { st.ans[p.k] = p.type === "check" ? [1] : 1; }); break;
        case "check": { const o = it.o.filter(o => !it.excl.includes(o.c)); st.ans[it.n] = shuffle(o).slice(0, 1 + Math.floor(R() * 2)).map(o => o.c).sort((a, b) => a - b); break; }
        case "ipc": st.ans[it.n] = pick([-3, -2, -1, 1, 2, 3]); break;
        case "occ": st.ans["8"] = pick(it.o.filter(o => o.c !== it.other)).c; break;
        case "phase2": st.ans["63"] = 2; break;
        default: st.ans[it.n] = pick(it.o.filter(o => o.c !== it.other)).c;
      }
      applySkips();
    }
    if (items.some(i => i.n === "1")) {                 // keep the demo respondent eligible
      if (st.ans["1"] >= 2551) { st.ans["1"] = 2540; delete st.ans["1m"]; }
      if (st.ans["5"] === 3) st.ans["5"] = 1;
      if (st.ans["6"] === 2) st.ans["6"] = 1;
    }
    applySkips();
  }

  /* ---------- conjoint ---------- */
  const NAMES = { "ชาย": ["วิชัย", "สมพงษ์", "เกรียงไกร", "บุญมี", "ทองดี", "คำปั่น", "สมบัติ", "อำนวย", "ประสิทธิ์", "สุรชัย", "ธนากร", "บุญเลิศ"],
                  "หญิง": ["สุภาพร", "วันเพ็ญ", "อรุณี", "นงลักษณ์", "จันทร์เพ็ญ", "พิมพ์ใจ", "ศิริพร", "บุษบา", "มาลัย", "รัตนา", "อำไพ", "สมใจ"] };
  const ATTR = {
    occ: { l: "อาชีพเดิม", v: ["วิศวกรโยธา", "ทนายความ", "อาจารย์มหาวิทยาลัย", "ครู", "เกษตรกร", "พยาบาล", "พนักงานบริษัทเอกชน"] },
    exp: { l: "ประสบการณ์การเมือง", v: ["ไม่เคยดำรงตำแหน่งทางการเมือง", "สมาชิกสภาท้องถิ่น 8 ปี", "อดีตนายก อบต."] },
    fam: { l: "ครอบครัว", v: ["ครอบครัวไม่เคยอยู่ในการเมือง", "ครอบครัวอยู่ในการเมืองท้องถิ่นมานาน"] },
    role: { l: "บทบาทในชุมชน", v: ["เป็นเจ้าภาพงานบุญ งานศพ และช่วยชาวบ้านติดต่อราชการ", "ให้คำปรึกษาด้านอาชีพแก่ชาวบ้านโดยไม่คิดค่าใช้จ่าย", "ยังไม่เคยมีบทบาทช่วยเหลือในพื้นที่"] },
    tie: { l: "กับครอบครัวท่าน", v: ["เคยช่วยครอบครัวของท่านโดยตรงตอนเดือดร้อนเมื่อปีที่แล้ว", "ไม่เคยรู้จักหรือช่วยเหลือครอบครัวของท่านเป็นการส่วนตัว"] },
    offer: { l: "สิ่งที่เสนอ", v: ["ผลักดันนโยบายในสภาเพื่อแก้ “เรื่องของท่าน”", "ผลักดันนโยบายในสภาเพื่อแก้ “เรื่องอื่น”", "ใช้งบทำโครงการส่วนรวมในตำบลเพื่อแก้ “เรื่องของท่าน” ทุกครัวเรือนได้ประโยชน์", "ช่วยค่าใช้จ่ายเมื่อเดือดร้อน ให้ทุกครอบครัวไม่ว่าจะเลือกใคร", "ช่วยค่าใช้จ่ายเมื่อเดือดร้อน เฉพาะครอบครัวที่สนับสนุนตน"] },
    amt: { l: "วงเงิน", v: ["ครั้งละไม่เกิน 1,000 บาท", "ครั้งละไม่เกิน 2,000 บาท"] },
    time: { l: "ระยะเวลา", v: ["ได้ผลภายในปีแรก", "เห็นผลภายใน 2 ปี", "ใช้เวลาราว 4 ปี"] },
    cert: { l: "ความแน่นอน", v: ["แน่นอนว่าทำได้จริง", "ถ้าสำเร็จจะแก้ได้เกือบทั้งหมด แต่มีโอกาสราวครึ่งหนึ่งที่จะไม่สำเร็จ", "แก้ได้บางส่วน (ราว 1 ใน 3) แต่ค่อนข้างแน่นอน"] },
  };
  const ROWS_FIXED = ["occ", "bg", "offer", "result"], ROW_L = { occ: "อาชีพ", bg: "ภูมิหลัง", offer: "สิ่งที่เสนอ", result: "ผลที่จะได้รับ" };
  let rowOrder = null;   // random design: order of the 5 background rows, fixed per respondent

  function randProfile(sex) {
    const p = { sex, age: 42 + Math.floor(R() * 14) };
    for (const k of ["occ", "exp", "fam", "role", "tie", "offer"]) p[k] = Math.floor(R() * ATTR[k].v.length);
    if (p.exp > 0 && p.role === 2) p.role = Math.floor(R() * 2);              // restriction: office-holders have a community role
    const help = p.offer >= 3;
    if (help) p.amt = Math.floor(R() * 2); else { p.time = Math.floor(R() * 3); p.cert = Math.floor(R() * 3); }
    return p;
  }
  function makeRandomTask(k) {
    const sexA = R() < .5 ? "ชาย" : "หญิง", sexB = R() < .5 ? "ชาย" : "หญิง";
    let A, B, n = 0;
    do { A = randProfile(sexA); B = randProfile(sexB); n++; } while (n < 20 && ["occ", "exp", "fam", "role", "tie", "offer"].every(k => A[k] === B[k]));
    const parties = shuffle(["A", "B", "C", "D"]);
    A.party = parties[0]; B.party = parties[1];
    const nm = shuffle(NAMES["ชาย"]), nf = shuffle(NAMES["หญิง"]);
    A.name = (sexA === "ชาย" ? "นาย" : "นาง") + (sexA === "ชาย" ? nm[0] : nf[0]);
    B.name = (sexB === "ชาย" ? "นาย" : "นาง") + (sexB === "ชาย" ? nm[1] : nf[1]);
    const [la, lb] = Avatar.pairLooks(sexA, sexB, R)(A.age, B.age);
    A.look = la; B.look = lb;
    return { k, design: "random", L: A, Rt: B, choice: null };
  }
  function makeFixedTasks() {
    const pairs = PARTS[3].items.filter(i => i.type === "pair");
    return [1, 2, 3, 4, 5].map(k => {                           // v1.8: always pair 1 → 5; set B swaps the columns
      const p = pairs.find(x => x.k === k);
      let L = { ...p.A }, Rt = { ...p.B };
      if (st.meta.version === "B") [L, Rt] = [Rt, L];
      const [la, lb] = Avatar.pairLooks(L.sex, Rt.sex, R)(L.age, Rt.age);
      L.look = la; Rt.look = lb;
      return { k, n: p.n, v: p.v, design: "fixed", pre: p.pre, L, Rt, choice: null, A: p.A.name };
    });
  }
  function ensureTasks() {
    if (st.cj.tasks && st.cj.tasks.design === st.meta.design) return;
    if (st.meta.design === "random") {
      rowOrder = shuffle(["occ", "exp", "fam", "role", "tie"]);
      st.cj.tasks = Array.from({ length: 5 }, (_, i) => makeRandomTask(i + 1));
    } else st.cj.tasks = makeFixedTasks();
    st.cj.tasks.design = st.meta.design;
  }

  function rowsFor(p, design) {
    if (design === "fixed") return ROWS_FIXED.map(k => [ROW_L[k], fill(p[k])]);
    const out = rowOrder.map(k => [ATTR[k].l, ATTR[k].v[p[k]]]);
    const help = p.offer >= 3;
    out.push(["สิ่งที่เสนอ", fill(ATTR.offer.v[p.offer]) + (help ? ` ${ATTR.amt.v[p.amt]}` : "")]);
    out.push(["ผลที่จะได้รับ", help ? "ได้รับความช่วยเหลือทันทีเมื่อร้องขอ แต่ช่วยเป็นครั้ง ๆ" : `${ATTR.time.v[p.time]} · ${ATTR.cert.v[p.cert]}`]);
    return out;
  }
  /* ---------- what differs in a pair: word-level comparison of the two candidates' rows (pairs 2–7 only;
     pair 1 differs on everything, so nothing is marked there). Names, ages and party letters are not marked,
     except the party line in pair 7, where the party is the thing that differs. ---------- */
  const HIGHLIGHT = true;
  const SEG = window.Intl && Intl.Segmenter ? new Intl.Segmenter("th", { granularity: "word" }) : null;
  const toks = s => SEG ? [...SEG.segment(s)].map(x => x.segment) : s.split(/(\s+)/);
  function diffMark(a, b) {                      // returns [htmlA, htmlB] with differing words wrapped in <mark>
    const A = toks(a), B = toks(b), n = A.length, m = B.length;
    const L = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const ka = new Array(n).fill(false), kb = new Array(m).fill(false);
    for (let i = 0, j = 0; i < n && j < m;) { if (A[i] === B[j]) { ka[i] = kb[j] = true; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
    const out = (T, keep) => { let h = "", open = false;
      T.forEach((t, i) => { const ch = !keep[i] && /\S/.test(t); if (ch && !open) { h += '<mark class="df">'; open = true; } else if (!ch && open && /\S/.test(t)) { h += "</mark>"; open = false; } h += esc(t); });
      return h + (open ? "</mark>" : ""); };
    return [out(A, ka), out(B, kb)];
  }
  function pairMarks(task) {
    if (!HIGHLIGHT || task.design !== "fixed" || task.k === 1) return null;
    if (task.marks) return task.marks;
    const L = {}, Rr = {};
    ROWS_FIXED.forEach(k => { const a = fill(task.L[k]), b = fill(task.Rt[k]); if (a !== b) [L[k], Rr[k]] = diffMark(a, b); });
    return (task.marks = { L, R: Rr });
  }
  function candCard(p, side, task, col) {
    const uid = `${task.k}${side}${Math.floor(R() * 1e6)}`;
    const party = task.design === "fixed" ? p.party : p.party;
    const sideCls = side === "L" ? "l" : "r";
    const marks = pairMarks(task), mk = marks ? marks[side === "L" ? "L" : "R"] : null;
    const picked = task.choice === side ? " picked" : task.choice ? " other" : "";
    return `<article class="cand ${sideCls}${picked}" data-side="${side}" style="--d:${(R() * 3).toFixed(2)}s">
      <div class="cand-top">${Avatar.svg(p.look, uid)}<div class="who"><span class="col">ผู้สมัคร ${col}</span><h3>${esc(p.name)}</h3><p class="num small">อายุ ${p.age} ปี · ${p.sex}</p><span class="party">${mk && mk.party ? mk.party : /^[A-D]$/.test(party) ? "พรรค " + party : esc(party)}</span></div></div>
      <dl>${task.design === "fixed" ? ROWS_FIXED.map(k => { const odds = k === "result" && (fill(p[k]).match(/โอกาสสำเร็จ (\d+) ใน 10/) || [])[1];
        return `<div${mk && mk[k] ? ' class="dif"' : ""}><dt>${ROW_L[k]}</dt><dd>${mk && mk[k] ? mk[k] : esc(fill(p[k]))}${odds ? beanRow(+odds) : ""}</dd></div>`; }).join("") : rowsFor(p, task.design).map(([l, v]) => `<div><dt>${l}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
      <button type="button" class="btn choose" data-side="${side}">เลือกผู้สมัคร ${col}</button>
      <span class="stamp" aria-hidden="true">เลือกแล้ว</span>
    </article>`;
  }

  function renderConjoint() {
    ensureTasks();
    const c = st.cj;
    if (c.stage === "follow") {                    // after pair 1: items 37–41
      const items = PARTS[3].items.filter(i => i.follow);
      app.innerHTML = partHead(3) + `<form class="panel" novalidate><p class="lead">คำถามต่อจากคู่ที่ 1 (นายวิชัย และนายสมพงษ์)</p>${items.map((it, k) => itemHTML(it, items[k - 1])).join("")}<div class="nav">${navBtns()}</div></form>`;
      return bindForm(items);
    }
    if (c.stage === "intro") {
      app.innerHTML = partHead(3) + `<section class="panel">
        <p class="lead">ต่อไปจะให้ท่านดูผู้สมัคร ส.ส. เขตสมมติ 5 คู่ ทุกคนแต่งขึ้น พรรค A ถึง D ก็เป็นพรรคสมมติ ให้ท่านเลือกคนที่จะลงคะแนนให้ในแต่ละคู่ ไม่มีคำตอบถูกหรือผิด</p>
        <ul class="bul"><li>ภาพผู้สมัครเป็นภาพวาดประกอบเท่านั้น</li><li>“เรื่องของท่าน” ในคู่ผู้สมัคร คือ <b>${esc(issueText())}</b> ที่ท่านเลือกไว้ในข้อ ${DN("21")} (ข้อ ${DN("35")}: ระบบเติมให้แล้ว)</li></ul>
        <fieldset class="q" id="q-34"><legend class="qh"><span class="qn num">${DN("34")}</span><span class="qt">ตรวจความเข้าใจ: ผู้สมัครที่จะเห็นต่อไปนี้เป็นคนจริงหรือคนสมมติ</span></legend>
          <div class="opts row"><label class="opt"><input type="radio" name="cmp" value="1"><span class="box"></span><span class="ot">คนสมมติ</span></label><label class="opt"><input type="radio" name="cmp" value="2"><span class="box"></span><span class="ot">คนจริง</span></label><label class="opt"><input type="radio" name="cmp" value="3"><span class="box"></span><span class="ot">ไม่แน่ใจ</span></label></div>
          <p class="live small" id="cmpfb">${c.fails ? `<span class="bad">ผู้สมัครทุกคนเป็นคนสมมติ ขอให้อ่านคำชี้แจงอีกครั้งแล้วตอบใหม่</span>` : ""}</p></fieldset>
        <div class="nav">${navBtns("เริ่มคู่ที่ 1")}</div></section>`;
      $("#back").onclick = goBack;
      const af = $("#autofill"); if (af) af.remove();
      $("#next").onclick = () => {
        const v = $('input[name="cmp"]:checked');
        if (!v) { $("#q-34").classList.add("miss"); return; }
        if (v.value === "1") { st.ans["34"] = c.fails ? 2 : 1; c.stage = "task"; c.i = 0; return render(); }
        c.fails++;
        if (c.fails >= 2) { st.ans["34"] = 0; toast(`ข้ามการเลือกผู้สมัคร ไปส่วนที่ 5 (ข้อ ${DN("46")})`); st.part = 4; return render(); }
        $("#cmpfb").innerHTML = `<span class="bad">ผู้สมัครทุกคนเป็นคนสมมติ ขอให้อ่านคำชี้แจงอีกครั้งแล้วตอบใหม่</span>`;
        v.checked = false;
      };
      return;
    }
    // task screen
    const t = c.tasks[c.i];
    const pre = t.pre ? `<div class="notice acc">${esc(t.pre.replace(/[“”]/g, ""))}</div>` : "";
    app.innerHTML = partHead(3) + `<section class="panel conj">
      <div class="conj-head"><p class="eyebrow num">คู่ที่ ${c.i + 1} / ${c.tasks.length}</p>
        <div class="dots">${c.tasks.map((x, i) => `<i class="${x.choice ? "on" : ""}${i === c.i ? " cur" : ""}"></i>`).join("")}</div></div>
      ${pre}
      <h3 class="ask"><span class="qn num">${DN(t.n)}</span> ถ้าท่านต้องเลือกระหว่างผู้สมัครสองคนนี้ ท่านจะลงคะแนนให้คนใด</h3>
      ${pairMarks(t) ? `<p class="dfnote"><mark class="df">ข้อความที่ขีดเน้น</mark> คือจุดที่สองคนนี้ต่างกัน นอกนั้นเหมือนกัน</p>` : ""}
      <div class="pair">${candCard(t.L, "L", t, "ก")}<div class="vs" aria-hidden="true">หรือ</div>${candCard(t.Rt, "R", t, "ข")}</div>
      <div class="nav"><button type="button" class="btn ghost" id="back">← ย้อนกลับ</button>
        <span class="navr">${DEMO && t.design === "random" ? `<button type="button" class="btn ghost" id="reroll" title="สุ่มคุณลักษณะคู่นี้ใหม่ (โหมดตัวอย่าง)">↻ สุ่มคู่นี้ใหม่</button>` : ""}
        <button type="button" class="btn primary" id="next" ${t.choice ? "" : "disabled"}>ถัดไป</button></span></div>
    </section>`;
    $("#back").onclick = goBack;
    $("#next").onclick = cjAdvance;
    const rr = $("#reroll");
    if (rr) rr.onclick = () => {
      const pair = $(".pair"); pair.classList.add("flip");
      setTimeout(() => { c.tasks[c.i] = makeRandomTask(t.k); renderConjoint(); }, reduce ? 0 : 260);
    };
    $(".pair").onclick = e => {
      const card = e.target.closest(".cand"); if (!card) return;
      if (e.target.closest("dl") && !e.target.closest(".choose") && window.getSelection().toString()) return;
      const side = card.dataset.side;
      t.choice = side; t.at = Math.round(performance.now() - st.t0);
      st.ans[t.n] = (side === "L" ? t.L : t.Rt).name === t.A ? 1 : 2;          // coded by candidate: 1 = candidate ก of set A
      $$(".cand").forEach(x => { x.classList.toggle("picked", x.dataset.side === side); x.classList.toggle("other", x.dataset.side !== side); });
      $$(".dots i")[c.i].classList.add("on");
      $("#next").disabled = false;
      clearTimeout(st.cjT);
      st.cjT = setTimeout(cjAdvance, reduce ? 300 : 900);
    };
  }
  function cjAdvance() {
    clearTimeout(st.cjT);
    const c = st.cj;
    if (c.stage === "task") {
      if (!c.tasks[c.i].choice) return;
      if (c.i === 0 && !c.follow.done) { c.stage = "follow"; c.follow.done = true; return render(); }
      if (c.i < c.tasks.length - 1) { c.i++; return render(); }
      st.part = 4; st.screen = "part"; return render();
    }
    if (c.stage === "follow") { c.stage = "task"; c.i = Math.min(1, c.tasks.length - 1); return render(); }
  }
  function cjBack() {
    clearTimeout(st.cjT);
    const c = st.cj;
    if (c.stage === "follow") { c.stage = "task"; c.i = 0; return render(); }
    if (c.stage === "task") {
      if (c.i === 0) { c.stage = "intro"; return render(); }
      if (c.i === 1) { c.stage = "follow"; return render(); }
      c.i--; return render();
    }
  }

  /* ---------- IPC short form: 3 items per dimension, −3..+3 each, sum + 9 = 0–18.
     Computed when at least 2 of 3 items are answered (mean × 3). Kept for the researchers only: respondents never see a score. ---------- */
  function scores() {
    const s = { I: 0, P: 0, C: 0 }, n = { I: 0, P: 0, C: 0 };
    for (const it of PARTS[5].items) { const v = st.ans[it.n]; if (typeof v === "number") { s[it.dim] += v; n[it.dim]++; } }
    const out = {};
    for (const k of ["I", "P", "C"]) out[k] = n[k] === 3 ? s[k] + 9 : n[k] === 2 ? Math.round((s[k] / 2) * 3 + 9) : null;
    out.complete = n.I === 3 && n.P === 3 && n.C === 3;
    return out;
  }

  function record() {
    const sc = scores();
    return {
      meta: { id: st.meta.id, code: null, test: DEMO || isTestRun(), phase: !DEMO && isPilot() ? "pilot" : undefined, dataset: DEMO ? "test" : curSet(), enumerator: st.meta.enumerator, collector: st.meta.mode === 0 || st.meta.mode === 1 ? st.meta.collector : "", cdate: st.meta.cdate, collectedBE: beYear(st.meta.cdate || todayISO()), started: st.meta.started, finished: new Date().toISOString(), seconds: Math.round((performance.now() - (st.t0 || 0)) / 1000), mode: st.meta.mode, venue: st.meta.venue, design: st.meta.design, version: st.meta.version, order: st.meta.order, gsize: st.meta.mode === 3 ? "" : st.meta.group.size, gcode: st.meta.group.size > 1 ? st.meta.group.code : "", instrument: "v1.9" },
      answers: { ...st.ans }, text: { ...st.txt },
      conjoint: (st.cj.tasks || []).map((t, i) => ({ task: i + 1, pair: t.k, item: t.n, chosen: t.choice, ms: t.at, left: strip(t.L, t.design), right: strip(t.Rt, t.design) })),
      ipc: { I: sc.I, P: sc.P, C: sc.C, complete: sc.complete },
      contact: st.ans["63"] === 1 && st.contact && validPhone(st.contact.phone) ? { phone: String(st.contact.phone).replace(/\D/g, ""), time: st.contact.time || "" } : undefined,
    };
  }
  function strip(p, design) {
    const look = { sex: p.look.sex, pose: p.look.pose, skin: p.look.skin, shirt: p.look.shirt, hairC: p.look.hairC, flip: p.look.flip };
    if (design === "fixed") return { name: p.name, party: p.partyCode || p.party, look };
    const o = { party: p.party, sex: p.sex, age: p.age, look };
    for (const k of ["occ", "exp", "fam", "role", "tie", "offer", "amt", "time", "cert"]) if (p[k] !== undefined) o[k] = p[k];
    return o;
  }

  /* ---------- sending: an outbox in this browser, so a lost signal in the field does not lose an interview.
     The server issues the respondent code when the record arrives; interviewer forms go with the collector's sign-in token. ---------- */
  const outbox = () => store.get("outbox", []);
  function remember(rec, code) {
    const sent = store.get("sent", []).filter(x => x.ref !== refOf(rec.meta.id));
    sent.unshift({ ref: refOf(rec.meta.id), code, at: Date.now(), by: rec.meta.collector || "", test: !!rec.meta.test });
    store.set("sent", sent.slice(0, 200));
  }
  let flushing = false;
  async function flush() {
    if (flushing) return; flushing = true;
    const se = Auth.get(), keep = [];
    for (const it of outbox()) {
      const mine = it.rec.meta.id === st.meta.id, needSign = it.rec.meta.mode === 0 || it.rec.meta.mode === 1;
      if (needSign && (!se || se.demo || se.user.username !== it.rec.meta.collector)) {          // wait for the person who collected it to sign in
        keep.push(it); if (mine) st.send = { state: "login" }; continue;
      }
      const j = await Auth.api("submit", { rec: it.rec, invite: it.invite });
      if (j.ok) { remember(it.rec, j.code); if (it.invite) store.set("inv.done", store.get("inv.done", []).concat([it.invite.slice(-24)]).slice(-50)); if (mine) st.send = { state: "ok", code: j.code, flag: j.flag }; }
      else if (j.offline || j.auth) { keep.push(it); if (mine) st.send = { state: j.auth ? "login" : "queued" }; }
      else if (mine) st.send = { state: "rejected", error: j.error };          // the current interview stays on screen
      else keep.push(Object.assign(it, { error: j.error }));
    }
    store.set("outbox", keep); flushing = false; chips();
    if (st.screen === "done") sendBox();
  }
  function finish() {
    if (DEMO) st.meta.code = makeCode();
    const rec = record();
    st.rec = rec;
    if (!DEMO && CONFIG.endpoint) { store.set("outbox", outbox().concat([st.meta.mode === 3 ? { rec, invite: INV } : { rec }])); st.send = { state: "sending" }; flush(); }
    st.screen = "done"; render();
  }
  function sendBox() {
    const el = $("#sendbox"); if (!el) return;
    const s = st.send || {}, paper = st.meta.mode === 0, ref = refOf();
    if (DEMO) el.innerHTML = `<div class="notice acc small">โหมดตัวอย่าง: เมื่อเปิดเก็บจริง ระบบจะออกรหัสผู้ตอบให้หลังส่ง เช่น <b class="num">${esc(st.meta.code)}</b></div>`;
    else if (s.state === "ok") el.innerHTML = `<div class="notice acc"><b>บันทึกแล้ว</b> · รหัสผู้ตอบ <b class="num big-code">${esc(s.code)}</b>${paper ? `<br><span class="small">เขียนรหัสนี้ที่มุมขวาบนของฟอร์มกระดาษ</span>` : ""}${s.flag ? `<br><span class="small">ระบบติดธง: ${esc(s.flag)} ผู้วิจัยจะตรวจสอบภายหลัง</span>` : ""}</div>`;
    else if (s.state === "sending") el.innerHTML = `<div class="notice acc">กำลังส่งคำตอบ…</div>`;
    else if (s.state === "queued") el.innerHTML = `<div class="notice"><b>ยังส่งไม่ได้</b> คำตอบเก็บไว้ในเครื่องนี้แล้ว ระบบจะส่งให้เองเมื่อมีสัญญาณ ${paper ? `เขียนเลขอ้างอิง <b class="num">${ref}</b> บนฟอร์มกระดาษไว้ก่อน รหัสผู้ตอบจะขึ้นในรายการ “ส่งจากเครื่องนี้”` : ""} <button type="button" class="btn" id="resend">ส่งอีกครั้ง</button></div>`;
    else if (s.state === "login") el.innerHTML = `<div class="notice"><b>ต้องเข้าสู่ระบบก่อนส่ง</b> คำตอบเก็บไว้ในเครื่องนี้แล้ว (เลขอ้างอิง <b class="num">${ref}</b>) ให้ผู้เก็บที่สัมภาษณ์ชุดนี้เข้าสู่ระบบ แล้วระบบจะส่งให้เอง<div id="relogin" style="margin-top:10px"></div></div>`;
    else if (s.state === "rejected") el.innerHTML = `<div class="notice"><b>ระบบไม่รับคำตอบนี้</b> ${esc(s.error || "")} <span class="small">(เลขอ้างอิง ${ref})</span></div>`;
    const rs = $("#resend"); if (rs) rs.onclick = () => { st.send = { state: "sending" }; sendBox(); flush(); };
    const rl = $("#relogin"); if (rl) Auth.form(rl, { onDone: () => { st.send = { state: "sending" }; sendBox(); flush(); } });
  }
  function chips() {
    const el = $("#chips"); if (!el) return;
    const n = outbox().length;
    el.innerHTML = (DEMO ? `<span class="chip warn"><i></i>โหมดตัวอย่าง · ไม่บันทึกคำตอบ</span><span class="chip">รอ EC อนุมัติก่อนเปิดเก็บจริง</span>`
      : isTestRun() ? `<span class="chip warn"><i></i>โหมดทดสอบระบบ · บันทึกเป็นข้อมูลทดสอบ</span>` : isPilot() ? `<span class="chip acc"><i></i>โหมดนำร่อง · เก็บแยกจากข้อมูลจริง</span>` : `<span class="chip mint"><i></i>เก็บข้อมูลจริง</span>`) +
      (n ? `<span class="chip warn">รอส่ง ${n} ชุด</span>` : "") +
      (INV ? `<span class="chip acc">ตอบผ่าน QR ของผู้เก็บข้อมูล${invInfo ? " เลข " + invInfo.enumerator : ""}</span>` : Auth.get() ? `<span class="chip">เข้าสู่ระบบ: ${esc(Auth.get().user.username)}</span>` : "");
  }

  function renderDone() {
    app.innerHTML = progress() + `
    <section class="panel done">
      <p class="eyebrow">จบแบบสอบถามแล้ว</p>
      <h2>ขอบคุณที่สละเวลาร่วมตอบ</h2>
      <p class="lead">คำตอบของท่านใช้วิเคราะห์ในภาพรวมเท่านั้น ไม่นำเสนอรายบุคคลหรือรายหมู่บ้าน${st.ans["63"] === 1 ? " ผู้วิจัยอาจโทรศัพท์ติดต่อเพื่อนัดสัมภาษณ์ระยะที่ 2 ตามที่ท่านยินดี และจะลบเบอร์ภายใน 90 วัน" : ""}</p>
      <div id="sendbox"></div>
      ${DEMO ? `<details class="rec"><summary>ข้อมูลที่ระบบจะบันทึกเมื่อเปิดเก็บจริง <span class="chip">โหมดตัวอย่าง · ไม่ได้ส่งไปที่ใด</span></summary>
        <p class="small muted">หนึ่งแถวต่อผู้ตอบ ไม่มีชื่อหรือพิกัด เบอร์โทร (เฉพาะผู้ที่ยินดี) แยกไปเก็บอีกชีตและไม่อยู่ในแถวคำตอบ ข้อ 29–33 เก็บเฉพาะคำตอบ การตรวจคะแนนทำตอนวิเคราะห์เท่านั้น คะแนน IPC (0–18) เก็บไว้ให้ผู้วิจัย ไม่แสดงต่อผู้ตอบ</p>
        <pre>${esc(JSON.stringify(Object.assign({}, st.rec, st.rec.contact ? { contact: { phone: "[ซ่อน]", time: st.rec.contact.time } } : {}), null, 1))}</pre>
        <button type="button" class="btn" id="dl">ดาวน์โหลดไฟล์ JSON</button></details>` : ""}
      <div class="nav"><button type="button" class="btn ghost" id="again">เริ่มใหม่</button><a class="btn primary" href="../">กลับหน้าหลักงานวิจัย</a></div>
    </section>`;
    const dl = $("#dl");
    if (dl) dl.onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(Object.assign({}, st.rec, { contact: undefined }), null, 1)], { type: "application/json" })); a.download = `survey-demo-${st.meta.id}.json`; a.click(); };
    $("#again").onclick = () => location.reload();
    sendBox();
  }

  function renderOut() {
    app.innerHTML = `<section class="panel"><h2>ขอบคุณสำหรับเวลาของท่าน</h2>
      <p class="lead">${st.ans["6"] === 2 ? "ท่านเคยตอบแบบสอบถามชุดนี้แล้ว ขอบคุณที่ร่วมงานวิจัยอีกครั้ง ไม่ต้องตอบซ้ำ" : "จากคำตอบในส่วนที่ 1 ท่านไม่อยู่ในกลุ่มที่งานวิจัยนี้ศึกษา (ผู้มีสิทธิเลือกตั้งที่มีชื่อในทะเบียนบ้านใน 4 อำเภอของบุรีรัมย์) จึงขอยุติการตอบเพียงเท่านี้"}</p>
      <div class="nav"><button class="btn ghost" id="b">← แก้คำตอบส่วนที่ 1</button>${DEMO ? `<button class="btn" id="c">ทดลองต่อ (โหมดตัวอย่าง)</button>` : ""}</div></section>`;
    $("#b").onclick = () => { st.screen = "part"; st.part = 0; render(); };
    const c = $("#c"); if (c) c.onclick = () => { st.screen = "part"; st.part = 1; render(); };
  }

  let toastT;
  /* ---------- IPC 24-item trial (Levenson, 1981): a separate questionnaire in a full-screen dialog ----------
     Thai draft translation: items 2, 3, 6, 7, 11, 13, 18, 19, 23 as in the main questionnaire (IOC-reviewed); the other 15 are new
     and need the advisor's review. Each item −3…+3 without 0; subscale = sum + 24 (0–48). Scores are shown on screen only for the
     test dataset (the researcher trying it); for pilot or live answers they go to the admin page only, never to the respondent. */
  const IPC24 = [
    [1, "I", "การที่ฉันจะได้เป็นผู้นำหรือไม่ ขึ้นอยู่กับความสามารถของฉันเป็นหลัก"],
    [2, "C", "ชีวิตของฉันถูกกำหนดโดยเหตุการณ์ที่เกิดขึ้นโดยบังเอิญเป็นส่วนใหญ่"],
    [3, "P", "ฉันรู้สึกว่าสิ่งที่เกิดขึ้นในชีวิตของฉัน ถูกกำหนดโดยคนที่มีอำนาจหรือมีตำแหน่งสูงเป็นส่วนใหญ่"],
    [4, "I", "การที่ฉันจะประสบอุบัติเหตุทางรถหรือไม่ ขึ้นอยู่กับว่าฉันขับขี่ดีแค่ไหนเป็นหลัก"],
    [5, "I", "เมื่อฉันวางแผนไว้ ฉันค่อนข้างมั่นใจว่าจะทำให้สำเร็จได้"],
    [6, "C", "หลายครั้งฉันไม่มีทางปกป้องผลประโยชน์ของตนเองจากเรื่องโชคร้ายที่เกิดขึ้นได้เลย"],
    [7, "C", "เวลาที่ฉันได้สิ่งที่ต้องการ มักเป็นเพราะฉันโชคดี"],
    [8, "P", "ถึงฉันจะมีความสามารถ ฉันก็จะไม่ได้รับมอบหมายให้เป็นผู้นำ ถ้าไม่เข้าหาคนที่มีอำนาจ"],
    [9, "I", "การที่ฉันจะมีเพื่อนมากหรือน้อย ขึ้นอยู่กับว่าฉันเป็นคนดีแค่ไหน"],
    [10, "C", "ฉันมักพบว่า อะไรจะเกิด มันก็ต้องเกิด"],
    [11, "P", "ชีวิตของฉันถูกควบคุมโดยคนที่มีอำนาจหรือมีตำแหน่งสูงเป็นหลัก"],
    [12, "C", "การที่ฉันจะประสบอุบัติเหตุทางรถหรือไม่ เป็นเรื่องของโชคเป็นส่วนใหญ่"],
    [13, "P", "คนอย่างฉันมีโอกาสน้อยมากที่จะปกป้องผลประโยชน์ของตนเองได้ เมื่อผลประโยชน์นั้นขัดกับกลุ่มที่มีอำนาจต่อรองหรือมีพลังกดดันสูง"],
    [14, "C", "การวางแผนล่วงหน้าไกล ๆ ไม่ใช่เรื่องฉลาดเสมอไปสำหรับฉัน เพราะหลายเรื่องกลายเป็นเรื่องของโชคดีหรือโชคร้าย"],
    [15, "P", "การจะได้สิ่งที่ต้องการ ฉันต้องทำให้คนที่อยู่เหนือกว่าฉันพอใจ"],
    [16, "C", "การที่ฉันจะได้เป็นผู้นำหรือไม่ ขึ้นอยู่กับว่าฉันโชคดีพอที่จะอยู่ถูกที่ถูกเวลาหรือเปล่า"],
    [17, "P", "ถ้าคนสำคัญไม่ชอบฉัน ฉันก็คงมีเพื่อนไม่มากนัก"],
    [18, "I", "ฉันสามารถกำหนดสิ่งที่จะเกิดขึ้นในชีวิตของฉันได้เป็นส่วนใหญ่"],
    [19, "I", "โดยปกติฉันสามารถปกป้องผลประโยชน์ของตนเองได้"],
    [20, "P", "การที่ฉันจะประสบอุบัติเหตุทางรถหรือไม่ ขึ้นอยู่กับผู้ขับขี่คนอื่นเป็นหลัก"],
    [21, "I", "เวลาที่ฉันได้สิ่งที่ต้องการ มักเป็นเพราะฉันทำงานหนักเพื่อสิ่งนั้น"],
    [22, "P", "เพื่อให้แผนของฉันสำเร็จ ฉันต้องทำให้แผนนั้นเข้ากับความต้องการของคนที่มีอำนาจเหนือฉัน"],
    [23, "I", "ชีวิตของฉันถูกกำหนดโดยการกระทำของฉันเอง"],
    [24, "C", "การที่ฉันจะมีเพื่อนน้อยหรือมาก เป็นเรื่องของโชคชะตาเป็นหลัก"]];
  const IPC_L = [[-3, "ไม่เห็นด้วยมาก"], [-2, "ไม่เห็นด้วยปานกลาง"], [-1, "ไม่เห็นด้วยเล็กน้อย"], [1, "เห็นด้วยเล็กน้อย"], [2, "เห็นด้วยปานกลาง"], [3, "เห็นด้วยมาก"]];
  const IPC_D = { I: "ตนเอง (Internal)", P: "ผู้มีอำนาจ (Powerful others)", C: "โชคชะตา (Chance)" };
  function ipcScore(a) {
    const out = {}; let n = 0;
    ["I", "P", "C"].forEach(d => { let s2 = 0, got = 0; IPC24.filter(x => x[1] === d).forEach(([k]) => { const v = a[k]; if (v) { s2 += v; got++; } }); out[d] = got === 8 ? s2 + 24 : null; n += got; });
    const have = ["I", "P", "C"].filter(d => out[d] != null).sort((x, y) => out[y] - out[x]);
    out.lean = have.length === 3 ? (out[have[0]] - out[have[1]] <= 3 ? "none" : have[0]) : ""; out.answered = n; return out;
  }
  function ipcResultHtml(sc) {
    const bar = d => `<div class="ipcbar"><span>${IPC_D[d]}</span><span class="track"><i style="width:${(sc[d] / 48 * 100).toFixed(1)}%"></i></span><b class="num">${sc[d]}</b></div>`;
    const lean = sc.lean === "none" ? "ไม่มีด้านไหนเด่นชัด (ด้านที่สูงสุดกับรองลงมาห่างกันไม่เกิน 3 แต้ม)" : `เอนไปทาง <b>${IPC_D[sc.lean]}</b>`;
    return `<div class="ipcres"><p>${lean}</p>${["I", "P", "C"].map(bar).join("")}<p class="small muted">แต่ละด้าน 0–48 (8 ข้อ × −3…+3 แล้วบวก 24) กึ่งกลาง 24 · ผลนี้แสดงเฉพาะชุดทดสอบ</p></div>`;
  }
  function openIpc24() {
    const set = DEMO ? "test" : curSet(), se = Auth.get();
    if (!DEMO && set !== "test" && (!se || se.demo)) { toast("เข้าสู่ระบบด้วยบัญชีผู้เก็บข้อมูลก่อนใช้แบบทดลองกับผู้ตอบจริง"); return; }
    let dlg = $("#ipcdlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "ipcdlg"; dlg.className = "ipcdlg"; document.body.appendChild(dlg); }
    const ans = {}, started = new Date().toISOString(), id = "ipc" + Math.random().toString(36).slice(2, 10);
    dlg.innerHTML = `<form method="dialog" class="ipc-in" id="ipcform">
      <div class="ipc-head"><div><p class="eyebrow">แบบทดลอง · ชุดข้อมูล ${SETS[set]}</p><h2>ความเชื่อเรื่องสิ่งที่กำหนดชีวิต (24 ข้อ)</h2></div><button type="button" class="btn ghost small" id="ipcx">ปิด</button></div>
      <p class="small">อ่านข้อความทีละข้อ แล้วเลือกว่าเห็นด้วยหรือไม่เห็นด้วยมากน้อยเพียงใด ไม่มีคำตอบถูกหรือผิด ${set === "test" ? "" : "ผลรายบุคคลจะไม่แสดงบนหน้าจอนี้"}</p>
      <label class="fld"><span class="small">รหัสผู้ตอบแบบสอบถามหลัก <em>(ถ้าเป็นคนเดียวกัน ไม่บังคับ)</em></span><input class="txt short" id="ipcmain" autocomplete="off" spellcheck="false"></label>
      <ol class="ipclist">${IPC24.map(([k, , t], i) => `<li><fieldset><legend><span class="num">${i + 1}.</span> ${esc(t)}</legend><div class="ipcopts">${IPC_L.map(([v, l]) => `<label><input type="radio" name="L${k}" value="${v}"><span>${l}</span></label>`).join("")}</div></fieldset></li>`).join("")}</ol>
      <p class="small muted" id="ipcleft"></p>
      <div class="ipc-foot">${DEMO || set === "test" ? `<button type="button" class="btn ghost small" id="ipcfill">สุ่มคำตอบ (ทดสอบ)</button>` : "<span></span>"}<button type="button" class="btn primary" id="ipcsend">ส่งคำตอบ</button></div>
      <div id="ipcout" aria-live="polite"></div></form>`;
    if (!dlg.open) dlg.showModal();
    const left = () => { const n = Object.keys(ans).length; $("#ipcleft").textContent = n < 24 ? `ตอบแล้ว ${n}/24 ข้อ` : "ตอบครบ 24 ข้อแล้ว"; };
    left();
    dlg.querySelector("#ipcform").onchange = e => { const t = e.target; if (/^L\d+$/.test(t.name)) { ans[+t.name.slice(1)] = +t.value; left(); } };
    $("#ipcx").onclick = () => { if (Object.keys(ans).length && !dlg.dataset.sent && !confirmClose()) return; dlg.close(); dlg.remove(); };
    const confirmClose = () => { const b = $("#ipcx"); if (b.dataset.sure) return true; b.dataset.sure = "1"; b.textContent = "แตะอีกครั้งเพื่อปิด (คำตอบจะหาย)"; return false; };
    const fill = $("#ipcfill"); if (fill) fill.onclick = () => { IPC24.forEach(([k]) => { const v = IPC_L[Math.floor(Math.random() * 6)][0]; ans[k] = v; const r = dlg.querySelector(`input[name="L${k}"][value="${v}"]`); if (r) r.checked = true; }); left(); };
    $("#ipcsend").onclick = async () => {
      const n = Object.keys(ans).length, out = $("#ipcout");
      if (n < 24 && !$("#ipcsend").dataset.sure) { $("#ipcsend").dataset.sure = "1"; out.innerHTML = `<p class="notice warn small">ยังตอบไม่ครบ (${n}/24) ด้านที่ข้อไม่ครบจะไม่ได้คะแนน กด “ส่งคำตอบ” อีกครั้งถ้าต้องการส่งเท่านี้</p>`; return; }
      const rec = { meta: { id, dataset: set, mode: st.meta.mode === 0 ? 0 : 1, started, finished: new Date().toISOString(), mainCode: $("#ipcmain").value.trim() }, answers: ans };
      if (DEMO || !CONFIG.endpoint || !se || se.demo) { out.innerHTML = `<p class="notice small">โหมดตัวอย่าง: ไม่ได้ส่งเข้าระบบ</p>${ipcResultHtml(ipcScore(ans))}`; dlg.dataset.sent = "1"; return; }
      $("#ipcsend").disabled = true; out.innerHTML = `<p class="small muted">กำลังส่ง…</p>`;
      const j = await Auth.api("submitIpc", { rec });
      if (!j.ok) { $("#ipcsend").disabled = false; out.innerHTML = `<p class="notice warn small" role="alert">${esc(j.error || "ส่งไม่สำเร็จ")} ลองอีกครั้ง</p>`; return; }
      dlg.dataset.sent = "1";
      out.innerHTML = j.scores ? `<p class="notice ok small">บันทึกแล้ว (ชุดทดสอบ)</p>${ipcResultHtml(j.scores)}` : `<p class="notice ok">บันทึกแล้ว ขอบคุณที่ช่วยตอบครับ</p><p class="small muted">ผลรายบุคคลดูได้ในหน้าบัญชีของฉัน (ผู้ดูแล) เท่านั้น</p>`;
      out.scrollIntoView({ block: "start" });
    };
  }

  /* ---------- phase: read from the server; changed by an admin with a code ---------- */
  function phaseNote() {
    if (isPilot()) return `<b>${PH_LABEL.pilot}</b><br><span class="small">เก็บเฉพาะผู้ที่อาศัยและมีชื่อในทะเบียนบ้าน อ.ชุมพลบุรี จ.สุรินทร์ คำตอบแยกไว้ในชีตนำร่อง ไม่นำไปทดสอบสมมติฐาน และไม่ขอเบอร์โทรสำหรับระยะที่ 2 รหัสผู้ตอบขึ้นต้นด้วย P-</span>`;
    if (isTestRun()) return `<b>${PH_LABEL.test}</b><br><span class="small">ทุกชุดบันทึกเป็นข้อมูลทดสอบ ไม่นับเป็นข้อมูลวิจัย</span>`;
    return `<b>${PH_LABEL.live}</b><br><span class="small">คำตอบนับเป็นข้อมูลวิจัย</span>`;
  }
  async function readPhase() {
    if (DEMO || !CONFIG.endpoint) return;
    try {
      const j = await fetch(CONFIG.endpoint, { cache: "no-store" }).then(r => r.json());
      if (j && ["test", "pilot", "live"].includes(j.phase) && j.phase !== PHASE) { PHASE = j.phase; store.set("phase", PHASE); if (!INV && st.meta && st.meta.dataset && !setOpen(st.meta.dataset)) st.meta.dataset = PHASE; if (st.screen === "intro" || st.screen === "part") render(); }
      else if (j && j.phase) store.set("phase", j.phase);
    } catch (e) { /* offline: keep the last phase seen on this device */ }
  }
  function phaseCode(raw) {
    const box = $("#phaseconfirm"), code = String(raw || "").trim().toLowerCase();
    const to = { pilot: "pilot", begin: "live", test: "test" }[code];
    if (!to) { box.innerHTML = `<p class="small err" role="alert">รหัสไม่ถูกต้อง</p>`; return; }
    const se = Auth.get();
    if (!se || se.demo || se.user.role !== "admin") { box.innerHTML = `<p class="small err" role="alert">ต้องเข้าสู่ระบบด้วยบัญชีผู้ดูแล (admin) ก่อนจึงจะเปลี่ยนโหมดได้</p>`; return; }
    if (to === PHASE) { box.innerHTML = `<p class="small">ตอนนี้อยู่ใน${PH_LABEL[to]}อยู่แล้ว</p>`; return; }
    const what = { pilot: "เปิดเก็บข้อมูล<b>นำร่อง</b> (ขั้น 1.2 ที่ อ.ชุมพลบุรี 10–12 คน) คำตอบจะเก็บแยกในชีต “คำตอบ (นำร่อง)”", live: "เปิดเก็บข้อมูล<b>จริง</b> (ขั้น 1.3) คำตอบจะนับเป็นข้อมูลวิจัย และหยุดรับคำตอบนำร่อง", test: "กลับเป็น<b>โหมดทดสอบ</b> คำตอบจะบันทึกเป็นข้อมูลทดสอบ" }[to];
    box.innerHTML = `<div class="notice warn" style="margin-top:8px"><p>${what}</p>
      ${to !== "test" ? `<label class="fld"><span>เลขที่หนังสือรับรองจริยธรรม (EC) <em>(ต้องได้รับอนุมัติก่อนเก็บข้อมูลจากคนจริง)</em></span><input class="txt" id="ecno" placeholder="เช่น HE69xxxx"></label>` : ""}
      <div class="row" style="margin-top:8px;display:flex;gap:8px"><button class="btn primary small" type="button" id="phgo">ยืนยัน</button><button class="btn ghost small" type="button" id="phno">ยกเลิก</button></div></div>`;
    $("#phno").onclick = () => { box.innerHTML = ""; };
    $("#phgo").onclick = async () => {
      const ec = to !== "test" ? $("#ecno").value.trim() : "";
      if (to !== "test" && ec.length < 3) { toast("ใส่เลขที่หนังสือรับรอง EC ก่อน"); $("#ecno").focus(); return; }
      $("#phgo").disabled = true;
      const j = await Auth.api("setPhase", { phase: to, ec });
      if (!j.ok) { $("#phgo").disabled = false; toast(j.error || "เปลี่ยนโหมดไม่สำเร็จ"); return; }
      PHASE = j.phase; store.set("phase", PHASE); delete st.ans["3"]; delete st.ans["4"]; st.meta.dataset = PHASE;
      toast(`เปลี่ยนเป็น${PH_LABEL[PHASE]}แล้ว`); render();
    };
  }

  function toast(msg) {
    let t = $("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 3800);
  }

  window.__survey = { st, scores, record, makeCode };     // for testing
  chips();
  readPhase();
  if (!DEMO && CONFIG.endpoint && outbox().length) flush();
  window.addEventListener("online", () => { if (!DEMO && outbox().length) flush(); });
  const jump = (DEMO || isTestRun()) && location.hash.match(/^#p([1-7])$/);
  if (jump) { st.meta.mode = 1; st.meta.venue = 1; st.meta.enumerator = 1; st.meta.started = new Date().toISOString(); st.t0 = performance.now(); st.screen = "part"; st.part = +jump[1] - 1; if (st.part === 3) st.cj.stage = "intro"; }
  render();
})();
