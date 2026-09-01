import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Merchant Support Agent · Cashfree Agent Toolkit',
  description:
    'A live agentic console for the Cashfree Payments Agent Toolkit — tool calls, guardrails and a real money ledger, streamed.',
};

export const viewport: Viewport = {
  themeColor: '#08080b',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full bg-canvas text-ink">{children}</body>
    </html>
  );
}
