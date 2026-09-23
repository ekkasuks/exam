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
  const resultsEl = document.getElementById('resultsSection');

  // ---- รายงานผลสอบของฉัน (วิชา / ชื่อทดสอบ / คะแนน / ผ่าน-ไม่ผ่าน เกณฑ์ 50%) ----
  function renderResults(results) {
    if (!results || !results.length) { resultsEl.innerHTML = ''; return; }
    resultsEl.innerHTML = `
      <h2 class="mb-2">📊 ผลสอบของฉัน</h2>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>วิชา</th><th>ชื่อการทดสอบ</th><th class="center">คะแนน</th><th class="center">ผล</th>
        </tr></thead>
        <tbody>${results.map(r => {
          const graded = r.showScore;
          const scoreCell = graded
            ? `${r.score}/${r.totalScore} <span class="muted">(${r.percent}%)</span>`
            : `<span class="muted">ส่งแล้ว</span>`;
          const resultCell = graded
            ? (r.passed
                ? '<span class="badge badge-green">✅ ผ่าน</span>'
                : '<span class="badge badge-red">❌ ไม่ผ่าน</span>')
            : '<span class="badge badge-gray">รอประกาศผล</span>';
          return `<tr>
            <td>${escapeHtml(r.subjectName || '-')}</td>
            <td>${escapeHtml(r.examTitle)}</td>
            <td class="center">${scoreCell}</td>
            <td class="center">${resultCell}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
      <p class="muted mt-1" style="font-size:13px">* เกณฑ์ผ่าน ตั้งแต่ 50% ขึ้นไป</p>`;
  }

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

  // ฟังก์ชันเหล่านี้เป็น function declaration (hoisted) จึงเรียกใช้ได้ก่อนบรรทัดนี้
  // และผูกกับ window เพื่อให้ปุ่ม onclick ใน HTML เรียกได้
  // silent=true : รีเฟรชเงียบ ๆ เบื้องหลัง (ไม่ล้างจอเป็นสปินเนอร์ ไม่ทับด้วย error)
  async function reload(silent) {
    if (!silent) listEl.innerHTML = `<div class="loader"><div class="spinner"></div>กำลังโหลด...</div>`;
    try {
      const data = await API.call('studentLogin', { studentId: student.studentId }, { retry: 1 });
      Auth.setStudent(data.student);
      sessionStorage.setItem('exam_list', JSON.stringify(data.exams || []));
      sessionStorage.setItem('exam_results', JSON.stringify(data.results || []));
      render(data.exams);
      renderResults(data.results || []);
    } catch (err) {
      if (!silent) {
        listEl.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>
          <button class="btn btn-ghost" onclick="reload()">ลองใหม่</button>`;
      }
    }
  }

  function startExam(examId) {
    location.href = 'exam.html?examId=' + encodeURIComponent(examId);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.reload = reload;
  window.startExam = startExam;

  // แสดงจาก cache ทันที (ลื่น) แล้วรีเฟรชเบื้องหลังให้ข้อมูลล่าสุด
  // (เช่น หลังเพิ่งทำข้อสอบเสร็จ ผลสอบจะอัปเดตเอง)
  const cached = sessionStorage.getItem('exam_list');
  if (cached) {
    try {
      render(JSON.parse(cached));
      renderResults(JSON.parse(sessionStorage.getItem('exam_results') || '[]'));
      reload(true); // รีเฟรชเงียบ ๆ
    } catch (e) { reload(false); }
  } else {
    reload(false);
  }
})();
