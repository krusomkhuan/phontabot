export const DEFAULT_REPLY = 'ขออภัยค่ะ น้องโพนต้ายังไม่มีข้อมูลเรื่องนี้ค่ะ';
export function required(name: string): string {
  let value = process.env[name]?.trim();
  // Compatibility with the already saved Vercel variable; prefer the correct name.
  if (!value && name === 'Gemini_API_KEY') {
    value = process.env.Gemimi_API_KEY?.trim();
    if (value) console.warn('Using legacy environment variable name: Gemimi_API_KEY');
  }
  if (!value) throw new Error(`missing:${name}`);
  return value;
}
// Log categories/status only; never log upstream bodies, tokens, or user text.
export function errorReason(error: unknown): string {
  const e = error as { message?: string; name?: string; status?: number };
  // Match locally but emit only fixed labels, never provider messages or request data.
  const message = String(e?.message ?? '');
  if (/API_KEY_INVALID|API key not valid|invalid api key/i.test(message)) return 'API_KEY_INVALID';
  if (/API_KEY_EXPIRED|API key expired/i.test(message)) return 'API_KEY_EXPIRED';
  if (/leaked|reported as leaked/i.test(message)) return 'API_KEY_REPORTED_LEAKED';
  if (/API_KEY_SERVICE_BLOCKED|SERVICE_DISABLED|PERMISSION_DENIED|not allowed|permission/i.test(message)) return 'API_ACCESS_DENIED';
  if (/not found|not supported|does not exist|deprecated|unsupported model/i.test(message)) return 'MODEL_UNAVAILABLE';
  if (/billing|FAILED_PRECONDITION/i.test(message)) return 'BILLING_OR_REGION';
  if (/quota|RESOURCE_EXHAUSTED/i.test(message)) return 'QUOTA_EXCEEDED';
  if (/timeout|timed out|abort/i.test(message)) return 'TIMEOUT';
  if (/INVALID_ARGUMENT/i.test(message)) return 'INVALID_REQUEST';
  return 'UNKNOWN';
}
export function logError(service: string, error: unknown) {
  const e = error as { status?: number; statusCode?: number; name?: string };
  console.error(JSON.stringify({service,status:e?.status ?? e?.statusCode ?? null,type:e?.name ?? 'Error',reason:errorReason(error)}));
}

