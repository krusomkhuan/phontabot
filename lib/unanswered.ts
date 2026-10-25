import { createHash, createHmac } from 'node:crypto';

export type FailureReason = 'no_match' | 'system_error';
export async function supportCommand(groupId:string, userId:string|undefined, text:string):Promise<string|null> {
  const admins=(process.env.ADMIN_USER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
  if (!userId || !admins.includes(userId) || !process.env.ADMIN_GROUP_ID || groupId!==process.env.ADMIN_GROUP_ID.trim()) return null;
  let action:'list'|'answer'; let id='',question='',answer='';
  if (text.trim()==='/คำถามค้าง') action='list';
  else if (text.trim().startsWith('/ตอบ ')) {
    const parts=text.trim().slice(5).split('|').map(s=>s.trim());
    if (parts.length!==3 || !/^[a-f0-9]{12}$/.test(parts[0]) || !parts[1] || !parts[2] || parts[1].length>500 || parts[2].length>4000)
      return 'ใช้รูปแบบ /ตอบ รหัสคำถาม | คำถามสำหรับ FAQ | คำตอบที่ตรวจสอบแล้ว';
    [id,question,answer]=parts;action='answer';
  } else return null;
  const url=process.env.UNANSWERED_LOG_URL?.trim(),secret=process.env.UNANSWERED_LOG_SECRET?.trim();
  if (!url||!secret)return 'ระบบบันทึกยังไม่ได้เชื่อมต่อ Google ค่ะ';
  try {
    const parsed=new URL(url);
    if(parsed.origin!=='https://script.google.com'||!/^\/macros\/s\/[\w-]+\/exec$/.test(parsed.pathname))throw new Error();
    const payload=JSON.stringify({action,groupId,adminUserId:userId,id,question,answer,sentAt:Date.now()});
    const signature=createHmac('sha256',secret).update(payload).digest('hex');
    for(let attempt=0;attempt<2;attempt++) {
      try {
        const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,signature}),signal:AbortSignal.timeout(2500),cache:'no-store'});
        const data=await response.json();
        if(!response.ok||data.ok!==true||typeof data.reply!=='string')throw new Error();
        return data.reply.slice(0,4500);
      } catch {if(attempt===1)throw new Error();}
    }
  } catch {console.error(JSON.stringify({service:'support-command',status:'failed'}));}
  return 'ยังยืนยันการบันทึกไม่ได้ค่ะ กรุณาพิมพ์ /คำถามค้าง เพื่อตรวจสอบก่อนส่งซ้ำ';
}
// No user ID or profile is transmitted. Redaction is best effort, not a privacy guarantee.
export function redactQuestion(text: string): string {
  return text.normalize('NFC').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[อีเมล]')
    .replace(/(?:\+?\d[\d\s()-]{7,}\d)/g, '[หมายเลข]').slice(0, 500);
}
export async function recordUnanswered(input: { question: string; reason: FailureReason; eventId: string; timestamp: number }): Promise<boolean> {
  const url = process.env.UNANSWERED_LOG_URL?.trim();
  const secret = process.env.UNANSWERED_LOG_SECRET?.trim();
  if (!url || !secret) { console.warn(JSON.stringify({service:'unanswered',status:'not_configured'})); return false; }
  try {
    const parsed = new URL(url);
    if (parsed.origin !== 'https://script.google.com' || !/^\/macros\/s\/[\w-]+\/exec$/.test(parsed.pathname)) throw new Error('invalid-log-url');
    const payload = JSON.stringify({question:redactQuestion(input.question),reason:input.reason,
      eventId:createHash('sha256').update(input.eventId).digest('hex'),
      timestamp:input.timestamp,sentAt:Date.now()});
    const signature = createHmac('sha256',secret).update(payload).digest('hex');
    // Same event ID on retry: receiver must deduplicate persistently.
    for (let attempt=0;attempt<2;attempt++) {
      try {
        const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({payload,signature}),signal:AbortSignal.timeout(1800),redirect:'follow',cache:'no-store'});
        if (!response.ok || (await response.json()).ok!==true) throw new Error('log-rejected');
        return true;
      } catch { if (attempt===1) throw new Error('log-unavailable'); }
    }
  } catch {console.error(JSON.stringify({service:'unanswered',status:'failed'}));}
  return false;
}
