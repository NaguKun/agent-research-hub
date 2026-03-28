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
    <aside className="w-80 border-r border-slate-200 bg-white flex flex-col h-full overflow-hidden relative shadow-lg z-40">
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-indigo-50/50 to-transparent pointer-events-none" />
      
      <div className="p-8 pb-6 flex items-center gap-4 relative z-10">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200">
          <Terminal size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-tight text-slate-900 font-sans leading-none">Deep Analyst</h1>
          <p className="text-[10px] text-indigo-500 font-bold tracking-tighter uppercase mt-1">Intelligence v1.0</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5 custom-scrollbar relative z-10">
        <div className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">Workspace / Sessions</div>
        {sessions.map((session) => (
          <button
            key={session.session_id}
            onClick={() => setActiveSessionId(session.session_id)}
            className={clsx(
              "w-full group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left border",
              activeSessionId === session.session_id 
                ? "bg-indigo-50 border-indigo-100 text-indigo-900 shadow-sm" 
                : "text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-800"
            )}
          >
            <div className={clsx(
              "w-2 h-2 rounded-full shrink-0 transition-all",
              activeSessionId === session.session_id ? "bg-indigo-500 scale-110 shadow-[0_0_10px_rgba(99,102,241,0.5)]" : "bg-slate-300 group-hover:bg-slate-400"
            )} />
            <span className="flex-1 truncate text-[13px] font-medium">{session.title}</span>
            <Trash2 
              size={14} 
              className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all transform translate-x-1 group-hover:translate-x-0" 
              onClick={(e) => handleDeleteSession(session.session_id, e)}
            />
          </button>
        ))}
      </div>

      <form onSubmit={handleCreateSession} className="p-6 bg-slate-50/50 border-t border-slate-200 relative z-10">
        <div className="relative">
          <input
            type="text"
            value={newSessionTitle}
            onChange={(e) => setNewSessionTitle(e.target.value)}
            placeholder="New Research Session..."
            className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-4 pr-10 text-sm focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all placeholder:text-slate-400 text-slate-800 shadow-sm"
          />
          <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-indigo-500 hover:text-indigo-700 transition-colors">
            <Plus size={18} />
          </button>
        </div>
      </form>
    </aside>
  );
}
