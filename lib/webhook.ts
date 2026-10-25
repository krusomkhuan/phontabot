import { validateSignature, Client, type WebhookEvent } from '@line/bot-sdk';
import { DEFAULT_REPLY, required, logError } from './config';
import { getFAQ } from './sheet';
import { answerQuestion } from './gemini';
export async function handleWebhook(request: Request): Promise<Response> {
  const started=Date.now();
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
  if (!texts.length) return Response.json({ok:true});
  try {for (const name of ['CHANNEL_ACCESS_TOKEN','Gemini_API_KEY','SHEET_CSV_URL']) required(name);} catch(error) {console.error(error instanceof Error ? error.message : 'missing-config');return new Response(null,{status:500});}
  const client=new Client({channelAccessToken:required('CHANNEL_ACCESS_TOKEN'),httpConfig:{timeout:2000}});
  const results=await Promise.all(texts.map(async event=>{
    if (event.type!=='message' || event.message.type!=='text') return true;
    let text=DEFAULT_REPLY;
    try {
      const faq=await getFAQ();
      const remaining=7500-(Date.now()-started);
      if (remaining>100 && event.message.text.length<=5000) text=await answerQuestion(event.message.text,faq,remaining);
    } catch(error) {logError('answer',error,[event.message.text]);}
    try {await client.replyMessage(event.replyToken,{type:'text',text});return true;}
    catch(error) {logError('line',error);return false;}
  }));
  // Acknowledge delivery to avoid replaying replies for already processed events.
  return Response.json({ok:true,replyFailures:results.filter(x=>!x).length});
}
