-- ============================================================
-- schema.sql — โครงสร้างฐานข้อมูล D1 (SQLite) สำหรับระบบสอบออนไลน์
-- รันไฟล์นี้หนึ่งครั้งตอนติดตั้ง (ผ่าน Dashboard > D1 > Console หรือ wrangler)
-- boolean เก็บเป็นเลข 0/1
-- ============================================================

CREATE TABLE IF NOT EXISTS students (
  studentId TEXT PRIMARY KEY,
  title     TEXT,
  fullName  TEXT,
  level     TEXT,
  room      TEXT,
  number    TEXT,
  status    TEXT DEFAULT 'ใช้งาน'
);
CREATE INDEX IF NOT EXISTS idx_students_level_room ON students(level, room);

CREATE TABLE IF NOT EXISTS classes (
  classId TEXT PRIMARY KEY,
  level   TEXT,
  room    TEXT,
  note    TEXT
);

CREATE TABLE IF NOT EXISTS subjects (
  subjectId TEXT PRIMARY KEY,
  name      TEXT,
  status    TEXT DEFAULT 'ใช้งาน'
);

CREATE TABLE IF NOT EXISTS exams (
  examId           TEXT PRIMARY KEY,
  title            TEXT,
  subjectId        TEXT,
  level            TEXT,
  description      TEXT,
  numQuestions     INTEGER DEFAULT 0,
  totalScore       REAL DEFAULT 0,
  scorePerQuestion REAL DEFAULT 1,
  duration         INTEGER DEFAULT 0,
  openAt           TEXT,
  closeAt          TEXT,
  allowedRooms     TEXT,
  status           TEXT DEFAULT 'ปิด',
  shuffleQuestions INTEGER DEFAULT 0,
  shuffleChoices   INTEGER DEFAULT 0,
  showScore        INTEGER DEFAULT 1,
  allowRetake      INTEGER DEFAULT 0,
  showAnswers      INTEGER DEFAULT 0,
  academicYear     TEXT,
  createdAt        TEXT,
  updatedAt        TEXT
);

CREATE TABLE IF NOT EXISTS questions (
  questionId   TEXT PRIMARY KEY,
  examId       TEXT,
  ord          INTEGER DEFAULT 0,
  questionText TEXT,
  imageId      TEXT,
  score        REAL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_questions_exam ON questions(examId);

CREATE TABLE IF NOT EXISTS choices (
  choiceId   TEXT PRIMARY KEY,
  questionId TEXT,
  examId     TEXT,
  label      TEXT,
  choiceText TEXT,
  imageId    TEXT,
  isCorrect  INTEGER DEFAULT 0,
  ord        INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_choices_exam ON choices(examId);
CREATE INDEX IF NOT EXISTS idx_choices_question ON choices(questionId);

CREATE TABLE IF NOT EXISTS results (
  attemptId    TEXT PRIMARY KEY,
  examId       TEXT,
  studentId    TEXT,
  score        REAL DEFAULT 0,
  totalScore   REAL DEFAULT 0,
  percent      REAL DEFAULT 0,
  startedAt    TEXT,
  submittedAt  TEXT,
  durationUsed INTEGER DEFAULT 0,
  status       TEXT DEFAULT 'submitted',
  academicYear TEXT
);
CREATE INDEX IF NOT EXISTS idx_results_exam ON results(examId);
CREATE INDEX IF NOT EXISTS idx_results_student ON results(studentId);

CREATE TABLE IF NOT EXISTS answers (
  answerId      TEXT PRIMARY KEY,
  attemptId     TEXT,
  examId        TEXT,
  studentId     TEXT,
  questionId    TEXT,
  selectedLabel TEXT,
  isCorrect     INTEGER DEFAULT 0,
  score         REAL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_answers_exam ON answers(examId);
CREATE INDEX IF NOT EXISTS idx_answers_attempt ON answers(attemptId);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ---------- ข้อมูลเริ่มต้น ----------
INSERT OR IGNORE INTO subjects (subjectId, name, status) VALUES
  ('SUB_thai',    'ภาษาไทย', 'ใช้งาน'),
  ('SUB_math',    'คณิตศาสตร์', 'ใช้งาน'),
  ('SUB_sci',     'วิทยาศาสตร์และเทคโนโลยี', 'ใช้งาน'),
  ('SUB_social',  'สังคมศึกษา ศาสนาและวัฒนธรรม', 'ใช้งาน'),
  ('SUB_health',  'สุขศึกษาและพลศึกษา', 'ใช้งาน'),
  ('SUB_art',     'ศิลปะ', 'ใช้งาน'),
  ('SUB_work',    'การงานอาชีพ', 'ใช้งาน'),
  ('SUB_eng',     'ภาษาอังกฤษ', 'ใช้งาน');

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('schoolName', 'โรงเรียนบ้านใหม่'),
  ('academicYear', '2568'),
  ('primaryColor', '#2563eb');
