/**
 * api.js
 * ตัวกลางเรียก Google Apps Script Web App
 * - ใช้ Content-Type: text/plain เพื่อเลี่ยง CORS preflight
 * - ส่ง action + พารามิเตอร์เป็น JSON ใน body
 */

const API = {
  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

  /**
   * เรียก API หนึ่งคำสั่ง
   * @param {string} action ชื่อคำสั่ง เช่น 'studentLogin'
   * @param {object} params พารามิเตอร์
   * @param {object} opts   ตัวเลือก เช่น { retry: 1 } (ลองใหม่เมื่อเน็ต/เซิร์ฟเวอร์สะดุด)
   *                        *ใช้ retry เฉพาะการ "อ่าน" เท่านั้น ไม่ใช้กับการส่งข้อสอบ*
   * @returns {Promise<any>} data (throw error ถ้าไม่สำเร็จ)
   */
  async call(action, params = {}, opts = {}) {
    if (!CONFIG.GAS_URL || CONFIG.GAS_URL.indexOf('PASTE_YOUR') === 0) {
      throw new Error('ยังไม่ได้ตั้งค่า GAS_URL ใน js/config.js');
    }
    const body = JSON.stringify(Object.assign({ action }, params));
    const retries = Math.max(0, opts.retry || 0);

    for (let attempt = 0; attempt <= retries; attempt++) {
      let res;
      try {
        res = await fetch(CONFIG.GAS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body,
          redirect: 'follow'
        });
      } catch (e) {
        // เน็ตสะดุด — ลองใหม่ได้ (request ยังไม่ถึงเซิร์ฟเวอร์)
        if (attempt < retries) { await this._sleep(700); continue; }
        throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตหรือ GAS_URL');
      }

      let json;
      try {
        json = await res.json();
      } catch (e) {
        if (attempt < retries) { await this._sleep(700); continue; }
        throw new Error('เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง (อาจยังไม่ได้ Deploy หรือสิทธิ์ไม่ถูกต้อง)');
      }

      if (!json.ok) {
        // error ระดับแอป (เช่น สิทธิ์/ข้อมูล) — ไม่ต้องลองใหม่ เพราะผลเหมือนเดิม
        const err = new Error(json.error || 'เกิดข้อผิดพลาด');
        err.code = json.code;
        throw err;
      }
      return json.data;
    }
  }
};

/**
 * ดึง config สาธารณะ (ชื่อโรงเรียน/ปีการศึกษา/สี) มาทับค่าใน CONFIG
 * แคชไว้ใน localStorage 24 ชม. เพื่อ "ไม่ยิง GAS ทุกครั้งที่เปิดหน้า" (ลดภาระเซิร์ฟเวอร์)
 */
async function applyPublicConfig() {
  const CACHE_KEY = 'exam_pubcfg';
  const MAX_AGE = 24 * 3600 * 1000; // 24 ชม.

  // 1) ใช้ค่าจากแคชก่อน (ถ้ามีและยังไม่หมดอายุ) — ไม่ต้องรอเน็ต
  let cached = null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj && obj.t && (Date.now() - obj.t) < MAX_AGE) cached = obj.data;
    }
  } catch (e) { /* ไม่มีแคชก็ไม่เป็นไร */ }

  if (cached) {
    applyConfigValues(cached);
    return; // มีแคชสดแล้ว ไม่ต้องเรียก GAS
  }

  // 2) ไม่มีแคช/หมดอายุ — เรียกครั้งเดียวแล้วเก็บแคช
  try {
    const data = await API.call('getPublicConfig', {}, { retry: 1 });
    applyConfigValues(data);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data: data })); } catch (e) {}
  } catch (e) {
    // ใช้ค่าเริ่มต้นใน config.js ต่อไป
    applyConfigValues({});
  }
}

function applyConfigValues(data) {
  data = data || {};
  if (data.schoolName) CONFIG.SCHOOL_NAME = data.schoolName;
  if (data.academicYear) CONFIG.ACADEMIC_YEAR = data.academicYear;
  if (data.primaryColor) {
    CONFIG.PRIMARY_COLOR = data.primaryColor;
    document.documentElement.style.setProperty('--primary', data.primaryColor);
  }
  document.querySelectorAll('[data-school-name]').forEach(el => {
    el.textContent = CONFIG.SCHOOL_NAME;
  });
}
