/* IPC 24-item trial (Levenson, 1981) on its own page, separate from the main questionnaire.
   Thai draft: items 2, 3, 6, 7, 11, 13, 18, 19, 23 are worded as in the main questionnaire (items 47–55, IOC-reviewed);
   the other 15 are a new draft for the advisor's review. Each item −3…+3 without 0.
   Full form: subscale = sum of 8 items + 24 (0–48). Short form (the 9 items of the main questionnaire): sum of 3 + 9 (0–18).
   Both are scored from the same answers so the two forms can be compared. Scores are shown on screen only for the test dataset;
   for pilot or live answers they go to the admin page only, never to the respondent.
   The dataset follows the same rule as the main questionnaire: test always open; pilot or live only while the server phase is that. */
(function () {
  "use strict";
  const CONFIG = window.SITE_CONFIG || { live: false, endpoint: "" };
  const DEMO = !(CONFIG.live && CONFIG.endpoint);
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = Auth.esc;
  const app = $("#app");
  const store = {
    get(k, d) { try { const v = localStorage.getItem("bfm." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("bfm." + k, JSON.stringify(v)); } catch (e) {} },
  };
  let PHASE = (() => { const v = store.get("phase"); return ["test", "pilot", "live"].includes(v) ? v : (CONFIG.test ? "test" : "live"); })();
  const SETS = { test: "ทดสอบ", pilot: "นำร่อง", live: "เก็บจริง" };
  const SET_D = { test: "ลองระบบหรือลองกับคนในทีม ไม่นับเป็นข้อมูลวิจัย เห็นผลทันทีหลังส่ง", pilot: "ทดลองกับผู้ตอบในพื้นที่นำร่อง ผลไม่แสดงบนจอ", live: "เก็บจริงหลังได้รับ EC ผลไม่แสดงบนจอ" };
  const setOpen = k => k === "test" || k === PHASE;

  const ITEMS = [
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
  const KEY24 = { I: [1, 4, 5, 9, 18, 19, 21, 23], P: [3, 8, 11, 13, 15, 17, 20, 22], C: [2, 6, 7, 10, 12, 14, 16, 24] };
  const KEY9 = { I: [23, 18, 19], P: [11, 3, 13], C: [2, 6, 7] };
  const SCALE = [[-3, "ไม่เห็นด้วยมาก"], [-2, "ไม่เห็นด้วยปานกลาง"], [-1, "ไม่เห็นด้วยเล็กน้อย"], [1, "เห็นด้วยเล็กน้อย"], [2, "เห็นด้วยปานกลาง"], [3, "เห็นด้วยมาก"]];
  const DIM = { I: "ตนเอง (I)", P: "ผู้มีอำนาจ (P)", C: "โชคชะตา (C)" }, SHORT = { I: "ตนเอง I", P: "ผู้มีอำนาจ P", C: "โชคชะตา C" };
  const MODES = [[1, "ผู้เก็บอ่านให้ฟัง", "ผู้เก็บอ่านข้อความและตัวเลือก แล้วกดตามที่ผู้ตอบบอก"], [2, "ผู้ตอบอ่านเอง", "ผู้ตอบอ่านและกดบนเครื่องของผู้เก็บ ผู้เก็บอยู่ด้วย"], [0, "กรอกจากกระดาษ", "ผู้ตอบทำแบบกระดาษ แล้วผู้เก็บกรอกเข้าระบบ"]];

  function sub(a, key, n, gap) {
    const o = {}; let got = 0;
    ["I", "P", "C"].forEach(d => { let s = 0, g = 0; key[d].forEach(k => { const v = a[k]; if (v) { s += v; g++; } }); o[d] = g === n ? s + 3 * n : null; got += g; });
    const have = ["I", "P", "C"].filter(d => o[d] != null).sort((x, y) => o[y] - o[x]);
    o.lean = have.length === 3 ? (o[have[0]] - o[have[1]] <= gap ? "none" : have[0]) : "";
    o.answered = got; return o;
  }
  const score = a => { const f = sub(a, KEY24, 8, 3), s = sub(a, KEY9, 3, 1); f.short = s; f.same = f.lean && s.lean ? (f.lean === s.lean ? 1 : 0) : ""; return f; };

  const fresh = () => ({ screen: "intro", set: setOpen(store.get("ipc.set")) ? store.get("ipc.set") : (PHASE === "test" ? "test" : PHASE), mode: 1, link: 0, main: "", consent: false,
    ans: {}, id: "ipc" + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "").slice(0, 12) : Math.random().toString(36).slice(2, 14)), started: null, sending: false, result: null });
  let st = fresh();

  /* ---------- screen 1: set-up ---------- */
  function intro() {
    const se = Auth.get(), signed = se && !se.demo, needSign = st.set !== "test";
    app.innerHTML = `<section class="card">
      <fieldset class="q"><legend>ชุดข้อมูล</legend>
        <div class="opts">${Object.keys(SETS).map(k => { const ok = setOpen(k); return `<label class="opt ${ok ? "" : "off"}"><input type="radio" name="set" value="${k}" ${st.set === k ? "checked" : ""} ${ok ? "" : "disabled"}><span><b>${SETS[k]}</b><small>${ok ? SET_D[k] : "ยังไม่เปิด ผู้ดูแลเปิดด้วยรหัสในหน้าแบบสอบถามหลัก"}</small></span></label>`; }).join("")}</div>
        ${PHASE === "pilot" && st.set === "pilot" ? `<p class="notice warn small">ตอนนี้เปิดนำร่องอยู่ ถ้าทดลองในอำเภอที่ศึกษา (เมืองบุรีรัมย์ สตึก บ้านด่าน แคนดง) ผู้ตอบนำร่องต้องไม่ถูกเลือกเป็นตัวอย่างจริงอีก</p>` : ""}
      </fieldset>
      <fieldset class="q"><legend>วิธีตอบ</legend>
        <div class="opts">${MODES.map(([v, t, d]) => `<label class="opt"><input type="radio" name="mode" value="${v}" ${st.mode === v ? "checked" : ""}><span><b>${t}</b><small>${d}</small></span></label>`).join("")}</div>
      </fieldset>
      <fieldset class="q"><legend>คนนี้ตอบแบบสอบถามหลักด้วยหรือไม่ <em>(ใช้จับคู่เทียบฉบับเต็มกับฉบับตัด)</em></legend>
        <div class="opts row"><label class="opt"><input type="radio" name="link" value="0" ${st.link === 0 ? "checked" : ""}><span>ไม่ได้ตอบ หรือไม่ทราบรหัส</span></label>
          <label class="opt"><input type="radio" name="link" value="1" ${st.link === 1 ? "checked" : ""}><span>ตอบแล้ว ใส่รหัสผู้ตอบ</span></label></div>
        <label class="fld" ${st.link ? "" : "hidden"} id="mainf"><span>รหัสผู้ตอบแบบสอบถามหลัก <em>(เช่น P-AB12CD หรือรหัสบนบัตร)</em></span><input class="txt short" name="main" value="${esc(st.main)}" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="20"></label>
      </fieldset>
      <fieldset class="q"><legend>ผู้เก็บข้อมูล</legend>
        <div id="who">${signed ? `<p class="who"><span>เข้าสู่ระบบเป็น <b>${esc(se.user.name || se.user.username)}</b>${se.user.enumerator ? ` · ผู้เก็บเลข ${esc(se.user.enumerator)}` : ""}</span></p>`
          : needSign && !DEMO ? `<div id="lg"></div>` : `<p class="small muted">${DEMO ? "โหมดตัวอย่าง: ไม่ส่งข้อมูลเข้าระบบ" : "ชุดทดสอบส่งได้เมื่อเข้าสู่ระบบ ถ้าไม่เข้าสู่ระบบ ผลจะแสดงบนจออย่างเดียว ไม่บันทึก"}</p>${DEMO ? "" : `<div id="lg"></div>`}`}</div>
      </fieldset>
      ${st.set !== "test" ? `<label class="opt"><input type="checkbox" name="consent" ${st.consent ? "checked" : ""}><span><b>ผู้ตอบได้ฟังหรืออ่านเอกสารชี้แจงแล้ว และยินยอมตอบ</b><small>ผู้ตอบหยุดหรือข้ามข้อไหนก็ได้ ไม่ต้องบอกเหตุผล ไม่ถามชื่อ ไม่ถามว่าเลือกใคร</small></span></label>` : ""}
      <p class="err small" id="introerr" role="alert"></p>
      <div class="nav"><a class="btn ghost small" href="../survey/">ไปแบบสอบถามหลัก</a><button class="btn primary" id="go" type="button">เริ่มตอบ 24 ข้อ</button></div>
    </section>`;
    const lg = $("#lg");
    if (lg && !signed) Auth.form(lg, { title: needSign ? "เข้าสู่ระบบก่อนเก็บกับผู้ตอบ" : "", lead: needSign ? "ชุดนำร่องและชุดเก็บจริงต้องเข้าสู่ระบบด้วยบัญชีผู้เก็บข้อมูล" : "", onDone: () => intro() });
    app.onchange = e => {
      const t = e.target;
      if (t.name === "set") { st.set = t.value; store.set("ipc.set", st.set); intro(); }
      if (t.name === "mode") st.mode = +t.value;
      if (t.name === "link") { st.link = +t.value; $("#mainf").hidden = !st.link; if (st.link) $("[name=main]").focus(); }
      if (t.name === "consent") st.consent = t.checked;
    };
    app.oninput = e => { if (e.target.name === "main") st.main = e.target.value.trim().toUpperCase(); };
    $("#go").onclick = () => {
      const er = $("#introerr"), se2 = Auth.get();
      if (!setOpen(st.set)) { er.textContent = "ชุดข้อมูลนี้ยังไม่เปิด"; return; }
      if (st.set !== "test" && !DEMO && (!se2 || se2.demo)) { er.textContent = "เข้าสู่ระบบด้วยบัญชีผู้เก็บข้อมูลก่อน"; return; }
      if (st.set !== "test" && !st.consent) { er.textContent = "ติ๊กยืนยันว่าผู้ตอบยินยอมแล้วก่อนเริ่ม"; return; }
      if (st.link && st.main.length < 4) { er.textContent = "ใส่รหัสผู้ตอบแบบสอบถามหลัก หรือเลือก “ไม่ได้ตอบ”"; return; }
      st.screen = "items"; st.started = new Date().toISOString(); items(); window.scrollTo({ top: 0 });
    };
  }

  /* ---------- screen 2: the 24 statements ---------- */
  function items() {
    const testy = DEMO || st.set === "test";
    app.innerHTML = `<div class="counter"><p><span><b>ชุด${SETS[st.set]}</b> · ${MODES.find(m => m[0] === st.mode)[1]}</span><span id="cnt"></span></p><div class="bar"><i id="bar"></i></div></div>
      <p class="notice ipc small">คำชี้แจง: ข้อความต่อไปนี้ ท่านเห็นด้วยหรือไม่เห็นด้วยมากน้อยเพียงใด ไม่มีคำตอบถูกหรือผิด ถ้าไม่อยากตอบข้อไหน ข้ามได้</p>
      <p class="scale-key">ตัวเลือก: ไม่เห็นด้วยมาก · ไม่เห็นด้วยปานกลาง · ไม่เห็นด้วยเล็กน้อย · เห็นด้วยเล็กน้อย · เห็นด้วยปานกลาง · เห็นด้วยมาก <span class="muted">(ไม่มีตรงกลาง)</span></p>
      <ol class="items">${ITEMS.map(([k, , t]) => `<li><fieldset id="f${k}"><legend><span class="num">${k}.</span>${esc(t)}</legend><div class="sc">${SCALE.map(([v, l]) => `<label><input type="radio" name="L${k}" value="${v}" ${st.ans[k] === v ? "checked" : ""}><span>${l}</span></label>`).join("")}</div></fieldset></li>`).join("")}</ol>
      <div id="out" aria-live="polite"></div>
      <div class="nav"><button class="btn ghost small" type="button" id="back">กลับไปหน้าเริ่ม</button>
        <span style="display:flex;gap:8px;flex-wrap:wrap">${testy ? `<button class="btn ghost small" type="button" id="fill">สุ่มคำตอบ (ทดสอบ)</button>` : ""}<button class="btn primary" type="button" id="send">ส่งคำตอบ</button></span></div>`;
    count();
    app.onchange = e => { const t = e.target; if (/^L\d+$/.test(t.name)) { const k = +t.name.slice(1); st.ans[k] = +t.value; $("#f" + k).classList.remove("miss"); count(); } };
    app.oninput = null;
    $("#back").onclick = () => { const b = $("#back"); if (Object.keys(st.ans).length && !b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "แตะอีกครั้ง (คำตอบที่ตอบไว้ยังอยู่)"; return; } st.screen = "intro"; intro(); window.scrollTo({ top: 0 }); };
    const fill = $("#fill"); if (fill) fill.onclick = () => { ITEMS.forEach(([k]) => { const v = SCALE[Math.floor(Math.random() * 6)][0]; st.ans[k] = v; const r = $(`input[name="L${k}"][value="${v}"]`); if (r) r.checked = true; $("#f" + k).classList.remove("miss"); }); count(); };
    $("#send").onclick = send;
  }
  function count() { const n = Object.keys(st.ans).length; $("#cnt").textContent = `ตอบแล้ว ${n}/24`; $("#bar").style.width = (n / 24 * 100).toFixed(1) + "%"; }

  async function send() {
    const n = Object.keys(st.ans).length, out = $("#out"), btn = $("#send");
    if (n < 24 && !btn.dataset.sure) {
      btn.dataset.sure = "1";
      const miss = ITEMS.filter(([k]) => !st.ans[k]).map(([k]) => k);
      miss.forEach(k => $("#f" + k).classList.add("miss"));
      out.innerHTML = `<p class="notice warn small">ยังไม่ได้ตอบ ${miss.length} ข้อ (ข้อ ${miss.join(", ")}) ด้านที่ข้อไม่ครบจะไม่ได้คะแนน ถ้าผู้ตอบตั้งใจข้าม กด “ส่งคำตอบ” อีกครั้งได้เลย</p>`;
      $("#f" + miss[0]).scrollIntoView({ block: "start", behavior: "smooth" }); return;
    }
    const se = Auth.get();
    const rec = { meta: { id: st.id, dataset: st.set, mode: st.mode, started: st.started, finished: new Date().toISOString(), mainCode: st.link ? st.main : "" }, answers: st.ans };
    if (DEMO || !se || se.demo) { st.result = { local: true, scores: score(st.ans) }; return done(); }
    btn.disabled = true; out.innerHTML = `<p class="small muted">กำลังส่ง…</p>`;
    const j = await Auth.api("submitIpc", { rec });
    if (!j.ok) { btn.disabled = false; out.innerHTML = `<p class="notice warn small" role="alert">${esc(j.error || "ส่งไม่สำเร็จ")} ลองอีกครั้ง คำตอบยังอยู่ในหน้านี้</p>`; return; }
    st.result = { saved: true, dup: j.dup, scores: j.scores ? Object.assign(score(st.ans), j.scores, { short: (j.scores.short || score(st.ans).short) }) : null };
    done();
  }

  /* ---------- screen 3: result (test) or thanks ---------- */
  function done() {
    st.screen = "done"; const r = st.result, s = r.scores;
    const head = r.local ? `<p class="notice small">${DEMO ? "โหมดตัวอย่าง" : "ยังไม่ได้เข้าสู่ระบบ"}: ไม่ได้ส่งเข้าระบบ ผลด้านล่างคำนวณในเครื่องนี้</p>`
      : `<p class="notice ok">${r.dup ? "คำตอบชุดนี้บันทึกไว้แล้ว" : "บันทึกแล้ว"} · ชุด${SETS[st.set]} · เลขอ้างอิง <span style="font-family:var(--f-mono)">${esc(st.id)}</span></p>`;
    app.innerHTML = `<section class="card">${head}
      ${s ? resultHtml(s) : `<p>ขอบคุณที่ช่วยตอบครับ</p><p class="small muted">ผลรายบุคคลไม่แสดงให้ผู้ตอบ ผู้ดูแลดูผลรวมได้ในหน้าบัญชีของฉัน</p>`}
      <div class="nav"><a class="btn ghost small" href="../survey/">ไปแบบสอบถามหลัก</a><button class="btn primary" type="button" id="again">เริ่มชุดใหม่</button></div></section>`;
    $("#again").onclick = () => { const keep = { set: st.set, mode: st.mode }; st = fresh(); Object.assign(st, keep); intro(); window.scrollTo({ top: 0 }); };
    window.scrollTo({ top: 0 });
  }
  function resultHtml(s) {
    const f = s, h = s.short || {}, cell = v => v == null || v === "" ? "–" : v;
    const avg = (v, n) => v == null || v === "" ? "–" : ((v - 3 * n) / n).toFixed(2).replace(/^(-?)0\./, "$10.");
    const lean = o => o.lean === "none" ? "ไม่มีด้านเด่น" : o.lean ? DIM[o.lean] : "–";
    const same = f.same === 1 ? "ทั้งสองฉบับชี้ไปทางเดียวกัน" : f.same === 0 ? "สองฉบับชี้ไปคนละทาง" : "ตอบไม่ครบ เทียบทิศทางไม่ได้";
    const bar = d => `<div class="br"><span>${DIM[d]}</span><span class="tr"><span class="tk f" title="ฉบับเต็ม"><i style="width:${f[d] == null ? 0 : (f[d] / 48 * 100).toFixed(1)}%"></i></span><span class="tk s" title="ฉบับตัด"><i style="width:${h[d] == null ? 0 : (h[d] / 18 * 100).toFixed(1)}%"></i></span></span></div>`;
    return `<div class="res">
      <h2>ฉบับเต็มเทียบฉบับตัด</h2>
      <p>${same}</p>
      <div class="bars">${["I", "P", "C"].map(bar).join("")}</div>
      <p class="legend"><span><i style="background:var(--ipc)"></i>ฉบับเต็ม 24 ข้อ (เทียบเต็ม 48)</span><span><i style="background:#a99ad6"></i>ฉบับตัด 9 ข้อ (เทียบเต็ม 18)</span></p>
      <p class="small">ฉบับเต็มเอนไปทาง <b>${lean(f)}</b> · ฉบับตัดเอนไปทาง <b>${lean(h)}</b></p>
      <div class="tblwrap"><table class="cmp"><thead><tr><th>ด้าน</th><th class="n">เต็ม<br>0–48</th><th class="n">ตัด<br>0–18</th><th class="n">เฉลี่ย/ข้อ<br>เต็ม</th><th class="n">เฉลี่ย/ข้อ<br>ตัด</th></tr></thead><tbody>
        ${["I", "P", "C"].map(d => `<tr><td>${SHORT[d]}</td><td class="n">${cell(f[d])}</td><td class="n">${cell(h[d])}</td><td class="n">${avg(f[d], 8)}</td><td class="n">${avg(h[d], 3)}</td></tr>`).join("")}</tbody></table></div>
      <p class="small muted">เฉลี่ยต่อข้อ = คะแนนดิบเฉลี่ยในช่วง −3…+3 ใช้เทียบสองฉบับได้ตรงกว่าคะแนนรวม เพราะจำนวนข้อไม่เท่ากัน · “ไม่มีด้านเด่น” = ด้านสูงสุดกับรองลงมาห่างกันไม่เกิน 3 แต้ม (เต็ม) หรือ 1 แต้ม (ตัด) · ผลนี้แสดงเฉพาะชุดทดสอบ</p>
    </div>`;
  }

  /* ---------- phase from the server ---------- */
  async function readPhase() {
    if (DEMO) return;
    try {
      const j = await fetch(CONFIG.endpoint, { cache: "no-store" }).then(r => r.json());
      if (j && ["test", "pilot", "live"].includes(j.phase)) { const ch = j.phase !== PHASE; PHASE = j.phase; store.set("phase", PHASE); if (!setOpen(st.set)) st.set = "test"; if (ch && st.screen === "intro") intro(); }
    } catch (e) { /* offline: keep the last phase seen on this device */ }
  }
  const navh = () => { const n = $(".site-nav"); if (n) document.documentElement.style.setProperty("--navh", n.offsetHeight + "px"); };
  navh(); window.addEventListener("resize", navh);
  Auth.onChange(() => { if (st.screen === "intro") intro(); });
  window.__ipc = { score, get st() { return st; } };    // for testing
  intro();
  readPhase();
})();
