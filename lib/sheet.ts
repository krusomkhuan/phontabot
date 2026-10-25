import { parse } from 'csv-parse/sync';
import { required } from './config';
export type FAQ = { category: string; question: string; answer: string };
let cache: { url: string; expires: number; rows: FAQ[] } | undefined;
export function parseFAQ(csv: string): FAQ[] {
  const records = parse(csv, {bom:true,skip_empty_lines:true,trim:true}) as string[][];
  const headers = records.shift() ?? [];
  const indices = ['หมวดหมู่','คำถาม','คำตอบ'].map(h=>headers.indexOf(h));
  if (indices.some(i=>i<0)) throw new Error('invalid-sheet-headers');
  const rows = records.map(row=>({category:row[indices[0]]?.trim() ?? '',question:row[indices[1]]?.trim() ?? '',answer:row[indices[2]]?.trim() ?? ''})).filter(r=>r.question && r.answer);
  if (!rows.length || rows.length>2000) throw new Error('invalid-sheet-size');
  return rows;
}
export async function getFAQ(): Promise<FAQ[]> {
  const url = required('SHEET_CSV_URL');
  if (cache?.url===url && cache.expires>Date.now()) return cache.rows;
  if (new URL(url).protocol!=='https:') throw new Error('invalid-sheet-url');
  const response = await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(1800)});
  if (!response.ok) throw new Error('sheet-http-error');
  const csv = await response.text();
  if (csv.length>200000) throw new Error('sheet-too-large');
  const rows = parseFAQ(csv);
  cache={url,expires:Date.now()+60000,rows};
  return rows;
}
