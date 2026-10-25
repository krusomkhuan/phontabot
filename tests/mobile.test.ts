import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formToken,readFormToken,approveMobile} from '../lib/support-mobile';
import {POST} from '../app/api/support-form/route';
test('mobile links expire, cannot be tampered with, and are revoked with admin access',()=>{
  process.env.UNANSWERED_LOG_SECRET='secret';process.env.ADMIN_GROUP_ID='Cg';process.env.ADMIN_USER_IDS='Ua';
  const p={id:'abcdef123456',adminUserId:'Ua',groupId:'Cg',expires:Date.now()+60000};const t=formToken(p);
  assert.deepEqual(readFormToken(t),p);assert.equal(readFormToken(t+'bad'),null);
  assert.equal(readFormToken(formToken({...p,expires:Date.now()-1})),null);
  assert.equal(readFormToken(formToken({...p,groupId:'Cother'})),null);
  process.env.ADMIN_USER_IDS='Uother';assert.equal(readFormToken(t),null);
});
test('mobile submission stores a draft and asks LINE for confirmation, never writes FAQ directly',async()=>{
  process.env.UNANSWERED_LOG_SECRET='secret';process.env.ADMIN_GROUP_ID='Cg';process.env.ADMIN_USER_IDS='Ua';process.env.CHANNEL_ACCESS_TOKEN='token';process.env.UNANSWERED_LOG_URL='https://script.google.com/macros/s/test/exec';
  const token=formToken({id:'abcdef123456',adminUserId:'Ua',groupId:'Cg',expires:Date.now()+60000});
  const original=globalThis.fetch;let drafts=0,pushes=0;
  globalThis.fetch=async(url,options)=>{
    const body=JSON.parse(String(options?.body));
    if(String(url).includes('script.google.com')){const p=JSON.parse(body.payload);assert.equal(p.action,'draft');assert.equal(p.adminUserId,'Ua');drafts++;return Response.json({ok:true,draft:{id:'00000000-0000-4000-8000-000000000001',question:'คำถาม',answer:'คำตอบ'}});}
    pushes++;assert.equal(body.to,'Cg');assert.ok(body.messages[1].template.actions[0].data.startsWith('approve:'));return new Response(null,{status:200});
  };
  const request=(extra:object={})=>new Request('https://example.org/api/support-form',{method:'POST',body:JSON.stringify({action:'draft',token,question:'คำถาม',answer:'คำตอบ',confirmed:true,...extra})});
  try{
    assert.equal((await POST(request({confirmed:false}))).status,400);assert.equal(drafts,0);
    assert.equal((await POST(request({action:'answer'}))).status,400);
    assert.equal((await POST(request())).status,200);assert.equal(drafts,1);assert.equal(pushes,1);
    assert.equal(await approveMobile('Cg','Ustranger','approve:00000000-0000-4000-8000-000000000001'),null);
  }finally{globalThis.fetch=original;}
});
