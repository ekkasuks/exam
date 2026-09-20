/**
 * Code.gs
 * จุดเข้าเว็บแอป (doGet/doPost) + ตัวจัดเส้นทาง action + ติดตั้งระบบ + Settings
 * ------------------------------------------------------------------
 * การเรียก API: ส่ง POST body เป็น JSON แต่ Content-Type: text/plain
 * เพื่อเลี่ยง CORS preflight (จำเป็นเมื่อเรียกจาก GitHub Pages)
 */

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var params = {};
  try {
    if (e && e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      params = e.parameter;
      if (params.payload) params = JSON.parse(params.payload);
    }
  } catch (err) {
    return fail('ข้อมูลที่ส่งมาไม่ถูกต้อง (JSON ผิดรูปแบบ)', 'BAD_JSON');
  }

  var action = params.action || '';
  try {
    return route(action, params);
  } catch (err) {
    return fail(err && err.message ? err.message : String(err), 'EXCEPTION');
  }
}

function route(action, params) {
  switch (action) {
    // สาธารณะ
    case 'ping': return ok({ time: nowISO(), version: '1.0' });
    case 'getPublicConfig': return getPublicConfig();

    // นักเรียน
    case 'studentLogin': return studentLogin(params);
    case 'getExam': return getExam(params);
    case 'submitExam': return submitExam(params);

    // ครู — auth
    case 'teacherLogin': return teacherLogin(params);

    // ครู — นักเรียน
    case 'listStudents': return listStudents(params);
    case 'addStudent': return addStudent(params);
    case 'updateStudent': return updateStudent(params);
    case 'deleteStudent': return deleteStudent(params);
    case 'importStudents': return importStudents(params);

    // ครู — ห้องเรียน
    case 'listClasses': return listClasses(params);
    case 'addClass': return addClass(params);
    case 'updateClass': return updateClass(params);
    case 'deleteClass': return deleteClass(params);

    // ครู — รายวิชา
    case 'listSubjects': return listSubjects(params);
    case 'addSubject': return addSubject(params);
    case 'updateSubject': return updateSubject(params);
    case 'deleteSubject': return deleteSubject(params);

    // ครู — ข้อสอบ
    case 'listExams': return listExams(params);
    case 'saveExam': return saveExam(params);
    case 'getExamFull': return getExamFull(params);
    case 'deleteExam': return deleteExam(params);
    case 'setExamStatus': return setExamStatus(params);
    case 'uploadImage': return uploadImage(params);

    // ครู — ผล/วิเคราะห์
    case 'getDashboardStats': return getDashboardStats(params);
    case 'getResults': return getResults(params);
    case 'getAnalysis': return getAnalysis(params);
    case 'resetAttempt': return resetAttempt(params);

    // ครู — ตั้งค่า
    case 'getSettings': return getSettingsAction(params);
    case 'saveSettings': return saveSettingsAction(params);

    default:
      return fail('ไม่รู้จักคำสั่ง: ' + action, 'UNKNOWN_ACTION');
  }
}

// ============ Settings ============

function getSetting(key) {
  var row = findOne(SHEETS.SETTINGS, function (r) { return String(r.key) === key; });
  if (row) return row.value;
  return DEFAULT_SETTINGS[key] !== undefined ? DEFAULT_SETTINGS[key] : '';
}

function setSetting(key, value) {
  return withLock(function () {
    var row = findOne(SHEETS.SETTINGS, function (r) { return String(r.key) === key; });
    if (row) {
      updateRowByNumber(SHEETS.SETTINGS, row.__row, { key: key, value: value });
    } else {
      appendRow(SHEETS.SETTINGS, { key: key, value: value });
    }
  });
}

/** config สาธารณะ (ไม่มีความลับ) สำหรับ frontend แสดงชื่อโรงเรียน/ปีการศึกษา/สี */
function getPublicConfig() {
  return ok({
    schoolName: getSetting('schoolName'),
    academicYear: getSetting('academicYear'),
    primaryColor: getSetting('primaryColor')
  });
}

function getSettingsAction(params) {
  requireTeacher(params);
  return ok({
    schoolName: getSetting('schoolName'),
    academicYear: getSetting('academicYear'),
    primaryColor: getSetting('primaryColor')
  });
}

function saveSettingsAction(params) {
  requireTeacher(params);
  if (params.schoolName !== undefined) setSetting('schoolName', params.schoolName);
  if (params.academicYear !== undefined) setSetting('academicYear', params.academicYear);
  if (params.primaryColor !== undefined) setSetting('primaryColor', params.primaryColor);
  return getPublicConfig();
}

// ============ ติดตั้งระบบ (รันครั้งเดียวจาก Editor) ============

/**
 * สร้างชีตทั้งหมด + ใส่หัวคอลัมน์ + ข้อมูลเริ่มต้น
 * *** รันฟังก์ชันนี้หนึ่งครั้งหลังวางโค้ด ***
 */
function setupSpreadsheet() {
  var ss = getSpreadsheet();

  Object.keys(SHEETS).forEach(function (k) {
    var name = SHEETS[k];
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    var headers = HEADERS[name];
    // เขียนหัวคอลัมน์ถ้ายังว่าง
    var firstRow = sh.getRange(1, 1, 1, headers.length).getValues()[0];
    var empty = firstRow.every(function (v) { return v === '' || v === null; });
    if (empty) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
  });

  // ลบชีตเริ่มต้น "Sheet1" ถ้ามีและว่าง
  var s1 = ss.getSheetByName('Sheet1') || ss.getSheetByName('ชีต1');
  if (s1 && ss.getSheets().length > 1) {
    try { ss.deleteSheet(s1); } catch (e) {}
  }

  seedDefaults();
  ensureTeacherCode();

  return 'ติดตั้งเรียบร้อย: สร้างชีตครบ ' + Object.keys(SHEETS).length + ' ชีต';
}

/** ใส่รายวิชาพื้นฐาน + Settings เริ่มต้น (เฉพาะเมื่อยังว่าง) */
function seedDefaults() {
  if (readAll(SHEETS.SUBJECTS).length === 0) {
    var subjects = [
      'ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์และเทคโนโลยี',
      'สังคมศึกษา ศาสนาและวัฒนธรรม', 'สุขศึกษาและพลศึกษา',
      'ศิลปะ', 'การงานอาชีพ', 'ภาษาอังกฤษ'
    ];
    appendRows(SHEETS.SUBJECTS, subjects.map(function (name) {
      return { subjectId: newId('SUB'), name: name, status: 'ใช้งาน' };
    }));
  }

  if (readAll(SHEETS.SETTINGS).length === 0) {
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
      appendRow(SHEETS.SETTINGS, { key: k, value: DEFAULT_SETTINGS[k] });
    });
  }
}

/** ตั้งรหัสครูเริ่มต้นถ้ายังไม่มี */
function ensureTeacherCode() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty(PROP_TEACHER_CODE)) {
    props.setProperty(PROP_TEACHER_CODE, DEFAULT_TEACHER_CODE);
  }
}

/** เปลี่ยนรหัสครู (รันจาก Editor) */
function setTeacherCode(newCode) {
  PropertiesService.getScriptProperties().setProperty(PROP_TEACHER_CODE, String(newCode));
  return 'ตั้งรหัสครูใหม่เรียบร้อย';
}

/** ใส่ข้อมูลตัวอย่างเพื่อทดสอบ (ไม่บังคับ) */
function seedSampleData() {
  // ห้องเรียนตัวอย่าง
  if (readAll(SHEETS.CLASSES).length === 0) {
    appendRows(SHEETS.CLASSES, [
      { classId: newId('CLS'), level: 'ป.5', room: 'ป.5/1', note: '' },
      { classId: newId('CLS'), level: 'ป.5', room: 'ป.5/2', note: '' }
    ]);
  }
  // นักเรียนตัวอย่าง
  if (readAll(SHEETS.STUDENTS).length === 0) {
    appendRows(SHEETS.STUDENTS, [
      { studentId: 'S0001', title: 'ด.ช.', fullName: 'ตัวอย่าง ใจดี', level: 'ป.5', room: 'ป.5/1', number: '10', status: 'ใช้งาน' },
      { studentId: 'S0002', title: 'ด.ญ.', fullName: 'สมหญิง เรียนเก่ง', level: 'ป.5', room: 'ป.5/1', number: '11', status: 'ใช้งาน' }
    ]);
  }
  return 'ใส่ข้อมูลตัวอย่างเรียบร้อย';
}
