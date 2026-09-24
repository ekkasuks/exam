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
  var results = findRows(SHEETS.RESULTS, function (r) {
    return String(r.examId) === examId && String(r.status) === 'submitted';
  });
  var answers = findRows(SHEETS.ANSWERS, function (r) { return String(r.examId) === examId; });

  return ok(computeAnalysis(examMeta(exam), questions, choices, results, answers, 'order'));
}

/**
 * วิเคราะห์ข้อสอบเชิงจิตมิติ (item analysis)
 * รายข้อ: ค่าความยาก P, อำนาจจำแนก D (กลุ่มสูง-ต่ำ 27%), ประสิทธิภาพตัวลวง DE
 * ภาพรวม: ความเชื่อมั่น KR-20, ความเที่ยงตรงสูงสุด (√KR20), ค่าเฉลี่ย P/D, สรุปคุณภาพ
 */
function computeAnalysis(examMetaObj, questions, choices, results, answers, ordKey) {
  ordKey = ordKey || 'order';
  function ordOf(r) { return Number(r[ordKey] != null ? r[ordKey] : r.order) || 0; }

  // ครั้งล่าสุดต่อคน
  var byStudent = {};
  results.forEach(function (r) {
    var sid = String(r.studentId).trim().toUpperCase();
    if (!byStudent[sid] || String(r.submittedAt) > String(byStudent[sid].submittedAt)) byStudent[sid] = r;
  });
  var attemptIds = {};
  Object.keys(byStudent).forEach(function (sid) { attemptIds[String(byStudent[sid].attemptId)] = true; });

  var qs = questions.slice().sort(function (a, b) { return ordOf(a) - ordOf(b); });
  var qids = qs.map(function (q) { return String(q.questionId); });
  var k = qids.length;

  var choiceByQ = {};
  choices.forEach(function (c) {
    var qid = String(c.questionId);
    if (!choiceByQ[qid]) choiceByQ[qid] = [];
    choiceByQ[qid].push(c);
  });

  var perAttempt = {};
  var selCount = {};
  answers.forEach(function (a) {
    var at = String(a.attemptId);
    if (!attemptIds[at]) return;
    var qid = String(a.questionId);
    if (!perAttempt[at]) perAttempt[at] = {};
    perAttempt[at][qid] = toBool(a.isCorrect) ? 1 : 0;
    if (!selCount[qid]) selCount[qid] = {};
    var lb = String(a.selectedLabel || '(ไม่ตอบ)');
    selCount[qid][lb] = (selCount[qid][lb] || 0) + 1;
  });

  var attempts = Object.keys(perAttempt);
  var N = attempts.length;

  var totals = attempts.map(function (at) {
    var s = 0; qids.forEach(function (qid) { s += (perAttempt[at][qid] || 0); });
    return { attemptId: at, total: s };
  });

  var correctCount = {}; qids.forEach(function (qid) { correctCount[qid] = 0; });
  attempts.forEach(function (at) { qids.forEach(function (qid) { correctCount[qid] += (perAttempt[at][qid] || 0); }); });

  var sorted = totals.slice().sort(function (a, b) { return b.total - a.total; });
  var g = Math.max(1, Math.round(N * 0.27));
  if (g * 2 > N) g = Math.floor(N / 2);
  var upper = sorted.slice(0, g).map(function (x) { return x.attemptId; });
  var lower = sorted.slice(N - g).map(function (x) { return x.attemptId; });
  var canDiscriminate = N >= 4 && g >= 1 && g * 2 <= N;

  var threshold = 0.05 * N;

  var itemsOut = qs.map(function (q) {
    var qid = String(q.questionId);
    var cs = (choiceByQ[qid] || []).slice().sort(function (a, b) { return ordOf(a) - ordOf(b); });
    var cCount = correctCount[qid] || 0;
    var p = N > 0 ? cCount / N : 0;

    var D = null;
    if (canDiscriminate) {
      var Hc = 0, Lc = 0;
      upper.forEach(function (at) { Hc += (perAttempt[at][qid] || 0); });
      lower.forEach(function (at) { Lc += (perAttempt[at][qid] || 0); });
      D = (Hc / g) - (Lc / g);
    }

    var totalDistractors = 0, functioning = 0;
    var choicesOut = cs.map(function (c) {
      var cnt = (selCount[qid] && selCount[qid][String(c.label)]) || 0;
      var isCorrect = toBool(c.isCorrect);
      var nf = false;
      if (!isCorrect) {
        totalDistractors++;
        if (cnt >= threshold && cnt > 0) functioning++; else nf = true;
      }
      return { label: c.label, choiceText: c.choiceText, isCorrect: isCorrect, count: cnt, nonFunctioning: nf };
    });
    var DE = totalDistractors > 0 ? Math.round((functioning / totalDistractors) * 10000) / 100 : null;

    return {
      questionId: q.questionId, order: ordOf(q), questionText: q.questionText,
      correct: cCount, wrong: N - cCount,
      p: Math.round(p * 100) / 100,
      discrimination: D === null ? null : Math.round(D * 100) / 100,
      distractorEfficiency: DE,
      choices: choicesOut
    };
  });

  var kr20 = null, meanScore = 0, sdScore = 0;
  if (N > 0) {
    var sum = totals.reduce(function (a, x) { return a + x.total; }, 0);
    meanScore = sum / N;
    var variance = totals.reduce(function (a, x) { return a + Math.pow(x.total - meanScore, 2); }, 0) / N;
    sdScore = Math.sqrt(variance);
    if (k > 1 && variance > 0 && N >= 2) {
      var sumPQ = 0;
      qids.forEach(function (qid) { var pp = correctCount[qid] / N; sumPQ += pp * (1 - pp); });
      kr20 = (k / (k - 1)) * (1 - sumPQ / variance);
      if (kr20 < 0) kr20 = 0; if (kr20 > 1) kr20 = 1;
    }
  }
  var meanP = (k > 0 && N > 0) ? qids.reduce(function (a, qid) { return a + (correctCount[qid] / N); }, 0) / k : 0;
  var dVals = itemsOut.filter(function (it) { return it.discrimination !== null; }).map(function (it) { return it.discrimination; });
  var meanD = dVals.length ? dVals.reduce(function (a, x) { return a + x; }, 0) / dVals.length : null;

  var good = 0, fair = 0, poor = 0;
  itemsOut.forEach(function (it) {
    if (it.discrimination === null) return;
    if (it.discrimination >= 0.3) good++; else if (it.discrimination >= 0.2) fair++; else poor++;
  });

  var overall = {
    numStudents: N, numItems: k,
    meanDifficulty: Math.round(meanP * 100) / 100,
    meanDiscrimination: meanD === null ? null : Math.round(meanD * 100) / 100,
    kr20: kr20 === null ? null : Math.round(kr20 * 1000) / 1000,
    validityMax: kr20 === null ? null : Math.round(Math.sqrt(kr20) * 1000) / 1000,
    meanScore: Math.round(meanScore * 100) / 100,
    sdScore: Math.round(sdScore * 100) / 100,
    quality: { good: good, fair: fair, poor: poor },
    groupSize: g,
    enoughData: canDiscriminate
  };

  return { exam: examMetaObj, overall: overall, questions: itemsOut };
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
