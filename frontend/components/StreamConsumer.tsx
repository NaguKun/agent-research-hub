'use client';

import { useEffect, useRef } from 'react';
import { useStore, AgentContext } from '@/lib/store';
import { api } from '@/lib/api';

export function StreamConsumer() {
  const { 
    activeSessionId, 
    upsertNode, 
    addThinking, 
    startTool, 
    endTool, 
    setIsRunning, 
    setActiveAgentName,
    setPendingQuestion,
    addMessage,
    setArtifacts
  } = useStore();
  
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!activeSessionId) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    const url = api.getStreamUrl(activeSessionId);
    const es = new EventSource(url);
    eventSourceRef.current = es;

    const handleEvent = (type: string, data: any) => {
      const { agent_context, payload, run_id } = data;
      const ctx = agent_context as AgentContext;

      if (ctx) {
        upsertNode({
          id: ctx.agent_id,
          name: ctx.agent_name,
          role: ctx.role,
          parent_id: ctx.parent_agent_id,
          status: 'running'
        });
        setActiveAgentName(ctx.agent_name);
      }

      switch (type) {
        case 'session_start':
          setIsRunning(true);
          break;

        case 'thinking':
          if (ctx) addThinking(ctx.agent_id, payload.text);
          break;

        case 'tool_start':
          if (ctx) startTool(ctx.agent_id, {
            id: payload.tool_use_id,
            name: payload.tool_name,
            input: payload.input_data
          });
          break;

        case 'tool_end':
          if (ctx) endTool(ctx.agent_id, payload.tool_use_id, payload.output_data, payload.is_error);
          break;

        case 'sub_agent_start':
          upsertNode({
            id: payload.child_agent_id,
            name: payload.child_agent_name,
            role: 'sub-agent',
            parent_id: ctx.agent_id,
            status: 'running'
          });
          break;

        case 'sub_agent_end':
          upsertNode({
            id: payload.child_agent_id,
            name: payload.child_agent_name,
            status: payload.status === 'completed' ? 'completed' : 'failed',
            summary: payload.summary
          });
          break;

        case 'agent_response':
          if (ctx) upsertNode({ id: ctx.agent_id, response: payload.text });
          break;

        case 'ask_user':
          setPendingQuestion({ question: payload.question, prompt_id: payload.prompt_id });
          upsertNode({ id: ctx.agent_id, status: 'waiting_for_user' });
          break;

        case 'ask_user_answered':
          setPendingQuestion(null);
          upsertNode({ id: ctx.agent_id, status: 'running' });
          break;

        case 'final_message':
          addMessage({
            id: Date.now().toString(),
            role: 'agent',
            content: payload.text,
            timestamp: new Date().toISOString(),
            artifact_ids: payload.artifact_ids
          });
          // Fetch artifacts list
          api.sessions.getArtifacts(activeSessionId).then(setArtifacts);
          break;

        case 'error':
          if (ctx) upsertNode({ id: ctx.agent_id, status: 'failed' });
          setIsRunning(false);
          break;

        case 'done':
          if (ctx) upsertNode({ id: ctx.agent_id, status: 'completed' });
          setIsRunning(false);
          setActiveAgentName(null);
          break;
      }
    };

    // SSE event types
    const eventTypes = [
      'session_start', 'thinking', 'tool_start', 'tool_end', 
      'sub_agent_start', 'sub_agent_end', 'agent_response', 
      'ask_user', 'ask_user_answered', 'final_message', 'error', 'done'
    ];

    eventTypes.forEach(type => {
      es.addEventListener(type, (e: any) => {
        try {
          const data = JSON.parse(e.data);
          handleEvent(type, data);
        } catch (err) {
          console.error('Error parsing SSE data', err);
        }
      });
    });

    es.onerror = (e) => {
      console.error('SSE Error', e);
      // Don't automatically close, let it retry if possible
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [activeSessionId, upsertNode, addThinking, startTool, endTool, setIsRunning, setActiveAgentName, setPendingQuestion, addMessage, setArtifacts]);

  return null;
}
