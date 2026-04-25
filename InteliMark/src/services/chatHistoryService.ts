import { db } from "../firebase";
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";

export interface ChatMessage {
  id?: string;
  userId: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Timestamp | Date;
  sessionId: string;
  topicsCovered?: string[];
  attachments?: {
    type: string;
    url: string;
    name: string;
  }[];
}

export interface ChatSession {
  id?: string;
  userId: string;
  sessionName: string;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
  messageCount: number;
  topicsCovered: string[];
}

const CHAT_MESSAGES_COLLECTION = "chat_messages";
const CHAT_SESSIONS_COLLECTION = "chat_sessions";

/**
 * Save a message to Firebase
 */
export async function saveChatMessage(message: ChatMessage): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, CHAT_MESSAGES_COLLECTION), {
      ...message,
      timestamp: Timestamp.now(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Error saving chat message:", error);
    throw error;
  }
}

/**
 * Get chat history for a specific user and session
 */
export async function getChatHistory(
  userId: string,
  sessionId: string
): Promise<ChatMessage[]> {
  try {
    const q = query(
      collection(db, CHAT_MESSAGES_COLLECTION),
      where("userId", "==", userId),
      where("sessionId", "==", sessionId),
      orderBy("timestamp", "asc")
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as ChatMessage[];
  } catch (error) {
    console.error("Error fetching chat history:", error);
    return [];
  }
}

/**
 * Get all chat sessions for a user
 */
export async function getUserChatSessions(userId: string): Promise<ChatSession[]> {
  try {
    const q = query(
      collection(db, CHAT_SESSIONS_COLLECTION),
      where("userId", "==", userId),
      orderBy("updatedAt", "desc")
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as ChatSession[];
  } catch (error) {
    console.error("Error fetching chat sessions:", error);
    return [];
  }
}

/**
 * Create a new chat session
 */
export async function createChatSession(
  userId: string,
  sessionName?: string
): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, CHAT_SESSIONS_COLLECTION), {
      userId,
      sessionName: sessionName || `Chat - ${new Date().toLocaleDateString()}`,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      messageCount: 0,
      topicsCovered: [],
    });
    return docRef.id;
  } catch (error) {
    console.error("Error creating chat session:", error);
    throw error;
  }
}

/**
 * Update chat session metadata
 */
export async function updateChatSession(
  sessionId: string,
  updates: Partial<ChatSession>
): Promise<void> {
  try {
    await updateDoc(doc(db, CHAT_SESSIONS_COLLECTION, sessionId), {
      ...updates,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error("Error updating chat session:", error);
    throw error;
  }
}

/**
 * Delete a chat session and all its messages
 */
export async function deleteChatSession(
  userId: string,
  sessionId: string
): Promise<void> {
  try {
    // Delete all messages in the session
    const q = query(
      collection(db, CHAT_MESSAGES_COLLECTION),
      where("userId", "==", userId),
      where("sessionId", "==", sessionId)
    );

    const snapshot = await getDocs(q);
    for (const docSnapshot of snapshot.docs) {
      await deleteDoc(doc(db, CHAT_MESSAGES_COLLECTION, docSnapshot.id));
    }

    // Delete the session
    await deleteDoc(doc(db, CHAT_SESSIONS_COLLECTION, sessionId));
  } catch (error) {
    console.error("Error deleting chat session:", error);
    throw error;
  }
}

/**
 * Extract topics from a message using simple keywords
 */
export function extractTopics(message: string): string[] {
  const topics: string[] = [];
  const commonTopics = [
    "math",
    "algebra",
    "geometry",
    "calculus",
    "physics",
    "chemistry",
    "biology",
    "history",
    "english",
    "science",
    "programming",
    "python",
    "javascript",
    "react",
    "nodejs",
    "database",
    "sql",
  ];

  const lowerMessage = message.toLowerCase();
  commonTopics.forEach((topic) => {
    if (lowerMessage.includes(topic) && !topics.includes(topic)) {
      topics.push(topic);
    }
  });

  return topics;
}
