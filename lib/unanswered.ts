import { createHash, createHmac } from 'node:crypto';

export type FailureReason = 'no_match' | 'system_error';
// No user ID or profile is transmitted. Redaction is best effort, not a privacy guarantee.
export function redactQuestion(text: string): string {
  return text.normalize('NFC').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[อีเมล]')
    .replace(/(?:\+?\d[\d\s()-]{7,}\d)/g, '[หมายเลข]').slice(0, 500);
}
export async function recordUnanswered(input: { question: string; reason: FailureReason; eventId: string; timestamp: number }): Promise<boolean> {
  const url = process.env.UNANSWERED_LOG_URL?.trim();
  const secret = process.env.UNANSWERED_LOG_SECRET?.trim();
  if (!url || !secret) { console.warn(JSON.stringify({service:'unanswered',status:'not_configured'})); return false; }
  try {
    const parsed = new URL(url);
    if (parsed.origin !== 'https://script.google.com' || !/^\/macros\/s\/[\w-]+\/exec$/.test(parsed.pathname)) throw new Error('invalid-log-url');
    const payload = JSON.stringify({question:redactQuestion(input.question),reason:input.reason,
      eventId:createHash('sha256').update(input.eventId).digest('hex'),
      timestamp:input.timestamp,sentAt:Date.now()});
    const signature = createHmac('sha256',secret).update(payload).digest('hex');
    // Same event ID on retry: receiver must deduplicate persistently.
    for (let attempt=0;attempt<2;attempt++) {
      try {
        const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({payload,signature}),signal:AbortSignal.timeout(1800),redirect:'follow',cache:'no-store'});
        if (!response.ok || (await response.json()).ok!==true) throw new Error('log-rejected');
        return true;
      } catch { if (attempt===1) throw new Error('log-unavailable'); }
    }
  } catch {console.error(JSON.stringify({service:'unanswered',status:'failed'}));}
  return false;
}
