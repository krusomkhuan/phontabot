import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import vm from 'node:vm';

test('Google receiver aggregates questions atomically, deduplicates events, rejects invalid requests, and summarizes once',()=>{
  const tables:any[]=[{id:1,name:'คำถามที่ยังตอบไม่ได้',rows:[['first','last','question','count','state','reason','key']]},
    {id:2,name:'สรุปรายวัน',rows:[['day','unknown','error','new','sent','retry']]},
    {id:3,name:'ป้องกันนับซ้ำ',rows:[['event']]}];
  const sheet=(table:any):any=>({getSheetId:()=>table.id,getLastRow:()=>table.rows.length,
    getRange:(row:number,col:number,count=1,width=1)=>({getValue:()=>table.rows[row-1]?.[col-1],
      setValue:(v:any)=>{table.rows[row-1][col-1]=v;},
      getValues:()=>table.rows.slice(row-1,row-1+count).map((r:any[])=>r.slice(col-1,col-1+width)),
      createTextFinder:(needle:string)=>({matchEntireCell:()=>({findNext:()=>{
        const index=table.rows.findIndex((r:any[],i:number)=>i>=row-1&&i<row-1+count&&String(r[col-1])===needle);
        return index<0?null:{getRow:()=>index+1};}})})})});
  const ss={getSheetByName:(n:string)=>sheet(tables.find(t=>t.name===n)),getId:()=>'private-file',getUrl:()=>'https://docs.google.com/spreadsheets/d/private-file'};
  const props:any={LOG_SECRET:'test-secret',LOG_SPREADSHEET_ID:'private-file',LINE_CHANNEL_ACCESS_TOKEN:'test-token',ADMIN_GROUP_ID:'Ctest'};
  let writes=0,pushes=0,locked=false,failWrite=false;
  const context=vm.createContext({console,Date,JSON,Math,Number,String,Error,
    PropertiesService:{getScriptProperties:()=>({getProperty:(n:string)=>props[n]})},
    LockService:{getScriptLock:()=>({waitLock:()=>{locked=true;},hasLock:()=>locked,releaseLock:()=>{locked=false;}})},
    SpreadsheetApp:{openById:()=>ss,flush:()=>{}},ScriptApp:{getOAuthToken:()=>'test-oauth'},
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
      } else {pushes++;assert.ok(JSON.parse(options.payload).messages[0].text.includes('ตอบไม่ได้ 3 ครั้ง'));}
      return {getResponseCode:()=>200};
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
  assert.equal(locked,false);
});
