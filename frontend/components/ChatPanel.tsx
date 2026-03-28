'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { api } from '@/lib/api';
import { Send, User, Bot, Loader2, ExternalLink, HelpCircle, Zap, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { clsx } from 'clsx';

function ArtifactLinks({ artifactIds, align }: { artifactIds: string[]; align: 'start' | 'end' }) {
  const { artifacts, activeSessionId, setSelectedArtifact, setSelectedArtifactContent } = useStore();

  const handleOpen = async (artifactId: string) => {
    const art = artifacts.find(a => a.artifact_id === artifactId);
    if (!art || !activeSessionId) return;
    setSelectedArtifact(art);
    setSelectedArtifactContent('Loading artifact content...');
    try {
      const content = await api.sessions.getArtifactContent(activeSessionId, artifactId);
      setSelectedArtifactContent(content);
    } catch {
      setSelectedArtifactContent('Failed to load artifact.');
    }
  };

  return (
    <div className={clsx("flex flex-wrap gap-2 mt-3", align === 'end' ? "justify-end" : "justify-start")}>
      {artifactIds.map(id => {
        const art = artifacts.find(a => a.artifact_id === id);
        const label = art ? art.title : id.slice(0, 8) + '...';
        const filename = art?.filename || '';
        const isReport = filename === 'final_report.md';
        return (
          <button
            key={id}
            onClick={() => handleOpen(id)}
            className={clsx(
              "flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold border cursor-pointer transition-all group",
              isReport
                ? "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:shadow-md"
                : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 hover:shadow-md"
            )}
          >
            <FileText size={12} className="group-hover:scale-110 transition-transform" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

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
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
          <MessageSquare size={32} className="text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-500">Select or create a session to start</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-hidden relative scanline">
      {/* Status Ticker - Enhanced */}
      {isRunning && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-indigo-600 border border-indigo-700 shadow-lg rounded-full flex items-center gap-3 animate-in fade-in slide-in-from-top-4 transition-all scale-95 hover:scale-100">
          <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span className="text-[10px] font-bold text-white tracking-widest uppercase">
            {activeAgentName ? `PROCESS_ACTIVE: ${activeAgentName}` : 'SYSTEM_RUNNING...'}
          </span>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-8 space-y-8 custom-scrollbar relative z-10 max-w-5xl mx-auto w-full">
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={clsx(
              "flex gap-4 group",
              msg.role === 'user' ? "flex-row-reverse" : "flex-row"
            )}
          >
            <div className={clsx(
              "w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105",
              msg.role === 'user' ? "bg-indigo-600 border-indigo-700" : "bg-white border-slate-200"
            )}>
              {msg.role === 'user' ? <User size={16} className="text-white" /> : <Bot size={16} className="text-indigo-600" />}
            </div>
            
            <div className={clsx(
              "flex-1 max-w-[85%] space-y-2",
              msg.role === 'user' ? "text-right" : "text-left"
            )}>
              <div className={clsx(
                "flex items-center gap-2 mb-1",
                msg.role === 'user' ? "flex-row-reverse" : "flex-row"
              )}>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {msg.role === 'user' ? 'YOU' : 'AGENT'}
                </span>
                <span className="text-[9px] text-slate-300">
                  • {new Date(msg.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div className={clsx(
                "px-6 py-5 rounded-2xl border text-sm leading-relaxed font-sans transition-all",
                msg.role === 'user' 
                  ? "bg-indigo-50/50 border-indigo-100 text-slate-800 rounded-tr-none" 
                  : "bg-white border-slate-200 text-slate-800 shadow-sm rounded-tl-none hover:border-slate-300"
              )}>
                {msg.isThinking ? (
                  <div className="flex items-center gap-3 font-mono text-[11px] text-indigo-600">
                    <Loader2 size={12} className="animate-spin" />
                    <span className="animate-pulse">EXECUTING_THOUGHT_PROCESS...</span>
                  </div>
                ) : (
                  <div className="prose prose-sm max-w-none prose-indigo prose-table:border-collapse prose-th:bg-slate-50 prose-th:px-4 prose-th:py-2 prose-td:px-4 prose-td:py-2 prose-td:border-t prose-td:border-slate-100">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                )}
              </div>
              
              {msg.artifact_ids && msg.artifact_ids.length > 0 && (
                <ArtifactLinks artifactIds={msg.artifact_ids} align={msg.role === 'user' ? 'end' : 'start'} />
              )}
            </div>
          </div>
        ))}

        {pendingQuestion && (
          <div className="flex gap-6 max-w-[90%] mr-auto animate-in fade-in slide-in-from-left-4">
            <div className="w-8 h-8 rounded bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0 mt-1 shadow-sm">
              <HelpCircle size={14} className="text-amber-600" />
            </div>
            <div className="space-y-4 flex-1">
              <div className="px-5 py-4 rounded bg-amber-50/50 border border-amber-200 text-slate-800 text-sm shadow-sm backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-[10px] font-mono text-amber-700 uppercase tracking-[0.2em] font-bold">Awaiting_Input</span>
                </div>
                <p className="font-sans leading-relaxed">{pendingQuestion.question}</p>
              </div>
              
              <form onSubmit={handleAnswerQuestion} className="flex gap-2">
                <input
                  type="text"
                  value={answerInput}
                  onChange={(e) => setAnswerInput(e.target.value)}
                  placeholder="Enter response..."
                  className="flex-1 bg-white border border-slate-300 rounded px-4 py-2.5 text-xs font-mono focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 transition-all text-slate-800 placeholder:text-slate-400 shadow-sm"
                  autoFocus
                />
                <button 
                  type="submit"
                  className="bg-amber-100 border border-amber-300 hover:bg-amber-200 text-amber-800 px-5 py-2 rounded text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm"
                >
                  Confirm
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      <div className="p-8 pb-10 border-t border-slate-200 bg-white/50 backdrop-blur-2xl relative z-10">
        <form onSubmit={handleSendMessage} className="relative max-w-3xl mx-auto group">
          <div className="absolute -top-3 left-6 px-2 bg-indigo-600 text-[8px] font-bold text-white uppercase tracking-widest z-20 rounded shadow-sm opacity-0 group-focus-within:opacity-100 transition-opacity">
            Ready_For_Command
          </div>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 z-20">
            <button
              type="button"
              onClick={() => setAgentMode(agentMode === 'mock' ? 'real' : 'mock')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider border transition-all ${
                agentMode === 'real'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800'
              }`}
            >
              <Zap size={10} />
              {agentMode === 'real' ? 'REAL_API' : 'MOCK'}
            </button>
            <button 
              type="submit" 
              disabled={!input.trim() || isRunning || !!pendingQuestion}
              className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 transition-all shadow-md active:scale-95"
            >
              <Send size={18} />
            </button>
          </div>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isRunning || !!pendingQuestion}
            placeholder={isRunning ? "Processing agent pipeline..." : "Ask anything — e.g. Analyze market trends"}
            className="w-full bg-slate-50/50 border border-slate-200 rounded-2xl py-5 pl-8 pr-32 text-sm focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-slate-400 text-slate-800 shadow-inner"
          />
        </form>
      </div>
    </div>
  );
}

function MessageSquare({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
