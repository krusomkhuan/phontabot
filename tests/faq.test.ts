import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findAnswer} from '../lib/faq';
import {DEFAULT_REPLY} from '../lib/config';
const rows=[
  {category:'ทั่วไป',question:'วิทยาลัยเปิดทำการกี่โมง',answer:'เปิดวันจันทร์–ศุกร์ เวลา 08:00–21:00 น.'},
  {category:'ทั่วไป',question:'ติดต่อวิทยาลัยได้ทางไหน',answer:'โทร 043-571144'},
  {category:'การสมัครเรียน',question:'เปิดรับสมัครนักเรียนใหม่เมื่อไร',answer:'รอบโควตาเดือนพฤศจิกายน–ธันวาคม'},
  {category:'การสมัครเรียน',question:'ใช้เอกสารอะไรในการสมัคร',answer:'สำเนาบัตรประชาชน สำเนาทะเบียนบ้าน ใบ ปพ.1 และรูปถ่าย'},
  {category:'สาขาวิชา',question:'มีสาขาอะไรบ้าง',answer:'ช่างยนต์ ช่างไฟฟ้า'},
  {category:'ค่าใช้จ่าย',question:'ค่าเทอมเท่าไร',answer:'ประมาณ 1500 บาทต่อภาคเรียน'},
  {category:'กิจกรรม',question:'มีชมรมอะไรบ้าง',answer:'ชมรมดนตรีและกีฬา'},
];
test('matches actual test phrases and polite variants',()=>{
  for(const q of ['วิทยาลัยเปิดทำการกี่โมง','เปิดกี่โมงครับ','เวลาทำการ','“วิทยาลัยเปิดทำการกี่โมง”']) assert.equal(findAnswer(q,rows),rows[0].answer,q);
  for(const q of ['สมัครเรียนใช้เอกสารอะไรบ้าง','สมัครต้องเตรียมอะไร','ต้องใช้หลักฐานอะไรในการสมัคร']) assert.equal(findAnswer(q,rows),rows[3].answer);
  for(const [q,index] of [['เบอร์โทรวิทยาลัย',1],['รับสมัครวันไหน',2],['เปิดสาขาอะไร',4],['ค่าเรียนเท่าไหร่',5],['มีกิจกรรมอะไร',6]] as const) assert.equal(findAnswer(q,rows),rows[index].answer);
});
test('unknown, ambiguous, compound and conflicting questions do not get invented answers',()=>{
  for(const q of ['มีทุนการศึกษาไหม','มีหอพักไหม','สมัครงาน','สูตรทำอาหาร','สมัครเรียน','เอกสารและค่าเทอม','ขอเลขบัญชี','']) assert.equal(findAnswer(q,rows),DEFAULT_REPLY);
  assert.equal(findAnswer('ค่าเทอมเท่าไร',[rows[5],{...rows[5],answer:'อีกจำนวนหนึ่ง'}]),DEFAULT_REPLY);
  assert.equal(findAnswer('เปิดกี่โมง',[rows[0],{...rows[0],question:'วันเสาร์เปิดทำการไหม',answer:'ข้อมูลขัดกัน'}]),DEFAULT_REPLY);
});
