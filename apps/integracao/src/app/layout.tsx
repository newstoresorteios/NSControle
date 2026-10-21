import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Plataforma Europa · Redirect', description: 'Operação compartilhada New Store e Redirect Europa' };
export default function RootLayout({children}: {children:React.ReactNode}) {
  return <html lang="pt-BR"><body className="antialiased">{children}</body></html>;
}
