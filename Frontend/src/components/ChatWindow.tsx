"use client";

import { useEffect, useRef, useState } from "react";
import MessageInput from "@/components/MessageInput";
import { sendMessage, subscribeToMessages, type ChatMessage } from "@/services/chatService";

type ChatWindowProps = {
  conversationId?: string;
  currentUserId?: string;
  currentUserName?: string;
  /** When true, renders with compact sizing for embedded panel use. */
  compact?: boolean;
};

export default function ChatWindow({
  conversationId = "chat-001",
  currentUserId = "learner001",
  currentUserName = "Learner",
  compact = false,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      return subscribeToMessages(
        conversationId,
        setMessages,
        (snapshotError) => setError(snapshotError.message || "Could not load messages."),
      );
    } catch (subscriptionError) {
      setError(subscriptionError instanceof Error ? subscriptionError.message : "Could not connect to Firebase.");
      return undefined;
    }
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(text: string) {
    try {
      setError(null);
      await sendMessage(conversationId, {
        text,
        senderId: currentUserId,
        senderName: currentUserName,
      });
    } catch (sendError) {
      console.error("Error in handleSend:", sendError);
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Could not send message."
      );
      throw sendError;
    }
  }

  return (
    <section
      className={
        compact
          ? "flex h-full w-full flex-col overflow-hidden t-fg"
          : "flex h-[min(720px,80vh)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 text-white shadow-2xl"
      }
    >
      {!compact && (
        <header className="border-b border-white/10 px-5 py-4">
          <h1 className="font-semibold">Chat</h1>
          <p className="text-xs text-zinc-400">Conversation: {conversationId}</p>
        </header>
      )}
      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        {messages.length === 0 && !error && (
          <p className="text-sm t-subtle-fg">No messages yet. Start the conversation.</p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.senderId === currentUserId
                ? "flex justify-end"
                : "flex justify-start"
            }
          >
            <div
              className={
                message.senderId === currentUserId
                  ? "chat-bubble-sent"
                  : "chat-bubble-received"
              }
            >
              {message.senderId !== currentUserId && (
                <p className="mb-1 text-[10px] font-semibold" style={{ color: "var(--accent-fg)" }}>
                  {message.senderName}
                </p>
              )}
              <p className="text-[13px] leading-relaxed">{message.text}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      {error && <p role="alert" className="px-5 pb-2 text-sm text-red-300">{error}</p>}
      <MessageInput onSend={handleSend} />
    </section>
  );
}
