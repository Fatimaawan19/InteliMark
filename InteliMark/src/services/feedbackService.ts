/**
 * Feedback & Rating Service
 * Handles storing and retrieving user feedback on chatbot responses
 */

import { db } from '../firebase';
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  updateDoc,
  doc,
  Timestamp,
  limit,
} from 'firebase/firestore';

export interface Feedback {
  id?: string;
  userId: string;
  sessionId: string;
  messageId: string;
  messageContent: string;
  rating: 'helpful' | 'unhelpful';
  comment?: string;
  topic?: string;
  timestamp: Timestamp | Date;
}

export interface FeedbackStats {
  totalRatings: number;
  helpfulCount: number;
  unhelpfulCount: number;
  helpfulPercentage: number;
  topicsWithMostFeedback: { topic: string; count: number }[];
  recentComments: { comment: string; rating: string; timestamp: Date }[];
}

const FEEDBACK_COLLECTION = 'feedback';

/**
 * Save feedback for a message
 */
export async function saveFeedback(feedback: Feedback): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, FEEDBACK_COLLECTION), {
      ...feedback,
      timestamp: Timestamp.now(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error saving feedback:', error);
    throw error;
  }
}

/**
 * Get feedback for a specific message
 */
export async function getMessageFeedback(
  userId: string,
  messageId: string
): Promise<Feedback | null> {
  try {
    const q = query(
      collection(db, FEEDBACK_COLLECTION),
      where('userId', '==', userId),
      where('messageId', '==', messageId)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return null;
    }

    return {
      id: snapshot.docs[0].id,
      ...snapshot.docs[0].data(),
    } as Feedback;
  } catch (error) {
    console.error('Error fetching message feedback:', error);
    return null;
  }
}

/**
 * Get feedback statistics for a user or session
 */
export async function getFeedbackStats(userId?: string, sessionId?: string): Promise<FeedbackStats> {
  try {
    let q;

    if (userId && sessionId) {
      q = query(
        collection(db, FEEDBACK_COLLECTION),
        where('userId', '==', userId),
        where('sessionId', '==', sessionId),
        orderBy('timestamp', 'desc'),
        limit(100)
      );
    } else if (userId) {
      q = query(
        collection(db, FEEDBACK_COLLECTION),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        limit(100)
      );
    } else {
      q = query(
        collection(db, FEEDBACK_COLLECTION),
        orderBy('timestamp', 'desc'),
        limit(500)
      );
    }

    const snapshot = await getDocs(q);
    const feedbackItems = snapshot.docs.map(doc => doc.data() as Feedback);

    const helpfulCount = feedbackItems.filter(f => f.rating === 'helpful').length;
    const unhelpfulCount = feedbackItems.filter(f => f.rating === 'unhelpful').length;
    const totalRatings = feedbackItems.length;

    // Topic statistics
    const topicCounts: { [key: string]: number } = {};
    feedbackItems.forEach(f => {
      if (f.topic) {
        topicCounts[f.topic] = (topicCounts[f.topic] || 0) + 1;
      }
    });

    const topicsWithMostFeedback = Object.entries(topicCounts)
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Recent comments
    const recentComments = feedbackItems
      .filter(f => f.comment)
      .map(f => ({
        comment: f.comment || '',
        rating: f.rating,
        timestamp: f.timestamp instanceof Timestamp ? f.timestamp.toDate() : (f.timestamp as Date),
      }))
      .slice(0, 10);

    return {
      totalRatings,
      helpfulCount,
      unhelpfulCount,
      helpfulPercentage: totalRatings > 0 ? Math.round((helpfulCount / totalRatings) * 100) : 0,
      topicsWithMostFeedback,
      recentComments,
    };
  } catch (error) {
    console.error('Error fetching feedback stats:', error);
    return {
      totalRatings: 0,
      helpfulCount: 0,
      unhelpfulCount: 0,
      helpfulPercentage: 0,
      topicsWithMostFeedback: [],
      recentComments: [],
    };
  }
}

/**
 * Update feedback (add comment or change rating)
 */
export async function updateFeedback(
  feedbackId: string,
  updates: Partial<Feedback>
): Promise<void> {
  try {
    await updateDoc(doc(db, FEEDBACK_COLLECTION, feedbackId), updates);
  } catch (error) {
    console.error('Error updating feedback:', error);
    throw error;
  }
}

/**
 * Get average rating for a topic
 */
export async function getTopicRating(topic: string): Promise<number> {
  try {
    const q = query(
      collection(db, FEEDBACK_COLLECTION),
      where('topic', '==', topic)
    );

    const snapshot = await getDocs(q);
    const feedbackItems = snapshot.docs.map(doc => doc.data() as Feedback);

    if (feedbackItems.length === 0) return 0;

    const helpfulCount = feedbackItems.filter(f => f.rating === 'helpful').length;
    return Math.round((helpfulCount / feedbackItems.length) * 100);
  } catch (error) {
    console.error('Error getting topic rating:', error);
    return 0;
  }
}

// ============================================
// CHATBOT SERVICE FEEDBACK (STAR RATINGS)
// ============================================

const CHATBOT_FEEDBACK_COLLECTION = 'chatbot_feedback';

export interface ChatbotFeedback {
  userId: string;
  topic: string;
  quizId: string;
  rating: number; // 1-5 stars
  comment: string;
  source: string;
  createdAt: any; // Firestore serverTimestamp
}

/**
 * Submit chatbot service feedback after quiz completion
 * @param feedbackData - Feedback data including rating (1-5), comment, topic, quizId
 * @returns Promise<string> - Document ID of saved feedback
 */
export async function submitChatbotFeedback(
  feedbackData: Omit<ChatbotFeedback, 'createdAt'>
): Promise<string> {
  try {
    console.log('[submitChatbotFeedback] Submitting feedback:', feedbackData);
    
    // Validate rating
    if (feedbackData.rating < 1 || feedbackData.rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    const docRef = await addDoc(collection(db, CHATBOT_FEEDBACK_COLLECTION), {
      ...feedbackData,
      createdAt: Timestamp.now(),
    });

    console.log('[submitChatbotFeedback] Feedback saved successfully with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('[submitChatbotFeedback] Error saving feedback:', error);
    throw error;
  }
}

/**
 * Get chatbot feedback statistics for analytics
 * @param userId - Optional user ID to filter feedback
 * @returns Promise<Object> - Statistics about chatbot feedback
 */
export async function getChatbotFeedbackStats(userId?: string) {
  try {
    let q;
    
    if (userId) {
      q = query(
        collection(db, CHATBOT_FEEDBACK_COLLECTION),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
    } else {
      q = query(
        collection(db, CHATBOT_FEEDBACK_COLLECTION),
        orderBy('createdAt', 'desc'),
        limit(100)
      );
    }

    const snapshot = await getDocs(q);
    const feedbackItems: any[] = [];
    snapshot.docs.forEach(doc => {
      feedbackItems.push({
        id: doc.id,
        ...(doc.data() as ChatbotFeedback)
      });
    });

    const totalCount = feedbackItems.length;
    const averageRating = totalCount > 0
      ? feedbackItems.reduce((sum, item) => sum + item.rating, 0) / totalCount
      : 0;

    const ratingDistribution = {
      1: feedbackItems.filter(f => f.rating === 1).length,
      2: feedbackItems.filter(f => f.rating === 2).length,
      3: feedbackItems.filter(f => f.rating === 3).length,
      4: feedbackItems.filter(f => f.rating === 4).length,
      5: feedbackItems.filter(f => f.rating === 5).length,
    };

    return {
      totalCount,
      averageRating: Math.round(averageRating * 10) / 10,
      ratingDistribution,
      recentFeedback: feedbackItems.slice(0, 10),
    };
  } catch (error) {
    console.error('[getChatbotFeedbackStats] Error:', error);
    return {
      totalCount: 0,
      averageRating: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      recentFeedback: [],
    };
  }
}
