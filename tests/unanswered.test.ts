import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { recordUnanswered, redactQuestion } from '../lib/unanswered';
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
