/**
 * Students.gs
 * จัดการนักเรียน ห้องเรียน และรายวิชา (ฝั่งครู)
 */

// ============ นักเรียน ============

function listStudents(params) {
  requireTeacher(params);
  var rows = readAll(SHEETS.STUDENTS);
  var level = params.level ? String(params.level).trim() : '';
  var room = params.room ? String(params.room).trim() : '';
  var q = params.q ? String(params.q).trim().toLowerCase() : '';

  var filtered = rows.filter(function (r) {
    if (level && String(r.level).trim() !== level) return false;
    if (room && String(r.room).trim() !== room) return false;
    if (q) {
      var hay = (String(r.studentId) + ' ' + String(r.fullName)).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });

  return ok(filtered.map(cleanStudent));
}

function cleanStudent(r) {
  return {
    studentId: r.studentId,
    title: r.title,
    fullName: r.fullName,
    level: r.level,
    room: r.room,
    number: r.number,
    status: r.status
  };
}

function addStudent(params) {
  requireTeacher(params);
  return withLock(function () {
    var all = readAll(SHEETS.STUDENTS);
    var studentId = String(params.studentId || '').trim().toUpperCase();
    if (!studentId) {
      studentId = nextStudentCode(all.map(function (r) { return r.studentId; }));
    } else {
      var dup = all.some(function (r) {
        return String(r.studentId).trim().toUpperCase() === studentId;
      });
      if (dup) return fail('มีรหัสนักเรียน ' + studentId + ' อยู่แล้ว', 'DUP');
    }
    var obj = {
      studentId: studentId,
      title: params.title || '',
      fullName: params.fullName || '',
      level: params.level || '',
      room: params.room || '',
      number: params.number || '',
      status: params.status || 'ใช้งาน'
    };
    appendRow(SHEETS.STUDENTS, obj);
    return ok(cleanStudent(obj));
  });
}

function updateStudent(params) {
  requireTeacher(params);
  return withLock(function () {
    var target = findOne(SHEETS.STUDENTS, function (r) {
      return String(r.studentId).trim().toUpperCase() === String(params.studentId).trim().toUpperCase();
    });
    if (!target) return fail('ไม่พบนักเรียน', 'NOT_FOUND');
    var obj = {
      studentId: target.studentId,
      title: params.title !== undefined ? params.title : target.title,
      fullName: params.fullName !== undefined ? params.fullName : target.fullName,
      level: params.level !== undefined ? params.level : target.level,
      room: params.room !== undefined ? params.room : target.room,
      number: params.number !== undefined ? params.number : target.number,
      status: params.status !== undefined ? params.status : target.status
    };
    updateRowByNumber(SHEETS.STUDENTS, target.__row, obj);
    return ok(cleanStudent(obj));
  });
}

function deleteStudent(params) {
  requireTeacher(params);
  return withLock(function () {
    var target = findOne(SHEETS.STUDENTS, function (r) {
      return String(r.studentId).trim().toUpperCase() === String(params.studentId).trim().toUpperCase();
    });
    if (!target) return fail('ไม่พบนักเรียน', 'NOT_FOUND');
    deleteRowByNumber(SHEETS.STUDENTS, target.__row);
    return ok(true);
  });
}

/**
 * นำเข้านักเรียนจำนวนมากจาก CSV (ฝั่ง client แปลงเป็น array ให้แล้ว)
 * params.rows = [{studentId?, title, fullName, level, room, number}, ...]
 * ถ้าไม่มี studentId จะสร้างให้อัตโนมัติ
 */
function importStudents(params) {
  requireTeacher(params);
  var rows = params.rows || [];
  if (!rows.length) return fail('ไม่มีข้อมูลนำเข้า', 'EMPTY');

  return withLock(function () {
    var all = readAll(SHEETS.STUDENTS);
    var existing = {};
    var codes = [];
    all.forEach(function (r) {
      var id = String(r.studentId).trim().toUpperCase();
      existing[id] = true;
      codes.push(r.studentId);
    });

    var toAdd = [];
    var skipped = 0;
    rows.forEach(function (row) {
      var id = String(row.studentId || '').trim().toUpperCase();
      if (id && existing[id]) { skipped++; return; }
      if (!id) {
        id = nextStudentCode(codes);
      }
      codes.push(id);
      existing[id] = true;
      toAdd.push({
        studentId: id,
        title: row.title || '',
        fullName: row.fullName || '',
        level: row.level || '',
        room: row.room || '',
        number: row.number || '',
        status: row.status || 'ใช้งาน'
      });
    });

    appendRows(SHEETS.STUDENTS, toAdd);
    return ok({ added: toAdd.length, skipped: skipped });
  });
}

// ============ ห้องเรียน ============

function listClasses(params) {
  requireTeacher(params);
  var classes = readAll(SHEETS.CLASSES);
  var students = readAll(SHEETS.STUDENTS);
  var count = {};
  students.forEach(function (s) {
    var key = String(s.level).trim() + '|' + String(s.room).trim();
    count[key] = (count[key] || 0) + 1;
  });
  var out = classes.map(function (c) {
    var key = String(c.level).trim() + '|' + String(c.room).trim();
    return {
      classId: c.classId,
      level: c.level,
      room: c.room,
      note: c.note,
      studentCount: count[key] || 0
    };
  });
  return ok(out);
}

function addClass(params) {
  requireTeacher(params);
  return withLock(function () {
    var dup = findOne(SHEETS.CLASSES, function (r) {
      return String(r.level).trim() === String(params.level).trim() &&
             String(r.room).trim() === String(params.room).trim();
    });
    if (dup) return fail('มีห้องนี้อยู่แล้ว', 'DUP');
    var obj = {
      classId: newId('CLS'),
      level: params.level || '',
      room: params.room || '',
      note: params.note || ''
    };
    appendRow(SHEETS.CLASSES, obj);
    return ok(obj);
  });
}

function updateClass(params) {
  requireTeacher(params);
  return withLock(function () {
    var target = findOne(SHEETS.CLASSES, function (r) {
      return String(r.classId) === String(params.classId);
    });
    if (!target) return fail('ไม่พบห้องเรียน', 'NOT_FOUND');
    var obj = {
      classId: target.classId,
      level: params.level !== undefined ? params.level : target.level,
      room: params.room !== undefined ? params.room : target.room,
      note: params.note !== undefined ? params.note : target.note
    };
    updateRowByNumber(SHEETS.CLASSES, target.__row, obj);
    return ok(obj);
  });
}

function deleteClass(params) {
  requireTeacher(params);
  return withLock(function () {
    var target = findOne(SHEETS.CLASSES, function (r) {
      return String(r.classId) === String(params.classId);
    });
    if (!target) return fail('ไม่พบห้องเรียน', 'NOT_FOUND');
    deleteRowByNumber(SHEETS.CLASSES, target.__row);
    return ok(true);
  });
}

// ============ รายวิชา ============

function listSubjects(params) {
  requireTeacher(params);
  return ok(readAll(SHEETS.SUBJECTS).map(function (r) {
    return { subjectId: r.subjectId, name: r.name, status: r.status };
  }));
}

function addSubject(params) {
  requireTeacher(params);
  return withLock(function () {
    var obj = {
      subjectId: newId('SUB'),
      name: params.name || '',
      status: params.status || 'ใช้งาน'
    };
    appendRow(SHEETS.SUBJECTS, obj);
    return ok(obj);
  });
}

function updateSubject(params) {
  requireTeacher(params);
  return withLock(function () {
    var target = findOne(SHEETS.SUBJECTS, function (r) {
      return String(r.subjectId) === String(params.subjectId);
    });
    if (!target) return fail('ไม่พบรายวิชา', 'NOT_FOUND');
    var obj = {
      subjectId: target.subjectId,
      name: params.name !== undefined ? params.name : target.name,
      status: params.status !== undefined ? params.status : target.status
    };
    updateRowByNumber(SHEETS.SUBJECTS, target.__row, obj);
    return ok(obj);
  });
}

function deleteSubject(params) {
  requireTeacher(params);
  return withLock(function () {
    var target = findOne(SHEETS.SUBJECTS, function (r) {
      return String(r.subjectId) === String(params.subjectId);
    });
    if (!target) return fail('ไม่พบรายวิชา', 'NOT_FOUND');
    deleteRowByNumber(SHEETS.SUBJECTS, target.__row);
    return ok(true);
  });
}
