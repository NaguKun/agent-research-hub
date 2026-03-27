'use client';

import { Sidebar } from '@/components/Sidebar';
import { ChatPanel } from '@/components/ChatPanel';
import { TracePanel } from '@/components/TracePanel';
import { StreamConsumer } from '@/components/StreamConsumer';

export default function Page() {
  return (
    <main className="flex h-screen w-full overflow-hidden bg-[#131b2e] text-slate-200">
      <StreamConsumer />
      
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <ChatPanel />
        <TracePanel />
      </div>

      {/* Global Styles for Scrollbars and Glassmorphism */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        
        /* Glassmorphism utility */
        .glass {
          background: rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        /* Typography overrides for tech vibe */
        h1, h2, h3, h4 {
          letter-spacing: -0.02em;
        }
      `}</style>
    </main>
  );
}
