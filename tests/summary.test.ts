import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {POST} from '../app/api/support-summary/route';
test('summary accepts signed requests only for configured group and uses stable LINE retry key',async()=>{
  process.env.UNANSWERED_LOG_SECRET='s';process.env.CHANNEL_ACCESS_TOKEN='t';process.env.ADMIN_GROUP_ID='Cgroup';
  const original=globalThis.fetch;let pushes=0;
  globalThis.fetch=async(url,options)=>{pushes++;assert.equal(String(url),'https://api.line.me/v2/bot/message/push');assert.equal(JSON.parse(String(options?.body)).to,'Cgroup');assert.equal((options?.headers as any)['X-Line-Retry-Key'],'00000000-0000-4000-8000-000000000001');return new Response(null,{status:409});};
  const request=(groupId='Cgroup',valid=true)=>{const payload=JSON.stringify({groupId,text:'สรุปรายวัน',retryKey:'00000000-0000-4000-8000-000000000001',sentAt:Date.now()});return new Request('https://example.org/api/support-summary',{method:'POST',body:JSON.stringify({payload,signature:valid?createHmac('sha256','s').update(payload).digest('hex'):'bad'})});};
  try {assert.equal((await POST(request('Cother'))).status,400);assert.equal((await POST(request('Cgroup',false))).status,401);assert.equal(pushes,0);assert.equal((await POST(request())).status,200);assert.equal(pushes,1);}finally{globalThis.fetch=original;}
});
