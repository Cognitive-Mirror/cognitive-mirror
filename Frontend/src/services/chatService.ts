/**
 * Workspace messaging — person-to-person chat backed by Firestore.
 *
 * This is human-to-human messaging. It is NOT an AI assistant and must not be
 * labelled as one in the UI (see Docs/AI_BACKEND_WORKFLOW.md §9 and the
 * Impact AI Thesis Risk 1: "It becomes a chatbot").
 */

import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";

import { db } from "./firebase";

export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: Timestamp | null;
};

function messagesCollection(chatId: string) {
  return collection(db, "chats", chatId, "messages");
}

export async function sendMessage(
  chatId: string,
  message: {
    senderId: string;
    senderName: string;
    text: string;
  },
) {
  return addDoc(messagesCollection(chatId), {
    ...message,
    timestamp: serverTimestamp(),
  });
}

export function subscribeToMessages(
  chatId: string,
  onMessages: (messages: ChatMessage[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(messagesCollection(chatId), orderBy("timestamp", "asc"));

  return onSnapshot(
    q,
    (snapshot) => {
      onMessages(
        snapshot.docs.map((doc) => {
          const data = doc.data();

          return {
            id: doc.id,
            senderId: data.senderId ?? "",
            senderName: data.senderName ?? "",
            text: data.text ?? "",
            timestamp: (data.timestamp as Timestamp) ?? null,
          };
        }),
      );
    },
    (error) => {
      onError?.(error);
    },
  );
}
