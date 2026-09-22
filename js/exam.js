/**
 * exam.js
 * ทำข้อสอบ — โหลดครั้งเดียว, เก็บคำตอบใน localStorage, ส่งทีเดียวตอนจบ
 * รองรับ refresh (กู้สถานะจาก localStorage), จับเวลา, ส่งอัตโนมัติเมื่อหมดเวลา
 */
(function () {
  const student = Auth.requireStudent();
  if (!student) return;

  const params = new URLSearchParams(location.search);
  const examId = params.get('examId');
  if (!examId) { location.href = 'student.html'; return; }

  const STATE_KEY = `examstate_${examId}_${student.studentId}`;
  const CHOICE_LABELS = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ซ', 'ฌ', 'ญ'];

  let state = null;       // { exam, questions, answers, startedAt, deadline, current }
  let submitting = false;
  let timerInterval = null;

  const el = {
    loading: document.getElementById('loading'),
    examArea: document.getElementById('examArea'),
    errorArea: document.getElementById('errorArea'),
    examTitle: document.getElementById('examTitle'),
    studentName: document.getElementById('studentName'),
    timer: document.getElementById('timer'),
    qnav: document.getElementById('qnav'),
    questionBox: document.getElementById('questionBox'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    submitBtn: document.getElementById('submitBtn'),
    confirmModal: document.getElementById('confirmModal'),
    confirmText: document.getElementById('confirmText'),
    confirmSubmit: document.getElementById('confirmSubmit')
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function saveState() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function loadSavedState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (s && s.exam && s.questions) return s;
    } catch (e) {}
    return null;
  }

  async function init() {
    const saved = loadSavedState();
    if (saved) {
      state = saved;
      // เผื่อหมดเวลาไปแล้วระหว่างปิดหน้า
      if (state.deadline && Date.now() >= state.deadline) {
        startUI();
        autoSubmit();
        return;
      }
      startUI();
      return;
    }
    try {
      const data = await API.call('getExam', { examId, studentId: student.studentId }, { retry: 1 });
      if (!data.questions || !data.questions.length) {
        return showError('ข้อสอบนี้ยังไม่มีคำถาม');
      }
      const durationMs = (Number(data.exam.duration) || 0) * 60000;
      state = {
        exam: data.exam,
        questions: data.questions,
        answers: {},
        startedAt: data.serverTime || new Date().toISOString(),
        deadline: durationMs > 0 ? (Date.now() + durationMs) : null,
        current: 0
      };
      saveState();
      startUI();
    } catch (err) {
      showError(err.message || 'โหลดข้อสอบไม่สำเร็จ');
    }
  }

  function showError(msg) {
    el.loading.classList.add('hidden');
    el.errorArea.classList.remove('hidden');
    el.errorArea.innerHTML = `<div class="alert alert-error">${esc(msg)}</div>
      <a href="student.html" class="btn btn-ghost">กลับหน้าหลัก</a>`;
  }

  function startUI() {
    el.loading.classList.add('hidden');
    el.examArea.classList.remove('hidden');
    el.examTitle.textContent = state.exam.title;
    el.studentName.textContent =
      `${student.title || ''} ${student.fullName || ''} • ${state.questions.length} ข้อ`;

    if (state.deadline) {
      el.timer.classList.remove('hidden');
      startTimer();
    }
    buildNav();
    renderQuestion();

    // เตือนก่อนออกจากหน้า
    window.addEventListener('beforeunload', (e) => {
      if (!submitting) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  function startTimer() {
    tick();
    timerInterval = setInterval(tick, 1000);
  }

  function tick() {
    const remain = Math.max(0, Math.floor((state.deadline - Date.now()) / 1000));
    const m = Math.floor(remain / 60);
    const s = remain % 60;
    el.timer.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    if (remain <= 60) el.timer.classList.add('warning');
    if (remain <= 0) {
      clearInterval(timerInterval);
      autoSubmit();
    }
  }

  function buildNav() {
    el.qnav.innerHTML = state.questions.map((q, i) => {
      const answered = state.answers[q.questionId] ? 'answered' : '';
      const current = i === state.current ? 'current' : '';
      return `<button class="${answered} ${current}" data-i="${i}">${i + 1}</button>`;
    }).join('');
    el.qnav.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => goto(parseInt(b.dataset.i, 10)));
    });
  }

  function updateNav() {
    el.qnav.querySelectorAll('button').forEach((b, i) => {
      b.className = '';
      if (state.answers[state.questions[i].questionId]) b.classList.add('answered');
      if (i === state.current) b.classList.add('current');
    });
  }

  function renderQuestion() {
    const q = state.questions[state.current];
    const selected = state.answers[q.questionId];
    const imgHtml = q.imageUrl
      ? `<img class="question-img" src="${q.imageUrl}" alt="รูปประกอบข้อ ${state.current + 1}" loading="lazy">` : '';

    // ป้ายกำกับตามตำแหน่งที่แสดง (ก ข ค ง) เพื่อให้เรียงสวยแม้สุ่มตัวเลือก
    // แต่บันทึก/ส่งคำตอบด้วย choiceId เพื่อให้ตรวจคะแนนถูกต้องเสมอ
    const choicesHtml = q.choices.map((c, idx) => {
      const disp = CHOICE_LABELS[idx] || c.label;
      const sel = selected === c.choiceId ? 'selected' : '';
      const cimg = c.imageUrl ? `<img class="choice-img" src="${c.imageUrl}" alt="" loading="lazy">` : '';
      return `
        <div class="choice ${sel}" data-cid="${esc(c.choiceId)}">
          <div class="letter">${esc(disp)}</div>
          <div class="grow">${esc(c.choiceText)}${cimg}</div>
        </div>`;
    }).join('');

    el.questionBox.innerHTML = `
      <div class="question-num">ข้อ ${state.current + 1} จาก ${state.questions.length}
        ${q.score ? `<span class="muted">(${q.score} คะแนน)</span>` : ''}</div>
      <div class="question-text">${esc(q.questionText)}</div>
      ${imgHtml}
      <div class="choices">${choicesHtml}</div>
    `;

    el.questionBox.querySelectorAll('.choice').forEach(ch => {
      ch.addEventListener('click', () => selectAnswer(q.questionId, ch.dataset.cid));
    });

    el.prevBtn.disabled = state.current === 0;
    el.nextBtn.style.display = state.current === state.questions.length - 1 ? 'none' : '';

    typeset();
  }

  function typeset() {
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise([el.questionBox]).catch(() => {});
    }
  }

  function selectAnswer(questionId, choiceId) {
    state.answers[questionId] = choiceId;
    saveState();
    el.questionBox.querySelectorAll('.choice').forEach(ch => {
      ch.classList.toggle('selected', ch.dataset.cid === choiceId);
    });
    updateNav();
  }

  function goto(i) {
    if (i < 0 || i >= state.questions.length) return;
    state.current = i;
    saveState();
    renderQuestion();
    updateNav();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  el.prevBtn.addEventListener('click', () => goto(state.current - 1));
  el.nextBtn.addEventListener('click', () => goto(state.current + 1));
  el.submitBtn.addEventListener('click', openConfirm);
  el.confirmSubmit.addEventListener('click', doSubmit);

  function openConfirm() {
    const answered = Object.keys(state.answers).filter(k => state.answers[k]).length;
    const total = state.questions.length;
    el.confirmText.innerHTML =
      `คุณตอบแล้ว <b>${answered}</b> จาก <b>${total}</b> ข้อ` +
      (answered < total ? `<br><span style="color:var(--danger)">ยังเหลืออีก ${total - answered} ข้อที่ยังไม่ตอบ</span>` : '') +
      `<br>ต้องการส่งข้อสอบหรือไม่?`;
    el.confirmModal.classList.remove('hidden');
  }
  window.closeConfirm = function () { el.confirmModal.classList.add('hidden'); };

  function autoSubmit() {
    if (submitting) return;
    alert('หมดเวลาทำข้อสอบ ระบบจะส่งคำตอบให้อัตโนมัติ');
    doSubmit();
  }

  async function doSubmit() {
    if (submitting) return;
    submitting = true;
    if (timerInterval) clearInterval(timerInterval);
    el.confirmModal.classList.add('hidden');
    el.confirmSubmit.disabled = true;
    el.submitBtn.disabled = true;
    el.submitBtn.textContent = 'กำลังส่ง...';

    const answers = state.questions.map(q => ({
      questionId: q.questionId,
      choiceId: state.answers[q.questionId] || ''
    }));

    try {
      const result = await API.call('submitExam', {
        examId, studentId: student.studentId,
        startedAt: state.startedAt, answers
      });
      // ล้าง state ข้อสอบ
      try { localStorage.removeItem(STATE_KEY); } catch (e) {}
      sessionStorage.setItem('exam_result', JSON.stringify({
        result, examTitle: state.exam.title
      }));
      // เก็บคำถาม+คำตอบไว้ให้หน้า result ใช้ทบทวน (ถ้าครูอนุญาต)
      if (result.showAnswers) {
        sessionStorage.setItem('exam_review', JSON.stringify({
          questions: state.questions, answers: state.answers, review: result.review
        }));
      }
      location.href = 'result.html';
    } catch (err) {
      submitting = false;
      el.submitBtn.disabled = false;
      el.confirmSubmit.disabled = false;
      el.submitBtn.textContent = 'ส่งข้อสอบ';
      if (state.deadline && Date.now() < state.deadline) startTimer();
      alert('ส่งข้อสอบไม่สำเร็จ: ' + (err.message || '') + '\nคำตอบของคุณยังถูกเก็บไว้ กรุณาลองส่งอีกครั้ง');
    }
  }

  init();
})();
