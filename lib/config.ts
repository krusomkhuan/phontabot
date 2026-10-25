export const DEFAULT_REPLY = 'ขออภัยค่ะ น้องโพนต้ายังไม่มีข้อมูลเรื่องนี้ค่ะ';
export function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing:${name}`);
  return value;
}
// Log categories/status only; never log upstream bodies, tokens, or user text.
export function logError(service: string, error: unknown) {
  const e = error as { status?: number; statusCode?: number; name?: string };
  console.error(JSON.stringify({service,status:e?.status ?? e?.statusCode ?? null,type:e?.name ?? 'Error'}));
}
