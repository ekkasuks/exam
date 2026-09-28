/**
 * multiply.js
 * ทดสอบสูตรคูณ แม่ 2-12 จำนวน 40 ข้อ, เวลา 10 นาที
 * โจทย์สุ่มฝั่ง client (ต่างกันทุกคน/ทุกครั้ง), ตัวเลือกสลับตำแหน่งทุกข้อ
 * เก็บสถานะใน localStorage (กัน refresh), ตรวจคะแนนฝั่ง server
 */
(function () {
  const student = Auth.requireStudent();
  if (!student) return;

  const TOTAL = 40;
  const DURATION_MS = 10 * 60000;
  const STATE_KEY = `multstate_${student.studentId}`;

  let state = null;   // { problems:[{a,b,choices}], answers:[value|null], startedAt, deadline, index, correct }
  let submitting = false;
  let timer = null;

  const el = {
    loading: document.getElementById('loading'),
    testArea: document.getElementById('testArea'),
    resultArea: document.getElementById('resultArea'),
    errorArea: document.getElementById('errorArea'),
    studentName: document.getElementById('studentName'),
    timerEl: document.getElementById('timer'),
    qNum: document.getElementById('qNum'),
    correctCount: document.getElementById('correctCount'),
    progressBar: document.getElementById('progressBar'),
    problem: document.getElementById('problem'),
    choices: document.getElementById('choices')
  };

  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function shuffle(a) {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
    return r;
  }

  // สร้างตัวลวง 3 ตัว ใกล้เคียงคำตอบจริง
  function makeChoices(a, b) {
    const correct = a * b;
    const cand = new Set([
      a * b + a, a * b - a, a * b + b, a * b - b,
      (a + 1) * b, (a - 1) * b, a * (b + 1), a * (b - 1),
      correct + 1, correct - 1, correct + 2, correct - 2
    ]);
    cand.delete(correct);
    const pool = Array.from(cand).filter(x => x > 0);
    const distractors = shuffle(pool).slice(0, 3);
    // เผื่อกรณีตัวลวงไม่พอ
    let n = 2;
    while (distractors.length < 3) { const v = correct + n; if (v > 0 && v !== correct && distractors.indexOf(v) === -1) distractors.push(v); n++; }
    return shuffle([correct].concat(distractors)); // สลับตำแหน่งคำตอบถูกทุกข้อ
  }

  function genProblems() {
    const arr = [];
    for (let i = 0; i < TOTAL; i++) {
      const a = rand(2, 12), b = rand(2, 12);
      arr.push({ a, b, choices: makeChoices(a, b) });
    }
    return arr;
  }

  function saveState() { try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) {} }
  function loadState() {
    try { const s = JSON.parse(localStorage.getItem(STATE_KEY)); if (s && s.problems && s.problems.length === TOTAL) return s; } catch (e) {}
    return null;
  }

  function init() {
    const saved = loadState();
    if (saved) {
      state = saved;
      if (state.deadline && Date.now() >= state.deadline) { startUI(); return autoSubmit(); }
    } else {
      state = { problems: genProblems(), answers: new Array(TOTAL).fill(null), startedAt: new Date().toISOString(), deadline: Date.now() + DURATION_MS, index: 0, correct: 0 };
      saveState();
    }
    startUI();
  }

  function startUI() {
    el.loading.classList.add('hidden');
    el.testArea.classList.remove('hidden');
    el.studentName.textContent = `${student.title || ''} ${student.fullName || ''}`;
    startTimer();
    renderProblem();
    window.addEventListener('beforeunload', (e) => { if (!submitting) { e.preventDefault(); e.returnValue = ''; } });
  }

  function startTimer() { tick(); timer = setInterval(tick, 1000); }
  function tick() {
    const remain = Math.max(0, Math.floor((state.deadline - Date.now()) / 1000));
    const m = Math.floor(remain / 60), s = remain % 60;
    el.timerEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    if (remain <= 60) el.timerEl.classList.add('warning');
    if (remain <= 0) { clearInterval(timer); autoSubmit(); }
  }

  function renderProblem() {
    const i = state.index;
    if (i >= TOTAL) return doSubmit();
    const p = state.problems[i];
    el.qNum.textContent = i + 1;
    el.correctCount.textContent = state.correct;
    el.progressBar.style.width = (i / TOTAL * 100) + '%';
    el.problem.textContent = `${p.a} × ${p.b} = ?`;
    el.choices.innerHTML = p.choices.map(v =>
      `<button class="mult-choice" data-v="${v}">${v}</button>`).join('');
    el.choices.querySelectorAll('.mult-choice').forEach(btn => {
      btn.addEventListener('click', () => answer(btn, Number(btn.dataset.v)));
    });
  }

  function answer(btn, value) {
    const i = state.index;
    if (state.answers[i] !== null) return; // กันกดซ้ำ
    const p = state.problems[i];
    const correctVal = p.a * p.b;
    state.answers[i] = value;
    const isCorrect = value === correctVal;
    if (isCorrect) state.correct++;
    saveState();

    // แสดงผลสั้น ๆ แล้วไปข้อถัดไป
    el.choices.querySelectorAll('.mult-choice').forEach(b => {
      b.style.pointerEvents = 'none';
      const bv = Number(b.dataset.v);
      if (bv === correctVal) b.classList.add('correct');
      else if (b === btn) b.classList.add('wrong');
    });
    el.correctCount.textContent = state.correct;

    setTimeout(() => {
      state.index++;
      saveState();
      renderProblem();
    }, isCorrect ? 300 : 650);
  }

  function autoSubmit() {
    if (submitting) return;
    submitting = true;
    if (timer) clearInterval(timer);
    alert('หมดเวลา! ระบบจะส่งคำตอบให้อัตโนมัติ');
    doSubmit();
  }

  async function doSubmit() {
    if (submitting && el.resultArea.innerHTML) return;
    submitting = true;
    if (timer) clearInterval(timer);
    el.testArea.classList.add('hidden');
    el.loading.classList.remove('hidden');
    el.loading.innerHTML = '<div class="spinner"></div>กำลังส่งคำตอบ...';

    const answers = state.problems.map((p, i) => ({ a: p.a, b: p.b, answer: state.answers[i] }));
    try {
      const res = await API.call('submitMultTest', { studentId: student.studentId, startedAt: state.startedAt, answers });
      try { localStorage.removeItem(STATE_KEY); } catch (e) {}
      showResult(res.score, res.total);
    } catch (err) {
      el.loading.classList.add('hidden');
      el.errorArea.classList.remove('hidden');
      el.errorArea.innerHTML = `<div class="alert alert-error">${(err.message || 'ส่งไม่สำเร็จ')}</div>
        <button class="btn" id="retryBtn">ลองส่งอีกครั้ง</button>
        <a href="student.html" class="btn btn-ghost">กลับหน้าหลัก</a>`;
      const rb = document.getElementById('retryBtn');
      if (rb) rb.addEventListener('click', () => { submitting = false; el.errorArea.classList.add('hidden'); doSubmit(); });
    }
  }

  function showResult(score, total) {
    el.loading.classList.add('hidden');
    el.resultArea.classList.remove('hidden');
    const pct = total ? Math.round(score / total * 100) : 0;
    const emoji = pct >= 80 ? '🌟' : pct >= 50 ? '👍' : '💪';
    el.resultArea.innerHTML = `
      <div class="card result-hero">
        <div class="result-ring">${emoji}</div>
        <h2>ทำเสร็จแล้ว!</h2>
        <div class="result-score mt-2">${score} / ${total}</div>
        <div class="result-percent">ตอบถูก ${pct}%</div>
        <div class="mt-3"><a href="student.html" class="btn">กลับหน้าหลัก</a></div>
      </div>`;
  }

  init();
})();
