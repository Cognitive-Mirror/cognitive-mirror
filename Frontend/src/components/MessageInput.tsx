"use client";

import { type FormEvent, useState } from "react";

type MessageInputProps = {
  onSend: (text: string) => Promise<void>;
  disabled?: boolean;
};

export default function MessageInput({ onSend, disabled = false }: MessageInputProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = text.trim();

    if (!value || disabled) return;

    // Clear immediately so a slow Firestore acknowledgement cannot trap the
    // composer with the previous message or prevent new input.
    setText("");
    setSending(true);

    try {
      await onSend(value);
    } catch (error) {
      console.error("Could not send message:", error);
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 border-t border-white/10 p-4">
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Write a message..."
        aria-label="Message"
        disabled={disabled}
        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-indigo-400"
      />
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        className="rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending ? "Sending..." : "Send"}
      </button>
    </form>
  );
}
