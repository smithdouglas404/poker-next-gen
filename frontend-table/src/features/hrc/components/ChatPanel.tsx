import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { wsClient } from "@/lib/ws-client";
import { MessageSquare, Send, X, ChevronRight, Mic } from "lucide-react";

interface ChatMessage {
  id: string;
  userId: string;
  displayName: string;
  message: string;
  timestamp: number;
  isSystem?: boolean;
}

interface ChatPanelProps {
  isMultiplayer?: boolean;
  sendChat?: (message: string) => void;
}

export function ChatPanel({ isMultiplayer, sendChat }: ChatPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Helper to push a message
  const pushMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => [...prev, msg].slice(-100));
    if (!isOpen) setUnreadCount(prev => prev + 1);
  }, [isOpen]);

  // Listen for incoming chat messages + system events
  useEffect(() => {
    if (!isMultiplayer) return;

    const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const unsubChat = wsClient.on("chat", (msg: any) => {
      pushMessage({
        id: makeId(),
        userId: msg.userId,
        displayName: msg.displayName,
        message: msg.message,
        timestamp: Date.now(),
      });
    });

    const unsubJoin = wsClient.on("player_joined", (msg: any) => {
      pushMessage({
        id: makeId(),
        userId: "system",
        displayName: "System",
        message: `${msg.displayName || "A player"} joined the table`,
        timestamp: Date.now(),
        isSystem: true,
      });
    });

    const unsubLeave = wsClient.on("player_left", (msg: any) => {
      pushMessage({
        id: makeId(),
        userId: "system",
        displayName: "System",
        message: `${msg.displayName || "A player"} left the table`,
        timestamp: Date.now(),
        isSystem: true,
      });
    });

    const unsubShowdown = wsClient.on("showdown", (msg: any) => {
      if (msg.results?.length > 0) {
        const winner = msg.results[0];
        pushMessage({
          id: makeId(),
          userId: "system",
          displayName: "System",
          message: `${winner.displayName || "Winner"} wins ${winner.amount ? "$" + winner.amount.toLocaleString() : "the pot"}`,
          timestamp: Date.now(),
          isSystem: true,
        });
      }
    });

    const unsubBlind = wsClient.on("blind_increase", (msg: any) => {
      pushMessage({
        id: makeId(),
        userId: "system",
        displayName: "System",
        message: `Blinds increased to ${msg.sb}/${msg.bb}${msg.ante ? ` (ante ${msg.ante})` : ""}`,
        timestamp: Date.now(),
        isSystem: true,
      });
    });

    const unsubTaunt = wsClient.on("taunt", (msg: any) => {
      if (msg.userId && msg.text) {
        pushMessage({
          id: makeId(),
          userId: msg.userId,
          displayName: msg.displayName || "Player",
          message: `\ud83d\udce2 ${msg.text}`,
          timestamp: Date.now(),
        });
      }
    });

    const unsubHistory = wsClient.on("chat_history", (msg: any) => {
      if (msg.messages?.length > 0) {
        const historyMsgs: ChatMessage[] = msg.messages.map((m: any) => ({
          id: `hist-${m.timestamp}-${Math.random().toString(36).slice(2, 6)}`,
          userId: m.userId,
          displayName: m.displayName,
          message: m.message,
          timestamp: new Date(m.timestamp).getTime(),
        }));
        setMessages(prev => [...historyMsgs, ...prev].slice(-100));
      }
    });

    return () => {
      unsubChat();
      unsubJoin();
      unsubLeave();
      unsubShowdown();
      unsubBlind();
      unsubTaunt();
      unsubHistory();
    };
  }, [isMultiplayer, pushMessage]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Clear unread when opening
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || !sendChat) return;
    sendChat(trimmed);
    setInput("");
  }, [input, sendChat]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Speech-to-text
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const hasSpeechAPI = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const toggleSpeech = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setIsListening(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR || !sendChat) return;

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = async (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (!transcript) return;
      const isNonEnglish = /[^\x00-\x7F]/.test(transcript);
      if (isNonEnglish) {
        try {
          const resp = await fetch("/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: transcript }), credentials: "include" });
          if (resp.ok) {
            const data = await resp.json();
            sendChat(data.translated !== data.original ? `${data.translated} (translated)` : transcript);
          } else sendChat(transcript);
        } catch { sendChat(transcript); }
      } else sendChat(transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => { setIsListening(false); recognitionRef.current = null; };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [sendChat]);

  if (!isMultiplayer) return null;

  return (
    <>
      {/* Toggle button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="fixed right-4 bottom-32 z-40 glass rounded-full p-3 border border-white/10 hover:border-amber-500/30 transition-all shadow-lg"
          >
            <MessageSquare className="w-5 h-5 text-amber-400" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[0.5625rem] font-bold flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 bottom-0 w-72 z-40 flex flex-col"
            style={{
              background: "rgba(5, 10, 20, 0.95)",
              borderLeft: "1px solid rgba(255,255,255,0.05)",
              backdropFilter: "blur(20px)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-white">Chat</span>
                <span className="text-[0.5625rem] text-gray-600">{messages.length}</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-white/5 rounded transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 scrollbar-thin">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <MessageSquare className="w-8 h-8 text-gray-700 mb-2" />
                  <p className="text-[0.625rem] text-gray-600">No messages yet</p>
                  <p className="text-[0.5625rem] text-gray-700">Say something to the table!</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="group"
                  >
                    {msg.isSystem ? (
                      <div className="flex items-center gap-1.5 py-0.5">
                        <div className="flex-1 h-px bg-white/5" />
                        <span className="text-[0.5625rem] italic text-amber-500/60 shrink-0">
                          {msg.message}
                        </span>
                        <div className="flex-1 h-px bg-white/5" />
                      </div>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[0.625rem] font-bold text-amber-400 shrink-0">
                            {msg.displayName}
                          </span>
                          <span className="text-[0.5625rem] text-gray-700">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="text-xs text-gray-300 leading-relaxed break-words">
                          {msg.message}
                        </p>
                      </>
                    )}
                  </motion.div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-3 py-2 border-t border-white/5">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type or speak..."
                  maxLength={200}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50 transition-colors"
                />
                {hasSpeechAPI && (
                  <button
                    onClick={toggleSpeech}
                    className={`p-2 rounded-lg border transition-colors ${
                      isListening
                        ? "bg-red-500/20 border-red-500/30 animate-pulse"
                        : "bg-white/5 border-white/10 hover:bg-white/10"
                    }`}
                    title={isListening ? "Stop recording" : "Voice input"}
                  >
                    <Mic className={`w-3.5 h-3.5 ${isListening ? "text-red-400" : "text-gray-400"}`} />
                  </button>
                )}
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/30 hover:bg-amber-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Send className="w-3.5 h-3.5 text-amber-400" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
