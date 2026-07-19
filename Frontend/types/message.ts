import { Timestamp } from "firebase/firestore";

export interface Message {
  id?: string;
  senderId: string;
  text: string;
  timestamp: Timestamp | null;
}