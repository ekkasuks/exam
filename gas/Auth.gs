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
  return ok({ student: info, exams: exams });
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
