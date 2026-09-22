/**
 * Results.gs
 * ส่งข้อสอบ (ตรวจฝั่ง server), ผลสอบ, วิเคราะห์รายข้อ, สถิติ dashboard
 */

/**
 * นักเรียนส่งข้อสอบ — ตรวจและให้คะแนนที่ server เท่านั้น
 * params.examId, params.studentId, params.startedAt(ISO), params.answers = [{questionId, selectedLabel}]
 */
function submitExam(params) {
  var examId = String(params.examId || '');
  var studentId = String(params.studentId || '').trim().toUpperCase();
  var answers = params.answers || [];
  var now = new Date();

  // ======================================================================
  // ส่วนที่ 1: อ่าน + ตรวจสอบ + ให้คะแนน — ทำ "นอกล็อก" เพื่อไม่ให้คิวค้าง
  // (นี่คือส่วนที่หนักที่สุด: อ่านหลายชีต จึงต้องไม่ถือล็อกไว้ตอนทำ)
  // ======================================================================
  var student = findOne(SHEETS.STUDENTS, function (r) {
    return String(r.studentId).trim().toUpperCase() === studentId;
  });
  if (!student) return fail('ไม่พบนักเรียน', 'NO_STUDENT');

  var exam = findOne(SHEETS.EXAMS, function (r) { return String(r.examId) === examId; });
  if (!exam) return fail('ไม่พบชุดข้อสอบ', 'NOT_FOUND');
  if (!examMatchesStudent(exam, student)) return fail('ไม่มีสิทธิ์ทำข้อสอบนี้', 'NO_PERMISSION');

  // ตรวจช่วงเวลา (กันส่งก่อนเปิด / หลังปิดนานเกินไป) — มี grace กันตัดคำตอบที่ทำค้างอยู่
  if (!isSubmitAllowed(exam, now)) {
    return fail('ข้อสอบนี้ปิดรับคำตอบแล้ว', 'CLOSED');
  }

  // กันส่งซ้ำ (best-effort นอกล็อก) — จับกรณีปกติที่เคยส่งไปแล้วก่อนหน้า
  var prev = findOne(SHEETS.RESULTS, function (r) {
    return String(r.examId) === examId &&
           String(r.studentId).trim().toUpperCase() === studentId &&
           String(r.status) === 'submitted';
  });
  if (prev && !toBool(exam.allowRetake)) {
    return fail('คุณส่งข้อสอบชุดนี้ไปแล้ว', 'ALREADY_DONE');
  }

  // โหลดโมเดลตรวจคะแนน (แคชไว้ — ไม่ต้องอ่านชีต Questions/Choices ทั้งแผ่นทุกครั้ง)
  var model = getExamScoreModel(examId);
  var scorePerQ = model.scorePerQ;
  var correctByChoiceId = model.correctByChoiceId;   // choiceId -> true
  var labelByChoiceId = model.labelByChoiceId;       // choiceId -> label เดิม
  var correctChoiceByQ = model.correctChoiceByQ;     // questionId -> choiceId ที่ถูก

  // คำตอบที่ส่งมา: questionId -> choiceId ที่เลือก
  var submitted = {};
  answers.forEach(function (a) {
    submitted[String(a.questionId)] = String(a.choiceId || '');
  });

  var attemptId = newId('AT');
  var totalScore = Number(exam.totalScore) || 0;
  var gotScore = 0;
  var answerRows = [];
  var reviewOut = [];

  model.questionIds.forEach(function (qid) {
    var selCid = submitted[qid] || '';
    var isCorrect = selCid !== '' && correctByChoiceId[selCid] === true;
    var qScore = isCorrect ? (scorePerQ[qid] || 0) : 0;
    gotScore += qScore;
    answerRows.push({
      answerId: newId('A'),
      attemptId: attemptId,
      examId: examId,
      studentId: student.studentId,
      questionId: qid,
      selectedLabel: labelByChoiceId[selCid] || '', // เก็บ label เดิมไว้ให้วิเคราะห์ได้
      isCorrect: isCorrect,
      score: qScore
    });
    reviewOut.push({
      questionId: qid,
      selectedChoiceId: selCid,
      correctChoiceId: correctChoiceByQ[qid] || '',
      isCorrect: isCorrect
    });
  });

  // กันคะแนนเกินเต็ม
  if (gotScore > totalScore && totalScore > 0) gotScore = totalScore;
  var percent = totalScore > 0 ? Math.round((gotScore / totalScore) * 10000) / 100 : 0;

  var startedAt = params.startedAt || '';
  var durationUsed = 0;
  var startDate = toDate(startedAt);
  if (startDate) durationUsed = Math.round((now.getTime() - startDate.getTime()) / 1000);

  var resultObj = {
    attemptId: attemptId,
    examId: examId,
    studentId: student.studentId,
    score: gotScore,
    totalScore: totalScore,
    percent: percent,
    startedAt: startedAt,
    submittedAt: now.toISOString(),
    durationUsed: durationUsed,
    status: 'submitted',
    academicYear: exam.academicYear || getSetting('academicYear')
  };

  // ======================================================================
  // ส่วนที่ 2: เขียนข้อมูล — ทำ "ในล็อก" เฉพาะการ append เท่านั้น (สั้นที่สุด)
  // ตั้ง timeout ยาวขึ้น (45 วิ) รองรับกรณีหลายสิบคนส่งพร้อมกันตอนหมดเวลา
  // ======================================================================
  withLock(function () {
    appendRow(SHEETS.RESULTS, resultObj);
    appendRows(SHEETS.ANSWERS, answerRows);
  }, 45000);

  // ผลตอบกลับ — เคารพ showScore / showAnswers
  var resp = {
    attemptId: attemptId,
    submitted: true,
    showScore: toBool(exam.showScore),
    showAnswers: toBool(exam.showAnswers)
  };
  if (toBool(exam.showScore)) {
    resp.score = gotScore;
    resp.totalScore = totalScore;
    resp.percent = percent;
  }
  if (toBool(exam.showAnswers)) {
    resp.review = reviewOut;
  }
  return ok(resp);
}

// ============ Dashboard: สถิติภาพรวม ============

function getDashboardStats(params) {
  requireTeacher(params);
  var students = readAll(SHEETS.STUDENTS);
  var classes = readAll(SHEETS.CLASSES);
  var subjects = readAll(SHEETS.SUBJECTS);
  var exams = readAll(SHEETS.EXAMS);
  var results = readAll(SHEETS.RESULTS);

  var now = new Date();
  var openCount = exams.filter(function (e) { return isExamOpenNow(e, now); }).length;

  return ok({
    students: students.length,
    classes: classes.length,
    subjects: subjects.length,
    exams: exams.length,
    openExams: openCount,
    attempts: results.filter(function (r) { return String(r.status) === 'submitted'; }).length
  });
}

// ============ ผลการสอบ (ตาราง + สรุป) ============

function getResults(params) {
  requireTeacher(params);
  var examId = params.examId ? String(params.examId) : '';
  if (!examId) return fail('กรุณาเลือกชุดข้อสอบ', 'NO_EXAM');

  var exam = findOne(SHEETS.EXAMS, function (r) { return String(r.examId) === examId; });
  if (!exam) return fail('ไม่พบชุดข้อสอบ', 'NOT_FOUND');

  var results = findRows(SHEETS.RESULTS, function (r) {
    return String(r.examId) === examId && String(r.status) === 'submitted';
  });

  // เก็บครั้งล่าสุดต่อคน (กรณีสอบซ้ำ)
  var byStudent = {};
  results.forEach(function (r) {
    var sid = String(r.studentId).trim().toUpperCase();
    var cur = byStudent[sid];
    if (!cur || toDate(r.submittedAt) > toDate(cur.submittedAt)) byStudent[sid] = r;
  });

  var students = readAll(SHEETS.STUDENTS);
  var stuMap = {};
  students.forEach(function (s) { stuMap[String(s.studentId).trim().toUpperCase()] = s; });

  // กรองนักเรียนตามระดับชั้น/ห้องที่ข้อสอบครอบคลุม
  var eligible = students.filter(function (s) { return examMatchesStudent(exam, s); });
  if (params.room) {
    eligible = eligible.filter(function (s) { return String(s.room).trim() === String(params.room).trim(); });
  }

  var table = [];
  var scores = [];
  eligible.forEach(function (s) {
    var sid = String(s.studentId).trim().toUpperCase();
    var r = byStudent[sid];
    var row = {
      studentId: s.studentId,
      number: s.number,
      fullName: s.fullName,
      title: s.title,
      level: s.level,
      room: s.room,
      done: !!r
    };
    if (r) {
      row.score = Number(r.score) || 0;
      row.totalScore = Number(r.totalScore) || 0;
      row.percent = Number(r.percent) || 0;
      row.submittedAt = r.submittedAt ? toDate(r.submittedAt).toISOString() : '';
      row.durationUsed = Number(r.durationUsed) || 0;
      scores.push(row.score);
    }
    table.push(row);
  });

  var summary = {
    totalEligible: eligible.length,
    done: scores.length,
    notDone: eligible.length - scores.length,
    avg: 0, max: 0, min: 0, avgPercent: 0,
    totalScore: Number(exam.totalScore) || 0
  };
  if (scores.length) {
    var sum = scores.reduce(function (a, b) { return a + b; }, 0);
    summary.avg = Math.round((sum / scores.length) * 100) / 100;
    summary.max = Math.max.apply(null, scores);
    summary.min = Math.min.apply(null, scores);
    summary.avgPercent = summary.totalScore > 0
      ? Math.round((summary.avg / summary.totalScore) * 10000) / 100 : 0;
  }

  return ok({ exam: examMeta(exam), summary: summary, table: table });
}

// ============ วิเคราะห์ข้อสอบรายข้อ ============

function getAnalysis(params) {
  requireTeacher(params);
  var examId = String(params.examId || '');
  var exam = findOne(SHEETS.EXAMS, function (r) { return String(r.examId) === examId; });
  if (!exam) return fail('ไม่พบชุดข้อสอบ', 'NOT_FOUND');

  var questions = findRows(SHEETS.QUESTIONS, function (r) { return String(r.examId) === examId; });
  var choices = findRows(SHEETS.CHOICES, function (r) { return String(r.examId) === examId; });
  var answers = findRows(SHEETS.ANSWERS, function (r) { return String(r.examId) === examId; });

  questions.sort(function (a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); });

  // ตัวเลือกต่อคำถาม
  var choiceByQ = {};
  choices.forEach(function (c) {
    var qid = String(c.questionId);
    if (!choiceByQ[qid]) choiceByQ[qid] = [];
    choiceByQ[qid].push(c);
  });

  // นับคำตอบต่อคำถาม/ต่อตัวเลือก
  var stat = {}; // qid -> {correct, wrong, byLabel:{}}
  answers.forEach(function (a) {
    var qid = String(a.questionId);
    if (!stat[qid]) stat[qid] = { correct: 0, wrong: 0, byLabel: {} };
    if (toBool(a.isCorrect)) stat[qid].correct++; else stat[qid].wrong++;
    var lb = String(a.selectedLabel || '(ไม่ตอบ)');
    stat[qid].byLabel[lb] = (stat[qid].byLabel[lb] || 0) + 1;
  });

  var out = questions.map(function (q) {
    var qid = String(q.questionId);
    var cs = (choiceByQ[qid] || []).slice();
    cs.sort(function (a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); });
    var s = stat[qid] || { correct: 0, wrong: 0, byLabel: {} };
    return {
      questionId: q.questionId,
      order: Number(q.order) || 0,
      questionText: q.questionText,
      correct: s.correct,
      wrong: s.wrong,
      choices: cs.map(function (c) {
        return {
          label: c.label,
          choiceText: c.choiceText,
          isCorrect: toBool(c.isCorrect),
          count: s.byLabel[String(c.label)] || 0
        };
      })
    };
  });

  return ok({ exam: examMeta(exam), questions: out });
}

// ============ อนุญาตสอบซ้ำรายบุคคล (ลบผลเดิม) ============

function resetAttempt(params) {
  requireTeacher(params);
  return withLock(function () {
    var examId = String(params.examId || '');
    var studentId = String(params.studentId || '').trim().toUpperCase();

    var results = findRows(SHEETS.RESULTS, function (r) {
      return String(r.examId) === examId &&
             String(r.studentId).trim().toUpperCase() === studentId;
    });
    var attemptIds = {};
    results.forEach(function (r) { attemptIds[String(r.attemptId)] = true; });

    deleteRowsByNumbers(SHEETS.RESULTS, results.map(function (r) { return r.__row; }));

    var ans = findRows(SHEETS.ANSWERS, function (r) {
      return attemptIds[String(r.attemptId)];
    });
    deleteRowsByNumbers(SHEETS.ANSWERS, ans.map(function (r) { return r.__row; }));

    return ok({ removed: results.length });
  });
}
