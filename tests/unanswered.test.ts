import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { recordUnanswered, redactQuestion, supportCommand } from '../lib/unanswered';
import { handleWebhook } from '../lib/webhook';
import { Client } from '@line/bot-sdk';

test('logs redact contacts, sign payload, and retry with a stable event identity', async()=>{
  assert.equal(redactQuestion('ติดต่อ a@example.com 081-234-5678'),'ติดต่อ [อีเมล] [หมายเลข]');
  process.env.UNANSWERED_LOG_URL='https://script.google.com/macros/s/test/exec';
  process.env.UNANSWERED_LOG_SECRET='signing-secret';
  const original=globalThis.fetch;const bodies:string[]=[];
  globalThis.fetch=async(_url,options)=>{
    bodies.push(String(options?.body));
    if(bodies.length===1)throw new Error('timeout');
    return Response.json({ok:true});
  };
  try {
    assert.equal(await recordUnanswered({question:'a@example.com',reason:'no_match',eventId:'event-a',timestamp:Date.now()}),true);
    assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);
    const envelope=JSON.parse(bodies[0]);
    assert.equal(envelope.signature,createHmac('sha256','signing-secret').update(envelope.payload).digest('hex'));
    const p=JSON.parse(envelope.payload);assert.equal(p.question,'[อีเมล]');assert.equal(p.reason,'no_match');
    assert.equal(p.eventId.length,64);assert.equal(p.userId,undefined);
    globalThis.fetch=async()=>Response.json({ok:false});
    assert.equal(await recordUnanswered({question:'test',reason:'no_match',eventId:'e',timestamp:Date.now()}),false);
  } finally {globalThis.fetch=original;delete process.env.UNANSWERED_LOG_URL;delete process.env.UNANSWERED_LOG_SECRET;}
});

test('webhook logs unmatched questions vs outages after replying, without group-chat collection',async()=>{
  process.env.CHANNEL_SECRET='secret';process.env.CHANNEL_ACCESS_TOKEN='token';
  process.env.UNANSWERED_LOG_URL='https://script.google.com/macros/s/test/exec';process.env.UNANSWERED_LOG_SECRET='secret';
  const origFetch=globalThis.fetch,origReply=Client.prototype.replyMessage;
  let replies=0;let failSheet=false;const reasons:string[]=[];
  globalThis.fetch=async(url,options)=>{
    if(String(url).includes('script.google.com')) {
      assert.ok(replies>0,'reply should happen before logging');
      reasons.push(JSON.parse(JSON.parse(String(options?.body)).payload).reason);
      return Response.json({ok:true});
    }
    if(failSheet)throw new Error('offline');
    return new Response('หมวดหมู่,คำถาม,คำตอบ\nทั่วไป,โทรศัพท์,043-571144');
  };
  Client.prototype.replyMessage=async function(){replies++;return {};};
  function request(source:object={type:'user'},text='มีสระว่ายน้ำไหม') {
    const body=JSON.stringify({events:[{type:'message',source,webhookEventId:'event',timestamp:Date.now(),replyToken:'reply',message:{id:'m',type:'text',text}}]});
    return new Request('https://example.org/api/webhook',{method:'POST',body,headers:{'x-line-signature':createHmac('sha256','secret').update(body).digest('base64')}});
  }
  try {
    process.env.SHEET_CSV_URL='https://example.org/unmatched.csv';
    assert.equal((await handleWebhook(request())).status,200);assert.deepEqual(reasons,['no_match']);
    failSheet=true;process.env.SHEET_CSV_URL='https://example.org/broken.csv';
    await handleWebhook(request());assert.deepEqual(reasons,['no_match','system_error']);
    await handleWebhook(request({type:'group',groupId:'Ctest'}));assert.equal(reasons.length,2);assert.equal(replies,2);
    await handleWebhook(request({type:'group',groupId:'Ctest'},'/group-id'));assert.equal(replies,3);assert.equal(reasons.length,2);
  } finally {globalThis.fetch=origFetch;Client.prototype.replyMessage=origReply;delete process.env.UNANSWERED_LOG_URL;delete process.env.UNANSWERED_LOG_SECRET;}
});

test('group FAQ commands require both authorized group and individual admin',async()=>{
  process.env.ADMIN_GROUP_ID='Cgroup';process.env.ADMIN_USER_IDS='Uadmin';
  process.env.UNANSWERED_LOG_URL='https://script.google.com/macros/s/test/exec';process.env.UNANSWERED_LOG_SECRET='secret';
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(_url,options)=>{calls++;const p=JSON.parse(JSON.parse(String(options?.body)).payload);assert.equal(p.adminUserId,'Uadmin');assert.equal(p.groupId,'Cgroup');return Response.json({ok:true,reply:'บันทึกแล้ว'});};
  try {
    assert.equal(await supportCommand('Cgroup','Ustranger','/คำถามค้าง'),null);
    assert.equal(await supportCommand('Cother','Uadmin','/คำถามค้าง'),null);
    assert.equal(await supportCommand('Cgroup',undefined,'/คำถามค้าง'),null);assert.equal(calls,0);
    assert.equal(await supportCommand('Cgroup','Uadmin','/คำถามค้าง'),'บันทึกแล้ว');
    assert.equal(await supportCommand('Cgroup','Uadmin','/ตอบ abcdef123456 | คำถาม | คำตอบ'),'บันทึกแล้ว');assert.equal(calls,2);
  } finally {globalThis.fetch=original;for(const key of ['ADMIN_GROUP_ID','ADMIN_USER_IDS','UNANSWERED_LOG_URL','UNANSWERED_LOG_SECRET'])delete process.env[key];}
});

test('/my-id works in group and private chat without FAQ or admin settings, and never grants rights',async()=>{
  process.env.CHANNEL_SECRET='identity-secret';process.env.CHANNEL_ACCESS_TOKEN='test-token';
  delete process.env.SHEET_CSV_URL;delete process.env.ADMIN_USER_IDS;delete process.env.ADMIN_GROUP_ID;
  const originalReply=Client.prototype.replyMessage,originalFetch=globalThis.fetch;
  const replies:string[]=[];
  Client.prototype.replyMessage=async function(_token,message:any){replies.push(message.text);return {};};
  globalThis.fetch=async()=>{throw new Error('identity commands must not call FAQ or logger');};
  async function send(source:object) {
    const body=JSON.stringify({events:[{type:'message',source,replyToken:'reply',message:{type:'text',text:'/my-id'}}]});
    return handleWebhook(new Request('https://example.org/api/webhook',{method:'POST',body,headers:{'x-line-signature':createHmac('sha256','identity-secret').update(body).digest('base64')}}));
  }
  try {
    await send({type:'group',groupId:'Cgroup',userId:'Uself'});
    await send({type:'user',userId:'Uprivate'});
    await send({type:'group',groupId:'Cgroup'});
    assert.equal(replies[0],'รหัสบัญชีของคุณ: Uself');assert.equal(replies[1],'รหัสบัญชีของคุณ: Uprivate');
    assert.ok(replies[2].includes('LINE ไม่ได้ส่งรหัสบัญชี'));
    assert.equal(process.env.ADMIN_USER_IDS,undefined);
  } finally {Client.prototype.replyMessage=originalReply;globalThis.fetch=originalFetch;}
});
