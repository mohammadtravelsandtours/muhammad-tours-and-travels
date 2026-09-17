'use client';

// Floating AI help widget — the only frontend surface for
// AiAssistantService (see apps/api/src/modules/ai-assistant), which
// existed with no UI anywhere in this codebase before this component.
// Optionally-authenticated: works for a signed-out visitor (a general
// question, a Hajj/Umrah package lookup) and gains booking-status
// lookups automatically once signed in, exactly matching the backend's
// OptionalJwtAuthGuard on POST /assistant/chat.
import { useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { ChatMessage } from '@/lib/assistant-types';
import { useAuth } from '@/lib/auth-context';

export function AiChatWidget() {
  const { accessToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Checked once on mount, not gated on `open`, so the launcher button
    // itself can stay hidden entirely when this deployment has no
    // ANTHROPIC_API_KEY configured — see AiAssistantService.isConfigured.
    apiClient
      .assistantStatus()
      .then((s) => setConfigured(s.configured))
      .catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  if (configured === false) return null;

  async function send() {
    const message = input.trim();
    if (!message || sending) return;
    setInput('');
    setError(null);
    const nextHistory = [...messages, { role: 'user' as const, content: message }];
    setMessages(nextHistory);
    setSending(true);
    try {
      const result = await apiClient.assistantChat({ message, history: messages.slice(-20) }, accessToken ?? undefined);
      setMessages([...nextHistory, { role: 'assistant', content: result.reply }]);
    } catch {
      setError("Sorry, something went wrong reaching support. Please try again, or use the contact options below.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50">
      {open && (
        <div className="mb-3 w-[calc(100vw-2rem)] max-w-sm h-[28rem] max-h-[70vh] rounded-lg border border-sand bg-ground shadow-xl flex flex-col overflow-hidden">
          <div className="bg-dusk-900 text-ground px-4 py-3 flex items-center justify-between shrink-0">
            <span className="text-sm font-medium">Muhammad Tours and Travels Help</span>
            <button onClick={() => setOpen(false)} aria-label="Close chat" className="text-ground/70 hover:text-ground">
              ✕
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 text-sm">
            {messages.length === 0 && (
              <p className="text-dusk-500">
                Ask about flights, hotels, Hajj/Umrah packages, deposits, or anything about Muhammad Tours and Travels.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`rounded-lg px-3 py-2 max-w-[85%] whitespace-pre-wrap ${
                    m.role === 'user' ? 'bg-dusk-900 text-ground' : 'bg-sand text-dusk-900'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && <div className="text-dusk-500 text-xs">Thinking…</div>}
            {error && <div className="text-tangerine-dim text-xs">{error}</div>}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="border-t border-sand p-2.5 flex gap-2 shrink-0"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a question…"
              className="flex-1 rounded-md border border-sand px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-dusk-500"
              maxLength={2000}
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="rounded-md bg-dusk-900 text-ground px-3.5 py-2 text-sm disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full bg-tangerine text-white w-14 h-14 shadow-lg flex items-center justify-center text-xl hover:opacity-90"
        aria-label={open ? 'Close help chat' : 'Open help chat'}
      >
        {open ? '✕' : '💬'}
      </button>
    </div>
  );
}
