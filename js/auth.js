/**
 * auth.js
 * จัดการ session ของนักเรียนและครู (เก็บใน sessionStorage)
 */

const Auth = {
  // ---------- นักเรียน ----------
  setStudent(student) {
    sessionStorage.setItem('exam_student', JSON.stringify(student));
  },
  getStudent() {
    try { return JSON.parse(sessionStorage.getItem('exam_student')); }
    catch (e) { return null; }
  },
  clearStudent() {
    sessionStorage.removeItem('exam_student');
  },
  requireStudent() {
    const s = this.getStudent();
    if (!s) { location.href = 'index.html'; return null; }
    return s;
  },

  // ---------- ครู ----------
  setTeacher(token) {
    sessionStorage.setItem('exam_teacher', token);
  },
  getTeacherToken() {
    return sessionStorage.getItem('exam_teacher');
  },
  clearTeacher() {
    sessionStorage.removeItem('exam_teacher');
  },
  isTeacher() {
    return !!this.getTeacherToken();
  },

  logout() {
    this.clearStudent();
    this.clearTeacher();
    location.href = 'index.html';
  }
};

/** helper: เรียก API ฝั่งครูโดยแนบ token อัตโนมัติ */
async function teacherCall(action, params = {}) {
  return API.call(action, Object.assign({ teacherCode: Auth.getTeacherToken() }, params));
}
