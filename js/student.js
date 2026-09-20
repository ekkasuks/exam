/**
 * student.js
 * หน้าเริ่มต้นนักเรียน: แสดงชื่อ + รายการข้อสอบที่ทำได้
 */
(function () {
  const student = Auth.requireStudent();
  if (!student) return;

  applyPublicConfig();

  // แสดงข้อความต้อนรับ
  const welcome = document.getElementById('welcome');
  welcome.innerHTML = `
    <div style="font-size:20px;font-weight:700;">ยินดีต้อนรับ</div>
    <div style="font-size:22px;color:var(--primary);font-weight:800;margin:4px 0;">
      ${student.title || ''} ${student.fullName || ''}
    </div>
    <div class="muted">ชั้น ${student.level || '-'}${student.room ? ' • ห้อง ' + student.room : ''} • เลขที่ ${student.number || '-'}</div>
  `;

  const listEl = document.getElementById('examList');

  function render(exams) {
    if (!exams || !exams.length) {
      listEl.innerHTML = `<div class="card text-center muted">
        <div style="font-size:44px;">📭</div>
        ขณะนี้ยังไม่มีข้อสอบที่เปิดให้ทำ<br>กรุณาสอบถามคุณครู
        <div class="mt-2"><button class="btn btn-sm btn-ghost" onclick="reload()">🔄 โหลดใหม่</button></div>
      </div>`;
      return;
    }
    listEl.innerHTML = exams.map(e => {
      const done = e.done;
      const canTake = e.canTake;
      let action;
      if (done && !canTake) {
        action = `<span class="badge badge-gray">✔ ทำเสร็จแล้ว</span>`;
        if (e.myScore !== undefined) {
          action += ` <span class="badge badge-green">คะแนน ${e.myScore}</span>`;
        }
      } else if (done && canTake) {
        action = `<button class="btn" onclick="startExam('${e.examId}')">ทำข้อสอบอีกครั้ง</button>`;
      } else {
        action = `<button class="btn" onclick="startExam('${e.examId}')">เริ่มทำข้อสอบ</button>`;
      }
      return `
        <div class="exam-card">
          <div class="badge badge-green">🟢 เปิดสอบ</div>
          <h3 class="mt-1">${escapeHtml(e.title)}</h3>
          <div class="muted">${escapeHtml(e.subjectName || '')} ${e.level ? '• ' + e.level : ''}</div>
          <div class="meta">
            <span>📝 ${e.numQuestions} ข้อ</span>
            <span>💯 ${e.totalScore} คะแนน</span>
            <span>⏱️ ${e.duration ? e.duration + ' นาที' : 'ไม่จำกัดเวลา'}</span>
          </div>
          ${e.description ? `<p class="muted mb-2">${escapeHtml(e.description)}</p>` : ''}
          ${action}
        </div>`;
    }).join('');
  }

  // ใช้รายการที่ส่งมาตอน login ก่อน (ลด request) แล้วค่อย refresh เงียบ ๆ
  const cached = sessionStorage.getItem('exam_list');
  if (cached) {
    try { render(JSON.parse(cached)); } catch (e) { reload(); }
  } else {
    reload();
  }

  window.reload = async function () {
    listEl.innerHTML = `<div class="loader"><div class="spinner"></div>กำลังโหลด...</div>`;
    try {
      const data = await API.call('studentLogin', { studentId: student.studentId });
      Auth.setStudent(data.student);
      sessionStorage.setItem('exam_list', JSON.stringify(data.exams || []));
      render(data.exams);
    } catch (err) {
      listEl.innerHTML = `<div class="alert alert-error">${err.message}</div>
        <button class="btn btn-ghost" onclick="reload()">ลองใหม่</button>`;
    }
  };

  window.startExam = function (examId) {
    location.href = 'exam.html?examId=' + encodeURIComponent(examId);
  };

  window.escapeHtml = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
})();
