import { createHmac, timingSafeEqual } from 'node:crypto';
export const runtime='nodejs';
export const maxDuration=15;
export async function POST(request:Request):Promise<Response> {
  const secret=process.env.UNANSWERED_LOG_SECRET?.trim(),group=process.env.ADMIN_GROUP_ID?.trim(),token=process.env.CHANNEL_ACCESS_TOKEN?.trim();
  if(!secret||!group||!token)return Response.json({ok:false},{status:503});
  try {
    const raw=await request.text();if(raw.length>20000)return new Response(null,{status:413});
    const envelope=JSON.parse(raw);
    if(typeof envelope.payload!=='string'||!/^[a-f0-9]{64}$/.test(envelope.signature||''))return new Response(null,{status:401});
    const expected=createHmac('sha256',secret).update(envelope.payload).digest();
    if(!timingSafeEqual(expected,Buffer.from(envelope.signature,'hex')))return new Response(null,{status:401});
    const p=JSON.parse(envelope.payload);
    if(p.groupId!==group||!Number.isFinite(p.sentAt)||Math.abs(Date.now()-p.sentAt)>300000||typeof p.text!=='string'||!p.text.trim()||p.text.length>4500||!/^[a-f0-9-]{36}$/.test(p.retryKey||''))return Response.json({ok:false},{status:400});
    const result=await fetch('https://api.line.me/v2/bot/message/push',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,'X-Line-Retry-Key':p.retryKey},body:JSON.stringify({to:group,messages:[{type:'text',text:p.text}]}),signal:AbortSignal.timeout(6000)});
    if(result.ok||result.status===409)return Response.json({ok:true});
    console.error(JSON.stringify({service:'daily-summary',status:result.status}));
    return Response.json({ok:false},{status:502});
  } catch {return Response.json({ok:false},{status:502});}
}
