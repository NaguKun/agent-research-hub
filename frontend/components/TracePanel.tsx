'use client';

import React, { useState } from 'react';
import { useStore, TraceNode as TraceNodeType, AgentStatus } from '@/lib/store';
import { api } from '@/lib/api';
import ReactMarkdown from 'react-markdown';
import { 
  ChevronRight, 
  ChevronDown, 
  CheckCircle2, 
  Circle, 
  PlayCircle, 
  XCircle, 
  HelpCircle,
  Cpu,
  Wrench,
  MessageSquare,
  FileText
} from 'lucide-react';
import { clsx } from 'clsx';

const StatusIcon = ({ status }: { status: AgentStatus }) => {
  switch (status) {
    case 'completed': return <CheckCircle2 size={14} className="text-emerald-400" />;
    case 'running': return <PlayCircle size={14} className="text-indigo-400 animate-pulse" />;
    case 'failed': return <XCircle size={14} className="text-red-400" />;
    case 'waiting_for_user': return <HelpCircle size={14} className="text-amber-400" />;
    default: return <Circle size={14} className="text-slate-600" />;
  }
};

const TraceNode = ({ nodeId, depth = 0 }: { nodeId: string; depth?: number }) => {
  const node = useStore((state) => state.traceNodes[nodeId]);
  const [isExpanded, setIsExpanded] = useState(true);

  if (!node) return null;

  return (
    <div className="space-y-1">
      <div 
        className={clsx(
          "group flex items-center gap-3 py-1.5 px-2 rounded transition-all duration-150 cursor-pointer border",
          node.status === 'running' ? "bg-indigo-500/5 border-indigo-500/30" : "hover:bg-white/5 border-transparent"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 shrink-0">
          {node.children.length > 0 ? (
            isExpanded ? <ChevronDown size={12} className="text-slate-600" /> : <ChevronRight size={12} className="text-slate-600" />
          ) : (
            <div className="w-3" />
          )}
          <StatusIcon status={node.status} />
        </div>
        
        <div className="flex-1 min-w-0 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className={clsx(
              "text-[11px] font-mono truncate",
              node.status === 'running' ? "text-indigo-300" : "text-slate-300"
            )}>
              {node.name}
            </span>
            <span className="text-[8px] font-mono text-slate-600 uppercase tracking-tighter shrink-0">
              [{node.role}]
            </span>
          </div>
          {node.status === 'running' && (
            <div className="flex gap-0.5">
              <div className="w-0.5 h-2 bg-indigo-500/40 animate-pulse" />
              <div className="w-0.5 h-2 bg-indigo-500/40 animate-pulse delay-75" />
              <div className="w-0.5 h-2 bg-indigo-500/40 animate-pulse delay-150" />
            </div>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="ml-3 pl-3 border-l border-white/5 space-y-4 py-2">
          {/* Thinking Steps */}
          {node.thinking.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[8px] font-mono font-bold text-slate-600 uppercase tracking-widest">
                <Cpu size={10} />
                <span>LOG_THOUGHTS</span>
              </div>
              <div className="space-y-1">
                {node.thinking.map((text, i) => (
                  <div key={i} className="text-[10px] font-mono text-slate-400 leading-relaxed bg-slate-900/30 p-2 rounded border border-white/10">
                    <span className="text-indigo-500/40 mr-2">[{i.toString().padStart(2, '0')}]</span>
                    {text}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tool Calls */}
          {node.tools.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[8px] font-mono font-bold text-slate-600 uppercase tracking-widest">
                <Wrench size={10} />
                <span>LOG_TOOLS</span>
              </div>
              <div className="space-y-2">
                {node.tools.map((tool) => (
                  <div key={tool.id} className="text-[10px] font-mono border border-white/10 rounded bg-slate-900/50 overflow-hidden">
                    <div className="flex items-center justify-between px-2 py-1 bg-white/10 border-b border-white/10">
                      <span className="text-indigo-400 text-[9px]">{tool.name}()</span>
                      <div className="flex items-center gap-2">
                        <span className={clsx(
                          "text-[8px] uppercase font-bold",
                          tool.status === 'running' ? "text-indigo-400 animate-pulse" : 
                          tool.status === 'error' ? "text-red-400" : "text-emerald-400"
                        )}>
                          {tool.status}
                        </span>
                      </div>
                    </div>
                    <div className="p-2 space-y-2">
                      <div className="space-y-1">
                        <span className="text-[8px] text-slate-600 uppercase font-bold">ARGS</span>
                        <pre className="text-[9px] text-slate-300 overflow-x-auto custom-scrollbar bg-slate-900/30 p-1.5 rounded border border-white/10">
                          {JSON.stringify(tool.input, null, 2)}
                        </pre>
                      </div>
                      {tool.output && (
                        <div className="space-y-1">
                          <span className="text-[8px] text-slate-600 uppercase font-bold">RETURN</span>
                          <pre className={clsx(
                            "text-[9px] overflow-x-auto custom-scrollbar bg-slate-900/30 p-1.5 rounded border border-white/10",
                            tool.status === 'error' ? "text-red-400/60" : "text-emerald-400/60"
                          )}>
                            {JSON.stringify(tool.output, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Agent Response */}
          {node.response && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[8px] font-mono font-bold text-slate-600 uppercase tracking-widest">
                <MessageSquare size={10} />
                <span>LOG_RESPONSE</span>
              </div>
              <div className="text-[10px] font-mono text-slate-400 bg-indigo-500/5 border border-indigo-500/10 p-2.5 rounded leading-relaxed">
                {node.response}
              </div>
            </div>
          )}

          {/* Children */}
          {node.children.length > 0 && (
            <div className="space-y-1 pt-1">
              {node.children.map((childId) => (
                <TraceNode key={childId} nodeId={childId} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export function TracePanel() {
  const { rootNodeIds, artifacts, activeSessionId } = useStore();
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(null);
  const [artifactContent, setArtifactContent] = useState<string | null>(null);

  const handleViewArtifact = async (id: string) => {
    if (!activeSessionId) return;
    setSelectedArtifact(id);
    const content = await api.sessions.getArtifactContent(activeSessionId, id);
    setArtifactContent(content);
  };

  return (
    <div className="w-96 border-l border-white/10 bg-[#131b2e]/80 backdrop-blur-2xl flex flex-col h-full overflow-hidden relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_100%_100%,rgba(79,70,229,0.03)_0%,transparent_50%)] pointer-events-none" />
      
      <div className="p-6 border-b border-white/5 relative z-10">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500 font-mono">System_Trace_Log</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar relative z-10">
        {rootNodeIds.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-700 space-y-3">
            <Cpu size={20} className="opacity-10" />
            <p className="text-[10px] font-mono uppercase tracking-widest">Idle_State</p>
          </div>
        ) : (
          rootNodeIds.map((id) => <TraceNode key={id} nodeId={id} />)
        )}
      </div>

      {artifacts.length > 0 && (
        <div className="p-4 border-t border-white/10 bg-slate-900/50 relative z-10">
          <h3 className="text-[8px] font-mono font-bold uppercase tracking-[0.2em] text-slate-600 mb-3 px-2">Generated_Assets</h3>
          <div className="space-y-1.5">
            {artifacts.map((art) => (
              <button
                key={art.artifact_id}
                onClick={() => handleViewArtifact(art.artifact_id)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all text-left group"
              >
                <div className="w-7 h-7 rounded bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-center shrink-0 group-hover:border-emerald-500/40 transition-colors">
                  <FileText size={14} className="text-emerald-500/60" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-mono text-slate-300 truncate">{(art as any).filename || art.title}</p>
                  <p className="text-[8px] font-mono text-slate-600 uppercase tracking-tighter">{(art as any).content_type || art.type}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Artifact Modal */}
      {selectedArtifact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-12 bg-black/90 backdrop-blur-md animate-in fade-in">
          <div className="bg-[#0f1729] border border-white/15 rounded-lg w-full max-w-5xl max-h-full flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.5)] overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500/30" />
            
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <FileText size={18} className="text-indigo-400" />
                <h2 className="text-sm font-mono font-bold text-white uppercase tracking-widest">Asset_Viewer: {selectedArtifact}</h2>
              </div>
              <button 
                onClick={() => setSelectedArtifact(null)}
                className="p-2 hover:bg-white/5 rounded transition-colors text-slate-500 hover:text-white"
              >
                <XCircle size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
              <div className="prose prose-invert prose-indigo max-w-none prose-sm font-sans">
                <ReactMarkdown>{artifactContent || 'FETCHING_DATA...'}</ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Loader2({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
