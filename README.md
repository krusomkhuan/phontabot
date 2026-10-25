# น้องโพนต้า

LINE chatbot งานประชาสัมพันธ์ วิทยาลัยการอาชีพโพนทอง ใช้ Next.js 14, LINE SDK, Gemini และ Google Sheets CSV

## ติดตั้ง

1. ใช้ Node.js 22 ขึ้นไป รัน `npm install`
2. คัดลอก `.env.example` เป็น `.env.local` และใส่ค่าจริง ห้าม commit ไฟล์ค่าลับ
3. รัน `npm test`, `npm run typecheck`, `npm run build`
4. เชื่อม Vercel กับ repository นี้ เลือก Framework เป็น Next.js และ Root Directory เป็นโฟลเดอร์ที่มี package.json
5. เพิ่มค่าฝั่ง Production: `CHANNEL_ACCESS_TOKEN`, `CHANNEL_SECRET`, `Gemini_API_KEY`, `SHEET_CSV_URL` (ตัวพิมพ์ต้องตรง รวม Gemini_API_KEY)
6. Deploy ใหม่ แล้วตั้ง LINE Webhook URL เป็น `https://โดเมนจริง/api/webhook` กด Verify และเปิด Use webhook

ค่าเดิมที่ชื่อ LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN / GEMINI_API_KEY ไม่ถูกอ่านโดยโค้ดชุดนี้ ต้องใช้ชื่อด้านบน

## FAQ

หัวตารางต้องเป็น หมวดหมู่, คำถาม, คำตอบ ข้อมูลต้องเป็นข้อมูลเผยแพร่ได้ ดึงใหม่ทุก 60 วินาทีต่อ server instance ไม่ใช้ cache หมดอายุเมื่อดึงข้อมูลล้มเหลว

## พฤติกรรม

โมเดล gemini-3.5-flash, temperature 1.0, maxOutputTokens 1024 ไม่เปลี่ยนโมเดลอัตโนมัติ ไม่มีข้อมูลหรือบริการผิดพลาดตอบ: ขออภัยค่ะ น้องโพนต้ายังไม่มีข้อมูลเรื่องนี้ค่ะ

ตรวจลายเซ็นบน body ดิบก่อนอ่าน JSON; Verify ที่ events ว่างไม่เรียกบริการอื่น; บันทึกเหตุผลการจบและจำนวนโทเคนโดยไม่บันทึกข้อความผู้ใช้หรือค่าลับ ตั้งเป้ารวมภายใน 10 วินาที (ไม่ใช่การรับประกันเครือข่าย/cold start) รอส่ง reply ให้เสร็จก่อนตอบ HTTP; ไม่ลองส่ง replyToken ซ้ำหลังเกิดข้อผิดพลาด

## ขอบเขตและตรวจจริง

Prompt ช่วยจำกัดคำตอบแต่ไม่รับประกันว่า AI จะไม่ตอบผิด ต้องทดสอบคำถามจริง คำถามนอก FAQ และคำสั่งแทรกก่อนเปิดใช้งาน ไม่มีการเก็บประวัติผู้ใช้หรือฐานข้อมูลป้องกัน event ซ้ำข้าม instance รุ่นเริ่มต้นนี้ไม่ควรเปิด webhook redelivery จนเพิ่มการป้องกัน event ซ้ำแบบถาวร

หากโมเดลใช้ไม่ได้จะบันทึก error และส่งข้อความสำรอง ต้องตรวจใน AI Studio ว่าบัญชีรองรับชื่อโมเดลตามที่กำหนด ห้ามเปลี่ยนรุ่นเอง

ตรวจ Vercel Logs เมื่อผิดพลาด: 401 ตรวจ CHANNEL_SECRET; 500 ตรวจชื่อค่าตั้งค่า; ตอบสำรองตรวจ Sheet และสิทธิ์/โควตา Gemini; LINE ส่งไม่ได้ตรวจ CHANNEL_ACCESS_TOKEN

ทดสอบในเครื่องด้วย mocks/fixtures ไม่ถือว่าทดสอบกับ LINE, Gemini หรือ production สำเร็จ ต้องกด Verify และส่งข้อความจริงหลัง Deploy
