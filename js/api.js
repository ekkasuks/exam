/**
 * api.js
 * ตัวกลางเรียก Google Apps Script Web App
 * - ใช้ Content-Type: text/plain เพื่อเลี่ยง CORS preflight
 * - ส่ง action + พารามิเตอร์เป็น JSON ใน body
 */

const API = {
  /**
   * เรียก API หนึ่งคำสั่ง
   * @param {string} action ชื่อคำสั่ง เช่น 'studentLogin'
   * @param {object} params พารามิเตอร์
   * @returns {Promise<any>} data (throw error ถ้าไม่สำเร็จ)
   */
  async call(action, params = {}) {
    if (!CONFIG.GAS_URL || CONFIG.GAS_URL.indexOf('PASTE_YOUR') === 0) {
      throw new Error('ยังไม่ได้ตั้งค่า GAS_URL ใน js/config.js');
    }
    const body = JSON.stringify(Object.assign({ action }, params));
    let res;
    try {
      res = await fetch(CONFIG.GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
        redirect: 'follow'
      });
    } catch (e) {
      throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตหรือ GAS_URL');
    }
    let json;
    try {
      json = await res.json();
    } catch (e) {
      throw new Error('เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง (อาจยังไม่ได้ Deploy หรือสิทธิ์ไม่ถูกต้อง)');
    }
    if (!json.ok) {
      const err = new Error(json.error || 'เกิดข้อผิดพลาด');
      err.code = json.code;
      throw err;
    }
    return json.data;
  }
};

/** ดึง config สาธารณะจาก backend มาทับค่าใน CONFIG (ชื่อโรงเรียน/สี) */
async function applyPublicConfig() {
  try {
    const data = await API.call('getPublicConfig');
    if (data.schoolName) CONFIG.SCHOOL_NAME = data.schoolName;
    if (data.academicYear) CONFIG.ACADEMIC_YEAR = data.academicYear;
    if (data.primaryColor) {
      CONFIG.PRIMARY_COLOR = data.primaryColor;
      document.documentElement.style.setProperty('--primary', data.primaryColor);
    }
  } catch (e) {
    // ใช้ค่าเริ่มต้นใน config.js ต่อไป
  }
  // อัปเดตชื่อโรงเรียนบนหน้า (ถ้ามี element)
  document.querySelectorAll('[data-school-name]').forEach(el => {
    el.textContent = CONFIG.SCHOOL_NAME;
  });
}
