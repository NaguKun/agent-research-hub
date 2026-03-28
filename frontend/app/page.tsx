'use client';

import { useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';
import { api } from '@/lib/api';
import { Sidebar } from '@/components/Sidebar';
import { ChatPanel } from '@/components/ChatPanel';
import { TracePanel } from '@/components/TracePanel';
import { StreamConsumer } from '@/components/StreamConsumer';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, FileText } from 'lucide-react';

export default function Page() {
  const { 
    activeSessionId, 
    syncData, 
    selectedArtifact, 
    selectedArtifactContent, 
    setSelectedArtifact 
  } = useStore();

  useEffect(() => {
    const syncCurrentState = async () => {
      if (!activeSessionId) return;
      try {
        const [traceRes, messages, artifacts] = await Promise.all([
          api.sessions.getTrace(activeSessionId).catch(() => ({ tree: {} })), 
          api.sessions.getMessages(activeSessionId),
          api.sessions.getArtifacts(activeSessionId)
        ]);
        syncData(traceRes.tree, messages, artifacts);
      } catch (err) {
        console.error('Sync error:', err);
      }
    };

    if (activeSessionId) {
      syncCurrentState();
    }
  }, [activeSessionId, syncData]);

  return (
    <main className="flex h-screen w-full overflow-hidden bg-slate-50 text-slate-800 font-sans selection:bg-indigo-100">
      <StreamConsumer />
      {/* Sidebar - Persistent */}
      <Sidebar />
      
      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Top Navigation Bar */}
        <header className="h-14 border-b border-slate-200 bg-white/70 backdrop-blur-md flex items-center justify-between px-6 z-30 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="h-5 w-px bg-slate-200 hidden sm:block" />
            <h2 className="text-sm font-medium text-slate-500 truncate max-w-[200px]">
              Platform / <span className="text-slate-900 font-bold">Deep Analyst</span>
            </h2>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full border border-slate-200">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-tight">System_Online</span>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          <ChatPanel />
          <TracePanel />
        </div>
      </div>

      {/* Global Artifact Modal (Uplifted to fix z-index stacking issues) */}
      {selectedArtifact && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] w-full max-w-5xl max-h-[90vh] flex flex-col shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3)] overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Modal Header */}
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200">
                  <FileText size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">{selectedArtifact.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded">Intelligence Asset</span>
                    <span className="text-[10px] font-medium text-slate-400">ID: {selectedArtifact.artifact_id.slice(0, 8)}</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedArtifact(null)}
                className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-all active:scale-90"
              >
                <X size={24} />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-8 sm:p-12 custom-scrollbar bg-white">
              <div className="prose prose-slate prose-indigo max-w-none prose-headings:font-bold prose-a:text-indigo-600 prose-table:border-collapse prose-th:bg-slate-50 prose-th:px-4 prose-th:py-2 prose-td:px-4 prose-td:py-2 prose-td:border-t prose-td:border-slate-100 shadow-sm rounded-xl overflow-hidden">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedArtifactContent || ''}</ReactMarkdown>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end px-8">
              <button 
                onClick={() => setSelectedArtifact(null)}
                className="px-8 py-3 bg-slate-900 text-white rounded-2xl text-sm font-bold hover:bg-slate-800 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5 active:translate-y-0"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

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
          background: rgba(0, 0, 0, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.2);
        }
        
        /* Glassmorphism utility */
        .glass {
          background: rgba(255, 255, 255, 0.6);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(0, 0, 0, 0.05);
        }

        /* Typography overrides for tech vibe */
        h1, h2, h3, h4 {
          letter-spacing: -0.02em;
        }
      `}</style>
    </main>
  );
}
