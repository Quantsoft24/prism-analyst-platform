"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { routeIntent, INTENT_CONFIGS, type IntentConfig, type IntentType, type ToolCall } from "@/lib/mockData";

/* ── Chat simulation phases ── */
type Phase =
  | "idle"           // Ask screen
  | "thinking"       // Dots showing, agent "working"
  | "tools"          // Tool calls appearing one by one
  | "answering"      // Answer text streaming in
  | "done";          // Complete

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  toolCalls?: ToolCall[];
  visibleToolCount?: number;
  showAnswer?: boolean;
  isThinking?: boolean;
  streamedText?: string;
}

interface UseChatReturn {
  phase: Phase;
  messages: ChatMessage[];
  intentConfig: IntentConfig | null;
  activeIntent: IntentType | null;
  showWorkspace: boolean;
  send: (query: string) => void;
  followUp: (query: string) => void;
  reset: () => void;
}

/**
 * useChat — Simulates the agentic research flow
 *
 * Timeline (matching Lakshya mockup):
 * 0ms      — User message appears, thinking dots shown
 * 600ms    — Workspace pane slides in
 * 1100ms   — First tool call appears
 * +400ms   — Each subsequent tool call appears
 * +600ms   — After last tool, answer text fades in
 */
export function useChat(): UseChatReturn {
  const [phase, setPhase] = useState<Phase>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeIntent, setActiveIntent] = useState<IntentType | null>(null);
  const [intentConfig, setIntentConfig] = useState<IntentConfig | null>(null);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  /* Clean up timers on unmount */
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const addTimer = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  /* ── Send a query ── */
  const send = useCallback((query: string) => {
    clearTimers();

    const intent = routeIntent(query);
    const config = INTENT_CONFIGS[intent];
    setActiveIntent(intent);
    setIntentConfig(config);

    // Phase 1: User message + thinking dots
    setPhase("thinking");
    setShowWorkspace(false);
    setMessages([
      { role: "user", text: query },
      { role: "assistant", text: "", isThinking: true, toolCalls: config.tools, visibleToolCount: 0, showAnswer: false },
    ]);

    // Phase 2: Show workspace pane (600ms)
    addTimer(() => {
      setShowWorkspace(true);
    }, 600);

    // Phase 3: Start showing tool calls one by one (1100ms + 400ms each)
    addTimer(() => {
      setPhase("tools");
    }, 1100);

    config.tools.forEach((_, i) => {
      addTimer(() => {
        setMessages(prev => {
          const updated = [...prev];
          const assistantMsg = { ...updated[updated.length - 1] };
          assistantMsg.visibleToolCount = i + 1;
          assistantMsg.isThinking = false;
          updated[updated.length - 1] = assistantMsg;
          return updated;
        });
      }, 1100 + 400 * (i + 1));
    });

    // Phase 4: Show answer after all tools — stream word-by-word
    const totalToolTime = 1100 + 400 * (config.tools.length + 1);
    addTimer(() => {
      setPhase("answering");
      setMessages(prev => {
        const updated = [...prev];
        const assistantMsg = { ...updated[updated.length - 1] };
        assistantMsg.showAnswer = true;
        assistantMsg.streamedText = "";
        updated[updated.length - 1] = assistantMsg;
        return updated;
      });

      // Stream words one by one at ~30ms per word
      const words = config.answer.split(/(\s+)/);
      words.forEach((_, wi) => {
        addTimer(() => {
          setMessages(prev => {
            const updated = [...prev];
            const assistantMsg = { ...updated[updated.length - 1] };
            assistantMsg.streamedText = words.slice(0, wi + 1).join("");
            updated[updated.length - 1] = assistantMsg;
            return updated;
          });
        }, 30 * (wi + 1));
      });

      // Phase 5: Done — after all words streamed
      addTimer(() => {
        setPhase("done");
      }, 30 * words.length + 200);
    }, totalToolTime);

  }, [clearTimers, addTimer]);

  /* ── Follow-up message ── */
  const followUp = useCallback((query: string) => {
    clearTimers();

    // Add user message + thinking assistant
    setMessages(prev => [
      ...prev,
      { role: "user", text: query },
      { role: "assistant", text: "", isThinking: true },
    ]);
    setPhase("thinking");

    // Simulate response after 1400ms — stream follow-up answer
    addTimer(() => {
      const followUpAnswer = "Got it. I've updated the workspace on the right with the additional detail you asked for. [1]";
      setMessages(prev => {
        const updated = [...prev];
        const lastMsg = { ...updated[updated.length - 1] };
        lastMsg.isThinking = false;
        lastMsg.text = followUpAnswer;
        lastMsg.showAnswer = true;
        lastMsg.streamedText = "";
        updated[updated.length - 1] = lastMsg;
        return updated;
      });
      setPhase("answering");

      // Stream words
      const words = followUpAnswer.split(/(\s+)/);
      words.forEach((_, wi) => {
        addTimer(() => {
          setMessages(prev => {
            const updated = [...prev];
            const lastMsg = { ...updated[updated.length - 1] };
            lastMsg.streamedText = words.slice(0, wi + 1).join("");
            updated[updated.length - 1] = lastMsg;
            return updated;
          });
        }, 30 * (wi + 1));
      });

      addTimer(() => {
        setPhase("done");
      }, 30 * words.length + 200);
    }, 1400);

  }, [clearTimers, addTimer]);

  /* ── Reset to ask screen ── */
  const reset = useCallback(() => {
    clearTimers();
    setPhase("idle");
    setMessages([]);
    setActiveIntent(null);
    setIntentConfig(null);
    setShowWorkspace(false);
  }, [clearTimers]);

  return { phase, messages, intentConfig, activeIntent, showWorkspace, send, followUp, reset };
}
