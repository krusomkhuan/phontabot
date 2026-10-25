import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import vm from 'node:vm';

test('Google receiver aggregates questions atomically, deduplicates events, rejects invalid requests, and summarizes once',()=>{
  const tables:any[]=[{id:1,name:'คำถามที่ยังตอบไม่ได้',rows:[['first','last','question','count','state','reason','key']]},
    {id:2,name:'สรุปรายวัน',rows:[['day','unknown','error','new','sent','retry']]},
    {id:3,name:'ป้องกันนับซ้ำ',rows:[['event']]},
    {id:4,name:'ชีต1',rows:[['หมวดหมู่','คำถาม','คำตอบ']]}];
  const sheet=(table:any):any=>({getSheetId:()=>table.id,getLastRow:()=>table.rows.length,getDataRange:()=>({getValues:()=>table.rows}),setFrozenRows:()=>{},appendRow:(r:any[])=>table.rows.push(r),
    getRange:(row:number,col:number,count=1,width=1)=>({getValue:()=>table.rows[row-1]?.[col-1],
      setValue:(v:any)=>{table.rows[row-1][col-1]=v;},
      getValues:()=>table.rows.slice(row-1,row-1+count).map((r:any[])=>r.slice(col-1,col-1+width)),
      createTextFinder:(needle:string)=>({matchEntireCell:()=>({findNext:()=>{
        const index=table.rows.findIndex((r:any[],i:number)=>i>=row-1&&i<row-1+count&&String(r[col-1])===needle);
        return index<0?null:{getRow:()=>index+1};}})})})});
  const ss={getSheetByName:(n:string)=>{const t=tables.find(t=>t.name===n);return t?sheet(t):null;},insertSheet:(name:string)=>{const t={name,id:tables.length+1,rows:[]};tables.push(t);return sheet(t);},getId:()=>'private-file',getUrl:()=>'https://docs.google.com/spreadsheets/d/private-file'};
  const faqFile={getSheets:()=>[sheet(tables[3])],getUrl:()=>'https://docs.google.com/spreadsheets/d/faq-file'};
  const props:any={LOG_SECRET:'test-secret',LOG_SPREADSHEET_ID:'private-file',LINE_CHANNEL_ACCESS_TOKEN:'test-token',ADMIN_GROUP_ID:'Ctest',ADMIN_USER_IDS:'Uadmin',FAQ_SPREADSHEET_ID:'faq-file',FAQ_SHEET_ID:'4'};
  let writes=0,pushes=0,locked=false,failWrite=false;
  const context=vm.createContext({console,Date,JSON,Math,Number,String,Error,
    PropertiesService:{getScriptProperties:()=>({getProperty:(n:string)=>props[n]})},
    LockService:{getScriptLock:()=>({waitLock:()=>{locked=true;},hasLock:()=>locked,releaseLock:()=>{locked=false;}})},
    SpreadsheetApp:{openById:(id:string)=>id==='faq-file'?faqFile:ss,flush:()=>{}},ScriptApp:{getOAuthToken:()=>'test-oauth'},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:(s:string)=>({setMimeType:()=>JSON.parse(s)})},
    Utilities:{Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'sha256'},
      computeDigest:(_a:string,s:string)=>[...createHash('sha256').update(s).digest()],
      computeHmacSha256Signature:(s:string,k:string)=>[...createHmac('sha256',k).update(s).digest()],
      getUuid:()=>'00000000-0000-4000-8000-000000000001',
      formatDate:(d:Date)=>new Date(d.getTime()+7*3600000).toISOString().slice(0,10)},
    UrlFetchApp:{fetch:(url:string,options:any)=>{
      if(url.includes('sheets.googleapis.com')) {
        if(failWrite)return {getResponseCode:()=>503};
        writes++;assert.equal(locked,true);
        for(const request of JSON.parse(options.payload).requests) {
          if(request.appendCells) {const x=request.appendCells;tables.find(t=>t.id===x.sheetId).rows.push(x.rows[0].values.map((v:any)=>Object.values(v.userEnteredValue)[0]));}
          if(request.updateCells) {const x=request.updateCells,s=x.start;tables.find(t=>t.id===s.sheetId).rows[s.rowIndex][s.columnIndex]=Object.values(x.rows[0].values[0].userEnteredValue)[0];}
        }
      } else {pushes++;assert.ok(JSON.parse(JSON.parse(options.payload).payload).text.includes('ตอบไม่ได้ 3 ครั้ง'));}
      return {getResponseCode:()=>200,getContentText:()=>'{"ok":true}'};
    }}
  });
  vm.runInContext(readFileSync('google-apps-script/Code.gs','utf8'),context);
  const send=(id:string,q:string,reason='no_match',valid=true)=>{
    const payload=JSON.stringify({eventId:createHash('sha256').update(id).digest('hex'),question:q,reason,timestamp:Date.now()-86400000,sentAt:Date.now()});
    return context.doPost({postData:{contents:JSON.stringify({payload,signature:valid?createHmac('sha256','test-secret').update(payload).digest('hex'):'bad'})}});
  };
  assert.equal(send('1','=IMPORTXML("evil")').ok,true);
  assert.equal(send('1','=IMPORTXML("evil")').duplicate,true);assert.equal(writes,1);
  assert.equal(send('2','=IMPORTXML("evil")').ok,true);assert.equal(tables[0].rows[1][3],2);
  assert.equal(tables[0].rows[1][2],'=IMPORTXML("evil")'); // Written as stringValue, never formulaValue.
  assert.equal(send('3','=IMPORTXML("evil")','system_error').ok,true);assert.equal(tables[0].rows.length,3);
  assert.equal(send('4','bad','no_match',false).ok,false);assert.equal(writes,3);
  failWrite=true;assert.equal(send('5','retry').ok,false);assert.equal(tables[2].rows.length,4);
  failWrite=false;
  context.sendDailySummary();assert.equal(pushes,1);context.sendDailySummary();assert.equal(pushes,1);
  const command=(action:string,adminUserId='Uadmin',groupId='Ctest',extra:object={})=>{
    const payload=JSON.stringify({action,adminUserId,groupId,sentAt:Date.now(),...extra});
    return context.doPost({postData:{contents:JSON.stringify({payload,signature:createHmac('sha256','test-secret').update(payload).digest('hex')})}});
  };
  assert.equal(command('list','Ustranger').ok,false);
  assert.equal(command('list','Uadmin','Cother').ok,false);
  assert.ok(command('list').reply.includes('ถามแล้ว 2 ครั้ง'));
  assert.ok(command('today').reply.includes('ยังรอคำตอบทั้งหมด'));
  const item={id:tables[0].rows[1][6].slice(0,12),question:'คำถามใหม่',answer:'คำตอบที่ตรวจสอบแล้ว'};
  assert.equal(command('answer','Ustranger','Ctest',item).ok,false);assert.equal(tables[3].rows.length,1);
  assert.ok(command('answer','Uadmin','Ctest',item).reply.includes('เพิ่มคำตอบลง Google Sheet'));
  assert.deepEqual(tables[3].rows[1],['เพิ่มเติมจากผู้ดูแล','คำถามใหม่','คำตอบที่ตรวจสอบแล้ว']);
  assert.equal(tables[0].rows[1][4],'เพิ่มคำตอบแล้ว');
  command('answer','Uadmin','Ctest',item);assert.equal(tables[3].rows.length,2);
  assert.ok(command('answer','Uadmin','Ctest',{...item,answer:'คำตอบขัดกัน'}).reply.includes('คำตอบอื่น'));
  send('6','เรียนวันหยุดได้ไหม');
  const pendingKey=tables[0].rows[3][6].slice(0,12);
  const draftInput={id:pendingKey,question:'เรียนวันหยุดได้ไหม',answer:'คำตอบที่ตรวจสอบแล้ว'};
  const d=command('draft','Uadmin','Ctest',draftInput);assert.ok(d.draft);assert.equal(tables[3].rows.length,2,'draft must not publish');
  assert.equal(command('draft','Uadmin','Ctest',draftInput).draft.id,d.draft.id);
  props.ADMIN_USER_IDS='Uadmin,Uother';
  assert.ok(command('approve','Uother','Ctest',{draftId:d.draft.id}).reply.includes('เฉพาะผู้ดูแล'));assert.equal(tables[3].rows.length,2);
  assert.ok(command('approve','Uadmin','Ctest',{draftId:d.draft.id}).saved);assert.equal(tables[3].rows.length,3);
  command('approve','Uadmin','Ctest',{draftId:d.draft.id});assert.equal(tables[3].rows.length,3,'replayed approval must not duplicate FAQ');
  assert.equal(locked,false);
});
