/**
 * Auth.gs
 * การเข้าสู่ระบบของนักเรียน (ด้วยรหัสนักเรียน) และครู (ด้วยรหัสลับ)
 */

/**
 * นักเรียนเข้าสู่ระบบด้วยรหัสนักเรียน
 * คืนข้อมูลนักเรียน + รายการข้อสอบที่เปิดให้ทำได้ (โหลดครั้งเดียว)
 */
function studentLogin(params) {
  var studentId = String(params.studentId || '').trim().toUpperCase();
  if (!studentId) return fail('กรุณากรอกรหัสนักเรียน', 'NO_ID');

  var student = findOne(SHEETS.STUDENTS, function (r) {
    return String(r.studentId).trim().toUpperCase() === studentId;
  });
  if (!student) return fail('ไม่พบรหัสนักเรียนนี้ในระบบ', 'NOT_FOUND');
  // ถือว่าใช้งานได้ เว้นแต่ระบุปิดชัดเจน
  var st = String(student.status || '').trim();
  if (st === 'ปิด' || st === 'inactive') {
    return fail('บัญชีนักเรียนนี้ถูกปิดการใช้งาน', 'INACTIVE');
  }

  var info = {
    studentId: student.studentId,
    title: student.title,
    fullName: student.fullName,
    level: student.level,
    room: student.room,
    number: student.number
  };

  var exams = listAvailableExamsForStudent(student);
  var results = buildStudentResults(student);
  return ok({ student: info, exams: exams, results: results });
}

/** ผลสอบทั้งหมดของนักเรียน (ครั้งล่าสุดต่อชุด) + ผ่าน/ไม่ผ่าน (เกณฑ์ 50%) */
function buildStudentResults(student) {
  var rows = findRows(SHEETS.RESULTS, function (r) {
    return String(r.studentId).trim().toUpperCase() === String(student.studentId).trim().toUpperCase() &&
           String(r.status) === 'submitted';
  });
  if (!rows.length) return [];
  rows.sort(function (a, b) { return String(b.submittedAt).localeCompare(String(a.submittedAt)); });

  var latest = {};
  rows.forEach(function (r) { var k = String(r.examId); if (!latest[k]) latest[k] = r; });

  var exams = {};
  readAll(SHEETS.EXAMS).forEach(function (e) { exams[String(e.examId)] = e; });
  var subjects = {};
  readAll(SHEETS.SUBJECTS).forEach(function (s) { subjects[s.subjectId] = s.name; });

  var out = Object.keys(latest).map(function (eid) {
    var r = latest[eid];
    var e = exams[eid] || {};
    var percent = Number(r.percent) || 0;
    return {
      examId: eid,
      examTitle: e.title || '(ข้อสอบถูกลบ)',
      subjectName: subjects[e.subjectId] || '',
      score: Number(r.score) || 0,
      totalScore: Number(r.totalScore) || 0,
      percent: percent,
      submittedAt: r.submittedAt || '',
      showScore: e.showScore !== undefined ? toBool(e.showScore) : true,
      passed: percent >= 50
    };
  });
  out.sort(function (a, b) { return String(b.submittedAt).localeCompare(String(a.submittedAt)); });
  return out;
}

/**
 * ตรวจสอบรหัสครู (server-side เท่านั้น)
 */
function teacherLogin(params) {
  var code = String(params.code || '').trim();
  if (!code) return fail('กรุณากรอกรหัสครู', 'NO_CODE');
  if (code !== getTeacherCode()) {
    // หน่วงเวลาเมื่อกรอกผิด เพื่อชะลอการเดารหัสแบบสุ่ม (brute-force)
    Utilities.sleep(800);
    return fail('รหัสครูไม่ถูกต้อง', 'WRONG_CODE');
  }
  // token ง่าย ๆ สำหรับ session (ตรวจซ้ำทุก request ด้วย requireTeacher)
  return ok({ token: getTeacherCode(), schoolName: getSetting('schoolName') });
}

/**
 * ยืนยันว่าเป็นครู — ทุก action ฝั่งครูต้องเรียกฟังก์ชันนี้ก่อน
 * โยน error ถ้าไม่ผ่าน
 */
function requireTeacher(params) {
  var code = String(params.teacherCode || params.token || '').trim();
  if (code !== getTeacherCode()) {
    throw new Error('ไม่มีสิทธิ์เข้าถึง กรุณาเข้าสู่ระบบครูใหม่');
  }
}
