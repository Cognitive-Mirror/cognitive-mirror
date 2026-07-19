console.log("db =", db);
import { db } from "./firebase";

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
  }
)

{
  console.log("===== SEND START =====");
  console.log("db:", db);
  console.log("chatId:", chatId);
  console.log("message:", message);

  try {
    const ref = await addDoc(
      collection(db, "chats", chatId, "messages"),
      {
        ...message,
        timestamp: serverTimestamp(),
      }
    );

    console.log("SUCCESS");
    console.log(ref.id);
    console.log(ref.path);
    return ref;
  } catch (err) {
    console.error("Firestore Error:", err);
    throw err;
  }
}
export function subscribeToMessages(
  chatId: string,
  onMessages: (messages: ChatMessage[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {

  const q = query(
    messagesCollection(chatId),
    orderBy("timestamp", "asc")
  );

  return onSnapshot(
    q,
    (snapshot) => {

      const messages: ChatMessage[] = snapshot.docs.map((doc) => {
        const data = doc.data();

        return {
          id: doc.id,
          senderId: data.senderId ?? "",
          senderName: data.senderName ?? "",
          text: data.text ?? "",
          timestamp: (data.timestamp as Timestamp) ?? null,
        };
      });

      onMessages(messages);
    },
    (error) => {
      console.error(error);

      if (onError) {
        onError(error);
      }
    }
  );
}

