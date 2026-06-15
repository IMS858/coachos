"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

type Message = {
  id: string;
  client_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function MessageThread({
  clientId,
  viewerId,
  initialMessages,
  names,
}: {
  clientId: string;
  viewerId: string;
  initialMessages: Message[];
  names: Record<string, string>;
}) {
  const supabase = createClient();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Live updates: append inserts for this thread
  useEffect(() => {
    const channel = supabase
      .channel(`messages-${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // Mark incoming messages read on open
  useEffect(() => {
    supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("client_id", clientId)
      .neq("sender_id", viewerId)
      .is("read_at", null)
      .then(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, messages.length]);

  // Stick to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);

    const { data, error: err } = await supabase
      .from("messages")
      .insert({ client_id: clientId, sender_id: viewerId, body })
      .select()
      .single();

    setSending(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDraft("");
    // Append optimistically (realtime may also deliver it; de-duped by id)
    if (data) {
      setMessages((prev) =>
        prev.some((m) => m.id === data.id) ? prev : [...prev, data as Message]
      );
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[420px] rounded-xl border border-divider bg-navy-soft overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center text-sm text-cream-faint">
            No messages yet — say hi. 👋
          </div>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === viewerId;
          const name = names[m.sender_id] ?? "—";
          return (
            <div
              key={m.id}
              className={`flex items-end gap-2.5 ${mine ? "flex-row-reverse" : ""}`}
            >
              <Avatar name={name} size="sm" />
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                  mine
                    ? "bg-sky-500/20 border border-sky-400/40 text-cream rounded-br-md"
                    : "bg-navy-elev border border-divider text-cream rounded-bl-md"
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                <div className="mt-1 text-[10px] text-cream-faint">
                  {name.split(" ")[0]} · {fmtTime(m.created_at)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-divider p-3">
        {error && (
          <p className="text-xs text-status-attention px-1 pb-2">{error}</p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Type a message… (Enter to send)"
            className="flex-1 resize-none rounded-lg border border-divider bg-navy px-3.5 py-2.5 text-sm text-cream placeholder:text-cream-faint focus:outline-none focus:border-sky-400/60"
          />
          <Button onClick={send} disabled={sending || !draft.trim()}>
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
