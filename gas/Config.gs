/**
 * Config.gs
 * ค่าคงที่กลางของระบบ + ชื่อ Sheet + คอลัมน์ + ตัวช่วยตั้งค่า
 * ------------------------------------------------------------------
 * หมายเหตุ: รหัสครูและข้อมูลสำคัญเก็บใน Script Properties เท่านั้น
 * ไม่ฝังในโค้ด Frontend
 */

// ====== ชื่อชีต ======
var SHEETS = {
  STUDENTS: 'Students',
  CLASSES: 'Classes',
  SUBJECTS: 'Subjects',
  EXAMS: 'Exams',
  QUESTIONS: 'Questions',
  CHOICES: 'Choices',
  RESULTS: 'Results',
  ANSWERS: 'Answers',
  SETTINGS: 'Settings'
};

// ====== หัวคอลัมน์ (ลำดับสำคัญ ห้ามสลับหลังมีข้อมูลแล้ว) ======
var HEADERS = {
  Students: ['studentId', 'title', 'fullName', 'level', 'room', 'number', 'status'],
  Classes: ['classId', 'level', 'room', 'note'],
  Subjects: ['subjectId', 'name', 'status'],
  Exams: [
    'examId', 'title', 'subjectId', 'level', 'description',
    'numQuestions', 'totalScore', 'scorePerQuestion', 'duration',
    'openAt', 'closeAt', 'allowedRooms', 'status',
    'shuffleQuestions', 'shuffleChoices', 'showScore',
    'allowRetake', 'showAnswers', 'academicYear', 'createdAt', 'updatedAt'
  ],
  Questions: ['questionId', 'examId', 'order', 'questionText', 'imageId', 'score'],
  Choices: ['choiceId', 'questionId', 'examId', 'label', 'choiceText', 'imageId', 'isCorrect', 'order'],
  Results: [
    'attemptId', 'examId', 'studentId', 'score', 'totalScore', 'percent',
    'startedAt', 'submittedAt', 'durationUsed', 'status', 'academicYear'
  ],
  Answers: ['answerId', 'attemptId', 'examId', 'studentId', 'questionId', 'selectedLabel', 'isCorrect', 'score'],
  Settings: ['key', 'value']
};

// ====== ค่าตั้งต้นของ Settings ======
var DEFAULT_SETTINGS = {
  schoolName: 'โรงเรียนบ้านใหม่',
  academicYear: '2568',
  primaryColor: '#2563eb'
};

// ====== Script Properties keys ======
var PROP_TEACHER_CODE = 'TEACHER_CODE';
var PROP_DRIVE_FOLDER = 'DRIVE_FOLDER_ID';
var DEFAULT_TEACHER_CODE = '127';

/**
 * ดึง Spreadsheet ที่ผูกกับสคริปต์
 * ถ้าใช้แบบ standalone ให้ตั้ง Script Property 'SPREADSHEET_ID'
 */
function getSpreadsheet() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('ไม่พบ Spreadsheet: กรุณาตั้งค่า Script Property "SPREADSHEET_ID" หรือผูกสคริปต์กับ Google Sheet');
  }
  return ss;
}

function getSheet(name) {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    throw new Error('ไม่พบชีต: ' + name + ' — กรุณารัน setupSpreadsheet() หนึ่งครั้ง');
  }
  return sh;
}

/** รหัสครู (จาก Script Properties เท่านั้น) */
function getTeacherCode() {
  var code = PropertiesService.getScriptProperties().getProperty(PROP_TEACHER_CODE);
  return code || DEFAULT_TEACHER_CODE;
}

/** โฟลเดอร์ Drive สำหรับเก็บรูป (สร้างอัตโนมัติถ้ายังไม่มี) */
function getImageFolder() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_DRIVE_FOLDER);
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (e) {
      // โฟลเดอร์ถูกลบ ให้สร้างใหม่
    }
  }
  var folder = DriveApp.createFolder('ExamSystem_Images');
  props.setProperty(PROP_DRIVE_FOLDER, folder.getId());
  return folder;
}
