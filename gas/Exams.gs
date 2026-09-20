/**
 * Exams.gs
 * จัดการชุดข้อสอบ (เมทาดาทา), การเปิด/ปิดสอบ, การส่งข้อสอบให้นักเรียน (ไม่มีเฉลย)
 */

// ============ ฝั่งครู: รายการ/บันทึก/ลบ ข้อสอบ ============

function listExams(params) {
  requireTeacher(params);
  var exams = readAll(SHEETS.EXAMS);
  var subjects = {};
  readAll(SHEETS.SUBJECTS).forEach(function (s) { subjects[s.subjectId] = s.name; });
  var out = exams.map(function (e) {
    return examMeta(e, subjects[e.subjectId]);
  });
  return ok(out);
}

function examMeta(e, subjectName) {
  return {
    examId: e.examId,
    title: e.title,
    subjectId: e.subjectId,
    subjectName: subjectName || '',
    level: e.level,
    description: e.description,
    numQuestions: Number(e.numQuestions) || 0,
    totalScore: Number(e.totalScore) || 0,
    scorePerQuestion: Number(e.scorePerQuestion) || 0,
    duration: Number(e.duration) || 0,
    openAt: e.openAt ? toDate(e.openAt).toISOString() : '',
    closeAt: e.closeAt ? toDate(e.closeAt).toISOString() : '',
    allowedRooms: e.allowedRooms ? String(e.allowedRooms) : '',
    status: e.status || 'ปิด',
    shuffleQuestions: toBool(e.shuffleQuestions),
    shuffleChoices: toBool(e.shuffleChoices),
    showScore: toBool(e.showScore),
    allowRetake: toBool(e.allowRetake),
    showAnswers: toBool(e.showAnswers),
    academicYear: e.academicYear || '',
    createdAt: e.createdAt || ''
  };
}

/**
 * บันทึกข้อสอบ (สร้างใหม่หรือแก้ไข) พร้อมคำถาม/ตัวเลือกทั้งชุด
 * params.exam = {examId?, title, subjectId, level, ...}
 * params.questions = [{questionId?, order, questionText, imageId, score,
 *                      choices:[{label, choiceText, imageId, isCorrect, order}]}]
 */
function saveExam(params) {
  requireTeacher(params);
  return withLock(function () {
    var exam = params.exam || {};
    var questions = params.questions || [];

    var isNew = !exam.examId;
    var examId = exam.examId || newId('EXAM');

    // คำนวณคะแนน
    var scorePerQuestion = Number(exam.scorePerQuestion) || 1;
    var totalScore = 0;
    questions.forEach(function (q) {
      totalScore += Number(q.score) || scorePerQuestion;
    });

    var examObj = {
      examId: examId,
      title: exam.title || '',
      subjectId: exam.subjectId || '',
      level: exam.level || '',
      description: exam.description || '',
      numQuestions: questions.length,
      totalScore: totalScore,
      scorePerQuestion: scorePerQuestion,
      duration: Number(exam.duration) || 0,
      openAt: exam.openAt || '',
      closeAt: exam.closeAt || '',
      allowedRooms: exam.allowedRooms || '',
      status: exam.status || 'ปิด',
      shuffleQuestions: !!exam.shuffleQuestions,
      shuffleChoices: !!exam.shuffleChoices,
      showScore: exam.showScore !== false,
      allowRetake: !!exam.allowRetake,
      showAnswers: !!exam.showAnswers,
      academicYear: exam.academicYear || getSetting('academicYear'),
      createdAt: '',
      updatedAt: nowISO()
    };

    if (isNew) {
      examObj.createdAt = nowISO();
      appendRow(SHEETS.EXAMS, examObj);
    } else {
      var target = findOne(SHEETS.EXAMS, function (r) {
        return String(r.examId) === String(examId);
      });
      if (!target) return fail('ไม่พบชุดข้อสอบ', 'NOT_FOUND');
      examObj.createdAt = target.createdAt || nowISO();
      updateRowByNumber(SHEETS.EXAMS, target.__row, examObj);
    }

    // เขียนคำถาม/ตัวเลือกใหม่ทั้งหมด (ลบของเก่าก่อน)
    saveQuestionsForExam(examId, questions, scorePerQuestion);

    return ok({ examId: examId, numQuestions: questions.length, totalScore: totalScore });
  });
}

function deleteExam(params) {
  requireTeacher(params);
  return withLock(function () {
    var examId = String(params.examId);
    var target = findOne(SHEETS.EXAMS, function (r) {
      return String(r.examId) === examId;
    });
    if (!target) return fail('ไม่พบชุดข้อสอบ', 'NOT_FOUND');
    deleteRowByNumber(SHEETS.EXAMS, target.__row);
    // ลบคำถาม/ตัวเลือก
    deleteRowsByExam(SHEETS.QUESTIONS, examId);
    deleteRowsByExam(SHEETS.CHOICES, examId);
    return ok(true);
  });
}

function deleteRowsByExam(sheetName, examId) {
  var rows = findRows(sheetName, function (r) { return String(r.examId) === String(examId); });
  deleteRowsByNumbers(sheetName, rows.map(function (r) { return r.__row; }));
}

/** เปลี่ยนสถานะเปิด/ปิดสอบ */
function setExamStatus(params) {
  requireTeacher(params);
  return withLock(function () {
    var target = findOne(SHEETS.EXAMS, function (r) {
      return String(r.examId) === String(params.examId);
    });
    if (!target) return fail('ไม่พบชุดข้อสอบ', 'NOT_FOUND');
    var rowNumber = target.__row;
    target.status = params.status || 'ปิด';
    if (params.openAt !== undefined) target.openAt = params.openAt;
    if (params.closeAt !== undefined) target.closeAt = params.closeAt;
    target.updatedAt = nowISO();
    updateRowByNumber(SHEETS.EXAMS, rowNumber, target);
    return ok({ examId: params.examId, status: target.status });
  });
}

/** ครูขอดูข้อสอบเต็ม (มีเฉลย) เพื่อแก้ไข */
function getExamFull(params) {
  requireTeacher(params);
  var examId = String(params.examId);
  var exam = findOne(SHEETS.EXAMS, function (r) { return String(r.examId) === examId; });
  if (!exam) return fail('ไม่พบชุดข้อสอบ', 'NOT_FOUND');

  var questions = buildQuestionTree(examId, /*includeCorrect*/ true, /*shuffleQ*/ false, /*shuffleC*/ false);
  return ok({ exam: examMeta(exam), questions: questions });
}

// ============ ฝั่งนักเรียน ============

/**
 * รายการข้อสอบที่นักเรียนคนนี้ทำได้
 * เงื่อนไข: status = เปิดสอบ, อยู่ในช่วงเวลา, ตรงระดับชั้น, ห้องได้รับอนุญาต
 */
function listAvailableExamsForStudent(student) {
  var now = new Date();
  var exams = readAll(SHEETS.EXAMS);
  var subjects = {};
  readAll(SHEETS.SUBJECTS).forEach(function (s) { subjects[s.subjectId] = s.name; });

  // ดึงผลสอบของนักเรียนคนนี้เพื่อบอกว่าทำไปแล้วหรือยัง
  var myResults = findRows(SHEETS.RESULTS, function (r) {
    return String(r.studentId).trim().toUpperCase() === String(student.studentId).trim().toUpperCase() &&
           String(r.status) === 'submitted';
  });
  var doneMap = {};
  myResults.forEach(function (r) { doneMap[String(r.examId)] = r; });

  var out = [];
  exams.forEach(function (e) {
    if (!isExamOpenNow(e, now)) return;
    if (!examMatchesStudent(e, student)) return;

    var done = doneMap[String(e.examId)];
    var allowRetake = toBool(e.allowRetake);
    var m = examMeta(e, subjects[e.subjectId]);
    m.done = !!done;
    m.canTake = !done || allowRetake;
    if (done) {
      m.myScore = Number(done.score) || 0;
      m.myPercent = Number(done.percent) || 0;
    }
    out.push(m);
  });
  return out;
}

function isExamOpenNow(e, now) {
  var status = String(e.status || '').trim();
  if (status === 'ปิด' || status === 'closed') return false;

  var open = toDate(e.openAt);
  var close = toDate(e.closeAt);

  if (status === 'เปิด' || status === 'open' || status === 'เปิดสอบ') {
    if (open && now < open) return false;
    if (close && now > close) return false;
    return true;
  }
  // สถานะ "กำหนดเวลา" — ยึดตามช่วงเวลา
  if (status === 'กำหนดเวลา' || status === 'scheduled') {
    if (open && now < open) return false;
    if (close && now > close) return false;
    return true;
  }
  return false;
}

/**
 * อนุญาตให้ "ส่ง" คำตอบได้หรือไม่ (ตอน submit)
 * ผ่อนกว่า isExamOpenNow: มี grace หลังเวลาปิด เพื่อไม่ตัดคำตอบของนักเรียน
 * ที่เริ่มทำทันเวลาแต่ส่ง/ส่งอัตโนมัติช้าไปเล็กน้อย
 */
function isSubmitAllowed(e, now) {
  var GRACE_MS = 10 * 60000; // 10 นาที
  var open = toDate(e.openAt);
  var close = toDate(e.closeAt);
  if (open && now.getTime() < open.getTime()) return false;           // ยังไม่ถึงเวลาเปิด
  if (close && now.getTime() > close.getTime() + GRACE_MS) return false; // เลยเวลาปิดมานานเกิน grace
  return true;
}

function examMatchesStudent(e, student) {
  // ระดับชั้นต้องตรง (ถ้าระบุ)
  if (e.level && String(e.level).trim() && String(e.level).trim() !== String(student.level).trim()) {
    return false;
  }
  // ห้องที่อนุญาต (ว่าง = ทุกห้องในระดับชั้น)
  var rooms = String(e.allowedRooms || '').trim();
  if (rooms) {
    var list = rooms.split(',').map(function (s) { return s.trim(); }).filter(String);
    if (list.length && list.indexOf(String(student.room).trim()) === -1) {
      return false;
    }
  }
  return true;
}

/**
 * นักเรียนขอข้อสอบเพื่อเริ่มทำ — ส่งเฉพาะข้อมูลจำเป็น (ไม่มีเฉลย)
 * ตรวจสิทธิ์ + เวลา + สอบซ้ำ ก่อนส่ง
 */
function getExam(params) {
  var examId = String(params.examId || '');
  var studentId = String(params.studentId || '').trim().toUpperCase();

  var student = findOne(SHEETS.STUDENTS, function (r) {
    return String(r.studentId).trim().toUpperCase() === studentId;
  });
  if (!student) return fail('ไม่พบนักเรียน', 'NO_STUDENT');

  var exam = findOne(SHEETS.EXAMS, function (r) { return String(r.examId) === examId; });
  if (!exam) return fail('ไม่พบชุดข้อสอบ', 'NOT_FOUND');

  var now = new Date();
  if (!isExamOpenNow(exam, now)) return fail('ข้อสอบนี้ยังไม่เปิดหรือปิดแล้ว', 'CLOSED');
  if (!examMatchesStudent(exam, student)) return fail('คุณไม่มีสิทธิ์ทำข้อสอบนี้', 'NO_PERMISSION');

  // ตรวจสอบว่าทำไปแล้วหรือยัง
  var done = findOne(SHEETS.RESULTS, function (r) {
    return String(r.examId) === examId &&
           String(r.studentId).trim().toUpperCase() === studentId &&
           String(r.status) === 'submitted';
  });
  if (done && !toBool(exam.allowRetake)) {
    return fail('คุณทำข้อสอบชุดนี้ไปแล้ว', 'ALREADY_DONE');
  }

  var meta = examMeta(exam);
  var questions = buildQuestionTree(examId, /*includeCorrect*/ false,
    toBool(exam.shuffleQuestions), toBool(exam.shuffleChoices));

  // ส่งเวลาเซิร์ฟเวอร์เพื่อให้ client ซิงก์นาฬิกา
  return ok({
    exam: {
      examId: meta.examId, title: meta.title, subjectName: meta.subjectName,
      level: meta.level, description: meta.description,
      numQuestions: questions.length, totalScore: meta.totalScore,
      duration: meta.duration
    },
    questions: questions,
    serverTime: now.toISOString(),
    student: {
      studentId: student.studentId, title: student.title,
      fullName: student.fullName, level: student.level,
      room: student.room, number: student.number
    }
  });
}
