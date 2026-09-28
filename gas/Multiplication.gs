/**
 * Multiplication.gs
 * ทดสอบสูตรคูณ (แม่ 2-12) — โจทย์สุ่มฝั่ง client, ตรวจคะแนนฝั่ง server
 * เก็บ 1 ผลต่อคน (ครูล้างได้), ครูเปิดตามระดับชั้น
 */

var MULT_TOTAL = 40;

/** ระดับชั้นที่เปิดทดสอบสูตรคูณ (เก็บใน Settings.multLevels เป็นข้อความคั่นด้วย ,) */
function getMultLevels() {
  var v = getSetting('multLevels');
  return String(v || '').split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
}

/** นักเรียนส่งคำตอบ */
function submitMultTest(params) {
  var studentId = String(params.studentId || '').trim().toUpperCase();
  var answers = params.answers || [];
  return withLock(function () {
    var student = findOne(SHEETS.STUDENTS, function (r) {
      return String(r.studentId).trim().toUpperCase() === studentId;
    });
    if (!student) return fail('ไม่พบนักเรียน', 'NO_STUDENT');

    var levels = getMultLevels();
    if (levels.indexOf(String(student.level).trim()) === -1) {
      return fail('ยังไม่เปิดทดสอบสูตรคูณสำหรับชั้นนี้', 'NOT_OPEN');
    }
    var prev = findOne(SHEETS.MULT_RESULTS, function (r) {
      return String(r.studentId).trim().toUpperCase() === studentId;
    });
    if (prev) return fail('คุณทำแบบทดสอบสูตรคูณไปแล้ว', 'ALREADY_DONE');

    var correct = 0;
    answers.forEach(function (a) {
      var x = Number(a.a), y = Number(a.b), ans = Number(a.answer);
      if (x >= 2 && x <= 12 && y >= 2 && y <= 12 && !isNaN(ans) && ans === x * y) correct++;
    });
    if (correct > MULT_TOTAL) correct = MULT_TOTAL;

    var now = new Date();
    var startedAt = params.startedAt || '';
    var durationUsed = 0;
    var sd = toDate(startedAt);
    if (sd) durationUsed = Math.round((now.getTime() - sd.getTime()) / 1000);

    appendRow(SHEETS.MULT_RESULTS, {
      studentId: student.studentId, score: correct, total: MULT_TOTAL,
      durationUsed: durationUsed, submittedAt: now.toISOString(), academicYear: getSetting('academicYear')
    });
    return ok({ score: correct, total: MULT_TOTAL });
  });
}

function getMultSettingsAction(params) {
  requireTeacher(params);
  return ok({ levels: getMultLevels() });
}
function saveMultSettingsAction(params) {
  requireTeacher(params);
  var levels = params.levels || [];
  setSetting('multLevels', Array.isArray(levels) ? levels.join(',') : String(levels));
  return ok({ levels: getMultLevels() });
}

function getMultResults(params) {
  requireTeacher(params);
  var levels = getMultLevels();
  var students = readAll(SHEETS.STUDENTS).filter(function (s) {
    return levels.indexOf(String(s.level).trim()) !== -1;
  });
  if (params.level) students = students.filter(function (s) { return String(s.level).trim() === String(params.level).trim(); });
  if (params.room) students = students.filter(function (s) { return String(s.room).trim() === String(params.room).trim(); });

  var res = readAll(SHEETS.MULT_RESULTS);
  var map = {};
  res.forEach(function (r) { map[String(r.studentId).trim().toUpperCase()] = r; });

  var table = students.map(function (s) {
    var r = map[String(s.studentId).trim().toUpperCase()];
    return {
      studentId: s.studentId, number: s.number, title: s.title, fullName: s.fullName,
      level: s.level, room: s.room,
      done: !!r,
      score: r ? Number(r.score) : null,
      total: r ? Number(r.total) : MULT_TOTAL,
      percent: (r && Number(r.total)) ? Math.round((Number(r.score) / Number(r.total)) * 100) : null,
      submittedAt: r ? r.submittedAt : '',
      durationUsed: r ? Number(r.durationUsed) : 0
    };
  });
  return ok({ levels: levels, table: table });
}

function resetMultAttempt(params) {
  requireTeacher(params);
  return withLock(function () {
    var studentId = String(params.studentId || '').trim().toUpperCase();
    var rows = findRows(SHEETS.MULT_RESULTS, function (r) {
      return String(r.studentId).trim().toUpperCase() === studentId;
    });
    deleteRowsByNumbers(SHEETS.MULT_RESULTS, rows.map(function (r) { return r.__row; }));
    return ok({ removed: rows.length });
  });
}
