// Paste into a NEW standalone Apps Script project. Never attach this to the public FAQ.
const LOG_TAB = 'คำถามที่ยังตอบไม่ได้';
const DAY_TAB = 'สรุปรายวัน';
const EVENT_TAB = 'ป้องกันนับซ้ำ';
const TZ = 'Asia/Bangkok';

function setup() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('LOG_SPREADSHEET_ID');
  if (!id) {
    const file = SpreadsheetApp.create('น้องโพนต้า — บันทึกคำถามส่วนตัว');
    id = file.getId();
    props.setProperty('LOG_SPREADSHEET_ID', id);
  }
  if (!props.getProperty('LOG_SECRET')) props.setProperty('LOG_SECRET', Utilities.getUuid()+Utilities.getUuid());
  const ss = SpreadsheetApp.openById(id);
  ss.setSpreadsheetTimeZone(TZ);
  ensureTab_(ss, LOG_TAB, ['วันเวลาครั้งแรก','วันเวลาล่าสุด','คำถาม','จำนวนครั้ง','สถานะ','สาเหตุ','รหัสคำถาม']);
  ensureTab_(ss, DAY_TAB, ['วันที่','ไม่พบคำตอบที่ตรง','ระบบขัดข้อง','คำถามใหม่','แจ้งสรุปแล้ว','รหัสส่ง LINE']);
  ensureTab_(ss, EVENT_TAB, ['รหัสเหตุการณ์']);
  ss.getSheetByName(EVENT_TAB).hideSheet();
  const sheet = ss.getSheetByName(LOG_TAB);
  sheet.getRange('A:B').setNumberFormat('dd/MM/yyyy HH:mm:ss');
  sheet.getRange('E2:E').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['รอเพิ่มข้อมูล','เพิ่มคำตอบแล้ว','รอแก้ไขระบบ','แก้ไขระบบแล้ว'],true).build());
  sheet.hideColumns(7);
  sheet.setColumnWidth(3,480);
  sheet.getRange('C:C').setWrap(true);
  console.log('ไฟล์บันทึกส่วนตัว: '+ss.getUrl());
  console.log('คัดลอก LOG_SECRET จาก Project Settings > Script properties ไป Vercel โดยไม่ส่งในแชต');
}

function ensureTab_(ss, name, headers) {
  const s=ss.getSheetByName(name)||ss.insertSheet(name);
  if (s.getLastRow()===0) s.appendRow(headers);
  s.setFrozenRows(1);
  return s;
}
function json_(value) {return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
function hex_(bytes) {return bytes.map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');}
function digest_(text) {return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text,Utilities.Charset.UTF_8));}
function reasonLabel_(reason) {return reason==='no_match'?'ไม่พบคำตอบที่ตรง':'ระบบขัดข้อง';}
// Prefix text, so a question beginning with '=' can never become a Sheet formula.
function literal_(text) {return "'"+String(text);}
function cell_(value) {
  return {userEnteredValue:typeof value==='number'?{numberValue:value}:{stringValue:String(value)}};
}
function append_(sheet,values) {return {appendCells:{sheetId:sheet.getSheetId(),rows:[{values:values.map(cell_)}],fields:'userEnteredValue'}};}
function put_(sheet,row,col,value) {return {updateCells:{start:{sheetId:sheet.getSheetId(),rowIndex:row-1,columnIndex:col-1},rows:[{values:[cell_(value)]}],fields:'userEnteredValue'}};}
function dateNumber_(ms) {return ms/86400000+25569+7/24;}

function support_(p,props) {
  const admins=(props.getProperty('ADMIN_USER_IDS')||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(!p.adminUserId||!admins.includes(p.adminUserId)||!props.getProperty('ADMIN_GROUP_ID')||p.groupId!==props.getProperty('ADMIN_GROUP_ID'))return {ok:false};
  const ss=SpreadsheetApp.openById(props.getProperty('LOG_SPREADSHEET_ID'));
  const log=ss.getSheetByName(LOG_TAB);
  const data=log.getLastRow()>1?log.getRange(2,1,log.getLastRow()-1,7).getValues():[];
  if(p.action==='today') {
    const day=Utilities.formatDate(new Date(),TZ,'yyyy-MM-dd'),daily=ss.getSheetByName(DAY_TAB);
    const rows=daily.getLastRow()>1?daily.getRange(2,1,daily.getLastRow()-1,6).getValues():[];
    const row=rows.find(r=>String(r[0])===day)||[day,0,0,0];
    const pending=data.filter(r=>r[4]==='รอเพิ่มข้อมูล'&&r[5]==='ไม่พบคำตอบที่ตรง').length;
    return {ok:true,reply:'สรุปวันนี้ '+day+'\nไม่พบคำตอบ '+row[1]+' ครั้ง\nระบบขัดข้อง '+row[2]+' ครั้ง\nคำถามใหม่ '+row[3]+' เรื่อง\nยังรอคำตอบทั้งหมด '+pending+' เรื่อง\n\nส่ง /คำถามค้าง เพื่อเปิดแบบฟอร์มเพิ่มคำตอบค่ะ'};
  }
  if(['get','draft','approve','reject'].includes(p.action))return mobile_(p,props,ss,data);
  if(p.action==='list') {
    const pending=data.filter(r=>r[4]==='รอเพิ่มข้อมูล'&&r[5]==='ไม่พบคำตอบที่ตรง').sort((a,b)=>Number(b[3])-Number(a[3])).slice(0,5);
    if(!pending.length)return {ok:true,reply:'ไม่มีคำถามรอเพิ่มข้อมูลค่ะ'};
    return {ok:true,items:pending.map(r=>({id:String(r[6]).slice(0,12),question:String(r[2]),count:Number(r[3])})),reply:'คำถามค้างที่มีคนถามบ่อย (สูงสุด 5 ข้อ)\n'+pending.map(r=>'รหัส '+String(r[6]).slice(0,12)+'\n'+String(r[2]).slice(0,300)+'\nถามแล้ว '+r[3]+' ครั้ง').join('\n\n')+'\n\nเพิ่มคำตอบด้วย\n/ตอบ รหัส | คำถามสำหรับ FAQ | คำตอบที่ตรวจสอบแล้ว\nคำถามและคำตอบจะเผยแพร่ใน FAQ สาธารณะ กรุณาตัดข้อมูลส่วนบุคคลก่อนส่งค่ะ'};
  }
  if(p.action!=='answer'||!/^[a-f0-9]{12}$/.test(p.id)||typeof p.question!=='string'||!p.question.trim()||p.question.length>500||typeof p.answer!=='string'||!p.answer.trim()||p.answer.length>4000)return {ok:false};
  const matches=data.map((r,index)=>({r,index})).filter(x=>String(x.r[6]).startsWith(p.id));
  if(matches.length!==1)return {ok:true,reply:'ไม่พบรหัสคำถามที่ตรงเพียงข้อเดียว กรุณาพิมพ์ /คำถามค้าง อีกครั้งค่ะ'};
  const target=matches[0];
  if(target.r[5]!=='ไม่พบคำตอบที่ตรง')return {ok:true,reply:'รายการนี้เป็นปัญหาระบบ ไม่ใช่คำถามที่รอเพิ่ม FAQ ค่ะ'};
  const faqId=props.getProperty('FAQ_SPREADSHEET_ID');
  if(!faqId)return {ok:true,reply:'ยังไม่ได้ตั้งค่า FAQ_SPREADSHEET_ID ค่ะ'};
  const faqFile=SpreadsheetApp.openById(faqId);
  const faq=faqFile.getSheets().find(s=>s.getSheetId()===Number(props.getProperty('FAQ_SHEET_ID')||'0'));
  if(!faq)throw new Error('faq-tab-missing');
  const rows=faq.getDataRange().getValues();
  if(rows[0][0]!=='หมวดหมู่'||rows[0][1]!=='คำถาม'||rows[0][2]!=='คำตอบ')throw new Error('faq-headers-mismatch');
  const normalize=q=>String(q).normalize('NFC').trim().toLowerCase().replace(/\s+/g,'');
  const existing=rows.slice(1).filter(r=>normalize(r[1])===normalize(p.question));
  if(existing.some(r=>String(r[2]).trim()!==p.answer.trim()))return {ok:true,reply:'คำถามนี้มีคำตอบอื่นใน FAQ แล้วค่ะ กรุณาตรวจแก้ในชีตโดยตรง เพื่อไม่ให้เกิดคำตอบขัดกัน'};
  if(!existing.length) {
    const write=UrlFetchApp.fetch('https://sheets.googleapis.com/v4/spreadsheets/'+faqId+':batchUpdate',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},payload:JSON.stringify({requests:[append_(faq,['เพิ่มเติมจากผู้ดูแล',p.question.trim(),p.answer.trim()])]}),muteHttpExceptions:true});
    if(write.getResponseCode()!==200)throw new Error('faq-write-failed');
  }
  // Retry after an interrupted write finds the existing FAQ, so no duplicate row is appended.
  log.getRange(target.index+2,5).setValue('เพิ่มคำตอบแล้ว');
  SpreadsheetApp.flush();
  return {ok:true,saved:true,reply:'เพิ่มคำตอบลง Google Sheet FAQ แล้วค่ะ\nคำถาม: '+p.question.trim()+'\nน้องโพนต้าจะอ่านข้อมูลใหม่ภายในประมาณ 60 วินาที\n'+faqFile.getUrl()};
}

function mobile_(p,props,ss,data) {
  if(p.action==='get'||p.action==='draft') {
    if(!/^[a-f0-9]{12}$/.test(p.id))return {ok:false};
    const matches=data.filter(r=>String(r[6]).startsWith(p.id)&&r[5]==='ไม่พบคำตอบที่ตรง'&&r[4]==='รอเพิ่มข้อมูล');
    if(matches.length!==1)return {ok:true,error:'รายการนี้ปิดแล้วหรือไม่พบ กรุณารับลิงก์ใหม่จาก LINE'};
    if(p.action==='get')return {ok:true,question:String(matches[0][2])};
    if(typeof p.question!=='string'||!p.question.trim()||p.question.length>500||typeof p.answer!=='string'||!p.answer.trim()||p.answer.length>4000)return {ok:false};
    const drafts=ensureTab_(ss,'ร่างคำตอบ',['รหัสร่าง','บัญชีผู้ดูแล','กลุ่ม','รหัสคำถาม','คำถาม FAQ','คำตอบ','หมดอายุ','สถานะ']);
    const rows=drafts.getLastRow()>1?drafts.getRange(2,1,drafts.getLastRow()-1,8).getValues():[];
    const pending=rows.find(r=>r[1]===p.adminUserId&&r[2]===p.groupId&&r[3]===p.id&&Number(r[6])>Date.now()&&r[7]==='รอยืนยัน');
    if(pending) {
      if(pending[4]!==p.question.trim()||pending[5]!==p.answer.trim())return {ok:true,error:'มีร่างรอยืนยันใน LINE อยู่แล้ว กรุณายืนยันหรือยกเลิกร่างเดิมก่อนแก้ไข'};
      return {ok:true,draft:{id:pending[0],question:pending[4],answer:pending[5]}};
    }
    const id=Utilities.getUuid(),question=p.question.trim(),answer=p.answer.trim();
    const write=UrlFetchApp.fetch('https://sheets.googleapis.com/v4/spreadsheets/'+ss.getId()+':batchUpdate',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},payload:JSON.stringify({requests:[append_(drafts,[id,p.adminUserId,p.groupId,p.id,question,answer,Date.now()+30*60000,'รอยืนยัน'])]}),muteHttpExceptions:true});
    if(write.getResponseCode()!==200)throw new Error('draft-write-failed');
    return {ok:true,draft:{id:id,question:question,answer:answer}};
  }
  const drafts=ss.getSheetByName('ร่างคำตอบ');
  if(!drafts||drafts.getLastRow()<2)return {ok:true,reply:'ไม่พบร่างคำตอบค่ะ'};
  const rows=drafts.getRange(2,1,drafts.getLastRow()-1,8).getValues();
  const index=rows.findIndex(r=>r[0]===p.draftId&&r[1]===p.adminUserId&&r[2]===p.groupId);
  if(index<0)return {ok:true,reply:'เฉพาะผู้ดูแลที่ส่งร่างนี้เท่านั้นที่ยืนยันหรือยกเลิกได้ค่ะ'};
  const row=rows[index];
  if(row[7]==='บันทึกแล้ว')return {ok:true,reply:'ร่างนี้เพิ่มลง FAQ แล้วค่ะ ไม่บันทึกซ้ำ'};
  if(row[7]!=='รอยืนยัน'||Number(row[6])<Date.now())return {ok:true,reply:'ร่างนี้หมดอายุหรือถูกยกเลิกแล้ว กรุณาเปิดแบบฟอร์มใหม่ค่ะ'};
  if(p.action==='reject'){drafts.getRange(index+2,8).setValue('ยกเลิก');return {ok:true,reply:'ยกเลิกร่างแล้วค่ะ สามารถเปิดแบบฟอร์มเพื่อกรอกใหม่ได้'};}
  const result=support_({action:'answer',adminUserId:p.adminUserId,groupId:p.groupId,id:row[3],question:row[4],answer:row[5]},props);
  if(result.saved){drafts.getRange(index+2,8).setValue('บันทึกแล้ว');SpreadsheetApp.flush();}
  return result;
}

function doPost(e) {
  const lock=LockService.getScriptLock();
  try {
    const envelope=JSON.parse(e.postData.contents);
    const props=PropertiesService.getScriptProperties();
    const secret=props.getProperty('LOG_SECRET');
    if (!secret || typeof envelope.payload!=='string' || envelope.payload.length>10000) return json_({ok:false});
    const sig=hex_(Utilities.computeHmacSha256Signature(envelope.payload,secret,Utilities.Charset.UTF_8));
    if (envelope.signature!==sig) return json_({ok:false});
    const p=JSON.parse(envelope.payload);
    if(!Number.isFinite(p.sentAt)||Math.abs(Date.now()-p.sentAt)>300000)return json_({ok:false});
    if(['list','answer','today','get','draft','approve','reject'].includes(p.action)) {
      lock.waitLock(10000);
      return json_(support_(p,props));
    }
    if (!['no_match','system_error'].includes(p.reason) || typeof p.question!=='string' || !p.question.trim() || p.question.length>500 || !/^[a-f0-9]{64}$/.test(p.eventId) || !Number.isFinite(p.sentAt) || Math.abs(Date.now()-p.sentAt)>300000 || !Number.isFinite(p.timestamp) || p.timestamp<0 || p.timestamp>Date.now()+300000) return json_({ok:false});
    lock.waitLock(10000);
    const ss=SpreadsheetApp.openById(props.getProperty('LOG_SPREADSHEET_ID'));
    const ledger=ss.getSheetByName(EVENT_TAB);
    if (ledger.getLastRow()>1 && ledger.getRange(2,1,ledger.getLastRow()-1,1).createTextFinder(p.eventId).matchEntireCell(true).findNext()) return json_({ok:true,duplicate:true});
    const sheet=ss.getSheetByName(LOG_TAB);
    const day=Utilities.formatDate(new Date(p.timestamp),TZ,'yyyy-MM-dd');
    const key=digest_(p.reason+'|'+p.question.normalize('NFC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,''));
    const found=sheet.getLastRow()>1?sheet.getRange(2,7,sheet.getLastRow()-1,1).createTextFinder(key).matchEntireCell(true).findNext():null;
    const fresh=!found;
    const requests=[];
    if (found) {
      const row=found.getRow();
      requests.push(put_(sheet,row,2,dateNumber_(p.timestamp)));
      requests.push(put_(sheet,row,4,Number(sheet.getRange(row,4).getValue())+1));
      const state=sheet.getRange(row,5).getValue();
      if (state==='เพิ่มคำตอบแล้ว'||state==='แก้ไขระบบแล้ว') requests.push(put_(sheet,row,5,p.reason==='no_match'?'รอเพิ่มข้อมูล':'รอแก้ไขระบบ'));
    } else requests.push(append_(sheet,[dateNumber_(p.timestamp),dateNumber_(p.timestamp),p.question,1,p.reason==='no_match'?'รอเพิ่มข้อมูล':'รอแก้ไขระบบ',reasonLabel_(p.reason),key]));
    const daily=ss.getSheetByName(DAY_TAB);
    const d=daily.getLastRow()>1?daily.getRange(2,1,daily.getLastRow()-1,1).createTextFinder(day).matchEntireCell(true).findNext():null;
    if (d) {
      const row=d.getRow();const col=p.reason==='no_match'?2:3;
      requests.push(put_(daily,row,col,Number(daily.getRange(row,col).getValue())+1));
      if (fresh) requests.push(put_(daily,row,4,Number(daily.getRange(row,4).getValue())+1));
    } else requests.push(append_(daily,[day,p.reason==='no_match'?1:0,p.reason==='system_error'?1:0,fresh?1:0,'',Utilities.getUuid()]));
    requests.push(append_(ledger,[p.eventId]));
    // Atomic batch: counts and event receipt are committed together, including after a timeout/retry.
    const write=UrlFetchApp.fetch('https://sheets.googleapis.com/v4/spreadsheets/'+ss.getId()+':batchUpdate',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},payload:JSON.stringify({requests:requests}),muteHttpExceptions:true});
    if(write.getResponseCode()!==200)throw new Error('sheet-write-failed');
    return json_({ok:true});
  } catch (_) {return json_({ok:false});}
  finally {if(lock.hasLock()) lock.releaseLock();}
}

// LINE token stays on Vercel. Apps Script sends a signed summary to the bot.
function installDailySummary() {
  const p=PropertiesService.getScriptProperties();
  if (!p.getProperty('LOG_SECRET') || !/^C[a-f0-9]{32}$/.test(p.getProperty('ADMIN_GROUP_ID')||'')) throw new Error('ตั้งค่า LOG_SECRET และ ADMIN_GROUP_ID ก่อน');
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='sendDailySummary').forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendDailySummary').timeBased().everyDays(1).atHour(8).inTimezone(TZ).create();
}

// Send complete previous-day totals. Apps Script runs approximately 08:00–09:00 Bangkok time.
function sendDailySummary() {
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const p=PropertiesService.getScriptProperties();
    const secret=p.getProperty('LOG_SECRET'),group=p.getProperty('ADMIN_GROUP_ID');
    if (!secret||!group) throw new Error('missing-summary-config');
    const ss=SpreadsheetApp.openById(p.getProperty('LOG_SPREADSHEET_ID'));
    const daily=ss.getSheetByName(DAY_TAB);
    const today=Utilities.formatDate(new Date(),TZ,'yyyy-MM-dd');
    const rows=daily.getLastRow()>1?daily.getRange(2,1,daily.getLastRow()-1,6).getValues():[];
    const yesterday=Utilities.formatDate(new Date(Date.now()-86400000),TZ,'yyyy-MM-dd');
    if(!rows.some(r=>String(r[0])===yesterday)) {
      const empty=[yesterday,0,0,0,'',Utilities.getUuid()];
      daily.appendRow([literal_(yesterday),0,0,0,'',empty[5]]);rows.push(empty);
    }
    for(let index=0;index<rows.length;index++) {
      const row=rows[index], day=String(row[0]);
      if(day>=today||row[4])continue;
      const text='สรุปน้องโพนต้า วันที่ '+day+'\nตอบไม่ได้ '+(Number(row[1])+Number(row[2]))+' ครั้ง\nไม่พบคำตอบที่ตรง '+row[1]+' ครั้ง\nระบบขัดข้อง '+row[2]+' ครั้ง\nพบคำถามใหม่ '+row[3]+' เรื่อง\nกรุณาตรวจสอบในชีตส่วนตัวค่ะ\n'+ss.getUrl();
      const payload=JSON.stringify({groupId:group,text:text,retryKey:row[5],sentAt:Date.now()});
      const signature=hex_(Utilities.computeHmacSha256Signature(payload,secret,Utilities.Charset.UTF_8));
      const response=UrlFetchApp.fetch('https://phonta.vercel.app/api/support-summary',{method:'post',contentType:'application/json',payload:JSON.stringify({payload:payload,signature:signature}),muteHttpExceptions:true});
      const code=response.getResponseCode();
      if(code!==200||JSON.parse(response.getContentText()).ok!==true)throw new Error('line-summary-failed:'+code);
      daily.getRange(index+2,5).setValue(new Date());
      SpreadsheetApp.flush();
    }
  } finally {lock.releaseLock();}
}
