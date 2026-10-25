import { DEFAULT_REPLY } from './config';
import type { FAQ } from './sheet';

const concepts: Record<string,RegExp> = {
  hours:/กี่โมง|เวลาเปิด|เวลาทำการ|เปิดทำการ|ปิดทำการ|วันหยุด|วันเสาร์|วันอาทิตย์/,
  contact:/ติดต่อ|เบอร์|โทรศัพท์|โทรหา|ช่องทาง|ไลน์|line|เฟซบุ๊ก|facebook/,
  admissionPeriod:/เมื่อไร|เมื่อไหร่|ช่วงไหน|วันไหน|กำหนด|รับสมัคร|เปิดรับ|ปิดรับ/,
  documents:/เอกสาร|หลักฐาน|เตรียมอะไร|ใช้อะไร|ต้องเตรียม|สำเนา/,
  programs:/สาขา|แผนก|หลักสูตร|เรียนอะไร|ช่างอะไร/,
  fees:/ค่าเทอม|ค่าเรียน|ค่าใช้จ่าย|ค่าธรรมเนียม|ค่าบำรุง|เทอมละ|เสียเงิน/,
  clubs:/ชมรม|กิจกรรม/,
  scholarships:/ทุนการศึกษา|ขอทุน|มีทุน|กยศ/,
  location:/ที่ตั้ง|อยู่ที่ไหน|ที่อยู่|เดินทาง|แผนที่/,
  dormitory:/หอพัก|ที่พัก/,
  employment:/สมัครงาน|ตำแหน่งงาน|รับพนักงาน/,
};
export function normalizeQuestion(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/\s+/g,'').replace(/[\p{P}\p{S}]/gu,'').replace(/(?:ครับ|ค่ะ|คะ|นะ|หน่อย|บ้าง|จ้า|จ๊ะ)/g,'');
}
function intent(text: string): Set<string> {
  return new Set(Object.entries(concepts).filter(([,re])=>re.test(text)).map(([name])=>name));
}
function dice(a: string,b: string): number {
  const grams=(text: string)=>new Set(Array.from({length:Math.max(0,text.length-1)},(_,i)=>text.slice(i,i+2)));
  const x=grams(a),y=grams(b);
  return x.size+y.size ? 2*[...x].filter(g=>y.has(g)).length/(x.size+y.size) : 0;
}
function choose(rows: FAQ[]): string {
  const answers=[...new Set(rows.map(row=>row.answer.trim()))];
  return answers.length===1 && answers[0].length<=4500 ? answers[0] : DEFAULT_REPLY;
}

// This is conservative text matching, not semantic AI. Never invent an answer.
export function findAnswer(question: string, rows: FAQ[]): string {
  const query=normalizeQuestion(question);
  if (!query || query.length>5000) return DEFAULT_REPLY;
  const exact=rows.filter(row=>normalizeQuestion(row.question)===query);
  if(exact.length) return choose(exact);
  const wanted=intent(query);
  if(wanted.size) {
    // A specific topic must appear in the FAQ question; category alone cannot
    // turn a question about documents into an answer about admission dates.
    const matched=rows.filter(row=>{
      const available=intent(normalizeQuestion(row.question));
      return [...wanted].every(topic=>available.has(topic));
    });
    if(matched.length) return choose(matched);
    return DEFAULT_REPLY;
  }
  // For new topics added to the sheet, accept only a strong spelling match
  // with a clear lead, rather than returning the nearest unrelated answer.
  if(query.length<8) return DEFAULT_REPLY;
  const ranked=rows.map(row=>({row,score:dice(query,normalizeQuestion(row.question))})).sort((a,b)=>b.score-a.score);
  const best=ranked[0];
  if(!best || best.score<0.78) return DEFAULT_REPLY;
  if(ranked[1] && best.score-ranked[1].score<0.12 && best.row.answer!==ranked[1].row.answer) return DEFAULT_REPLY;
  return choose([best.row]);
}
