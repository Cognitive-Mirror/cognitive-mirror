"use client";

/**
 * Workspace messaging panel.
 *
 * This is person-to-person messaging backed by Firestore. It is deliberately
 * NOT presented as an AI assistant: the Impact AI Thesis (§5, Risk 1) rules out
 * a general-purpose chatbot, and labelling a human chat channel as AI would
 * misrepresent the product. If conversational AI is added later it must be a
 * role-bounded, governed assist surface — not this panel.
 */

import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import ChatWindow from "@/components/ChatWindow";
import type { RoleId } from "@/lib/auth";
import { auth } from "@/services/firebase";

const roleChannelLabel: Record<RoleId, string> = {
  learner: "Direct messages",
  manager: "Team channel",
  admin: "Admin channel",
};

export default function DashboardChatPanel({ role }: { role: RoleId }) {
  const [open, setOpen] = useState(false);
  const channelLabel = roleChannelLabel[role] ?? roleChannelLabel.learner;
  const user = auth.currentUser;

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* ── Floating Action Button ── */}
      <button
        onClick={() => setOpen((previous) => !previous)}
        className={`chat-fab${open ? " is-open" : ""}`}
        aria-label={open ? "Close workspace messages" : "Open workspace messages"}
        aria-expanded={open}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* ── Chat Panel ── */}
      <div className={`chat-panel${open ? " is-open" : ""}`}>
        <div className="chat-panel-header">
          <div className="flex items-center gap-3">
            <div className="chat-panel-icon">
              <MessageCircle className="h-[18px] w-[18px] text-white" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold t-fg">Workspace messages</h3>
              <p className="text-[11px] t-subtle-fg">
                <span className="chat-status-dot" />
                {channelLabel}
              </p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="grid h-8 w-8 place-items-center rounded-lg transition hover:opacity-70"
            style={{ background: "var(--bg-subtle)" }}
            aria-label="Close message panel"
          >
            <X className="h-4 w-4 t-muted" />
          </button>
        </div>

        <div className="chat-panel-body">
          <ChatWindow
            conversationId={user?.uid ?? "anonymous"}
            currentUserId={user?.uid ?? "anonymous"}
            currentUserName={user?.displayName ?? user?.email ?? "User"}
            compact
          />
        </div>
      </div>
    </>
  );
}
