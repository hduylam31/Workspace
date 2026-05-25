import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import './globals.css';

const nunito = Nunito({ subsets: ['latin', 'vietnamese'], display: 'swap' });

export const metadata: Metadata = {
  title: 'An Khang PM Workspace',
  description: 'PM Task Management Workspace for An Khang Team',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={`${nunito.className} bg-gray-50 min-h-screen antialiased`}>{children}</body>
    </html>
  );
}
