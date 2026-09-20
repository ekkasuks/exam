/**
 * result.js
 * แสดงผลสอบหลังส่ง (เคารพการตั้งค่า showScore / showAnswers ของครู)
 */
(function () {
  applyPublicConfig();
  const content = document.getElementById('content');
  const CHOICE_LABELS = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ซ', 'ฌ', 'ญ'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  let payload;
  try { payload = JSON.parse(sessionStorage.getItem('exam_result')); } catch (e) {}

  if (!payload || !payload.result) {
    content.innerHTML = `<div class="card text-center">
      <p class="muted">ไม่พบข้อมูลผลสอบ</p>
      <a href="student.html" class="btn mt-2">กลับหน้าหลัก</a></div>`;
    return;
  }

  const r = payload.result;
  let html = `<div class="card result-hero">
    <div class="result-ring">🎉</div>
    <h2>ส่งข้อสอบเรียบร้อย!</h2>
    <p class="muted">${esc(payload.examTitle || '')}</p>`;

  if (r.showScore) {
    const pct = r.percent || 0;
    const emoji = pct >= 80 ? '🌟' : pct >= 50 ? '👍' : '💪';
    html += `
      <div class="result-score mt-2">${r.score} / ${r.totalScore}</div>
      <div class="result-percent">${pct}% ${emoji}</div>`;
  } else {
    html += `<p class="mt-2 alert alert-info">ส่งคำตอบเรียบร้อยแล้ว คุณครูจะแจ้งคะแนนภายหลัง</p>`;
  }
  html += `<div class="mt-3"><a href="student.html" class="btn">กลับหน้าหลัก</a></div></div>`;

  // ทบทวนคำตอบ (ถ้าครูอนุญาตแสดงเฉลย)
  if (r.showAnswers) {
    let review;
    try { review = JSON.parse(sessionStorage.getItem('exam_review')); } catch (e) {}
    if (review && review.questions) {
      const correctMap = {};
      (r.review || review.review || []).forEach(a => { correctMap[a.questionId] = a; });

      html += `<h2 class="mb-2 mt-3">📖 เฉลยและคำตอบของคุณ</h2>`;
      review.questions.forEach((q, i) => {
        const info = correctMap[q.questionId] || {};
        const myCid = review.answers[q.questionId] || '';
        html += `<div class="question-box mb-2">
          <div class="question-num">ข้อ ${i + 1}
            ${info.isCorrect ? '<span class="badge badge-green">ถูก</span>' : '<span class="badge badge-red">ผิด</span>'}</div>
          <div class="question-text">${esc(q.questionText)}</div>
          ${q.imageUrl ? `<img class="question-img" src="${q.imageUrl}" alt="">` : ''}
          <div class="choices mt-1">`;
        q.choices.forEach((c, idx) => {
          const disp = CHOICE_LABELS[idx] || c.label;
          const isCorrectChoice = c.choiceId === info.correctChoiceId;
          const isMine = c.choiceId === myCid;
          let cls = '';
          if (isCorrectChoice) cls = 'correct';
          else if (isMine) cls = 'wrong';
          html += `<div class="choice ${cls}">
            <div class="letter">${esc(disp)}</div>
            <div class="grow">${esc(c.choiceText)}
              ${isMine ? ' <b>(คำตอบของคุณ)</b>' : ''}
              ${isCorrectChoice ? ' ✅' : ''}
            </div></div>`;
        });
        html += `</div></div>`;
      });
    }
  }

  content.innerHTML = html;
  if (window.MathJax && window.MathJax.typesetPromise) {
    window.MathJax.typesetPromise([content]).catch(() => {});
  }
})();
