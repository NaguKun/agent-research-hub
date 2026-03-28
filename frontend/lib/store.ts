import { create } from 'zustand';

export type AgentStatus = 'queued' | 'running' | 'completed' | 'failed' | 'waiting_for_user';

export interface AgentContext {
  agent_id: string;
  agent_name: string;
  role: string;
  parent_agent_id: string | null;
}

export interface TraceNode {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  thinking: string[];
  tools: {
    id: string;
    name: string;
    input: any;
    output?: any;
    status: 'running' | 'completed' | 'error';
  }[];
  response?: string;
  children: string[]; // IDs of child nodes
  parent_id: string | null;
  summary?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
  isThinking?: boolean;
  prompt_id?: string;
  isQuestion?: boolean;
  artifact_ids?: string[];
}

export interface Session {
  session_id: string;
  title: string;
}

export interface Artifact {
  artifact_id: string;
  title: string;
  type: string;
  filename: string;
  agent_name: string;
}

interface AppState {
  sessions: Session[];
  activeSessionId: string | null;
  messages: Message[];
  traceNodes: Record<string, TraceNode>;
  rootNodeIds: string[];
  artifacts: Artifact[];
  isRunning: boolean;
  activeAgentName: string | null;
  pendingQuestion: { question: string; prompt_id: string } | null;
  agentMode: 'mock' | 'real';
  selectedArtifact: Artifact | null;
  selectedArtifactContent: string | null;
  
  // Actions
  setSessions: (sessions: Session[]) => void;
  setActiveSessionId: (id: string | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  
  // Trace Actions
  upsertNode: (node: Partial<TraceNode> & { id: string }) => void;
  addThinking: (agentId: string, text: string) => void;
  startTool: (agentId: string, tool: { id: string; name: string; input: any }) => void;
  endTool: (agentId: string, toolId: string, output: any, isError: boolean) => void;
  
  setArtifacts: (artifacts: Artifact[]) => void;
  setIsRunning: (isRunning: boolean) => void;
  setActiveAgentName: (name: string | null) => void;
  setPendingQuestion: (q: { question: string; prompt_id: string } | null) => void;
  setAgentMode: (mode: 'mock' | 'real') => void;
  resetRunState: () => void;
  syncData: (traceTree: any, messages: Message[], artifacts: Artifact[]) => void;
  setSelectedArtifact: (art: Artifact | null) => void;
  setSelectedArtifactContent: (content: string | null) => void;
}

export const useStore = create<AppState>((set) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],
  traceNodes: {},
  rootNodeIds: [],
  artifacts: [],
  isRunning: false,
  activeAgentName: null,
  pendingQuestion: null,
  agentMode: 'mock',
  selectedArtifact: null,
  selectedArtifactContent: null,

  setSessions: (sessions) => set({ sessions }),
  setActiveSessionId: (id) => set({ 
    activeSessionId: id, 
    messages: [], 
    traceNodes: {}, 
    rootNodeIds: [], 
    artifacts: [], 
    pendingQuestion: null, 
    isRunning: false,
    selectedArtifact: null,
    selectedArtifactContent: null
  }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, updates) => set((state) => ({
    messages: state.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
  })),

  upsertNode: (nodeUpdate) => set((state) => {
    const existing = state.traceNodes[nodeUpdate.id];
    const newNode = {
      name: existing?.name || '',
      role: existing?.role || '',
      status: existing?.status || 'queued',
      thinking: existing?.thinking || [],
      tools: existing?.tools || [],
      children: existing?.children || [],
      parent_id: existing?.parent_id || null,
      ...nodeUpdate,
    };

    const newTraceNodes = { ...state.traceNodes, [newNode.id]: newNode };
    let newRootNodeIds = [...state.rootNodeIds];

    if (newNode.parent_id) {
      const parent = newTraceNodes[newNode.parent_id];
      if (parent && !parent.children.includes(newNode.id)) {
        newTraceNodes[newNode.parent_id] = {
          ...parent,
          children: [...parent.children, newNode.id],
        };
      }
    } else if (!newRootNodeIds.includes(newNode.id)) {
      newRootNodeIds.push(newNode.id);
    }

    return { traceNodes: newTraceNodes, rootNodeIds: newRootNodeIds };
  }),

  addThinking: (agentId, text) => set((state) => {
    const node = state.traceNodes[agentId];
    if (!node) return state;
    return {
      traceNodes: {
        ...state.traceNodes,
        [agentId]: { ...node, thinking: [...node.thinking, text] },
      },
    };
  }),

  startTool: (agentId, tool) => set((state) => {
    const node = state.traceNodes[agentId];
    if (!node) return state;
    return {
      traceNodes: {
        ...state.traceNodes,
        [agentId]: {
          ...node,
          tools: [...node.tools, { ...tool, status: 'running' }],
        },
      },
    };
  }),

  endTool: (agentId, toolId, output, isError) => set((state) => {
    const node = state.traceNodes[agentId];
    if (!node) return state;
    return {
      traceNodes: {
        ...state.traceNodes,
        [agentId]: {
          ...node,
          tools: node.tools.map((t) =>
            t.id === toolId ? { ...t, output, status: isError ? 'error' : 'completed' } : t
          ),
        },
      },
    };
  }),

  setArtifacts: (artifacts) => set({ artifacts }),
  setIsRunning: (isRunning) => set({ isRunning }),
  setActiveAgentName: (name) => set({ activeAgentName: name }),
  setPendingQuestion: (q) => set({ pendingQuestion: q }),
  setAgentMode: (mode) => set({ agentMode: mode }),
  resetRunState: () => set({ traceNodes: {}, rootNodeIds: [], artifacts: [], pendingQuestion: null, isRunning: false, activeAgentName: null }),

  syncData: (traceTree, messages, artifacts) => set((state) => {
    if (!traceTree || !traceTree.node_id) {
      return { messages, artifacts };
    }

    const flatNodes: Record<string, TraceNode> = {};
    const rootIds: string[] = [];

    const flatten = (node: any) => {
      const newNode: TraceNode = {
        id: node.node_id,
        name: node.agent_name,
        role: node.role,
        status: node.status,
        thinking: node.events
          .filter((e: any) => e.event_type === 'thinking')
          .map((e: any) => e.payload.text),
        tools: node.events
          .filter((e: any) => e.event_type === 'tool_start' || e.event_type === 'tool_end')
          .reduce((acc: any[], e: any) => {
            if (e.event_type === 'tool_start') {
              acc.push({
                id: e.payload.tool_use_id,
                name: e.payload.tool_name,
                input: e.payload.input_data,
                status: 'running',
              });
            } else {
              const tool = acc.find((t) => t.id === e.payload.tool_use_id);
              if (tool) {
                tool.output = e.payload.output_data;
                tool.status = e.payload.is_error ? 'error' : 'completed';
              }
            }
            return acc;
          }, []),
        response: node.events.find((e: any) => e.event_type === 'agent_response')?.payload.text,
        children: node.children.map((c: any) => c.node_id),
        parent_id: node.parent_node_id,
        summary: node.summary,
      };

      flatNodes[newNode.id] = newNode;
      node.children.forEach(flatten);
    };

    flatten(traceTree);
    rootIds.push(traceTree.node_id);

    // Also check for pending questions in the whole tree
    let pendingQ = null;
    const allEvents = Object.values(flatNodes).flatMap(n => (n as any).events || []); 
    // Wait, the events are already on the traceTree nodes. 
    // Let's search the flatNodes (we need to preserve events in the TraceNode interface if we want to search them here, 
    // or just search while flattening).

    const findPending = (node: any) => {
      const askEvent = node.events.find((e: any) => e.event_type === 'ask_user');
      if (askEvent && node.status === 'waiting_for_user') {
        pendingQ = { question: askEvent.payload.question, prompt_id: askEvent.payload.prompt_id };
      }
      node.children.forEach(findPending);
    };
    findPending(traceTree);

    // activeAgentName
    const activeNode = Object.values(flatNodes).find(n => n.status === 'running');

    return { 
      traceNodes: flatNodes, 
      rootNodeIds: rootIds, 
      messages, 
      artifacts,
      pendingQuestion: pendingQ,
      activeAgentName: activeNode?.name || state.activeAgentName,
      isRunning: traceTree.status === 'running' || traceTree.status === 'waiting_for_user'
    };
  }),

  setSelectedArtifact: (art) => set({ selectedArtifact: art }),
  setSelectedArtifactContent: (content) => set({ selectedArtifactContent: content }),
}));
