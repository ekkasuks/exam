/**
 * Utils.gs
 * ฟังก์ชันช่วยเหลือกลาง: อ่าน/เขียนชีตแบบ object, สร้าง ID, ตอบ JSON, ล็อก
 */

// ====== ตอบกลับเป็น JSON (ใช้ text/plain-friendly สำหรับ CORS แบบ simple request) ======
function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ok(data) {
  return jsonOutput({ ok: true, data: data === undefined ? null : data });
}

function fail(message, code) {
  return jsonOutput({ ok: false, error: message || 'เกิดข้อผิดพลาด', code: code || 'ERROR' });
}

// ====== สร้าง ID ======
function newId(prefix) {
  var ts = Date.now().toString(36);
  var rand = Math.floor(Math.random() * 1e6).toString(36);
  return (prefix || 'ID') + '_' + ts + rand;
}

/** สร้างรหัสนักเรียนอัตโนมัติแบบ S0001 โดยดูจากเลขสูงสุดที่มี */
function nextStudentCode(existingIds) {
  var max = 0;
  (existingIds || []).forEach(function (id) {
    var m = String(id).match(/^S(\d+)$/i);
    if (m) {
      var n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  });
  var next = max + 1;
  return 'S' + ('0000' + next).slice(-4);
}

// ====== อ่านชีตทั้งหมดเป็น array ของ object ======
function readAll(sheetName) {
  var sh = getSheet(sheetName);
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2) return [];
  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var obj = {};
    var hasData = false;
    for (var c = 0; c < headers.length; c++) {
      var key = headers[c];
      if (!key) continue;
      var v = values[i][c];
      obj[key] = v;
      if (v !== '' && v !== null) hasData = true;
    }
    obj.__row = i + 1; // เลขแถวจริงในชีต
    if (hasData) rows.push(obj);
  }
  return rows;
}

/** อ่านเฉพาะแถวที่ตรงเงื่อนไข (ลด IO ไม่ได้ แต่ลดการประมวลผลฝั่งเรียก) */
function findRows(sheetName, predicate) {
  return readAll(sheetName).filter(predicate);
}

function findOne(sheetName, predicate) {
  var rows = readAll(sheetName);
  for (var i = 0; i < rows.length; i++) {
    if (predicate(rows[i])) return rows[i];
  }
  return null;
}

/** แปลง object เป็นแถวตามลำดับ header */
function objToRow(sheetName, obj) {
  var headers = HEADERS[sheetName];
  return headers.map(function (h) {
    var v = obj[h];
    if (v === undefined || v === null) return '';
    return v;
  });
}

/** เพิ่มแถวใหม่ */
function appendRow(sheetName, obj) {
  var sh = getSheet(sheetName);
  sh.appendRow(objToRow(sheetName, obj));
  return obj;
}

/** เพิ่มหลายแถวทีเดียว (เร็วกว่า appendRow ทีละแถว) */
function appendRows(sheetName, objs) {
  if (!objs || !objs.length) return 0;
  var sh = getSheet(sheetName);
  var rows = objs.map(function (o) { return objToRow(sheetName, o); });
  var startRow = sh.getLastRow() + 1;
  sh.getRange(startRow, 1, rows.length, HEADERS[sheetName].length).setValues(rows);
  return rows.length;
}

/** อัปเดตแถวตาม __row */
function updateRowByNumber(sheetName, rowNumber, obj) {
  var sh = getSheet(sheetName);
  sh.getRange(rowNumber, 1, 1, HEADERS[sheetName].length).setValues([objToRow(sheetName, obj)]);
}

/** ลบแถวตาม __row */
function deleteRowByNumber(sheetName, rowNumber) {
  var sh = getSheet(sheetName);
  sh.deleteRow(rowNumber);
}

/** ลบหลายแถว (เรียงจากล่างขึ้นบนเพื่อไม่ให้เลขแถวเลื่อน) */
function deleteRowsByNumbers(sheetName, rowNumbers) {
  var sh = getSheet(sheetName);
  rowNumbers.sort(function (a, b) { return b - a; }).forEach(function (r) {
    sh.deleteRow(r);
  });
}

// ====== แคช (CacheService) เพื่อลดการอ่านชีตซ้ำ ======
// ใช้กับข้อมูลที่อ่านบ่อยและเปลี่ยนไม่บ่อย เช่น คำถาม/เฉลยของข้อสอบ
// ทุกฟังก์ชันกันพลาดด้วย try/catch — ถ้าแคชมีปัญหาให้ตกไปอ่านชีตตามปกติ
function cacheGet(key) {
  try {
    var v = CacheService.getScriptCache().get(key);
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
}

function cachePut(key, obj, ttlSeconds) {
  try {
    var s = JSON.stringify(obj);
    // CacheService จำกัด ~100KB ต่อคีย์ — ถ้าใหญ่เกินไปให้ข้าม (ไปอ่านชีตแทน)
    if (s.length < 95000) {
      CacheService.getScriptCache().put(key, s, ttlSeconds || 21600); // ค่าเริ่มต้น 6 ชม.
    }
  } catch (e) { /* ข้ามได้ */ }
}

function cacheDel(/* ...keys */) {
  try {
    var keys = Array.prototype.slice.call(arguments);
    CacheService.getScriptCache().removeAll(keys);
  } catch (e) { /* ข้ามได้ */ }
}

/** ล้างแคชของข้อสอบชุดหนึ่ง (เรียกเมื่อครูแก้/ลบข้อสอบ) */
function invalidateExamCache(examId) {
  cacheDel('tree_' + examId, 'score_' + examId);
}

// ====== ล็อกเพื่อกันเขียนชนกัน ======
// timeoutMs: เวลารอสูงสุดในการขอล็อก (ค่าเริ่มต้น 20 วินาที)
// สำหรับงานที่มีคนแย่งกันมาก (เช่น ส่งข้อสอบพร้อมกัน) ควรตั้งให้นานขึ้น
function withLock(fn, timeoutMs) {
  var lock = LockService.getScriptLock();
  var got = lock.tryLock(timeoutMs || 20000);
  if (!got) {
    throw new Error('ระบบกำลังมีผู้ใช้งานจำนวนมาก กรุณาลองใหม่อีกครั้ง');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ====== แปลงวันที่ ======
function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function nowISO() {
  return new Date().toISOString();
}

/** parse boolean จากค่าใน Sheet (TRUE/true/1/ใช่) */
function toBool(v) {
  if (v === true) return true;
  if (v === false || v === '' || v === null || v === undefined) return false;
  var s = String(v).toLowerCase().trim();
  return s === 'true' || s === '1' || s === 'yes' || s === 'ใช่' || s === 'y';
}

/** สับเปลี่ยนลำดับ array (Fisher–Yates) */
function shuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
