import {readFormToken,supportRequest} from '../../../lib/support-mobile';
export const runtime='nodejs';
export const maxDuration=20;
export async function POST(request:Request):Promise<Response> {
  try {
    const raw=await request.text();if(raw.length>25000)return Response.json({error:'ข้อมูลยาวเกินไป'},{status:413});
    const body=JSON.parse(raw),access=readFormToken(body.token||'');
    if(!access)return Response.json({error:'ลิงก์หมดอายุหรือไม่มีสิทธิ์ กรุณาส่ง /คำถามค้าง ใน LINE เพื่อรับลิงก์ใหม่'},{status:401});
    if(body.action==='get') {
      const result=await supportRequest({...access,action:'get'});
      return Response.json({question:result.question||'',error:result.error||null},{headers:{'Cache-Control':'no-store'}});
    }
    if(body.action!=='draft'||typeof body.question!=='string'||!body.question.trim()||body.question.length>500||typeof body.answer!=='string'||!body.answer.trim()||body.answer.length>4000||body.confirmed!==true)
      return Response.json({error:'กรุณากรอกคำถาม คำตอบ และตรวจยืนยันข้อมูล'},{status:400});
    const result=await supportRequest({...access,action:'draft',question:body.question.trim(),answer:body.answer.trim()});
    if(result.error)return Response.json({error:result.error},{status:409});
    const draft=result.draft;
    const response=await fetch('https://api.line.me/v2/bot/message/push',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.CHANNEL_ACCESS_TOKEN,'X-Line-Retry-Key':draft.id},body:JSON.stringify({to:access.groupId,messages:[{type:'text',text:('ตรวจคำตอบก่อนเพิ่ม FAQ สาธารณะ\nคำถาม: '+draft.question+'\n\nคำตอบ: '+draft.answer+'\n\nให้ผู้ส่งแบบฟอร์มกด “ยืนยันเพิ่มคำตอบ” ด้านล่าง').slice(0,4900),quickReply:{items:[{type:'action',action:{type:'postback',label:'ยืนยันเพิ่มคำตอบ',data:'approve:'+draft.id,displayText:'ยืนยันเพิ่มคำตอบ'}},{type:'action',action:{type:'postback',label:'ยกเลิกร่างนี้',data:'reject:'+draft.id,displayText:'ยกเลิกร่างคำตอบ'}}]}}]}),signal:AbortSignal.timeout(6000)});
    if(!response.ok&&response.status!==409)return Response.json({error:'เก็บร่างแล้ว แต่ส่งไป LINE ไม่สำเร็จ กรุณากดส่งอีกครั้ง'},{status:502});
    return Response.json({ok:true,message:'ส่งร่างไป LINE แล้ว กลับไปที่กลุ่มและกด “ยืนยันเพิ่มคำตอบ” ด้วยบัญชีผู้ดูแลของคุณ จึงจะบันทึกลง FAQ'});
  } catch {return Response.json({error:'ยังเชื่อมต่อไม่ได้ กรุณาลองอีกครั้ง หากส่งร่างแล้วให้ตรวจใน LINE ก่อน'},{status:502});}
}
