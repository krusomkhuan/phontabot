import { handleWebhook } from '../../../lib/webhook';
export const runtime='nodejs';
export const maxDuration=15;
export const POST=handleWebhook;
export function GET() {return Response.json({ok:true,service:'phontabot',message:'LINE webhook accepts signed POST requests'});}
