import {test} from 'node:test';
import assert from 'node:assert/strict';
import {answerQuestion} from '../lib/gemini';

test('Google receives a valid 10s deadline while the local budget can be shorter',async()=>{
  const originalFetch=globalThis.fetch;
  const originalKey=process.env.Gemini_API_KEY;
  process.env.Gemini_API_KEY='test-key';
  let serverDeadline='';
  globalThis.fetch=async (_input,init)=>{
    serverDeadline=new Headers(init?.headers).get('x-server-timeout') ?? '';
    return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'เปิดวันจันทร์ถึงศุกร์ค่ะ'}]}}],usageMetadata:{candidatesTokenCount:10}}),{headers:{'content-type':'application/json'}});
  };
  try {
    const reply=await answerQuestion('เปิดกี่โมง',[{category:'ทั่วไป',question:'เปิดกี่โมง',answer:'วันจันทร์ถึงศุกร์'}],7000);
    assert.equal(reply,'เปิดวันจันทร์ถึงศุกร์ค่ะ');
    assert.equal(Number(serverDeadline),10);
    globalThis.fetch=async (_input,init)=>new Promise((_resolve,reject)=>{
      const signal=init?.signal;
      if(signal?.aborted) reject(new Error('aborted'));
      else signal?.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
    });
    const started=Date.now();
    const keepAlive=setTimeout(()=>{},1000);
    try {await assert.rejects(answerQuestion('เปิดกี่โมง',[],40));assert.ok(Date.now()-started<1000);}
    finally {clearTimeout(keepAlive);}
  } finally {globalThis.fetch=originalFetch;if(originalKey===undefined) delete process.env.Gemini_API_KEY;else process.env.Gemini_API_KEY=originalKey;}
});
