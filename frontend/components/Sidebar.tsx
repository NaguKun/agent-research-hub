'use client';

import React, { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { api } from '@/lib/api';
import { Plus, MessageSquare, Trash2, Terminal } from 'lucide-react';
import { clsx } from 'clsx';

export function Sidebar() {
  const { sessions, setSessions, activeSessionId, setActiveSessionId } = useStore();
  const [newSessionTitle, setNewSessionTitle] = useState('');

  useEffect(() => {
    api.sessions.list().then(setSessions);
  }, [setSessions]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionTitle.trim()) return;
    const session = await api.sessions.create(newSessionTitle);
    setSessions([...sessions, session]);
    setActiveSessionId(session.session_id);
    setNewSessionTitle('');
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await api.sessions.delete(id);
    setSessions(sessions.filter(s => s.session_id !== id));
    if (activeSessionId === id) setActiveSessionId(null);
  };

  return (
    <aside className="w-72 border-r border-white/10 bg-[#131b2e]/80 backdrop-blur-2xl flex flex-col h-full overflow-hidden relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(79,70,229,0.05)_0%,transparent_50%)] pointer-events-none" />
      
      <div className="p-6 border-b border-white/5 flex items-center gap-3 relative z-10">
        <div className="w-8 h-8 rounded bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(79,70,229,0.15)]">
          <Terminal size={16} className="text-indigo-400" />
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-[0.1em] text-white uppercase font-terminal">Deep Analyst</h1>
          <p className="text-[9px] text-indigo-400/60 font-mono tracking-tighter uppercase">v1.0.4-stable</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar relative z-10">
        <div className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Sessions</div>
        {sessions.map((session) => (
          <button
            key={session.session_id}
            onClick={() => setActiveSessionId(session.session_id)}
            className={clsx(
              "w-full group flex items-center gap-3 px-3 py-2 rounded transition-all duration-150 text-left border",
              activeSessionId === session.session_id 
                ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300 shadow-[0_0_15px_rgba(79,70,229,0.05)]" 
                : "text-slate-500 border-transparent hover:bg-white/5 hover:text-slate-300"
            )}
          >
            <div className={clsx(
              "w-1.5 h-1.5 rounded-full shrink-0",
              activeSessionId === session.session_id ? "bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.6)]" : "bg-slate-700"
            )} />
            <span className="flex-1 truncate text-xs font-mono">{session.title}</span>
            <Trash2 
              size={12} 
              className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity" 
              onClick={(e) => handleDeleteSession(session.session_id, e)}
            />
          </button>
        ))}
      </div>

      <form onSubmit={handleCreateSession} className="p-4 border-t border-white/5 relative z-10">
        <div className="relative">
          <input
            type="text"
            value={newSessionTitle}
            onChange={(e) => setNewSessionTitle(e.target.value)}
            placeholder="Initialize session..."
            className="w-full bg-slate-900/60 border border-white/15 rounded py-2 pl-3 pr-10 text-xs font-mono focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-500"
          />
          <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-indigo-400 transition-colors">
            <Plus size={16} />
          </button>
        </div>
      </form>
    </aside>
  );
}
