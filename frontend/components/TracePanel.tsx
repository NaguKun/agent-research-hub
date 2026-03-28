'use client';

import React, { useState } from 'react';
import { useStore, TraceNode as TraceNodeType, Artifact } from '@/lib/store';
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
  Check,
  X,
  Compass,
  FileText
} from 'lucide-react';
import { clsx } from 'clsx';

const StatusMarker = ({ status }: { status: string }) => {
  switch (status) {
    case 'running': return <div className="w-4 h-4 rounded-full bg-indigo-100 flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-ping" /></div>;
    case 'completed': return <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center"><Check size={10} className="text-emerald-600" /></div>;
    case 'failed': return <div className="w-4 h-4 rounded-full bg-red-100 flex items-center justify-center"><X size={10} className="text-red-600" /></div>;
    case 'waiting_for_user': return <div className="w-4 h-4 rounded-full bg-amber-100 flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" /></div>;
    default: return <div className="w-4 h-4 rounded-full bg-slate-100" />;
  }
};

const ChildrenGroup = ({ childIds, depth }: { childIds: string[]; depth: number }) => {
  const { traceNodes } = useStore();

  // Detect parallel execution: children sharing the same parent that are both 'running' 
  // or were running simultaneously (both have no ended_at yet, or same-name agents)
  const children = childIds.map(id => traceNodes[id]).filter(Boolean);

  // Group by agent_name to detect parallel instances of the same agent type
  const nameCounts: Record<string, number> = {};
  children.forEach(c => { nameCounts[c.name] = (nameCounts[c.name] || 0) + 1; });
  const hasParallelInstances = Object.values(nameCounts).some(count => count >= 2);

  // Also detect: multiple siblings currently running at the same time
  const runningCount = children.filter(c => c.status === 'running').length;
  const isParallel = hasParallelInstances || runningCount >= 2;

  if (isParallel) {
    return (
      <div className="space-y-2">
        {/* Parallel execution indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-violet-50 border border-dashed border-violet-300 rounded-xl">
          <div className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-violet-600">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            <span className="text-[9px] font-bold text-violet-700 uppercase tracking-[0.15em]">
              Parallel Execution
            </span>
          </div>
          <span className="text-[9px] font-bold text-violet-500 bg-violet-100 px-2 py-0.5 rounded-full ml-auto">
            {children.length} agents
          </span>
        </div>

        {/* Parallel children rendered in a grid */}
        <div className="grid grid-cols-1 gap-2 pl-2 border-l-2 border-dashed border-violet-200">
          {childIds.map((childId) => (
            <TraceNode key={childId} nodeId={childId} depth={depth + 1} />
          ))}
        </div>
      </div>
    );
  }

  // Sequential (non-parallel) — render normally
  return (
    <div className="space-y-3">
      {childIds.map((childId) => (
        <TraceNode key={childId} nodeId={childId} depth={depth + 1} />
      ))}
    </div>
  );
};

const TraceNode = ({ nodeId, depth = 0 }: { nodeId: string; depth?: number }) => {
  const { traceNodes } = useStore();
  const [isExpanded, setIsExpanded] = useState(true);
  const node = traceNodes[nodeId];
  if (!node) return null;

  return (
    <div className="space-y-2">
      {/* Node Header */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className={clsx(
          "group flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all border",
          node.status === 'running' 
            ? "bg-indigo-50/50 border-indigo-200 shadow-[0_0_15px_rgba(99,102,241,0.1)]" 
            : "bg-white border-slate-200 hover:border-indigo-300 hover:shadow-md"
        )}
      >
        <div className="flex items-center gap-2 shrink-0">
          {node.children.length > 0 ? (
            isExpanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />
          ) : (
            <div className="w-3.5" />
          )}
          <StatusMarker status={node.status} />
        </div>
        
        <div className="flex-1 min-w-0 flex items-center justify-between">
          <div className="flex flex-col min-w-0">
            <span className={clsx(
              "text-xs font-bold truncate leading-none",
              node.status === 'running' ? "text-indigo-700" : "text-slate-900"
            )}>
              {node.name}
            </span>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              {node.role.replace('_', ' ')}
            </span>
          </div>
          {node.status === 'running' && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-100 rounded-full">
              <div className="w-1 h-1 rounded-full bg-indigo-600 animate-pulse" />
              <span className="text-[8px] font-bold text-indigo-600 uppercase">Active</span>
            </div>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className={clsx(
          "space-y-4 pt-1",
          depth >= 0 ? "ml-6 pl-4 border-l border-slate-100" : ""
        )}>
          {/* Content Card (only if it has content) */}
          {(node.thinking.length > 0 || node.tools.length > 0 || node.response) && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">
              {node.thinking.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest flex items-center gap-2">
                    <Cpu size={12} />
                    <span>Thought Process</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed italic border-l-2 border-indigo-200 pl-3">
                    {node.thinking[node.thinking.length - 1]}
                  </p>
                </div>
              )}

              {node.tools.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Wrench size={12} />
                    <span>Tool Activity</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {node.tools.map((t, i) => (
                      <div key={i} className={clsx(
                        "px-2.5 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1.5",
                        t.status === 'completed' ? "bg-emerald-50 border-emerald-100 text-emerald-700" : 
                        t.status === 'error' ? "bg-red-50 border-red-100 text-red-700" :
                        "bg-white border-slate-200 text-slate-500"
                      )}>
                        {t.status === 'running' ? <div className="w-1 h-1 rounded-full bg-indigo-400 animate-pulse" /> : 
                         t.status === 'error' ? <X size={8} /> : <Check size={8} />}
                        {t.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {node.response && (
                <div className="space-y-1.5 pt-2 border-t border-slate-200/50">
                  <div className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                    <MessageSquare size={12} />
                    <span>Resolution</span>
                  </div>
                  <p className="text-[11px] text-slate-800 leading-relaxed font-medium">{node.response}</p>
                </div>
              )}
            </div>
          )}

          {/* Nested Children — with parallel execution detection */}
          {node.children.length > 0 && (
            <ChildrenGroup childIds={node.children} depth={depth} />
          )}
        </div>
      )}
    </div>
  );
};

export function TracePanel() {
  const { 
    rootNodeIds, 
    artifacts, 
    activeSessionId, 
    setSelectedArtifact, 
    setSelectedArtifactContent 
  } = useStore();

  const handleOpenArtifact = async (art: Artifact) => {
    setSelectedArtifact(art);
    setSelectedArtifactContent('Loading artifact content...');
    try {
      const content = await api.sessions.getArtifactContent(activeSessionId!, art.artifact_id);
      setSelectedArtifactContent(content);
    } catch (err) {
      setSelectedArtifactContent('Failed to load artifact.');
    }
  };

  return (
    <div className="w-[500px] border-l border-slate-200 bg-slate-50/50 flex flex-col h-full overflow-hidden relative z-20">
      <div className="p-8 pb-6 bg-white border-b border-slate-200 shadow-sm">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-1">Process Navigation</h2>
        <h3 className="text-sm font-bold text-slate-900">Execution Timeline</h3>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-10 custom-scrollbar relative">
        {rootNodeIds.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-6 opacity-60">
            <div className="w-20 h-20 rounded-3xl bg-white border border-slate-200 shadow-xl flex items-center justify-center">
              <Compass size={32} className="text-slate-200 animate-spin-slow" />
            </div>
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">System Idle</p>
              <p className="text-[10px] text-slate-300 mt-2">Waiting for a new research run...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {rootNodeIds.map((id) => <TraceNode key={id} nodeId={id} />)}
          </div>
        )}

        {/* Artifacts List */}
        {artifacts.length > 0 && (
          <div className="mt-12 pt-8 border-t border-slate-200">
            <div className="flex items-center justify-between mb-6 px-1">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Generated Deliverables</h4>
              <span className="text-[9px] font-bold text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-full">{artifacts.length} files</span>
            </div>
            <div className="grid gap-3">
              {artifacts.map((art) => {
                const isReport = art.filename === 'final_report.md';
                const isAnalysis = art.filename === 'data_analysis.md';
                const iconBg = isReport ? 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600' 
                  : isAnalysis ? 'bg-amber-50 text-amber-600 group-hover:bg-amber-600'
                  : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600';
                
                return (
                  <button
                    key={art.artifact_id}
                    onClick={() => handleOpenArtifact(art)}
                    className={clsx(
                      "flex items-center gap-4 p-4 bg-white border rounded-2xl hover:shadow-md transition-all group text-left",
                      isReport ? "border-indigo-200 hover:border-indigo-300" : "border-slate-200 hover:border-indigo-300"
                    )}
                  >
                    <div className={clsx(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 group-hover:text-white transition-colors",
                      iconBg
                    )}>
                      <FileText size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 truncate">{art.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{art.filename}</span>
                        <span className="text-[8px] text-slate-300">•</span>
                        <span className="text-[9px] font-bold text-indigo-400 bg-indigo-50 px-1.5 py-0.5 rounded">{art.agent_name}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
