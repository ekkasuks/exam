/**
 * teacher.js
 * แผงควบคุมครู: Dashboard, นักเรียน, ห้องเรียน, รายวิชา, ข้อสอบ,
 * นำเข้าจาก Word, ผลการสอบ, วิเคราะห์ข้อสอบ, ตั้งค่า
 */
(function () {
  'use strict';

  const THAI_LABELS = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ซ'];

  // แคชข้อมูลเพื่อลด request
  const cache = { subjects: null, classes: null, exams: null };

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function $(id) { return document.getElementById(id); }
  function typeset(node) {
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise(node ? [node] : undefined).catch(() => {});
    }
  }
  function toast(msg, type = 'success') {
    const box = document.createElement('div');
    box.className = `alert alert-${type}`;
    box.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:200;box-shadow:var(--shadow-lg);max-width:90%;';
    box.textContent = msg;
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3000);
  }

  // Modal
  const modal = $('modal'), modalCard = $('modalCard');
  function openModal(html, big) {
    modalCard.className = 'modal' + (big ? ' big' : '');
    modalCard.innerHTML = html;
    modal.classList.remove('hidden');
    typeset(modalCard);
  }
  function closeModal() { modal.classList.add('hidden'); modalCard.innerHTML = ''; }
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  window.closeModal = closeModal;

  function loading(node) {
    node.innerHTML = '<div class="loader"><div class="spinner"></div>กำลังโหลด...</div>';
  }

  // ================= LOGIN =================
  const loginView = $('teacherLogin');
  const shell = $('teacherShell');

  applyPublicConfig();

  $('teacherLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('tLoginBtn');
    const code = $('teacherCode').value.trim();
    $('loginAlert').innerHTML = '';
    btn.disabled = true; btn.textContent = 'กำลังตรวจสอบ...';
    try {
      const data = await API.call('teacherLogin', { code });
      Auth.setTeacher(data.token);
      showShell();
    } catch (err) {
      $('loginAlert').innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
      btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ';
    }
  });

  function showShell() {
    loginView.classList.add('hidden');
    shell.classList.remove('hidden');
    setupNav();
    navigate('dashboard');
  }

  // ================= NAV =================
  const sidebar = $('sidebar');
  function setupNav() {
    document.querySelectorAll('.sidebar a[data-page]').forEach(a => {
      a.addEventListener('click', () => {
        navigate(a.dataset.page);
        sidebar.classList.remove('open');
      });
    });
    $('menuToggle').addEventListener('click', () => sidebar.classList.toggle('open'));
  }

  const PAGE_TITLES = {
    dashboard: '🏠 Dashboard', students: '👨‍🎓 นักเรียน', classes: '🏫 ห้องเรียน',
    subjects: '📚 รายวิชา', exams: '📝 ข้อสอบ', import: '📥 นำเข้าข้อสอบ',
    results: '📊 ผลการสอบ', analysis: '📈 วิเคราะห์ข้อสอบ', settings: '⚙️ ตั้งค่า'
  };

  function navigate(page) {
    document.querySelectorAll('.sidebar a[data-page]').forEach(a => {
      a.classList.toggle('active', a.dataset.page === page);
    });
    $('pageBrand').textContent = PAGE_TITLES[page] || '';
    const el = $('pageContent');
    ({
      dashboard: pageDashboard, students: pageStudents, classes: pageClasses,
      subjects: pageSubjects, exams: pageExams, import: pageImport,
      results: pageResults, analysis: pageAnalysis, settings: pageSettings
    }[page] || pageDashboard)(el);
  }

  // ================= DASHBOARD =================
  async function pageDashboard(el) {
    loading(el);
    try {
      const s = await teacherCall('getDashboardStats');
      el.innerHTML = `
        <h1 class="page-title">ภาพรวมระบบ</h1>
        <div class="stats-grid">
          ${stat('👨‍🎓', s.students, 'นักเรียน')}
          ${stat('🏫', s.classes, 'ห้องเรียน')}
          ${stat('📚', s.subjects, 'รายวิชา')}
          ${stat('📝', s.exams, 'ชุดข้อสอบ')}
          ${stat('🟢', s.openExams, 'ข้อสอบที่เปิด')}
          ${stat('✅', s.attempts, 'การสอบทั้งหมด')}
        </div>
        <div class="card mt-3">
          <div class="card-title">เริ่มต้นใช้งาน</div>
          <div class="row">
            <button class="btn" onclick="TEACHER.go('students')">จัดการนักเรียน</button>
            <button class="btn" onclick="TEACHER.go('import')">นำเข้าข้อสอบจาก Word</button>
            <button class="btn btn-ghost" onclick="TEACHER.go('exams')">ดูชุดข้อสอบ</button>
          </div>
        </div>`;
    } catch (err) { showErr(el, err); }
  }
  function stat(icon, num, label) {
    return `<div class="stat"><div style="font-size:22px">${icon}</div>
      <div class="num">${num}</div><div class="label">${label}</div></div>`;
  }

  function showErr(el, err) {
    el.innerHTML = `<div class="alert alert-error">${esc(err.message || 'เกิดข้อผิดพลาด')}</div>`;
  }

  // ================= helpers: load caches =================
  async function loadSubjects(force) {
    if (cache.subjects && !force) return cache.subjects;
    cache.subjects = await teacherCall('listSubjects');
    return cache.subjects;
  }
  async function loadClasses(force) {
    if (cache.classes && !force) return cache.classes;
    cache.classes = await teacherCall('listClasses');
    return cache.classes;
  }
  async function loadExams(force) {
    if (cache.exams && !force) return cache.exams;
    cache.exams = await teacherCall('listExams');
    return cache.exams;
  }

  // ================= STUDENTS =================
  async function pageStudents(el) {
    loading(el);
    try {
      const classes = await loadClasses();
      const levels = [...new Set(classes.map(c => c.level))];
      const rooms = [...new Set(classes.map(c => c.room))];
      el.innerHTML = `
        <h1 class="page-title">จัดการนักเรียน</h1>
        <div class="toolbar">
          <input type="text" id="stSearch" placeholder="🔍 ค้นหาชื่อ/รหัส">
          <select id="stLevel"><option value="">ทุกชั้น</option>${levels.map(l => `<option>${esc(l)}</option>`).join('')}</select>
          <select id="stRoom"><option value="">ทุกห้อง</option>${rooms.map(r => `<option>${esc(r)}</option>`).join('')}</select>
          <button class="btn btn-sm" onclick="TEACHER.studentForm()">＋ เพิ่มนักเรียน</button>
          <button class="btn btn-sm btn-ghost" onclick="TEACHER.importCsv()">📥 นำเข้า CSV</button>
        </div>
        <div id="stTable"><div class="loader"><div class="spinner"></div></div></div>`;
      const doSearch = () => renderStudents();
      $('stSearch').addEventListener('input', debounce(doSearch, 300));
      $('stLevel').addEventListener('change', doSearch);
      $('stRoom').addEventListener('change', doSearch);
      renderStudents();
    } catch (err) { showErr(el, err); }
  }

  async function renderStudents() {
    const box = $('stTable');
    const params = {
      q: $('stSearch').value.trim(),
      level: $('stLevel').value,
      room: $('stRoom').value
    };
    box.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
    try {
      const list = await teacherCall('listStudents', params);
      if (!list.length) { box.innerHTML = '<div class="card muted text-center">ไม่พบนักเรียน</div>'; return; }
      box.innerHTML = `<div class="muted mb-1">พบ ${list.length} คน</div>
      <div class="table-wrap"><table>
        <thead><tr><th>เลขที่</th><th>รหัส</th><th>ชื่อ-นามสกุล</th><th>ชั้น</th><th>ห้อง</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>${list.map(s => `<tr>
          <td class="center">${esc(s.number)}</td>
          <td>${esc(s.studentId)}</td>
          <td>${esc(s.title)} ${esc(s.fullName)}</td>
          <td>${esc(s.level)}</td>
          <td>${esc(s.room)}</td>
          <td>${statusBadge(s.status)}</td>
          <td class="center">
            <button class="btn btn-sm btn-ghost" onclick='TEACHER.studentForm(${JSON.stringify(s)})'>แก้ไข</button>
            <button class="btn btn-sm btn-danger" onclick="TEACHER.deleteStudent('${esc(s.studentId)}')">ลบ</button>
          </td></tr>`).join('')}</tbody>
      </table></div>`;
    } catch (err) { showErr(box, err); }
  }
  function statusBadge(status) {
    const off = status === 'ปิด' || status === 'inactive';
    return off ? '<span class="badge badge-red">ปิด</span>' : '<span class="badge badge-green">ใช้งาน</span>';
  }

  async function studentForm(s) {
    s = s || {};
    const classes = await loadClasses();
    const levels = [...new Set(classes.map(c => c.level))];
    const rooms = [...new Set(classes.map(c => c.room))];
    openModal(`
      <h2>${s.studentId ? 'แก้ไขนักเรียน' : 'เพิ่มนักเรียน'}</h2>
      <div class="field-row">
        <div class="field"><label>คำนำหน้า</label>
          <select id="fTitle">${['ด.ช.', 'ด.ญ.', 'นาย', 'น.ส.'].map(t => `<option ${s.title === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="field"><label>เลขที่</label><input id="fNumber" value="${esc(s.number || '')}"></div>
      </div>
      <div class="field"><label>ชื่อ-นามสกุล</label><input id="fName" value="${esc(s.fullName || '')}"></div>
      <div class="field-row">
        <div class="field"><label>ชั้น</label>
          <input id="fLevel" list="levelList" value="${esc(s.level || '')}">
          <datalist id="levelList">${levels.map(l => `<option>${esc(l)}</option>`).join('')}</datalist></div>
        <div class="field"><label>ห้อง</label>
          <input id="fRoom" list="roomList" value="${esc(s.room || '')}">
          <datalist id="roomList">${rooms.map(r => `<option>${esc(r)}</option>`).join('')}</datalist></div>
      </div>
      <div class="field"><label>รหัสนักเรียน ${s.studentId ? '' : '(เว้นว่างให้ระบบสร้างอัตโนมัติ)'}</label>
        <input id="fId" value="${esc(s.studentId || '')}" ${s.studentId ? 'readonly' : ''}></div>
      <div class="field"><label>สถานะ</label>
        <select id="fStatus"><option ${s.status !== 'ปิด' ? 'selected' : ''}>ใช้งาน</option><option ${s.status === 'ปิด' ? 'selected' : ''}>ปิด</option></select></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
        <button class="btn" id="saveStBtn">บันทึก</button>
      </div>`);
    $('saveStBtn').addEventListener('click', async () => {
      const payload = {
        studentId: $('fId').value.trim(), title: $('fTitle').value,
        number: $('fNumber').value.trim(), fullName: $('fName').value.trim(),
        level: $('fLevel').value.trim(), room: $('fRoom').value.trim(),
        status: $('fStatus').value
      };
      if (!payload.fullName) return toast('กรุณากรอกชื่อ', 'error');
      try {
        await teacherCall(s.studentId ? 'updateStudent' : 'addStudent', payload);
        closeModal(); toast('บันทึกเรียบร้อย'); renderStudents();
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  async function deleteStudent(studentId) {
    if (!confirm('ยืนยันลบนักเรียน ' + studentId + '?')) return;
    try { await teacherCall('deleteStudent', { studentId }); toast('ลบแล้ว'); renderStudents(); }
    catch (err) { toast(err.message, 'error'); }
  }

  function importCsv() {
    openModal(`
      <h2>นำเข้ารายชื่อนักเรียนจาก CSV</h2>
      <p class="muted mb-2">คอลัมน์: <b>รหัส, คำนำหน้า, ชื่อ-นามสกุล, ชั้น, ห้อง, เลขที่</b><br>
      (บรรทัดแรกเป็นหัวตาราง เว้นรหัสว่างได้ ระบบจะสร้างให้อัตโนมัติ)</p>
      <button class="btn btn-sm btn-outline mb-2" onclick="TEACHER.downloadStudentTemplate()">⬇️ ดาวน์โหลดไฟล์เทมเพลต CSV</button>
      <p class="muted mb-2" style="font-size:13px">เปิดไฟล์ด้วย Excel/Google Sheets กรอกข้อมูล แล้วเลือกไฟล์ด้านล่างเพื่อนำเข้า</p>
      <div class="field">
        <textarea id="csvArea" placeholder="รหัส,คำนำหน้า,ชื่อ-นามสกุล,ชั้น,ห้อง,เลขที่
S0001,ด.ช.,ตัวอย่าง ใจดี,ป.5,ป.5/1,10
,ด.ญ.,สมหญิง เรียนเก่ง,ป.5,ป.5/1,11"></textarea>
      </div>
      <input type="file" id="csvFile" accept=".csv,text/csv" class="mb-2">
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
        <button class="btn" id="csvImportBtn">นำเข้า</button>
      </div>`);
    $('csvFile').addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = () => { $('csvArea').value = reader.result; };
      reader.readAsText(f, 'UTF-8');
    });
    $('csvImportBtn').addEventListener('click', async () => {
      const rows = parseCsv($('csvArea').value);
      if (!rows.length) return toast('ไม่พบข้อมูล', 'error');
      try {
        const res = await teacherCall('importStudents', { rows });
        closeModal();
        toast(`นำเข้า ${res.added} คน${res.skipped ? ' (ข้าม ' + res.skipped + ' ที่ซ้ำ)' : ''}`);
        renderStudents();
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  function downloadStudentTemplate() {
    // เทมเพลตพร้อมหัวตาราง + ตัวอย่าง 2 แถว (แถวที่ 2 เว้นรหัสไว้ให้ระบบสร้างอัตโนมัติ)
    downloadCsv('เทมเพลตรายชื่อนักเรียน',
      ['รหัส', 'คำนำหน้า', 'ชื่อ-นามสกุล', 'ชั้น', 'ห้อง', 'เลขที่'],
      [
        ['S0001', 'ด.ช.', 'ตัวอย่าง ใจดี', 'ป.5', 'ป.5/1', '1'],
        ['', 'ด.ญ.', 'สมหญิง เรียนเก่ง', 'ป.5', 'ป.5/1', '2']
      ]);
  }

  function parseCsv(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    // ข้ามหัวตารางถ้าบรรทัดแรกมีคำว่า "ชื่อ" หรือ "รหัส"
    let start = 0;
    if (/ชื่อ|รหัส|name|title/i.test(lines[0])) start = 1;
    const out = [];
    for (let i = start; i < lines.length; i++) {
      const c = splitCsvLine(lines[i]);
      if (!c.some(x => x)) continue;
      out.push({
        studentId: (c[0] || '').trim(),
        title: (c[1] || '').trim(),
        fullName: (c[2] || '').trim(),
        level: (c[3] || '').trim(),
        room: (c[4] || '').trim(),
        number: (c[5] || '').trim()
      });
    }
    return out;
  }
  function splitCsvLine(line) {
    const result = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
      else cur += ch;
    }
    result.push(cur);
    return result;
  }

  // ================= CLASSES =================
  async function pageClasses(el) {
    loading(el);
    try {
      const classes = await loadClasses(true);
      el.innerHTML = `
        <h1 class="page-title">ห้องเรียน</h1>
        <div class="toolbar"><button class="btn btn-sm" onclick="TEACHER.classForm()">＋ เพิ่มห้อง</button></div>
        <div class="table-wrap"><table>
          <thead><tr><th>ระดับชั้น</th><th>ห้อง</th><th class="center">จำนวนนักเรียน</th><th>หมายเหตุ</th><th></th></tr></thead>
          <tbody>${classes.map(c => `<tr>
            <td>${esc(c.level)}</td><td>${esc(c.room)}</td>
            <td class="center">${c.studentCount}</td><td>${esc(c.note || '')}</td>
            <td class="center">
              <button class="btn btn-sm btn-ghost" onclick='TEACHER.classForm(${JSON.stringify(c)})'>แก้ไข</button>
              <button class="btn btn-sm btn-danger" onclick="TEACHER.deleteClass('${esc(c.classId)}')">ลบ</button>
            </td></tr>`).join('')}</tbody></table></div>
        ${classes.length ? '' : '<div class="card muted text-center">ยังไม่มีห้องเรียน</div>'}`;
    } catch (err) { showErr(el, err); }
  }
  function classForm(c) {
    c = c || {};
    openModal(`
      <h2>${c.classId ? 'แก้ไขห้อง' : 'เพิ่มห้อง'}</h2>
      <div class="field"><label>ระดับชั้น (เช่น ป.5)</label><input id="cLevel" value="${esc(c.level || '')}"></div>
      <div class="field"><label>ชื่อห้อง (เช่น ป.5/1)</label><input id="cRoom" value="${esc(c.room || '')}"></div>
      <div class="field"><label>หมายเหตุ</label><input id="cNote" value="${esc(c.note || '')}"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
        <button class="btn" id="saveClsBtn">บันทึก</button></div>`);
    $('saveClsBtn').addEventListener('click', async () => {
      const payload = { classId: c.classId, level: $('cLevel').value.trim(), room: $('cRoom').value.trim(), note: $('cNote').value.trim() };
      if (!payload.level || !payload.room) return toast('กรอกชั้นและห้อง', 'error');
      try {
        await teacherCall(c.classId ? 'updateClass' : 'addClass', payload);
        cache.classes = null; closeModal(); toast('บันทึกแล้ว'); navigate('classes');
      } catch (err) { toast(err.message, 'error'); }
    });
  }
  async function deleteClass(classId) {
    if (!confirm('ยืนยันลบห้องเรียนนี้?')) return;
    try { await teacherCall('deleteClass', { classId }); cache.classes = null; toast('ลบแล้ว'); navigate('classes'); }
    catch (err) { toast(err.message, 'error'); }
  }

  // ================= SUBJECTS =================
  async function pageSubjects(el) {
    loading(el);
    try {
      const subjects = await loadSubjects(true);
      el.innerHTML = `
        <h1 class="page-title">รายวิชา</h1>
        <div class="toolbar"><button class="btn btn-sm" onclick="TEACHER.subjectForm()">＋ เพิ่มวิชา</button></div>
        <div class="table-wrap"><table>
          <thead><tr><th>ชื่อวิชา</th><th>สถานะ</th><th></th></tr></thead>
          <tbody>${subjects.map(s => `<tr>
            <td>${esc(s.name)}</td><td>${statusBadge(s.status)}</td>
            <td class="center">
              <button class="btn btn-sm btn-ghost" onclick='TEACHER.subjectForm(${JSON.stringify(s)})'>แก้ไข</button>
              <button class="btn btn-sm btn-danger" onclick="TEACHER.deleteSubject('${esc(s.subjectId)}')">ลบ</button>
            </td></tr>`).join('')}</tbody></table></div>`;
    } catch (err) { showErr(el, err); }
  }
  function subjectForm(s) {
    s = s || {};
    openModal(`
      <h2>${s.subjectId ? 'แก้ไขวิชา' : 'เพิ่มวิชา'}</h2>
      <div class="field"><label>ชื่อวิชา</label><input id="subName" value="${esc(s.name || '')}"></div>
      <div class="field"><label>สถานะ</label>
        <select id="subStatus"><option ${s.status !== 'ปิด' ? 'selected' : ''}>ใช้งาน</option><option ${s.status === 'ปิด' ? 'selected' : ''}>ปิด</option></select></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
        <button class="btn" id="saveSubBtn">บันทึก</button></div>`);
    $('saveSubBtn').addEventListener('click', async () => {
      const payload = { subjectId: s.subjectId, name: $('subName').value.trim(), status: $('subStatus').value };
      if (!payload.name) return toast('กรอกชื่อวิชา', 'error');
      try {
        await teacherCall(s.subjectId ? 'updateSubject' : 'addSubject', payload);
        cache.subjects = null; closeModal(); toast('บันทึกแล้ว'); navigate('subjects');
      } catch (err) { toast(err.message, 'error'); }
    });
  }
  async function deleteSubject(subjectId) {
    if (!confirm('ยืนยันลบวิชานี้?')) return;
    try { await teacherCall('deleteSubject', { subjectId }); cache.subjects = null; toast('ลบแล้ว'); navigate('subjects'); }
    catch (err) { toast(err.message, 'error'); }
  }

  // ================= EXAMS =================
  async function pageExams(el) {
    loading(el);
    try {
      const exams = await loadExams(true);
      el.innerHTML = `
        <h1 class="page-title">ชุดข้อสอบ</h1>
        <div class="toolbar"><button class="btn btn-sm" onclick="TEACHER.editExam()">＋ สร้างข้อสอบใหม่</button></div>
        ${exams.length ? `<div class="table-wrap"><table>
          <thead><tr><th>ชื่อชุด</th><th>วิชา</th><th>ชั้น</th><th class="center">ข้อ</th><th class="center">คะแนน</th><th>สถานะ</th><th></th></tr></thead>
          <tbody>${exams.map(e => `<tr>
            <td>${esc(e.title)}</td><td>${esc(e.subjectName)}</td><td>${esc(e.level)}</td>
            <td class="center">${e.numQuestions}</td><td class="center">${e.totalScore}</td>
            <td>${examStatusBadge(e.status)}</td>
            <td class="center" style="white-space:nowrap">
              <button class="btn btn-sm" onclick="TEACHER.toggleStatus('${e.examId}','${esc(e.status)}')">${e.status === 'ปิด' || !e.status ? '🟢 เปิด' : '🔴 ปิด'}</button>
              <button class="btn btn-sm btn-ghost" onclick="TEACHER.editExam('${e.examId}')">แก้ไข</button>
              <button class="btn btn-sm btn-danger" onclick="TEACHER.deleteExam('${e.examId}')">ลบ</button>
            </td></tr>`).join('')}</tbody></table></div>`
        : '<div class="card muted text-center">ยังไม่มีชุดข้อสอบ<br>สร้างใหม่ หรือ นำเข้าจาก Word</div>'}`;
    } catch (err) { showErr(el, err); }
  }
  function examStatusBadge(status) {
    if (status === 'เปิด' || status === 'open') return '<span class="badge badge-green">🟢 เปิดสอบ</span>';
    if (status === 'กำหนดเวลา' || status === 'scheduled') return '<span class="badge badge-yellow">🟡 กำหนดเวลา</span>';
    return '<span class="badge badge-red">🔴 ปิด</span>';
  }
  async function toggleStatus(examId, current) {
    const next = (current === 'ปิด' || !current) ? 'เปิด' : 'ปิด';
    try {
      await teacherCall('setExamStatus', { examId, status: next });
      cache.exams = null; toast('เปลี่ยนสถานะแล้ว'); navigate('exams');
    } catch (err) { toast(err.message, 'error'); }
  }
  async function deleteExam(examId) {
    if (!confirm('ยืนยันลบชุดข้อสอบนี้? (คำถามและตัวเลือกจะถูกลบด้วย)')) return;
    try { await teacherCall('deleteExam', { examId }); cache.exams = null; toast('ลบแล้ว'); navigate('exams'); }
    catch (err) { toast(err.message, 'error'); }
  }

  // ---------- Exam editor ----------
  let editorState = null; // { exam:{}, questions:[] }

  async function editExam(examId, prefill) {
    const el = $('pageContent');
    loading(el);
    try {
      const subjects = await loadSubjects();
      const classes = await loadClasses();
      const levels = [...new Set(classes.map(c => c.level))];

      if (examId) {
        const data = await teacherCall('getExamFull', { examId });
        editorState = { exam: data.exam, questions: data.questions };
      } else if (prefill) {
        editorState = prefill;
      } else {
        editorState = { exam: { status: 'ปิด', scorePerQuestion: 1, showScore: true }, questions: [] };
      }
      renderEditor(el, subjects, levels);
    } catch (err) { showErr(el, err); }
  }

  function renderEditor(el, subjects, levels) {
    const e = editorState.exam;
    el.innerHTML = `
      <div class="row spread mb-2">
        <h1 class="page-title" style="margin:0">${e.examId ? 'แก้ไขข้อสอบ' : 'สร้างข้อสอบ'}</h1>
        <button class="btn btn-ghost btn-sm" onclick="TEACHER.go('exams')">← กลับ</button>
      </div>
      <div class="card">
        <div class="card-title">ข้อมูลชุดข้อสอบ</div>
        <div class="field"><label>ชื่อชุดข้อสอบ *</label><input id="eTitle" value="${esc(e.title || '')}"></div>
        <div class="field-row">
          <div class="field"><label>รายวิชา</label>
            <select id="eSubject">${subjects.map(s => `<option value="${esc(s.subjectId)}" ${e.subjectId === s.subjectId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
          <div class="field"><label>ระดับชั้น</label>
            <input id="eLevel" list="edLevels" value="${esc(e.level || '')}">
            <datalist id="edLevels">${levels.map(l => `<option>${esc(l)}</option>`).join('')}</datalist></div>
        </div>
        <div class="field"><label>คำอธิบาย</label><input id="eDesc" value="${esc(e.description || '')}"></div>
        <div class="field-row">
          <div class="field"><label>เวลาทำ (นาที, 0=ไม่จำกัด)</label><input type="number" id="eDuration" value="${e.duration || 0}"></div>
          <div class="field"><label>คะแนนต่อข้อ (ค่าเริ่มต้น)</label><input type="number" id="eScorePer" value="${e.scorePerQuestion || 1}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>เปิดสอบตั้งแต่ (ไม่บังคับ)</label><input type="datetime-local" id="eOpenAt" value="${toLocalInput(e.openAt)}"></div>
          <div class="field"><label>ปิดสอบเมื่อ (ไม่บังคับ)</label><input type="datetime-local" id="eCloseAt" value="${toLocalInput(e.closeAt)}"></div>
        </div>
        <div class="field"><label>ห้องที่อนุญาต (คั่นด้วย , เว้นว่าง=ทุกห้องในระดับชั้น)</label>
          <input id="eRooms" value="${esc(e.allowedRooms || '')}" placeholder="ป.5/1, ป.5/2"></div>
        <div class="field-row">
          <div>
            ${checkbox('eShuffleQ', 'สุ่มลำดับข้อ', e.shuffleQuestions)}
            ${checkbox('eShuffleC', 'สุ่มตัวเลือก', e.shuffleChoices)}
          </div>
          <div>
            ${checkbox('eShowScore', 'แสดงคะแนนหลังสอบ', e.showScore !== false)}
            ${checkbox('eShowAnswers', 'แสดงเฉลยหลังสอบ', e.showAnswers)}
            ${checkbox('eAllowRetake', 'อนุญาตสอบซ้ำ', e.allowRetake)}
          </div>
        </div>
      </div>

      <div class="row spread mb-2">
        <h2 style="margin:0">คำถาม (<span id="qCount">${editorState.questions.length}</span> ข้อ)</h2>
        <button class="btn btn-sm" onclick="TEACHER.addQuestion()">＋ เพิ่มข้อ</button>
      </div>
      <div id="qList"></div>
      <div class="exam-footer no-print">
        <button class="btn btn-success btn-lg" onclick="TEACHER.saveExam()">💾 บันทึกข้อสอบ</button>
      </div>`;
    renderQuestions();
  }

  function checkbox(id, label, checked) {
    return `<div class="checkbox-row"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><label for="${id}">${label}</label></div>`;
  }
  function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function renderQuestions() {
    const box = $('qList');
    const qs = editorState.questions;
    $('qCount').textContent = qs.length;
    if (!qs.length) { box.innerHTML = '<div class="card muted text-center">ยังไม่มีคำถาม กด "เพิ่มข้อ" หรือ นำเข้าจาก Word</div>'; return; }
    box.innerHTML = qs.map((q, i) => renderQEditor(q, i)).join('');
    typeset(box);
  }

  function renderQEditor(q, i) {
    return `<div class="q-editor" data-i="${i}">
      <div class="q-editor-head">
        <b>ข้อ ${i + 1}</b>
        <div>
          <button class="btn btn-sm btn-ghost" onclick="TEACHER.moveQ(${i},-1)">↑</button>
          <button class="btn btn-sm btn-ghost" onclick="TEACHER.moveQ(${i},1)">↓</button>
          <button class="btn btn-sm btn-danger" onclick="TEACHER.delQ(${i})">ลบ</button>
        </div>
      </div>
      <div class="field"><label>คำถาม</label>
        <textarea data-q="${i}" data-f="questionText" style="min-height:70px">${esc(q.questionText || '')}</textarea></div>
      <div class="row mb-1">
        <div class="field" style="width:140px;margin:0"><label>คะแนน</label>
          <input type="number" data-q="${i}" data-f="score" value="${q.score || ''}" placeholder="ค่าเริ่มต้น"></div>
        <div class="field grow" style="margin:0"><label>รูปประกอบข้อ</label>
          ${q.imageUrl ? `<img class="question-img" src="${q.imageUrl}" style="max-height:90px"><button class="btn btn-sm btn-ghost" onclick="TEACHER.removeQImg(${i})">ลบรูป</button>`
            : `<input type="file" accept="image/*" onchange="TEACHER.uploadQImg(event,${i})">`}</div>
      </div>
      <label>ตัวเลือก (เลือกวงกลมหน้าข้อที่ถูก)</label>
      ${(q.choices || []).map((c, ci) => `
        <div class="q-choice-edit">
          <input type="radio" name="correct_${i}" ${c.isCorrect ? 'checked' : ''} onclick="TEACHER.setCorrect(${i},${ci})" title="คำตอบที่ถูก">
          <span class="lab">${esc(c.label)}</span>
          <input type="text" data-q="${i}" data-c="${ci}" data-f="choiceText" value="${esc(c.choiceText || '')}">
          <button class="btn btn-sm btn-danger" onclick="TEACHER.delChoice(${i},${ci})">✕</button>
        </div>`).join('')}
      <button class="btn btn-sm btn-ghost" onclick="TEACHER.addChoice(${i})">＋ เพิ่มตัวเลือก</button>
    </div>`;
  }

  // sync DOM inputs -> editorState (เรียกก่อน re-render/save)
  function syncEditorInputs() {
    document.querySelectorAll('#qList [data-q]').forEach(inp => {
      const qi = +inp.dataset.q, f = inp.dataset.f;
      if (inp.dataset.c !== undefined) {
        editorState.questions[qi].choices[+inp.dataset.c][f] = inp.value;
      } else {
        editorState.questions[qi][f] = f === 'score' ? (inp.value === '' ? '' : Number(inp.value)) : inp.value;
      }
    });
  }

  function addQuestion() {
    syncEditorInputs();
    editorState.questions.push({
      questionText: '', imageId: '', score: '',
      choices: [
        { label: 'ก', choiceText: '', isCorrect: true },
        { label: 'ข', choiceText: '', isCorrect: false },
        { label: 'ค', choiceText: '', isCorrect: false },
        { label: 'ง', choiceText: '', isCorrect: false }
      ]
    });
    renderQuestions();
  }
  function delQ(i) { syncEditorInputs(); editorState.questions.splice(i, 1); renderQuestions(); }
  function moveQ(i, dir) {
    syncEditorInputs();
    const j = i + dir; const qs = editorState.questions;
    if (j < 0 || j >= qs.length) return;
    [qs[i], qs[j]] = [qs[j], qs[i]];
    renderQuestions();
  }
  function addChoice(i) {
    syncEditorInputs();
    const q = editorState.questions[i];
    q.choices = q.choices || [];
    q.choices.push({ label: THAI_LABELS[q.choices.length] || String(q.choices.length + 1), choiceText: '', isCorrect: false });
    renderQuestions();
  }
  function delChoice(i, ci) {
    syncEditorInputs();
    const q = editorState.questions[i];
    q.choices.splice(ci, 1);
    // relabel เป็น ก ข ค ง ใหม่
    q.choices.forEach((c, idx) => { c.label = THAI_LABELS[idx] || String(idx + 1); });
    if (!q.choices.some(c => c.isCorrect) && q.choices.length) q.choices[0].isCorrect = true;
    renderQuestions();
  }
  function setCorrect(i, ci) {
    editorState.questions[i].choices.forEach((c, idx) => { c.isCorrect = idx === ci; });
  }
  function removeQImg(i) { syncEditorInputs(); editorState.questions[i].imageId = ''; editorState.questions[i].imageUrl = ''; renderQuestions(); }

  async function uploadQImg(ev, i) {
    const file = ev.target.files[0]; if (!file) return;
    syncEditorInputs();
    toast('กำลังอัปโหลดรูป...', 'info');
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await teacherCall('uploadImage', { dataUrl, filename: 'q' + (i + 1) });
      editorState.questions[i].imageId = res.imageId;
      editorState.questions[i].imageUrl = res.imageUrl;
      toast('อัปโหลดรูปแล้ว'); renderQuestions();
    } catch (err) { toast(err.message, 'error'); }
  }
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  async function saveExam() {
    syncEditorInputs();
    const exam = {
      examId: editorState.exam.examId,
      title: $('eTitle').value.trim(),
      subjectId: $('eSubject').value,
      level: $('eLevel').value.trim(),
      description: $('eDesc').value.trim(),
      duration: Number($('eDuration').value) || 0,
      scorePerQuestion: Number($('eScorePer').value) || 1,
      openAt: fromLocalInput($('eOpenAt').value),
      closeAt: fromLocalInput($('eCloseAt').value),
      allowedRooms: $('eRooms').value.trim(),
      shuffleQuestions: $('eShuffleQ').checked,
      shuffleChoices: $('eShuffleC').checked,
      showScore: $('eShowScore').checked,
      showAnswers: $('eShowAnswers').checked,
      allowRetake: $('eAllowRetake').checked,
      status: editorState.exam.status || 'ปิด'
    };
    if (!exam.title) return toast('กรุณากรอกชื่อชุดข้อสอบ', 'error');
    if (!editorState.questions.length) return toast('กรุณาเพิ่มคำถามอย่างน้อย 1 ข้อ', 'error');
    // ตรวจว่าทุกข้อมีคำตอบถูก
    for (let i = 0; i < editorState.questions.length; i++) {
      const q = editorState.questions[i];
      if (!q.choices || !q.choices.length) return toast(`ข้อ ${i + 1} ยังไม่มีตัวเลือก`, 'error');
      if (!q.choices.some(c => c.isCorrect)) return toast(`ข้อ ${i + 1} ยังไม่ได้เลือกคำตอบที่ถูก`, 'error');
    }
    try {
      await teacherCall('saveExam', { exam, questions: editorState.questions });
      cache.exams = null;
      toast('บันทึกข้อสอบเรียบร้อย 🎉');
      navigate('exams');
    } catch (err) { toast(err.message, 'error'); }
  }
  function fromLocalInput(v) { return v ? new Date(v).toISOString() : ''; }

  // ================= IMPORT (Word) =================
  function pageImport(el) {
    el.innerHTML = `
      <h1 class="page-title">นำเข้าข้อสอบจาก Word</h1>
      <div class="card">
        <p class="muted mb-2">คัดลอกข้อสอบจาก Microsoft Word แล้ววางในช่องด้านล่าง จากนั้นกด "วิเคราะห์"<br>
        • ใส่ <b>*</b> หน้าตัวเลือกที่เป็นคำตอบที่ถูก เช่น <code>*ค. เหล็กเกิดสนิม</code><br>
        • รองรับ ก. ข. ค. ง. / A. B. C. D. / ก) ข) ค) ง) — แนะนำให้ใช้รูปแบบนี้<br>
        • ถ้าตัวเลือกเป็นตัวเลข (1. 2. 3. 4.) ให้เว้น <b>บรรทัดว่าง</b> คั่นระหว่างข้อ เพื่อให้ระบบแยกข้อถูกต้อง<br>
        • สมการคณิตศาสตร์ใช้ <code>$...$</code> เช่น <code>$x^2+2x+1$</code> (ตัวเลขยกกำลัง/เศษส่วนแบบยูนิโคดใช้ได้เลย)</p>
        <div class="field">
          <textarea id="wordArea" style="min-height:240px" placeholder="1. ข้อใดเป็นการเปลี่ยนแปลงทางเคมี
ก. น้ำแข็งละลาย
ข. น้ำเดือด
*ค. เหล็กเกิดสนิม
ง. น้ำตาลละลายน้ำ

2. 25 × 4 มีค่าเท่าใด
ก. 50
*ข. 100
ค. 125
ง. 150"></textarea>
        </div>
        <button class="btn" onclick="TEACHER.parseWord()">🔍 วิเคราะห์</button>
      </div>
      <div id="importPreview"></div>`;
  }

  function parseWord() {
    const text = $('wordArea').value;
    const questions = parseWordExam(text);
    const box = $('importPreview');
    if (!questions.length) {
      box.innerHTML = '<div class="alert alert-warning">ไม่พบข้อสอบ กรุณาตรวจสอบรูปแบบ</div>';
      return;
    }
    const noCorrect = questions.filter(q => !q.choices.some(c => c.isCorrect)).length;
    box.innerHTML = `
      <div class="card">
        <div class="card-title">ตรวจสอบก่อนบันทึก (พบ ${questions.length} ข้อ)</div>
        ${noCorrect ? `<div class="alert alert-warning">มี ${noCorrect} ข้อที่ยังไม่ได้ระบุคำตอบที่ถูก (ใส่ * หน้าตัวเลือก) — สามารถแก้ในตัวแก้ไขได้</div>` : ''}
        <div id="previewList">${questions.map((q, i) => `
          <div class="preview-q">
            <div class="qt">ข้อ ${i + 1}. ${esc(q.questionText)}</div>
            ${q.choices.map(c => `<div class="ch ${c.isCorrect ? 'correct' : ''}">${esc(c.label)}. ${esc(c.choiceText)} ${c.isCorrect ? '✅' : ''}</div>`).join('')}
          </div>`).join('')}</div>
        <div class="row mt-2">
          <button class="btn btn-success" onclick="TEACHER.importToEditor()">➡️ ไปตั้งค่าและแก้ไขข้อสอบ</button>
          <button class="btn btn-ghost" onclick="TEACHER.go('import')">ล้าง</button>
        </div>
      </div>`;
    typeset(box);
    window.__importedQuestions = questions;
  }

  function importToEditor() {
    const questions = (window.__importedQuestions || []).map(q => ({
      questionText: q.questionText, imageId: '', score: '',
      choices: q.choices.map(c => ({ label: c.label, choiceText: c.choiceText, imageId: '', isCorrect: !!c.isCorrect }))
    }));
    editExam(null, { exam: { status: 'ปิด', scorePerQuestion: 1, showScore: true }, questions });
    navigateSet('exams'); // ให้เมนู exams ไฮไลต์
  }
  function navigateSet(page) {
    document.querySelectorAll('.sidebar a[data-page]').forEach(a => a.classList.toggle('active', a.dataset.page === page));
    $('pageBrand').textContent = 'แก้ไขข้อสอบ';
  }

  /**
   * ตัวแยกข้อสอบจากข้อความ Word
   * - ตัวอักษร ก-ฮ / A-Za-z ตามด้วย . หรือ ) = ตัวเลือก
   * - ตัวเลข ตามด้วย . หรือ ) = ข้อใหม่ (หรือเป็นตัวเลือกแบบตัวเลข ถ้าลำดับต่อเนื่อง 1,2,3,4 ในข้อเดียว)
   * - * นำหน้า = คำตอบที่ถูก
   */
  function parseWordExam(text) {
    const rawLines = text.split(/\r?\n/);
    const questions = [];
    let cur = null;
    let blankBefore = false; // มีบรรทัดว่างคั่นก่อนบรรทัดนี้หรือไม่ (ใช้เป็นตัวแบ่งข้อ)

    rawLines.forEach(raw => {
      const line = raw.trim();
      if (!line) { blankBefore = true; return; }
      const hadBlank = blankBefore;
      blankBefore = false;

      let star = false;
      let body = line;
      if (body[0] === '*') { star = true; body = body.slice(1).trim(); }

      const m = body.match(/^([ก-ฮ]|[A-Za-z]|\d{1,2})[.)]\s*(.*)$/);
      if (!m) {
        // ข้อความต่อเนื่อง
        if (cur && cur.choices.length) cur.choices[cur.choices.length - 1].choiceText += ' ' + line;
        else if (cur) cur.questionText += ' ' + line;
        return;
      }
      const label = m[1];
      const rest = m[2];
      const isDigit = /^\d+$/.test(label);

      if (!isDigit) {
        // ตัวอักษร => ตัวเลือกของข้อปัจจุบัน
        if (cur) cur.choices.push({ label: label, choiceText: rest, isCorrect: star });
        return;
      }

      // ตัวเลข: เป็น "ตัวเลือกแบบตัวเลข" ก็ต่อเมื่อ
      //  - ไม่มีบรรทัดว่างคั่นมาก่อน (บรรทัดว่าง = ขึ้นข้อใหม่) และ
      //  - เป็นลำดับต่อเนื่องของตัวเลือกตัวเลขจริง ๆ (ตัวก่อนเป็นตัวเลข หรือเป็นตัวแรกและเลขคือ 1)
      // มิฉะนั้นถือเป็น "ข้อใหม่" — กันเลขข้อถัดไปถูกกลืนเป็นตัวเลือก
      const n = parseInt(label, 10);
      const numChoices = cur ? cur.choices.length : 0;
      const prevIsDigitChoice = numChoices > 0 && /^\d+$/.test(cur.choices[numChoices - 1].label);
      const isNumericChoice = !hadBlank && cur && cur.questionText && numChoices < 8 &&
        n === numChoices + 1 && (numChoices === 0 ? n === 1 : prevIsDigitChoice);
      if (isNumericChoice) {
        cur.choices.push({ label: label, choiceText: rest, isCorrect: star });
      } else {
        cur = { questionText: rest, choices: [] };
        questions.push(cur);
      }
    });

    return questions.filter(q => q.questionText);
  }

  // ================= RESULTS =================
  async function pageResults(el) {
    loading(el);
    try {
      const exams = await loadExams();
      el.innerHTML = `
        <h1 class="page-title">ผลการสอบ</h1>
        <div class="toolbar">
          <select id="resExam"><option value="">— เลือกชุดข้อสอบ —</option>
            ${exams.map(e => `<option value="${e.examId}">${esc(e.title)} (${esc(e.subjectName)})</option>`).join('')}</select>
          <select id="resRoom"><option value="">ทุกห้อง</option></select>
          <button class="btn btn-sm btn-ghost" id="resExportCsv">⬇️ CSV</button>
          <button class="btn btn-sm btn-ghost" id="resExportXls">⬇️ Excel</button>
          <button class="btn btn-sm btn-ghost" onclick="window.print()">🖨️ พิมพ์</button>
        </div>
        <div id="resContent"><div class="muted">เลือกชุดข้อสอบเพื่อดูผล</div></div>`;
      const classes = await loadClasses();
      const rooms = [...new Set(classes.map(c => c.room))];
      $('resRoom').innerHTML = '<option value="">ทุกห้อง</option>' + rooms.map(r => `<option>${esc(r)}</option>`).join('');
      $('resExam').addEventListener('change', renderResults);
      $('resRoom').addEventListener('change', renderResults);
      $('resExportCsv').addEventListener('click', () => exportResults('csv'));
      $('resExportXls').addEventListener('click', () => exportResults('xls'));
    } catch (err) { showErr(el, err); }
  }

  let lastResults = null;
  async function renderResults() {
    const examId = $('resExam').value;
    const room = $('resRoom').value;
    const box = $('resContent');
    if (!examId) { box.innerHTML = '<div class="muted">เลือกชุดข้อสอบเพื่อดูผล</div>'; return; }
    box.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
    try {
      const data = await teacherCall('getResults', { examId, room });
      lastResults = data;
      const s = data.summary;
      box.innerHTML = `
        <div class="stats-grid mb-3">
          ${stat('👥', s.totalEligible, 'ผู้มีสิทธิ์สอบ')}
          ${stat('✅', s.done, 'เข้าสอบแล้ว')}
          ${stat('⏳', s.notDone, 'ยังไม่ได้สอบ')}
          ${stat('📊', s.avg, 'คะแนนเฉลี่ย')}
          ${stat('🏆', s.max, 'สูงสุด')}
          ${stat('📉', s.min, 'ต่ำสุด')}
          ${stat('%', s.avgPercent + '%', 'ร้อยละเฉลี่ย')}
        </div>
        <div class="table-wrap"><table id="resTable">
          <thead><tr>
            <th onclick="TEACHER.sortRes('number')">เลขที่</th>
            <th onclick="TEACHER.sortRes('studentId')">รหัส</th>
            <th onclick="TEACHER.sortRes('fullName')">ชื่อ</th>
            <th onclick="TEACHER.sortRes('room')">ห้อง</th>
            <th class="center" onclick="TEACHER.sortRes('score')">คะแนน</th>
            <th class="center" onclick="TEACHER.sortRes('percent')">ร้อยละ</th>
            <th>เวลาส่ง</th><th></th>
          </tr></thead>
          <tbody id="resTbody"></tbody>
        </table></div>`;
      renderResTable(data.table);
    } catch (err) { showErr(box, err); }
  }

  function renderResTable(rows) {
    $('resTbody').innerHTML = rows.map(r => `<tr>
      <td class="center">${esc(r.number)}</td>
      <td>${esc(r.studentId)}</td>
      <td>${esc(r.title || '')} ${esc(r.fullName)}</td>
      <td>${esc(r.room)}</td>
      <td class="center">${r.done ? r.score + '/' + r.totalScore : '<span class="badge badge-gray">ยังไม่สอบ</span>'}</td>
      <td class="center">${r.done ? r.percent + '%' : '-'}</td>
      <td>${r.done ? fmtTime(r.submittedAt) : '-'}</td>
      <td class="center">${r.done ? `<button class="btn btn-sm btn-ghost no-print" onclick="TEACHER.resetAttempt('${esc(lastResults.exam.examId)}','${esc(r.studentId)}')">ให้สอบใหม่</button>` : ''}</td>
    </tr>`).join('');
  }
  function fmtTime(iso) {
    if (!iso) return '-';
    const d = new Date(iso); if (isNaN(d)) return '-';
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  let sortDir = {};
  function sortRes(field) {
    if (!lastResults) return;
    sortDir[field] = !sortDir[field];
    const dir = sortDir[field] ? 1 : -1;
    const rows = lastResults.table.slice().sort((a, b) => {
      let x = a[field], y = b[field];
      if (typeof x === 'string') { x = x || ''; y = y || ''; return x.localeCompare(y, 'th') * dir; }
      return ((x || 0) - (y || 0)) * dir;
    });
    renderResTable(rows);
  }
  async function resetAttempt(examId, studentId) {
    if (!confirm('ให้ ' + studentId + ' สอบชุดนี้ใหม่? (ผลเดิมจะถูกลบ)')) return;
    try { await teacherCall('resetAttempt', { examId, studentId }); toast('ลบผลเดิมแล้ว ให้สอบใหม่ได้'); renderResults(); }
    catch (err) { toast(err.message, 'error'); }
  }

  function exportResults(type) {
    if (!lastResults) return toast('ยังไม่มีข้อมูล', 'error');
    const rows = lastResults.table;
    const header = ['เลขที่', 'รหัส', 'ชื่อ-นามสกุล', 'ห้อง', 'คะแนน', 'คะแนนเต็ม', 'ร้อยละ', 'เวลาส่ง'];
    const data = rows.map(r => [
      r.number, r.studentId, (r.title || '') + ' ' + r.fullName, r.room,
      r.done ? r.score : '', r.totalScore || lastResults.summary.totalScore,
      r.done ? r.percent : '', r.done ? fmtTime(r.submittedAt) : 'ยังไม่สอบ'
    ]);
    const name = 'ผลสอบ_' + (lastResults.exam.title || 'exam');
    if (type === 'csv') downloadCsv(name, header, data);
    else downloadXls(name, header, data);
  }

  function downloadCsv(name, header, data) {
    const csv = [header, ...data].map(row =>
      row.map(cell => `"${String(cell == null ? '' : cell).replace(/"/g, '""')}"`).join(',')
    ).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    triggerDownload(blob, name + '.csv');
  }
  function downloadXls(name, header, data) {
    let html = '<table border="1"><tr>' + header.map(h => `<th>${esc(h)}</th>`).join('') + '</tr>';
    data.forEach(row => { html += '<tr>' + row.map(c => `<td>${esc(c)}</td>`).join('') + '</tr>'; });
    html += '</table>';
    const blob = new Blob(['﻿<html><head><meta charset="utf-8"></head><body>' + html + '</body></html>'],
      { type: 'application/vnd.ms-excel' });
    triggerDownload(blob, name + '.xls');
  }
  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ================= ANALYSIS =================
  async function pageAnalysis(el) {
    loading(el);
    try {
      const exams = await loadExams();
      el.innerHTML = `
        <h1 class="page-title">วิเคราะห์ข้อสอบรายข้อ</h1>
        <div class="toolbar">
          <select id="anExam"><option value="">— เลือกชุดข้อสอบ —</option>
            ${exams.map(e => `<option value="${e.examId}">${esc(e.title)}</option>`).join('')}</select>
        </div>
        <div id="anContent"><div class="muted">เลือกชุดข้อสอบเพื่อดูการวิเคราะห์</div></div>`;
      $('anExam').addEventListener('change', renderAnalysis);
    } catch (err) { showErr(el, err); }
  }
  // ---- ตัวช่วยแปลผลค่าสถิติ ----
  function difficultyInfo(p) {
    if (p == null) return { text: '-', cls: 'badge-gray' };
    if (p < 0.20) return { text: 'ยากมาก', cls: 'badge-red' };
    if (p > 0.80) return { text: 'ง่ายมาก', cls: 'badge-yellow' };
    return { text: 'เหมาะสม', cls: 'badge-green' };
  }
  function discriminationInfo(d) {
    if (d == null) return { text: 'ข้อมูลไม่พอ', cls: 'badge-gray' };
    if (d < 0) return { text: 'ติดลบ (ตรวจเฉลย)', cls: 'badge-red' };
    if (d < 0.20) return { text: 'ต้องปรับปรุง', cls: 'badge-red' };
    if (d < 0.30) return { text: 'พอใช้', cls: 'badge-yellow' };
    if (d < 0.40) return { text: 'ดี', cls: 'badge-green' };
    return { text: 'ดีมาก', cls: 'badge-green' };
  }
  function deInfo(de) {
    if (de == null) return { cls: 'badge-gray' };
    if (de >= 75) return { cls: 'badge-green' };
    if (de >= 50) return { cls: 'badge-yellow' };
    return { cls: 'badge-red' };
  }
  function reliabilityInfo(kr) {
    if (kr == null) return { text: 'ข้อมูลไม่พอ', cls: 'badge-gray' };
    if (kr >= 0.80) return { text: 'สูง/ดีมาก', cls: 'badge-green' };
    if (kr >= 0.70) return { text: 'ยอมรับได้', cls: 'badge-yellow' };
    return { text: 'ต่ำ (ควรปรับปรุง)', cls: 'badge-red' };
  }
  function fmt(v) { return v == null ? '-' : v; }

  async function renderAnalysis() {
    const examId = $('anExam').value;
    const box = $('anContent');
    if (!examId) { box.innerHTML = '<div class="muted">เลือกชุดข้อสอบ</div>'; return; }
    box.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
    try {
      const data = await teacherCall('getAnalysis', { examId });
      if (!data.questions.length) { box.innerHTML = '<div class="muted">ไม่มีข้อมูล</div>'; return; }
      if (!data.overall) {
        box.innerHTML = '<div class="alert alert-warning">ฟีเจอร์วิเคราะห์เชิงลึกต้องอัปเดตโค้ด Backend (Worker) เป็นเวอร์ชันล่าสุดก่อน — ดูวิธีที่ cloudflare/README.md แล้ว Deploy ใหม่</div>';
        return;
      }
      const o = data.overall;
      if (!o.numStudents) {
        box.innerHTML = '<div class="card muted text-center">ยังไม่มีผู้เข้าสอบชุดนี้ จึงยังวิเคราะห์ไม่ได้</div>';
        return;
      }

      const rel = reliabilityInfo(o.kr20);
      const smallNote = o.numStudents < 10
        ? `<div class="alert alert-warning" style="font-size:13px">มีผู้เข้าสอบ ${o.numStudents} คน — ค่าทางสถิติจะแม่นยำขึ้นเมื่อมีผู้สอบมากขึ้น (แนะนำ ≥ 10–30 คน)</div>`
        : '';

      // ---- การ์ดสรุปภาพรวม ----
      let html = `
        <div class="card">
          <div class="card-title">📈 สรุปภาพรวมของข้อสอบ</div>
          ${smallNote}
          <div class="stats-grid">
            ${stat('👥', o.numStudents, 'ผู้เข้าสอบ')}
            ${stat('📝', o.numItems, 'จำนวนข้อ')}
            ${stat('📊', o.meanScore + '/' + o.numItems, 'คะแนนเฉลี่ย')}
            ${stat('📉', o.sdScore, 'ส่วนเบี่ยงเบน (SD)')}
            ${stat('🎯', fmt(o.meanDifficulty), 'ความยากเฉลี่ย (P)')}
            ${stat('🔍', fmt(o.meanDiscrimination), 'อำนาจจำแนกเฉลี่ย (r)')}
          </div>
          <div class="row mt-2" style="gap:20px;flex-wrap:wrap">
            <div>
              <div class="muted" style="font-size:13px">ความเชื่อมั่น (Reliability, KR-20)</div>
              <div style="font-size:26px;font-weight:800;color:var(--primary)">${fmt(o.kr20)}
                <span class="badge ${rel.cls}" style="vertical-align:middle">${rel.text}</span></div>
            </div>
            <div>
              <div class="muted" style="font-size:13px">ความเที่ยงตรงสูงสุด (โดยประมาณ = √ความเชื่อมั่น)</div>
              <div style="font-size:26px;font-weight:800;color:var(--gray-600)">${fmt(o.validityMax)}</div>
            </div>
          </div>
          <div class="mt-2" style="font-size:13px">
            คุณภาพข้อสอบ (ตามอำนาจจำแนก):
            <span class="badge badge-green">ดี ${o.quality.good} ข้อ</span>
            <span class="badge badge-yellow">พอใช้ ${o.quality.fair} ข้อ</span>
            <span class="badge badge-red">ควรปรับปรุง ${o.quality.poor} ข้อ</span>
          </div>
          <p class="muted mt-2" style="font-size:12px;line-height:1.7">
            <b>หมายเหตุ:</b> ค่า "ความเที่ยงตรง" ที่แท้จริงประเมินจากผู้เชี่ยวชาญ (IOC) คำนวณจากคำตอบล้วนไม่ได้
            ค่าที่แสดงเป็น "เพดานสูงสุดตามทฤษฎี (√ความเชื่อมั่น)" ใช้เป็นแนวเทียบเท่านั้น •
            อำนาจจำแนกคำนวณจากกลุ่มสูง/ต่ำ กลุ่มละ ${o.groupSize} คน (27%)
          </p>
        </div>
        <h2 class="mb-2 mt-3">วิเคราะห์รายข้อ</h2>`;

      // ---- รายข้อ ----
      html += data.questions.map((q, i) => {
        const total = q.correct + q.wrong;
        const di = difficultyInfo(q.p);
        const di2 = discriminationInfo(q.discrimination);
        const de = deInfo(q.distractorEfficiency);
        return `<div class="card">
          <div class="mb-1"><b>ข้อ ${i + 1}. ${esc(q.questionText)}</b></div>
          <div class="row mb-2" style="gap:8px;flex-wrap:wrap">
            <span class="badge ${di.cls}">P (ความยาก) = ${fmt(q.p)} · ${di.text}</span>
            <span class="badge ${ di2.cls }">r (อำนาจจำแนก) = ${fmt(q.discrimination)} · ${ di2.text }</span>
            <span class="badge ${de.cls}">DE (ตัวลวง) = ${q.distractorEfficiency == null ? '-' : q.distractorEfficiency + '%'}</span>
          </div>
          <div class="muted mb-1" style="font-size:13px">ตอบถูก ${q.correct} คน • ตอบผิด ${q.wrong} คน</div>
          ${q.choices.map(c => {
            const pct = total ? Math.round((c.count / total) * 100) : 0;
            const nf = c.nonFunctioning;
            return `<div style="margin:6px 0">
              <div class="row spread" style="font-size:14px">
                <span>${c.isCorrect ? '✅ ' : ''}${esc(c.label)}. ${esc(c.choiceText)}
                  ${nf ? '<span class="badge badge-gray" style="font-size:11px">ตัวลวงไม่ทำงาน</span>' : ''}</span>
                <span class="muted">${c.count} คน (${pct}%)</span>
              </div>
              <div style="background:var(--gray-200);border-radius:6px;height:10px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:${c.isCorrect ? 'var(--success)' : (nf ? 'var(--gray-300)' : 'var(--primary)')}"></div>
              </div>
            </div>`;
          }).join('')}
        </div>`;
      }).join('');

      box.innerHTML = html;
      typeset(box);
    } catch (err) { showErr(box, err); }
  }

  // ================= SETTINGS =================
  async function pageSettings(el) {
    loading(el);
    try {
      const s = await teacherCall('getSettings');
      el.innerHTML = `
        <h1 class="page-title">ตั้งค่าระบบ</h1>
        <div class="card" style="max-width:480px">
          <div class="field"><label>ชื่อโรงเรียน</label><input id="setSchool" value="${esc(s.schoolName || '')}"></div>
          <div class="field"><label>ปีการศึกษา</label><input id="setYear" value="${esc(s.academicYear || '')}"></div>
          <div class="field"><label>สีหลักของระบบ</label><input type="color" id="setColor" value="${esc(s.primaryColor || '#2563eb')}" style="height:48px"></div>
          <button class="btn" id="saveSettingsBtn">บันทึกการตั้งค่า</button>
        </div>
        <div class="card mt-2" style="max-width:480px">
          <div class="card-title">ℹ️ หมายเหตุ</div>
          <p class="muted" style="font-size:14px">การเปลี่ยน "รหัสครู" ให้ทำในหน้า Google Apps Script (ฟังก์ชัน setTeacherCode) เพื่อความปลอดภัย ไม่เก็บไว้ในหน้าเว็บ</p>
        </div>`;
      $('saveSettingsBtn').addEventListener('click', async () => {
        try {
          await teacherCall('saveSettings', {
            schoolName: $('setSchool').value.trim(),
            academicYear: $('setYear').value.trim(),
            primaryColor: $('setColor').value
          });
          // ล้างแคช config ในเครื่องเพื่อให้ดึงค่าที่เพิ่งบันทึกใหม่
          try { localStorage.removeItem('exam_pubcfg'); } catch (e) {}
          toast('บันทึกแล้ว'); applyPublicConfig();
        } catch (err) { toast(err.message, 'error'); }
      });
    } catch (err) { showErr(el, err); }
  }

  // ---------- utils ----------
  function debounce(fn, ms) {
    let t; return function () { clearTimeout(t); t = setTimeout(() => fn.apply(this, arguments), ms); };
  }

  // ---------- expose ----------
  window.TEACHER = {
    go: navigate,
    studentForm, deleteStudent, importCsv, downloadStudentTemplate,
    classForm, deleteClass,
    subjectForm, deleteSubject,
    editExam, toggleStatus, deleteExam,
    addQuestion, delQ, moveQ, addChoice, delChoice, setCorrect, uploadQImg, removeQImg, saveExam,
    parseWord, importToEditor,
    sortRes, resetAttempt
  };

  // เข้าสู่แผงควบคุมทันทีถ้ายังมี session ครูอยู่ (วางไว้ท้ายสุดหลังประกาศตัวแปรครบ)
  if (Auth.isTeacher()) { showShell(); }
})();
