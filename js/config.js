/**
 * config.js
 * -------------------------------------------------------------
 * ไฟล์ตั้งค่าหลักของระบบ — แก้ค่าตรงนี้หลัง Deploy Google Apps Script
 *
 * *** สิ่งที่ต้องแก้ก่อนใช้งานจริง ***
 * 1) GAS_URL      : URL ของ Web App (ลงท้ายด้วย /exec)
 * 2) SCHOOL_NAME  : ชื่อโรงเรียน (แก้ให้ตรงกับโรงเรียนของคุณ)
 *
 * หมายเหตุด้านความปลอดภัย:
 *  - ห้ามใส่ "รหัสครู" ไว้ในไฟล์นี้ (รหัสครูอยู่ใน Google Apps Script เท่านั้น)
 *  - Spreadsheet ID ไม่ต้องใส่ในนี้ (Backend จัดการเอง)
 */
const CONFIG = {
  // วาง URL ของ Google Apps Script Web App ที่ Deploy แล้ว (ลงท้าย /exec)
  GAS_URL: 'https://script.google.com/macros/s/AKfycbx2AaVlPSl4MFdCkiRSpzOQcd8NG9MnXBx1Yn-5yVo2I2yIX71BPNzltTq7G2scx6q6pg/exec',

  // ค่าที่แสดงบนหน้าเว็บ (ถ้า Backend ตั้งค่าไว้ ระบบจะดึงมาทับให้อัตโนมัติ)
  SCHOOL_NAME: 'โรงเรียนบ้านใหม่',
  ACADEMIC_YEAR: '2568',
  PRIMARY_COLOR: '#2563eb'
};
