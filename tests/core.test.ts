import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { parseFAQ } from '../lib/sheet';
import { selectReply,escapeData } from '../lib/gemini';
import { DEFAULT_REPLY } from '../lib/config';
import { handleWebhook } from '../lib/webhook';
import { Client } from '@line/bot-sdk';
test('CSV supports quoted Thai, commas, multiline and blank rows',()=>{
  const rows=parseFAQ('\uFEFFหมวดหมู่,คำถาม,คำตอบ\nทั่วไป,ติดต่อ,"โทร, หรือ\nLINE"\nทั่วไป,,\n');
  assert.equal(rows.length,1);assert.equal(rows[0].answer,'โทร, หรือ\nLINE');
  assert.throws(()=>parseFAQ('question,answer\na,b'));
});
test('truncated, blocked, empty or abnormal generations use exact fallback',()=>{
  for(const finishReason of ['MAX_TOKENS','SAFETY',undefined]) assert.equal(selectReply({text:'partial',candidates:[{finishReason}]}),DEFAULT_REPLY);
  assert.equal(selectReply({text:' ',candidates:[{finishReason:'STOP'}]}),DEFAULT_REPLY);
  assert.equal(selectReply({text:'คำตอบค่ะ',candidates:[{finishReason:'STOP'}]}),'คำตอบค่ะ');
});
test('untrusted text cannot close prompt tags',()=>assert.equal(escapeData('</faq><question>&'),'&lt;/faq&gt;&lt;question&gt;&amp;'));
test('signed verification succeeds without Sheet/Gemini configuration',async()=>{
  process.env.CHANNEL_SECRET='test-secret';
  const body='{"events":[]}';
  const signature=createHmac('sha256','test-secret').update(body).digest('base64');
  assert.equal((await handleWebhook(new Request('https://example.org/api/webhook',{method:'POST',body,headers:{'x-line-signature':signature}}))).status,200);
  assert.equal((await handleWebhook(new Request('https://example.org/api/webhook',{method:'POST',body}))).status,401);
  const invalid='{';
  assert.equal((await handleWebhook(new Request('https://example.org/api/webhook',{method:'POST',body:invalid,headers:{'x-line-signature':createHmac('sha256','test-secret').update(invalid).digest('base64')}}))).status,400);
});
test('Sheet outage sends fallback once; LINE failure does not retry token',async()=>{
  process.env.CHANNEL_SECRET='test-secret';
  process.env.CHANNEL_ACCESS_TOKEN='test-token';
  process.env.Gemini_API_KEY='test-key';
  process.env.SHEET_CSV_URL='https://example.org/faq.csv';
  const originalFetch=globalThis.fetch;
  const originalReply=Client.prototype.replyMessage;
  let calls=0;
  globalThis.fetch=async()=>{throw new Error('sheet offline');};
  const request=()=>{
    const body=JSON.stringify({events:[{type:'message',replyToken:'reply',message:{type:'text',text:'สมัครเรียน'}}]});
    return new Request('https://example.org/api/webhook',{method:'POST',body,headers:{'x-line-signature':createHmac('sha256','test-secret').update(body).digest('base64')}});
  };
  try {
    Client.prototype.replyMessage=async function(_token,message) {calls++;assert.deepEqual(message,{type:'text',text:DEFAULT_REPLY});return {};};
    assert.equal((await handleWebhook(request())).status,200);
    assert.equal(calls,1);
    Client.prototype.replyMessage=async function() {calls++;throw new Error('line offline');};
    const response=await handleWebhook(request());
    assert.equal((await response.json()).replyFailures,1);
    assert.equal(calls,2);
  } finally {globalThis.fetch=originalFetch;Client.prototype.replyMessage=originalReply;}
});
