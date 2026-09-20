/**
 * Questions.gs
 * บันทึก/อ่าน คำถามและตัวเลือก + อัปโหลดรูปไป Google Drive
 */

/**
 * บันทึกคำถามทั้งชุดของข้อสอบ (ลบของเก่าแล้วเขียนใหม่)
 * questions = [{questionId?, order, questionText, imageId, score,
 *               choices:[{label, choiceText, imageId, isCorrect, order}]}]
 */
function saveQuestionsForExam(examId, questions, scorePerQuestion) {
  deleteRowsByExam(SHEETS.QUESTIONS, examId);
  deleteRowsByExam(SHEETS.CHOICES, examId);

  var qRows = [];
  var cRows = [];

  questions.forEach(function (q, qi) {
    var questionId = q.questionId || newId('Q');
    qRows.push({
      questionId: questionId,
      examId: examId,
      order: (q.order !== undefined && q.order !== null) ? q.order : (qi + 1),
      questionText: q.questionText || '',
      imageId: q.imageId || '',
      score: (q.score !== undefined && q.score !== '' && q.score !== null) ? Number(q.score) : scorePerQuestion
    });

    (q.choices || []).forEach(function (c, ci) {
      cRows.push({
        choiceId: c.choiceId || newId('C'),
        questionId: questionId,
        examId: examId,
        label: c.label || '',
        choiceText: c.choiceText || '',
        imageId: c.imageId || '',
        isCorrect: !!c.isCorrect,
        order: (c.order !== undefined && c.order !== null) ? c.order : (ci + 1)
      });
    });
  });

  appendRows(SHEETS.QUESTIONS, qRows);
  appendRows(SHEETS.CHOICES, cRows);
}

/**
 * สร้างโครงคำถาม+ตัวเลือกของข้อสอบ
 * includeCorrect=false จะไม่ส่ง isCorrect ออกไป (สำหรับนักเรียน)
 */
function buildQuestionTree(examId, includeCorrect, shuffleQ, shuffleC) {
  var questions = findRows(SHEETS.QUESTIONS, function (r) {
    return String(r.examId) === String(examId);
  });
  var choices = findRows(SHEETS.CHOICES, function (r) {
    return String(r.examId) === String(examId);
  });

  var byQuestion = {};
  choices.forEach(function (c) {
    var qid = String(c.questionId);
    if (!byQuestion[qid]) byQuestion[qid] = [];
    byQuestion[qid].push(c);
  });

  questions.sort(function (a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); });

  var tree = questions.map(function (q) {
    var cs = (byQuestion[String(q.questionId)] || []).slice();
    cs.sort(function (a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); });
    if (shuffleC) cs = shuffle(cs);

    var choiceOut = cs.map(function (c) {
      var obj = {
        choiceId: c.choiceId,
        label: c.label,
        choiceText: c.choiceText,
        imageId: c.imageId ? String(c.imageId) : '',
        imageUrl: c.imageId ? imageUrl(c.imageId) : ''
      };
      if (includeCorrect) obj.isCorrect = toBool(c.isCorrect);
      return obj;
    });

    return {
      questionId: q.questionId,
      order: Number(q.order) || 0,
      questionText: q.questionText,
      imageId: q.imageId ? String(q.imageId) : '',
      imageUrl: q.imageId ? imageUrl(q.imageId) : '',
      score: Number(q.score) || 0,
      choices: choiceOut
    };
  });

  if (shuffleQ) tree = shuffle(tree);
  return tree;
}

/**
 * URL สำหรับแสดงรูปจาก Drive (ใช้ thumbnail endpoint โหลดเร็ว)
 */
function imageUrl(fileId) {
  if (!fileId) return '';
  return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1000';
}

/**
 * อัปโหลดรูปไป Drive
 * params.dataUrl = "data:image/png;base64,...."
 * params.filename (optional)
 * คืน fileId + url
 */
function uploadImage(params) {
  requireTeacher(params);
  var dataUrl = params.dataUrl || '';
  var m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return fail('รูปแบบรูปภาพไม่ถูกต้อง', 'BAD_IMAGE');

  var contentType = m[1];
  var allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowed.indexOf(contentType) === -1) {
    return fail('รองรับเฉพาะไฟล์ JPG, PNG, WEBP', 'BAD_TYPE');
  }

  var bytes = Utilities.base64Decode(m[2]);
  var ext = contentType.split('/')[1];
  var name = (params.filename || ('img_' + Date.now())) + '.' + ext;
  var blob = Utilities.newBlob(bytes, contentType, name);

  var folder = getImageFolder();
  var file = folder.createFile(blob);
  // ให้ทุกคนที่มีลิงก์ดูได้ (จำเป็นสำหรับแสดงในหน้าเว็บ)
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    // บางองค์กรจำกัดการแชร์ — ยังเก็บไฟล์ได้ แต่แจ้งเตือน
  }

  var fileId = file.getId();
  return ok({ imageId: fileId, imageUrl: imageUrl(fileId) });
}
