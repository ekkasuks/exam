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
  // URL ของ Backend — ใส่ได้ทั้ง 2 แบบ:
  //  (ก) Google Apps Script Web App (ลงท้าย /exec)
  //  (ข) Cloudflare Worker (เช่น https://exam-api.xxxx.workers.dev) — ดูวิธีย้ายที่ cloudflare/README.md
  GAS_URL: 'https://script.google.com/macros/s/AKfycbwIyh4ReTZlfvLuWgdOMxpsWLO8kDubWhr5qzecmJSpn-9R6GXomIg11KlHxMP8dTH7mw/exec',

  // ค่าที่แสดงบนหน้าเว็บ (ถ้า Backend ตั้งค่าไว้ ระบบจะดึงมาทับให้อัตโนมัติ)
  SCHOOL_NAME: 'โรงเรียนบ้านใหม่',
  ACADEMIC_YEAR: '2568',
  PRIMARY_COLOR: '#2563eb'
};
