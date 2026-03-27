import type {Metadata} from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Deep Analyst | Agent-Transparent Chat',
  description: 'Full visibility into AI agent research pipelines.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} dark`}>
      <body className="font-sans antialiased bg-[#0f1729] text-slate-200 selection:bg-indigo-500/30" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
