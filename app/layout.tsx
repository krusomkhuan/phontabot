import type { ReactNode } from 'react';
export const metadata = { title: 'น้องโพนต้า | วิทยาลัยการอาชีพโพนทอง' };
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="th"><body style={{fontFamily:'sans-serif',maxWidth:760,margin:'60px auto',padding:24,lineHeight:1.8}}>{children}</body></html>;
}
