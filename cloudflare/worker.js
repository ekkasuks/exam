/**
 * worker.js — Cloudflare Worker backend สำหรับระบบสอบออนไลน์
 * ------------------------------------------------------------------
 * แทนที่ Google Apps Script: รับ request รูปแบบเดิม ({action, ...} แบบ text/plain)
 * และตอบ {ok, data} เหมือนเดิม → หน้าเว็บเปลี่ยนแค่ URL ใน js/config.js
 *
 * Bindings ที่ต้องตั้งใน Cloudflare:
 *   - D1 database ผูกชื่อ  DB
 *   - Variable/Secret       TEACHER_CODE  (รหัสครู เช่น 127)
 *
 * ตรวจคะแนน/สิทธิ์/เวลา/กันส่งซ้ำ ทำที่ Worker ทั้งหมด (ไม่ส่งเฉลยไปก่อนสอบ)
 */

export default {
  async fetch(request, env) {
    // ---- CORS ----
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    let params = {};
    try {
      const text = await request.text();
      if (text) params = JSON.parse(text);
    } catch (e) {
      return json({ ok: false, error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง (JSON ผิดรูปแบบ)', code: 'BAD_JSON' });
    }
    // เผื่อเรียกแบบ GET ?action=ping
    if (!params.action) {
      const u = new URL(request.url);
      if (u.searchParams.get('action')) params.action = u.searchParams.get('action');
    }

    try {
      const result = await route(params.action, params, env);
      return json(result);
    } catch (err) {
      return json({ ok: false, error: (err && err.message) ? err.message : String(err), code: 'EXCEPTION' });
    }
  }
};

// ============ helpers: response ============
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: Object.assign({ 'Content-Type': 'application/json;charset=utf-8' }, corsHeaders())
  });
}
function ok(data) { return { ok: true, data: data === undefined ? null : data }; }
function fail(message, code) { return { ok: false, error: message || 'เกิดข้อผิดพลาด', code: code || 'ERROR' }; }

// ============ helpers: DB ============
async function dbAll(env, sql, ...args) {
  const r = await env.DB.prepare(sql).bind(...args).all();
  return r.results || [];
}
async function dbFirst(env, sql, ...args) {
  return await env.DB.prepare(sql).bind(...args).first();
}
async function dbRun(env, sql, ...args) {
  return await env.DB.prepare(sql).bind(...args).run();
}

// ============ helpers: misc ============
function newId(prefix) {
  return (prefix || 'ID') + '_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}
function b(v) { return v ? 1 : 0; }
function toBool(v) {
  if (v === 1 || v === true) return true;
  if (!v) return false;
  const s = String(v).toLowerCase().trim();
  return s === '1' || s === 'true' || s === 'yes' || s === 'ใช่' || s === 'y';
}
function nowISO() { return new Date().toISOString(); }
function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function nextStudentCode(existingIds) {
  let max = 0;
  (existingIds || []).forEach(id => {
    const m = String(id).match(/^S(\d+)$/i);
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  });
  return 'S' + ('0000' + (max + 1)).slice(-4);
}
function getTeacherCode(env) { return (env && env.TEACHER_CODE) ? String(env.TEACHER_CODE) : '127'; }
function requireTeacher(params, env) {
  const code = String(params.teacherCode || params.token || '').trim();
  if (code !== getTeacherCode(env)) {
    throw new Error('ไม่มีสิทธิ์เข้าถึง กรุณาเข้าสู่ระบบครูใหม่');
  }
}

// ============ router ============
async function route(action, params, env) {
  switch (action) {
    case 'ping': return ok({ time: nowISO(), version: '1.0-cf' });
    case 'initDb': return await initDb(env);
    case 'getPublicConfig': return await getPublicConfig(env);

    case 'studentLogin': return await studentLogin(params, env);
    case 'getExam': return await getExam(params, env);
    case 'submitExam': return await submitExam(params, env);

    case 'teacherLogin': return await teacherLogin(params, env);

    case 'listStudents': return await listStudents(params, env);
    case 'addStudent': return await addStudent(params, env);
    case 'updateStudent': return await updateStudent(params, env);
    case 'deleteStudent': return await deleteStudent(params, env);
    case 'importStudents': return await importStudents(params, env);

    case 'listClasses': return await listClasses(params, env);
    case 'addClass': return await addClass(params, env);
    case 'updateClass': return await updateClass(params, env);
    case 'deleteClass': return await deleteClass(params, env);

    case 'listSubjects': return await listSubjects(params, env);
    case 'addSubject': return await addSubject(params, env);
    case 'updateSubject': return await updateSubject(params, env);
    case 'deleteSubject': return await deleteSubject(params, env);

    case 'listExams': return await listExams(params, env);
    case 'saveExam': return await saveExam(params, env);
    case 'getExamFull': return await getExamFull(params, env);
    case 'deleteExam': return await deleteExam(params, env);
    case 'setExamStatus': return await setExamStatus(params, env);
    case 'uploadImage': return await uploadImage(params, env);

    case 'getDashboardStats': return await getDashboardStats(params, env);
    case 'getResults': return await getResults(params, env);
    case 'getAnalysis': return await getAnalysis(params, env);
    case 'resetAttempt': return await resetAttempt(params, env);

    case 'getSettings': return await getSettingsAction(params, env);
    case 'saveSettings': return await saveSettingsAction(params, env);

    default:
      return fail('ไม่รู้จักคำสั่ง: ' + action, 'UNKNOWN_ACTION');
  }
}

// ============ ติดตั้งฐานข้อมูล (initDb) ============
// สร้างตารางทั้งหมด + ข้อมูลเริ่มต้น (idempotent — เรียกซ้ำได้ไม่ลบข้อมูลเดิม)
// เปิดใช้ได้โดยเข้า URL:  <Worker-URL>/?action=initDb
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS students (studentId TEXT PRIMARY KEY, title TEXT, fullName TEXT, level TEXT, room TEXT, number TEXT, status TEXT DEFAULT 'ใช้งาน')`,
  `CREATE INDEX IF NOT EXISTS idx_students_level_room ON students(level, room)`,
  `CREATE TABLE IF NOT EXISTS classes (classId TEXT PRIMARY KEY, level TEXT, room TEXT, note TEXT)`,
  `CREATE TABLE IF NOT EXISTS subjects (subjectId TEXT PRIMARY KEY, name TEXT, status TEXT DEFAULT 'ใช้งาน')`,
  `CREATE TABLE IF NOT EXISTS exams (examId TEXT PRIMARY KEY, title TEXT, subjectId TEXT, level TEXT, description TEXT, numQuestions INTEGER DEFAULT 0, totalScore REAL DEFAULT 0, scorePerQuestion REAL DEFAULT 1, duration INTEGER DEFAULT 0, openAt TEXT, closeAt TEXT, allowedRooms TEXT, status TEXT DEFAULT 'ปิด', shuffleQuestions INTEGER DEFAULT 0, shuffleChoices INTEGER DEFAULT 0, showScore INTEGER DEFAULT 1, allowRetake INTEGER DEFAULT 0, showAnswers INTEGER DEFAULT 0, academicYear TEXT, createdAt TEXT, updatedAt TEXT)`,
  `CREATE TABLE IF NOT EXISTS questions (questionId TEXT PRIMARY KEY, examId TEXT, ord INTEGER DEFAULT 0, questionText TEXT, imageId TEXT, score REAL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_questions_exam ON questions(examId)`,
  `CREATE TABLE IF NOT EXISTS choices (choiceId TEXT PRIMARY KEY, questionId TEXT, examId TEXT, label TEXT, choiceText TEXT, imageId TEXT, isCorrect INTEGER DEFAULT 0, ord INTEGER DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_choices_exam ON choices(examId)`,
  `CREATE INDEX IF NOT EXISTS idx_choices_question ON choices(questionId)`,
  `CREATE TABLE IF NOT EXISTS results (attemptId TEXT PRIMARY KEY, examId TEXT, studentId TEXT, score REAL DEFAULT 0, totalScore REAL DEFAULT 0, percent REAL DEFAULT 0, startedAt TEXT, submittedAt TEXT, durationUsed INTEGER DEFAULT 0, status TEXT DEFAULT 'submitted', academicYear TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_results_exam ON results(examId)`,
  `CREATE INDEX IF NOT EXISTS idx_results_student ON results(studentId)`,
  `CREATE TABLE IF NOT EXISTS answers (answerId TEXT PRIMARY KEY, attemptId TEXT, examId TEXT, studentId TEXT, questionId TEXT, selectedLabel TEXT, isCorrect INTEGER DEFAULT 0, score REAL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_answers_exam ON answers(examId)`,
  `CREATE INDEX IF NOT EXISTS idx_answers_attempt ON answers(attemptId)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`
];
const SEED_STATEMENTS = [
  `INSERT OR IGNORE INTO subjects (subjectId, name, status) VALUES
    ('SUB_thai','ภาษาไทย','ใช้งาน'),('SUB_math','คณิตศาสตร์','ใช้งาน'),
    ('SUB_sci','วิทยาศาสตร์และเทคโนโลยี','ใช้งาน'),('SUB_social','สังคมศึกษา ศาสนาและวัฒนธรรม','ใช้งาน'),
    ('SUB_health','สุขศึกษาและพลศึกษา','ใช้งาน'),('SUB_art','ศิลปะ','ใช้งาน'),
    ('SUB_work','การงานอาชีพ','ใช้งาน'),('SUB_eng','ภาษาอังกฤษ','ใช้งาน')`,
  `INSERT OR IGNORE INTO settings (key, value) VALUES
    ('schoolName','โรงเรียนบ้านใหม่'),('academicYear','2568'),('primaryColor','#2563eb')`
];
async function initDb(env) {
  const stmts = SCHEMA_STATEMENTS.concat(SEED_STATEMENTS).map(s => env.DB.prepare(s));
  await env.DB.batch(stmts);
  return ok({ initialized: true, tables: SCHEMA_STATEMENTS.length, message: 'สร้างตารางฐานข้อมูลเรียบร้อย พร้อมใช้งาน' });
}

// ============ Settings ============
async function getSetting(env, key, def) {
  const row = await dbFirst(env, 'SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : (def !== undefined ? def : '');
}
async function setSetting(env, key, value) {
  await dbRun(env,
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, value);
}
async function getPublicConfig(env) {
  // ไม่ให้พังถ้ายังไม่ได้ initDb — คืนค่าเริ่มต้นเพื่อให้หน้าเว็บโหลดได้
  try {
    return ok({
      schoolName: await getSetting(env, 'schoolName', 'โรงเรียนบ้านใหม่'),
      academicYear: await getSetting(env, 'academicYear', '2568'),
      primaryColor: await getSetting(env, 'primaryColor', '#2563eb')
    });
  } catch (e) {
    return ok({ schoolName: 'โรงเรียนบ้านใหม่', academicYear: '2568', primaryColor: '#2563eb', needsInit: true });
  }
}
async function getSettingsAction(params, env) {
  requireTeacher(params, env);
  return await getPublicConfig(env);
}
async function saveSettingsAction(params, env) {
  requireTeacher(params, env);
  if (params.schoolName !== undefined) await setSetting(env, 'schoolName', params.schoolName);
  if (params.academicYear !== undefined) await setSetting(env, 'academicYear', params.academicYear);
  if (params.primaryColor !== undefined) await setSetting(env, 'primaryColor', params.primaryColor);
  return await getPublicConfig(env);
}

// ============ Auth ============
async function studentLogin(params, env) {
  const studentId = String(params.studentId || '').trim().toUpperCase();
  if (!studentId) return fail('กรุณากรอกรหัสนักเรียน', 'NO_ID');

  const student = await dbFirst(env, 'SELECT * FROM students WHERE UPPER(studentId) = ?', studentId);
  if (!student) return fail('ไม่พบรหัสนักเรียนนี้ในระบบ', 'NOT_FOUND');
  const st = String(student.status || '').trim();
  if (st === 'ปิด' || st === 'inactive') return fail('บัญชีนักเรียนนี้ถูกปิดการใช้งาน', 'INACTIVE');

  const exams = await listAvailableExamsForStudent(env, student);
  return ok({
    student: {
      studentId: student.studentId, title: student.title, fullName: student.fullName,
      level: student.level, room: student.room, number: student.number
    },
    exams
  });
}

async function teacherLogin(params, env) {
  const code = String(params.code || '').trim();
  if (!code) return fail('กรุณากรอกรหัสครู', 'NO_CODE');
  if (code !== getTeacherCode(env)) {
    // หน่วงเวลาเมื่อกรอกผิด เพื่อชะลอการเดารหัส
    await new Promise(r => setTimeout(r, 800));
    return fail('รหัสครูไม่ถูกต้อง', 'WRONG_CODE');
  }
  let schoolName = 'โรงเรียนบ้านใหม่';
  try { schoolName = await getSetting(env, 'schoolName', schoolName); } catch (e) { /* ยังไม่ initDb ก็ล็อกอินได้ */ }
  return ok({ token: getTeacherCode(env), schoolName });
}

// ============ Students ============
function cleanStudent(r) {
  return {
    studentId: r.studentId, title: r.title, fullName: r.fullName,
    level: r.level, room: r.room, number: r.number, status: r.status
  };
}
async function listStudents(params, env) {
  requireTeacher(params, env);
  let sql = 'SELECT * FROM students WHERE 1=1';
  const args = [];
  if (params.level) { sql += ' AND level = ?'; args.push(String(params.level).trim()); }
  if (params.room) { sql += ' AND room = ?'; args.push(String(params.room).trim()); }
  if (params.q) {
    sql += ' AND (LOWER(studentId) LIKE ? OR LOWER(fullName) LIKE ?)';
    const like = '%' + String(params.q).trim().toLowerCase() + '%';
    args.push(like, like);
  }
  sql += ' ORDER BY level, room, CAST(number AS INTEGER), number';
  const rows = await dbAll(env, sql, ...args);
  return ok(rows.map(cleanStudent));
}
async function addStudent(params, env) {
  requireTeacher(params, env);
  let studentId = String(params.studentId || '').trim().toUpperCase();
  if (studentId) {
    const dup = await dbFirst(env, 'SELECT studentId FROM students WHERE UPPER(studentId) = ?', studentId);
    if (dup) return fail('มีรหัสนักเรียน ' + studentId + ' อยู่แล้ว', 'DUP');
  } else {
    const all = await dbAll(env, 'SELECT studentId FROM students');
    studentId = nextStudentCode(all.map(r => r.studentId));
  }
  const obj = {
    studentId,
    title: params.title || '', fullName: params.fullName || '',
    level: params.level || '', room: params.room || '',
    number: params.number || '', status: params.status || 'ใช้งาน'
  };
  await dbRun(env,
    'INSERT INTO students (studentId,title,fullName,level,room,number,status) VALUES (?,?,?,?,?,?,?)',
    obj.studentId, obj.title, obj.fullName, obj.level, obj.room, obj.number, obj.status);
  return ok(cleanStudent(obj));
}
async function updateStudent(params, env) {
  requireTeacher(params, env);
  const target = await dbFirst(env, 'SELECT * FROM students WHERE UPPER(studentId) = ?',
    String(params.studentId).trim().toUpperCase());
  if (!target) return fail('ไม่พบนักเรียน', 'NOT_FOUND');
  const obj = {
    title: params.title !== undefined ? params.title : target.title,
    fullName: params.fullName !== undefined ? params.fullName : target.fullName,
    level: params.level !== undefined ? params.level : target.level,
    room: params.room !== undefined ? params.room : target.room,
    number: params.number !== undefined ? params.number : target.number,
    status: params.status !== undefined ? params.status : target.status
  };
  await dbRun(env,
    'UPDATE students SET title=?,fullName=?,level=?,room=?,number=?,status=? WHERE studentId=?',
    obj.title, obj.fullName, obj.level, obj.room, obj.number, obj.status, target.studentId);
  return ok(Object.assign({ studentId: target.studentId }, obj));
}
async function deleteStudent(params, env) {
  requireTeacher(params, env);
  const r = await dbRun(env, 'DELETE FROM students WHERE UPPER(studentId) = ?',
    String(params.studentId).trim().toUpperCase());
  if (!r.meta || r.meta.changes === 0) return fail('ไม่พบนักเรียน', 'NOT_FOUND');
  return ok(true);
}
async function importStudents(params, env) {
  requireTeacher(params, env);
  const rows = params.rows || [];
  if (!rows.length) return fail('ไม่มีข้อมูลนำเข้า', 'EMPTY');

  const all = await dbAll(env, 'SELECT studentId FROM students');
  const existing = {};
  const codes = [];
  all.forEach(r => { existing[String(r.studentId).trim().toUpperCase()] = true; codes.push(r.studentId); });

  const stmts = [];
  let added = 0, skipped = 0;
  const insertSql = 'INSERT INTO students (studentId,title,fullName,level,room,number,status) VALUES (?,?,?,?,?,?,?)';
  for (const row of rows) {
    let id = String(row.studentId || '').trim().toUpperCase();
    if (id && existing[id]) { skipped++; continue; }
    if (!id) id = nextStudentCode(codes);
    codes.push(id); existing[id] = true; added++;
    stmts.push(env.DB.prepare(insertSql).bind(
      id, row.title || '', row.fullName || '', row.level || '', row.room || '', row.number || '', row.status || 'ใช้งาน'));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return ok({ added, skipped });
}

// ============ Classes ============
async function listClasses(params, env) {
  requireTeacher(params, env);
  const classes = await dbAll(env, 'SELECT * FROM classes ORDER BY level, room');
  const counts = await dbAll(env, 'SELECT level, room, COUNT(*) AS c FROM students GROUP BY level, room');
  const map = {};
  counts.forEach(r => { map[String(r.level).trim() + '|' + String(r.room).trim()] = r.c; });
  return ok(classes.map(c => ({
    classId: c.classId, level: c.level, room: c.room, note: c.note,
    studentCount: map[String(c.level).trim() + '|' + String(c.room).trim()] || 0
  })));
}
async function addClass(params, env) {
  requireTeacher(params, env);
  const dup = await dbFirst(env, 'SELECT classId FROM classes WHERE level = ? AND room = ?',
    String(params.level).trim(), String(params.room).trim());
  if (dup) return fail('มีห้องนี้อยู่แล้ว', 'DUP');
  const obj = { classId: newId('CLS'), level: params.level || '', room: params.room || '', note: params.note || '' };
  await dbRun(env, 'INSERT INTO classes (classId,level,room,note) VALUES (?,?,?,?)',
    obj.classId, obj.level, obj.room, obj.note);
  return ok(obj);
}
async function updateClass(params, env) {
  requireTeacher(params, env);
  const target = await dbFirst(env, 'SELECT * FROM classes WHERE classId = ?', String(params.classId));
  if (!target) return fail('ไม่พบห้องเรียน', 'NOT_FOUND');
  const obj = {
    classId: target.classId,
    level: params.level !== undefined ? params.level : target.level,
    room: params.room !== undefined ? params.room : target.room,
    note: params.note !== undefined ? params.note : target.note
  };
  await dbRun(env, 'UPDATE classes SET level=?,room=?,note=? WHERE classId=?',
    obj.level, obj.room, obj.note, obj.classId);
  return ok(obj);
}
async function deleteClass(params, env) {
  requireTeacher(params, env);
  const r = await dbRun(env, 'DELETE FROM classes WHERE classId = ?', String(params.classId));
  if (!r.meta || r.meta.changes === 0) return fail('ไม่พบห้องเรียน', 'NOT_FOUND');
  return ok(true);
}

// ============ Subjects ============
async function listSubjects(params, env) {
  requireTeacher(params, env);
  const rows = await dbAll(env, 'SELECT * FROM subjects ORDER BY rowid');
  return ok(rows.map(r => ({ subjectId: r.subjectId, name: r.name, status: r.status })));
}
async function addSubject(params, env) {
  requireTeacher(params, env);
  const obj = { subjectId: newId('SUB'), name: params.name || '', status: params.status || 'ใช้งาน' };
  await dbRun(env, 'INSERT INTO subjects (subjectId,name,status) VALUES (?,?,?)', obj.subjectId, obj.name, obj.status);
  return ok(obj);
}
async function updateSubject(params, env) {
  requireTeacher(params, env);
  const target = await dbFirst(env, 'SELECT * FROM subjects WHERE subjectId = ?', String(params.subjectId));
  if (!target) return fail('ไม่พบรายวิชา', 'NOT_FOUND');
  const obj = {
    subjectId: target.subjectId,
    name: params.name !== undefined ? params.name : target.name,
    status: params.status !== undefined ? params.status : target.status
  };
  await dbRun(env, 'UPDATE subjects SET name=?,status=? WHERE subjectId=?', obj.name, obj.status, obj.subjectId);
  return ok(obj);
}
async function deleteSubject(params, env) {
  requireTeacher(params, env);
  const r = await dbRun(env, 'DELETE FROM subjects WHERE subjectId = ?', String(params.subjectId));
  if (!r.meta || r.meta.changes === 0) return fail('ไม่พบรายวิชา', 'NOT_FOUND');
  return ok(true);
}

// ============ Exams ============
function examMeta(e, subjectName) {
  return {
    examId: e.examId, title: e.title, subjectId: e.subjectId, subjectName: subjectName || '',
    level: e.level, description: e.description,
    numQuestions: Number(e.numQuestions) || 0, totalScore: Number(e.totalScore) || 0,
    scorePerQuestion: Number(e.scorePerQuestion) || 0, duration: Number(e.duration) || 0,
    openAt: e.openAt ? (toDate(e.openAt) ? toDate(e.openAt).toISOString() : '') : '',
    closeAt: e.closeAt ? (toDate(e.closeAt) ? toDate(e.closeAt).toISOString() : '') : '',
    allowedRooms: e.allowedRooms ? String(e.allowedRooms) : '',
    status: e.status || 'ปิด',
    shuffleQuestions: toBool(e.shuffleQuestions), shuffleChoices: toBool(e.shuffleChoices),
    showScore: toBool(e.showScore), allowRetake: toBool(e.allowRetake), showAnswers: toBool(e.showAnswers),
    academicYear: e.academicYear || '', createdAt: e.createdAt || ''
  };
}
function isExamOpenNow(e, now) {
  const status = String(e.status || '').trim();
  if (status === 'ปิด' || status === 'closed') return false;
  const open = toDate(e.openAt), close = toDate(e.closeAt);
  if (open && now < open) return false;
  if (close && now > close) return false;
  return status === 'เปิด' || status === 'open' || status === 'เปิดสอบ' ||
         status === 'กำหนดเวลา' || status === 'scheduled';
}
function isSubmitAllowed(e, now) {
  const GRACE = 10 * 60000;
  const open = toDate(e.openAt), close = toDate(e.closeAt);
  if (open && now.getTime() < open.getTime()) return false;
  if (close && now.getTime() > close.getTime() + GRACE) return false;
  return true;
}
function examMatchesStudent(e, student) {
  if (e.level && String(e.level).trim() && String(e.level).trim() !== String(student.level).trim()) return false;
  const rooms = String(e.allowedRooms || '').trim();
  if (rooms) {
    const list = rooms.split(',').map(s => s.trim()).filter(Boolean);
    if (list.length && list.indexOf(String(student.room).trim()) === -1) return false;
  }
  return true;
}

async function listExams(params, env) {
  requireTeacher(params, env);
  const exams = await dbAll(env, 'SELECT * FROM exams ORDER BY createdAt DESC');
  const subjects = await subjectMap(env);
  return ok(exams.map(e => examMeta(e, subjects[e.subjectId])));
}
async function subjectMap(env) {
  const subs = await dbAll(env, 'SELECT subjectId, name FROM subjects');
  const map = {};
  subs.forEach(s => { map[s.subjectId] = s.name; });
  return map;
}

async function listAvailableExamsForStudent(env, student) {
  const now = new Date();
  const exams = await dbAll(env, 'SELECT * FROM exams');
  const subjects = await subjectMap(env);
  const done = await dbAll(env,
    'SELECT * FROM results WHERE UPPER(studentId) = ? AND status = ?',
    String(student.studentId).trim().toUpperCase(), 'submitted');
  const doneMap = {};
  done.forEach(r => { doneMap[String(r.examId)] = r; });

  const out = [];
  for (const e of exams) {
    if (!isExamOpenNow(e, now)) continue;
    if (!examMatchesStudent(e, student)) continue;
    const d = doneMap[String(e.examId)];
    const m = examMeta(e, subjects[e.subjectId]);
    m.done = !!d;
    m.canTake = !d || toBool(e.allowRetake);
    if (d) { m.myScore = Number(d.score) || 0; m.myPercent = Number(d.percent) || 0; }
    out.push(m);
  }
  return out;
}

async function saveExam(params, env) {
  requireTeacher(params, env);
  const exam = params.exam || {};
  const questions = params.questions || [];
  const isNew = !exam.examId;
  const examId = exam.examId || newId('EXAM');

  const scorePerQuestion = Number(exam.scorePerQuestion) || 1;
  let totalScore = 0;
  questions.forEach(q => { totalScore += (q.score !== undefined && q.score !== '' && q.score !== null) ? Number(q.score) : scorePerQuestion; });

  const academicYear = exam.academicYear || await getSetting(env, 'academicYear');
  const now = nowISO();

  let createdAt = now;
  if (!isNew) {
    const prev = await dbFirst(env, 'SELECT createdAt FROM exams WHERE examId = ?', examId);
    if (!prev) return fail('ไม่พบชุดข้อสอบ', 'NOT_FOUND');
    createdAt = prev.createdAt || now;
  }

  const vals = [
    examId, exam.title || '', exam.subjectId || '', exam.level || '', exam.description || '',
    questions.length, totalScore, scorePerQuestion, Number(exam.duration) || 0,
    exam.openAt || '', exam.closeAt || '', exam.allowedRooms || '', exam.status || 'ปิด',
    b(exam.shuffleQuestions), b(exam.shuffleChoices), exam.showScore !== false ? 1 : 0,
    b(exam.allowRetake), b(exam.showAnswers), academicYear, createdAt, now
  ];
  await dbRun(env,
    `INSERT INTO exams (examId,title,subjectId,level,description,numQuestions,totalScore,scorePerQuestion,duration,
      openAt,closeAt,allowedRooms,status,shuffleQuestions,shuffleChoices,showScore,allowRetake,showAnswers,
      academicYear,createdAt,updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(examId) DO UPDATE SET
      title=excluded.title, subjectId=excluded.subjectId, level=excluded.level, description=excluded.description,
      numQuestions=excluded.numQuestions, totalScore=excluded.totalScore, scorePerQuestion=excluded.scorePerQuestion,
      duration=excluded.duration, openAt=excluded.openAt, closeAt=excluded.closeAt, allowedRooms=excluded.allowedRooms,
      status=excluded.status, shuffleQuestions=excluded.shuffleQuestions, shuffleChoices=excluded.shuffleChoices,
      showScore=excluded.showScore, allowRetake=excluded.allowRetake, showAnswers=excluded.showAnswers,
      academicYear=excluded.academicYear, updatedAt=excluded.updatedAt`,
    ...vals);

  // เขียนคำถาม/ตัวเลือกใหม่ทั้งหมด
  const stmts = [
    env.DB.prepare('DELETE FROM questions WHERE examId = ?').bind(examId),
    env.DB.prepare('DELETE FROM choices WHERE examId = ?').bind(examId)
  ];
  const qSql = 'INSERT INTO questions (questionId,examId,ord,questionText,imageId,score) VALUES (?,?,?,?,?,?)';
  const cSql = 'INSERT INTO choices (choiceId,questionId,examId,label,choiceText,imageId,isCorrect,ord) VALUES (?,?,?,?,?,?,?,?)';
  questions.forEach((q, qi) => {
    const questionId = q.questionId || newId('Q');
    const qScore = (q.score !== undefined && q.score !== '' && q.score !== null) ? Number(q.score) : scorePerQuestion;
    stmts.push(env.DB.prepare(qSql).bind(questionId, examId, (q.order != null ? q.order : qi + 1), q.questionText || '', q.imageId || '', qScore));
    (q.choices || []).forEach((c, ci) => {
      stmts.push(env.DB.prepare(cSql).bind(
        c.choiceId || newId('C'), questionId, examId, c.label || '', c.choiceText || '', c.imageId || '',
        b(c.isCorrect), (c.order != null ? c.order : ci + 1)));
    });
  });
  await env.DB.batch(stmts);

  return ok({ examId, numQuestions: questions.length, totalScore });
}

async function getExamFull(params, env) {
  requireTeacher(params, env);
  const exam = await dbFirst(env, 'SELECT * FROM exams WHERE examId = ?', String(params.examId));
  if (!exam) return fail('ไม่พบชุดข้อสอบ', 'NOT_FOUND');
  const questions = await buildQuestionTree(env, exam.examId, true, false, false);
  return ok({ exam: examMeta(exam), questions });
}

async function deleteExam(params, env) {
  requireTeacher(params, env);
  const examId = String(params.examId);
  const r = await dbRun(env, 'DELETE FROM exams WHERE examId = ?', examId);
  if (!r.meta || r.meta.changes === 0) return fail('ไม่พบชุดข้อสอบ', 'NOT_FOUND');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM questions WHERE examId = ?').bind(examId),
    env.DB.prepare('DELETE FROM choices WHERE examId = ?').bind(examId)
  ]);
  return ok(true);
}

async function setExamStatus(params, env) {
  requireTeacher(params, env);
  const exam = await dbFirst(env, 'SELECT examId FROM exams WHERE examId = ?', String(params.examId));
  if (!exam) return fail('ไม่พบชุดข้อสอบ', 'NOT_FOUND');
  const status = params.status || 'ปิด';
  if (params.openAt !== undefined || params.closeAt !== undefined) {
    await dbRun(env, 'UPDATE exams SET status=?, openAt=?, closeAt=?, updatedAt=? WHERE examId=?',
      status, params.openAt || '', params.closeAt || '', nowISO(), String(params.examId));
  } else {
    await dbRun(env, 'UPDATE exams SET status=?, updatedAt=? WHERE examId=?', status, nowISO(), String(params.examId));
  }
  return ok({ examId: params.examId, status });
}

async function uploadImage(params, env) {
  requireTeacher(params, env);
  // เวอร์ชัน Cloudflare นี้ยังไม่เปิดใช้รูปภาพ (ต้องตั้ง R2 เพิ่ม)
  return fail('เวอร์ชันนี้ยังไม่รองรับการแนบรูปภาพ (ต้องตั้งค่า Cloudflare R2 เพิ่ม)', 'IMG_DISABLED');
}

// ---------- คำถาม/ตัวเลือก ----------
async function buildQuestionTree(env, examId, includeCorrect, shuffleQ, shuffleC) {
  const questions = await dbAll(env, 'SELECT * FROM questions WHERE examId = ? ORDER BY ord', examId);
  const choices = await dbAll(env, 'SELECT * FROM choices WHERE examId = ? ORDER BY ord', examId);
  const byQ = {};
  choices.forEach(c => { (byQ[String(c.questionId)] = byQ[String(c.questionId)] || []).push(c); });

  let tree = questions.map(q => {
    let cs = (byQ[String(q.questionId)] || []).slice();
    if (shuffleC) cs = shuffle(cs);
    const choiceOut = cs.map(c => {
      const o = { choiceId: c.choiceId, label: c.label, choiceText: c.choiceText, imageId: c.imageId || '', imageUrl: '' };
      if (includeCorrect) o.isCorrect = toBool(c.isCorrect);
      return o;
    });
    return {
      questionId: q.questionId, order: Number(q.ord) || 0, questionText: q.questionText,
      imageId: q.imageId || '', imageUrl: '', score: Number(q.score) || 0, choices: choiceOut
    };
  });
  if (shuffleQ) tree = shuffle(tree);
  return tree;
}

async function getExam(params, env) {
  const examId = String(params.examId || '');
  const studentId = String(params.studentId || '').trim().toUpperCase();

  const student = await dbFirst(env, 'SELECT * FROM students WHERE UPPER(studentId) = ?', studentId);
  if (!student) return fail('ไม่พบนักเรียน', 'NO_STUDENT');
  const exam = await dbFirst(env, 'SELECT * FROM exams WHERE examId = ?', examId);
  if (!exam) return fail('ไม่พบชุดข้อสอบ', 'NOT_FOUND');

  const now = new Date();
  if (!isExamOpenNow(exam, now)) return fail('ข้อสอบนี้ยังไม่เปิดหรือปิดแล้ว', 'CLOSED');
  if (!examMatchesStudent(exam, student)) return fail('คุณไม่มีสิทธิ์ทำข้อสอบนี้', 'NO_PERMISSION');

  const done = await dbFirst(env,
    'SELECT attemptId FROM results WHERE examId = ? AND UPPER(studentId) = ? AND status = ?',
    examId, studentId, 'submitted');
  if (done && !toBool(exam.allowRetake)) return fail('คุณทำข้อสอบชุดนี้ไปแล้ว', 'ALREADY_DONE');

  const meta = examMeta(exam);
  const questions = await buildQuestionTree(env, examId, false, toBool(exam.shuffleQuestions), toBool(exam.shuffleChoices));
  return ok({
    exam: {
      examId: meta.examId, title: meta.title, subjectName: meta.subjectName, level: meta.level,
      description: meta.description, numQuestions: questions.length, totalScore: meta.totalScore, duration: meta.duration
    },
    questions,
    serverTime: now.toISOString(),
    student: {
      studentId: student.studentId, title: student.title, fullName: student.fullName,
      level: student.level, room: student.room, number: student.number
    }
  });
}

// ============ Submit ============
async function submitExam(params, env) {
  const examId = String(params.examId || '');
  const studentId = String(params.studentId || '').trim().toUpperCase();
  const answers = params.answers || [];
  const now = new Date();

  const student = await dbFirst(env, 'SELECT * FROM students WHERE UPPER(studentId) = ?', studentId);
  if (!student) return fail('ไม่พบนักเรียน', 'NO_STUDENT');
  const exam = await dbFirst(env, 'SELECT * FROM exams WHERE examId = ?', examId);
  if (!exam) return fail('ไม่พบชุดข้อสอบ', 'NOT_FOUND');
  if (!examMatchesStudent(exam, student)) return fail('ไม่มีสิทธิ์ทำข้อสอบนี้', 'NO_PERMISSION');
  if (!isSubmitAllowed(exam, now)) return fail('ข้อสอบนี้ปิดรับคำตอบแล้ว', 'CLOSED');

  const prev = await dbFirst(env,
    'SELECT attemptId FROM results WHERE examId = ? AND UPPER(studentId) = ? AND status = ?',
    examId, studentId, 'submitted');
  if (prev && !toBool(exam.allowRetake)) return fail('คุณส่งข้อสอบชุดนี้ไปแล้ว', 'ALREADY_DONE');

  const questions = await dbAll(env, 'SELECT questionId, score FROM questions WHERE examId = ?', examId);
  const choices = await dbAll(env, 'SELECT choiceId, questionId, label, isCorrect FROM choices WHERE examId = ?', examId);

  const scorePerQ = {};
  const questionIds = [];
  questions.forEach(q => { scorePerQ[String(q.questionId)] = Number(q.score) || 0; questionIds.push(String(q.questionId)); });

  const correctByChoiceId = {}, labelByChoiceId = {}, correctChoiceByQ = {};
  choices.forEach(c => {
    const cid = String(c.choiceId);
    labelByChoiceId[cid] = String(c.label);
    if (toBool(c.isCorrect)) { correctByChoiceId[cid] = true; correctChoiceByQ[String(c.questionId)] = cid; }
  });

  const submitted = {};
  answers.forEach(a => { submitted[String(a.questionId)] = String(a.choiceId || ''); });

  const attemptId = newId('AT');
  const totalScore = Number(exam.totalScore) || 0;
  let gotScore = 0;
  const answerRows = [];
  const reviewOut = [];

  questionIds.forEach(qid => {
    const selCid = submitted[qid] || '';
    const isCorrect = selCid !== '' && correctByChoiceId[selCid] === true;
    const qScore = isCorrect ? (scorePerQ[qid] || 0) : 0;
    gotScore += qScore;
    answerRows.push({
      answerId: newId('A'), attemptId, examId, studentId: student.studentId, questionId: qid,
      selectedLabel: labelByChoiceId[selCid] || '', isCorrect, score: qScore
    });
    reviewOut.push({ questionId: qid, selectedChoiceId: selCid, correctChoiceId: correctChoiceByQ[qid] || '', isCorrect });
  });

  if (gotScore > totalScore && totalScore > 0) gotScore = totalScore;
  const percent = totalScore > 0 ? Math.round((gotScore / totalScore) * 10000) / 100 : 0;

  const startedAt = params.startedAt || '';
  let durationUsed = 0;
  const sd = toDate(startedAt);
  if (sd) durationUsed = Math.round((now.getTime() - sd.getTime()) / 1000);

  // เขียนผล + คำตอบทั้งหมดใน batch เดียว (atomic)
  const stmts = [
    env.DB.prepare(
      `INSERT INTO results (attemptId,examId,studentId,score,totalScore,percent,startedAt,submittedAt,durationUsed,status,academicYear)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(attemptId, examId, student.studentId, gotScore, totalScore, percent, startedAt, now.toISOString(),
      durationUsed, 'submitted', exam.academicYear || '')
  ];
  const aSql = 'INSERT INTO answers (answerId,attemptId,examId,studentId,questionId,selectedLabel,isCorrect,score) VALUES (?,?,?,?,?,?,?,?)';
  answerRows.forEach(a => {
    stmts.push(env.DB.prepare(aSql).bind(a.answerId, a.attemptId, a.examId, a.studentId, a.questionId, a.selectedLabel, b(a.isCorrect), a.score));
  });
  await env.DB.batch(stmts);

  const resp = { attemptId, submitted: true, showScore: toBool(exam.showScore), showAnswers: toBool(exam.showAnswers) };
  if (toBool(exam.showScore)) { resp.score = gotScore; resp.totalScore = totalScore; resp.percent = percent; }
  if (toBool(exam.showAnswers)) resp.review = reviewOut;
  return ok(resp);
}

// ============ Dashboard / Results / Analysis ============
async function getDashboardStats(params, env) {
  requireTeacher(params, env);
  const c = async (sql) => (await dbFirst(env, sql)).n;
  const students = await c('SELECT COUNT(*) AS n FROM students');
  const classes = await c('SELECT COUNT(*) AS n FROM classes');
  const subjects = await c('SELECT COUNT(*) AS n FROM subjects');
  const examsCount = await c('SELECT COUNT(*) AS n FROM exams');
  const attempts = await c("SELECT COUNT(*) AS n FROM results WHERE status = 'submitted'");

  const exams = await dbAll(env, 'SELECT * FROM exams');
  const now = new Date();
  const openExams = exams.filter(e => isExamOpenNow(e, now)).length;

  return ok({ students, classes, subjects, exams: examsCount, openExams, attempts });
}

async function getResults(params, env) {
  requireTeacher(params, env);
  const examId = params.examId ? String(params.examId) : '';
  if (!examId) return fail('กรุณาเลือกชุดข้อสอบ', 'NO_EXAM');
  const exam = await dbFirst(env, 'SELECT * FROM exams WHERE examId = ?', examId);
  if (!exam) return fail('ไม่พบชุดข้อสอบ', 'NOT_FOUND');

  const results = await dbAll(env, "SELECT * FROM results WHERE examId = ? AND status = 'submitted'", examId);
  const byStudent = {};
  results.forEach(r => {
    const sid = String(r.studentId).trim().toUpperCase();
    const cur = byStudent[sid];
    if (!cur || toDate(r.submittedAt) > toDate(cur.submittedAt)) byStudent[sid] = r;
  });

  let students = await dbAll(env, 'SELECT * FROM students');
  let eligible = students.filter(s => examMatchesStudent(exam, s));
  if (params.room) eligible = eligible.filter(s => String(s.room).trim() === String(params.room).trim());

  const table = [];
  const scores = [];
  eligible.forEach(s => {
    const r = byStudent[String(s.studentId).trim().toUpperCase()];
    const row = {
      studentId: s.studentId, number: s.number, fullName: s.fullName, title: s.title,
      level: s.level, room: s.room, done: !!r
    };
    if (r) {
      row.score = Number(r.score) || 0; row.totalScore = Number(r.totalScore) || 0;
      row.percent = Number(r.percent) || 0;
      row.submittedAt = r.submittedAt ? toDate(r.submittedAt).toISOString() : '';
      row.durationUsed = Number(r.durationUsed) || 0;
      scores.push(row.score);
    }
    table.push(row);
  });

  const summary = {
    totalEligible: eligible.length, done: scores.length, notDone: eligible.length - scores.length,
    avg: 0, max: 0, min: 0, avgPercent: 0, totalScore: Number(exam.totalScore) || 0
  };
  if (scores.length) {
    const sum = scores.reduce((a, x) => a + x, 0);
    summary.avg = Math.round((sum / scores.length) * 100) / 100;
    summary.max = Math.max(...scores);
    summary.min = Math.min(...scores);
    summary.avgPercent = summary.totalScore > 0 ? Math.round((summary.avg / summary.totalScore) * 10000) / 100 : 0;
  }
  return ok({ exam: examMeta(exam), summary, table });
}

async function getAnalysis(params, env) {
  requireTeacher(params, env);
  const examId = String(params.examId || '');
  const exam = await dbFirst(env, 'SELECT * FROM exams WHERE examId = ?', examId);
  if (!exam) return fail('ไม่พบชุดข้อสอบ', 'NOT_FOUND');

  const questions = await dbAll(env, 'SELECT * FROM questions WHERE examId = ? ORDER BY ord', examId);
  const choices = await dbAll(env, 'SELECT * FROM choices WHERE examId = ? ORDER BY ord', examId);
  const answers = await dbAll(env, 'SELECT * FROM answers WHERE examId = ?', examId);

  const choiceByQ = {};
  choices.forEach(c => { (choiceByQ[String(c.questionId)] = choiceByQ[String(c.questionId)] || []).push(c); });

  const stat = {};
  answers.forEach(a => {
    const qid = String(a.questionId);
    if (!stat[qid]) stat[qid] = { correct: 0, wrong: 0, byLabel: {} };
    if (toBool(a.isCorrect)) stat[qid].correct++; else stat[qid].wrong++;
    const lb = String(a.selectedLabel || '(ไม่ตอบ)');
    stat[qid].byLabel[lb] = (stat[qid].byLabel[lb] || 0) + 1;
  });

  const out = questions.map(q => {
    const qid = String(q.questionId);
    const s = stat[qid] || { correct: 0, wrong: 0, byLabel: {} };
    const cs = (choiceByQ[qid] || []);
    return {
      questionId: q.questionId, order: Number(q.ord) || 0, questionText: q.questionText,
      correct: s.correct, wrong: s.wrong,
      choices: cs.map(c => ({
        label: c.label, choiceText: c.choiceText, isCorrect: toBool(c.isCorrect),
        count: s.byLabel[String(c.label)] || 0
      }))
    };
  });
  return ok({ exam: examMeta(exam), questions: out });
}

async function resetAttempt(params, env) {
  requireTeacher(params, env);
  const examId = String(params.examId || '');
  const studentId = String(params.studentId || '').trim().toUpperCase();
  const rs = await dbAll(env, 'SELECT attemptId FROM results WHERE examId = ? AND UPPER(studentId) = ?', examId, studentId);
  const stmts = [
    env.DB.prepare('DELETE FROM results WHERE examId = ? AND UPPER(studentId) = ?').bind(examId, studentId)
  ];
  rs.forEach(r => { stmts.push(env.DB.prepare('DELETE FROM answers WHERE attemptId = ?').bind(r.attemptId)); });
  await env.DB.batch(stmts);
  return ok({ removed: rs.length });
}
