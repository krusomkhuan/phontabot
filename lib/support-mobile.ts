import {createHmac,timingSafeEqual} from 'node:crypto';
export type FormAccess={id:string;adminUserId:string;groupId:string;expires:number};
export function authorizedAdmin(groupId:string,userId:string|undefined):boolean {
  return !!userId && groupId===process.env.ADMIN_GROUP_ID?.trim() && (process.env.ADMIN_USER_IDS||'').split(',').map(x=>x.trim()).includes(userId);
}
export function formToken(access:FormAccess):string {
  const data=Buffer.from(JSON.stringify(access)).toString('base64url');
  return data+'.'+createHmac('sha256',process.env.UNANSWERED_LOG_SECRET||'').update('mobile:'+data).digest('base64url');
}
export function readFormToken(token:string):FormAccess|null {
  try {
    if(!process.env.UNANSWERED_LOG_SECRET||token.length>2000)return null;
    const [data,signature,...rest]=token.split('.');if(rest.length||!data||!signature)return null;
    const sig=Buffer.from(signature,'base64url'),expected=createHmac('sha256',process.env.UNANSWERED_LOG_SECRET).update('mobile:'+data).digest();
    if(sig.length!==expected.length||!timingSafeEqual(sig,expected))return null;
    const p=JSON.parse(Buffer.from(data,'base64url').toString()) as FormAccess;
    if(!/^[a-f0-9]{12}$/.test(p.id)||!authorizedAdmin(p.groupId,p.adminUserId)||!Number.isFinite(p.expires)||p.expires<Date.now()||p.expires>Date.now()+31*60000)return null;
    return p;
  } catch{return null;}
}
export async function supportRequest(data:Record<string,unknown>):Promise<any> {
  const url=process.env.UNANSWERED_LOG_URL?.trim(),secret=process.env.UNANSWERED_LOG_SECRET?.trim();
  if(!url||!secret)throw Error('not-configured');
  const parsed=new URL(url);if(parsed.origin!=='https://script.google.com'||!/^\/macros\/s\/[\w-]+\/exec$/.test(parsed.pathname))throw Error('invalid-url');
  const payload=JSON.stringify({...data,sentAt:Date.now()}),signature=createHmac('sha256',secret).update(payload).digest('hex');
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,signature}),cache:'no-store',signal:AbortSignal.timeout(6000)});
  const result=await response.json();if(!response.ok||result.ok!==true)throw Error('receiver-failed');return result;
}
export async function approveMobile(groupId:string,userId:string|undefined,data:string):Promise<string|null> {
  if(!authorizedAdmin(groupId,userId))return null;
  const match=/^(approve|reject):([a-f0-9-]{36})$/.exec(data);if(!match)return null;
  try {return (await supportRequest({action:match[1],draftId:match[2],groupId,adminUserId:userId})).reply;}
  catch{return 'ยังยืนยันผลไม่ได้ค่ะ กรุณากดปุ่มเดิมอีกครั้ง ระบบจะตรวจสอบก่อนบันทึกซ้ำ';}
}
