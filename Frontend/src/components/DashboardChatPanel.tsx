"use client";

import { useState, useEffect } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import ChatWindow from "@/components/ChatWindow";
import type { RoleId } from "@/lib/auth";
import { auth } from "@/services/firebase";



const roleConfig = {
  learner: {
    channelLabel: "Private AI Assistant",
  },

  manager: {
    channelLabel: "Private AI Assistant",
  },

  admin: {
    channelLabel: "Private AI Assistant",
  },
};

export default function DashboardChatPanel({ role }: { role: RoleId }) {
  const [open, setOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);
  const config = roleConfig[role] ?? roleConfig.learner;
  const user = auth.currentUser;
  console.log("CONFIG =", config);
  function toggle() {
    setOpen((prev) => !prev);
    if (!open) setHasUnread(false);
  }

  /* close on Escape */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* ── Floating Action Button ── */}
      <button
        onClick={toggle}
        className={`chat-fab${open ? " is-open" : ""}`}
        aria-label={open ? "Close chat" : "Open chat"}
      >
        {hasUnread && !open && <span className="fab-badge">2</span>}
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* ── Chat Panel ── */}
      <div className={`chat-panel${open ? " is-open" : ""}`}>
        {/* Header */}
        <div className="chat-panel-header">
          <div className="flex items-center gap-3">
            <div className="chat-panel-icon">
              <MessageCircle className="h-[18px] w-[18px] text-white" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold t-fg">Workspace Chat</h3>
              <p className="text-[11px] t-subtle-fg">
                <span className="chat-status-dot" />
                Online · {config.channelLabel}
              </p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="grid h-8 w-8 place-items-center rounded-lg transition hover:opacity-70"
            style={{ background: "var(--bg-subtle)" }}
            aria-label="Close chat panel"
          >
            <X className="h-4 w-4 t-muted" />
          </button>
        </div>

        {/* Chat content (reuses existing ChatWindow) */}
        <div className="chat-panel-body">
        <ChatWindow
    conversationId={user?.uid ?? "anonymous"}
    currentUserId={user?.uid ?? "anonymous"}
    currentUserName={
        user?.displayName ??
        user?.email ??
        "User"
    }
    compact
/>
        </div>
      </div>
    </>
  );
}
