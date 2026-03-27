'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { api } from '@/lib/api';
import { Send, User, Bot, Loader2, ExternalLink, HelpCircle, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { clsx } from 'clsx';

export function ChatPanel() {
  const { 
    activeSessionId, 
    messages, 
    setMessages, 
    addMessage, 
    isRunning, 
    setIsRunning, 
    pendingQuestion,
    setPendingQuestion,
    activeAgentName,
    agentMode,
    setAgentMode
  } = useStore();
  
  const [input, setInput] = useState('');
  const [answerInput, setAnswerInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeSessionId) {
      api.sessions.getMessages(activeSessionId).then(setMessages);
    }
  }, [activeSessionId, setMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeSessionId || isRunning) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: input,
      timestamp: new Date().toISOString(),
    };
    addMessage(userMessage);
    setInput('');
    setIsRunning(true);

    try {
      await api.sessions.sendMessage(activeSessionId, input, agentMode);
    } catch (err) {
      console.error(err);
      setIsRunning(false);
    }
  };

  const handleAnswerQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answerInput.trim() || !activeSessionId || !pendingQuestion) return;

    const promptId = pendingQuestion.prompt_id;
    const answer = answerInput;
    setAnswerInput('');
    setPendingQuestion(null);

    try {
      await api.sessions.answerQuestion(activeSessionId, promptId, answer);
    } catch (err) {
      console.error(err);
    }
  };

  if (!activeSessionId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-500 space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
          <MessageSquare size={32} />
        </div>
        <p className="text-sm font-medium">Select or create a session to start</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0f1729]/40 overflow-hidden relative scanline">
      {/* Status Ticker */}
      {isRunning && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/30 backdrop-blur-xl rounded flex items-center gap-3 shadow-[0_0_30px_rgba(79,70,229,0.1)] animate-in fade-in slide-in-from-top-4">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse shadow-[0_0_8px_rgba(129,140,248,1)]" />
          <span className="text-[10px] font-mono text-indigo-300 tracking-[0.1em] uppercase">
            {activeAgentName ? `PROCESS_ACTIVE: ${activeAgentName}` : 'SYSTEM_RUNNING...'}
          </span>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar relative z-10">
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={clsx(
              "flex gap-6 max-w-[90%]",
              msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
            )}
          >
            <div className={clsx(
              "w-8 h-8 rounded border flex items-center justify-center shrink-0 mt-1",
              msg.role === 'user' ? "bg-indigo-600/20 border-indigo-500/40" : "bg-slate-800 border-white/15"
            )}>
              {msg.role === 'user' ? <User size={14} className="text-indigo-300" /> : <Bot size={14} className="text-indigo-400" />}
            </div>
            
            <div className={clsx(
              "space-y-2 flex-1",
              msg.role === 'user' ? "text-right" : "text-left"
            )}>
              <div className="flex items-center gap-3 mb-1 opacity-40">
                <span className={clsx(
                  "text-[9px] font-mono uppercase tracking-widest",
                  msg.role === 'user' ? "order-2" : "order-1"
                )}>
                  {msg.role === 'user' ? 'USER_ID' : 'AGENT_ID'}
                </span>
                <div className="h-px flex-1 bg-white/5 order-2" />
                <span className="text-[9px] font-mono order-3">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>

              <div className={clsx(
                "px-5 py-4 rounded border text-sm leading-relaxed font-sans",
                msg.role === 'user' 
                  ? "bg-indigo-500/5 border-indigo-500/20 text-slate-200" 
                  : "bg-white/[0.05] border-white/10 text-slate-200 shadow-sm backdrop-blur-sm"
              )}>
                {msg.isThinking ? (
                  <div className="flex items-center gap-3 font-mono text-[11px] text-indigo-400/60">
                    <Loader2 size={12} className="animate-spin" />
                    <span className="animate-pulse">EXECUTING_THOUGHT_PROCESS...</span>
                  </div>
                ) : (
                  <div className="prose prose-invert prose-sm max-w-none prose-indigo">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                )}
              </div>
              
              {msg.artifact_ids && msg.artifact_ids.length > 0 && (
                <div className={clsx("flex flex-wrap gap-2 mt-3", msg.role === 'user' ? "justify-end" : "justify-start")}>
                  {msg.artifact_ids.map(id => (
                    <div key={id} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/5 border border-emerald-500/20 rounded text-[10px] text-emerald-400 font-mono cursor-pointer hover:bg-emerald-500/10 transition-colors group">
                      <ExternalLink size={10} className="group-hover:scale-110 transition-transform" />
                      <span>{id}.md</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {pendingQuestion && (
          <div className="flex gap-6 max-w-[90%] mr-auto animate-in fade-in slide-in-from-left-4">
            <div className="w-8 h-8 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0 mt-1">
              <HelpCircle size={14} className="text-amber-400" />
            </div>
            <div className="space-y-4 flex-1">
              <div className="px-5 py-4 rounded bg-amber-500/5 border border-amber-500/20 text-slate-200 text-sm shadow-sm backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-[10px] font-mono text-amber-400 uppercase tracking-[0.2em] font-bold">Awaiting_Input</span>
                </div>
                <p className="font-sans leading-relaxed">{pendingQuestion.question}</p>
              </div>
              
              <form onSubmit={handleAnswerQuestion} className="flex gap-2">
                <input
                  type="text"
                  value={answerInput}
                  onChange={(e) => setAnswerInput(e.target.value)}
                  placeholder="Enter response..."
                  className="flex-1 bg-slate-900/60 border border-white/15 rounded px-4 py-2.5 text-xs font-mono focus:outline-none focus:border-amber-500/50 transition-all"
                  autoFocus
                />
                <button 
                  type="submit"
                  className="bg-amber-600/20 border border-amber-500/40 hover:bg-amber-600/30 text-amber-300 px-5 py-2 rounded text-[10px] font-bold uppercase tracking-widest transition-all"
                >
                  Confirm
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      <div className="p-8 border-t border-white/10 bg-[#131b2e]/80 backdrop-blur-2xl relative z-10">
        <form onSubmit={handleSendMessage} className="relative max-w-4xl mx-auto">
          <div className="absolute -top-3 left-4 px-2 bg-[#131b2e] text-[9px] font-mono text-slate-500 uppercase tracking-widest z-10">
            Terminal_Input
          </div>
          <div className="absolute -top-3 right-4 z-10">
            <button
              type="button"
              onClick={() => setAgentMode(agentMode === 'mock' ? 'real' : 'mock')}
              className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider border transition-all ${
                agentMode === 'real'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-slate-800/50 border-white/10 text-slate-500 hover:text-slate-300'
              }`}
            >
              <Zap size={10} />
              {agentMode === 'real' ? 'REAL_API' : 'MOCK'}
            </button>
          </div>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isRunning || !!pendingQuestion}
            placeholder={isRunning ? "SYSTEM_BUSY..." : "Enter command or query..."}
            className="w-full bg-slate-900/60 border border-white/15 rounded py-4 pl-6 pr-14 text-xs font-mono focus:outline-none focus:border-indigo-500/50 transition-all disabled:opacity-30 disabled:cursor-not-allowed placeholder:text-slate-500"
          />
          <button 
            type="submit" 
            disabled={!input.trim() || isRunning || !!pendingQuestion}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded border border-indigo-500/30 bg-indigo-600/10 text-indigo-400 flex items-center justify-center hover:bg-indigo-600/20 disabled:border-white/5 disabled:bg-transparent disabled:text-slate-700 transition-all"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}

function MessageSquare({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
