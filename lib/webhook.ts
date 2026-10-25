import { validateSignature, Client, type WebhookEvent } from '@line/bot-sdk';
import { DEFAULT_REPLY, required, logError } from './config';
import { getFAQ } from './sheet';
import { findAnswer } from './faq';
import { recordUnanswered, supportCommand, type FailureReason } from './unanswered';
import { createHash } from 'node:crypto';
import { approveMobile } from './support-mobile';
export async function handleWebhook(request: Request): Promise<Response> {
  let secret: string;
  try {secret=required('CHANNEL_SECRET');} catch {console.error('missing:CHANNEL_SECRET');return Response.json({error:'Configuration missing'},{status:500});}
  const raw=await request.text();
  if (raw.length>1000000) return new Response(null,{status:413});
  const signature=request.headers.get('x-line-signature');
  if (!signature || !validateSignature(raw,secret,signature)) return new Response(null,{status:401});
  let events: WebhookEvent[];
  try {
    const body=JSON.parse(raw);
    if (!Array.isArray(body.events)) throw new Error();
    events=body.events;
    if (events.some(e=>!e || typeof e!=='object')) throw new Error();
  } catch {return new Response(null,{status:400});}
  if (!events.length) return Response.json({ok:true});
  const texts=events.filter(e=>e.type==='message' && e.message?.type==='text' && e.replyToken);
  const postbacks=events.filter(e=>e.type==='postback' && e.replyToken);
  if (!texts.length&&!postbacks.length) return Response.json({ok:true});
  try {required('CHANNEL_ACCESS_TOKEN');} catch(error) {console.error(error instanceof Error ? error.message : 'missing-config');return new Response(null,{status:500});}
  const client=new Client({channelAccessToken:required('CHANNEL_ACCESS_TOKEN'),httpConfig:{timeout:2000}});
  const approvals=await Promise.all(postbacks.map(async e=>{
    if(e.type!=='postback'||e.source.type!=='group')return true;
    const reply=await approveMobile(e.source.groupId,e.source.userId,e.postback.data);
    if(!reply)return true;
    try{await client.replyMessage(e.replyToken,{type:'text',text:reply});return true;}catch(error){logError('line',error);return false;}
  }));
  const results=await Promise.all(texts.map(async event=>{
    if (event.type!=='message' || event.message.type!=='text') return true;
    if(event.message.text.trim()==='/my-id') {
      const userId=event.source?.userId;
      const text=userId?`รหัสบัญชีของคุณ: ${userId}`:'LINE ไม่ได้ส่งรหัสบัญชีของผู้ส่งมาค่ะ กรุณาเพิ่มน้องโพนต้าเป็นเพื่อนแล้วส่ง /my-id ในแชตส่วนตัวอีกครั้ง';
      try {await client.replyMessage(event.replyToken,{type:'text',text});return true;}catch(error){logError('line',error);return false;}
    }
    // Group chats are for the support team, not another FAQ conversation.
    if (event.source?.type==='group' || event.source?.type==='room') {
      if (event.message.text.trim()==='/group-id' && event.source.type==='group') {
        try {await client.replyMessage(event.replyToken,{type:'text',text:`รหัสกลุ่มนี้: ${event.source.groupId}`});} catch(error) {logError('line',error);return false;}
      } else if(event.source.type==='group') {
        const reply=await supportCommand(event.source.groupId,event.source.userId,event.message.text);
        if(reply)try {await client.replyMessage(event.replyToken,{type:'text',text:reply});}catch(error){logError('line',error);return false;}
      }
      return true;
    }
    let text=DEFAULT_REPLY;
    let reason: FailureReason='no_match';
    try {
      const faq=await getFAQ();
      text=findAnswer(event.message.text,faq);
      console.info(JSON.stringify({service:'faq',rows:faq.length,matched:text!==DEFAULT_REPLY}));
    } catch(error) {reason='system_error';logError('answer',error,[event.message.text]);}
    let replied=true;
    try {await client.replyMessage(event.replyToken,{type:'text',text});}
    catch(error) {logError('line',error);replied=false;}
    // Reply first; logging failures must never block the user's fallback reply.
    if (text===DEFAULT_REPLY) {
      await recordUnanswered({question:event.message.text,reason,
        eventId:event.webhookEventId || event.message.id || createHash('sha256').update(raw).digest('hex'),
        timestamp:Number.isFinite(event.timestamp)?event.timestamp:Date.now()});
    }
    return replied;
  }));
  // Acknowledge delivery to avoid replaying replies for already processed events.
  return Response.json({ok:true,replyFailures:[...results,...approvals].filter(x=>!x).length});
}
