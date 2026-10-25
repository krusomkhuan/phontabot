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
export function logError(service: string, error: unknown) {
  const e = error as { status?: number; statusCode?: number; name?: string };
  console.error(JSON.stringify({service,status:e?.status ?? e?.statusCode ?? null,type:e?.name ?? 'Error'}));
}

