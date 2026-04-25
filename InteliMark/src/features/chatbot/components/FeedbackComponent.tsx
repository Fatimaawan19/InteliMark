import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThumbsUp, ThumbsDown, MessageSquare, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Feedback, saveFeedback, getMessageFeedback } from '@/services/feedbackService';

interface FeedbackComponentProps {
  messageId: string;
  messageContent: string;
  userId: string;
  sessionId: string;
  topic?: string;
  onFeedbackSubmitted?: (rating: 'helpful' | 'unhelpful') => void;
}

export const FeedbackComponent = ({
  messageId,
  messageContent,
  userId,
  sessionId,
  topic,
  onFeedbackSubmitted,
}: FeedbackComponentProps) => {
  const [rating, setRating] = useState<'helpful' | 'unhelpful' | null>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load existing feedback on mount
  useEffect(() => {
    const loadFeedback = async () => {
      try {
        const existingFeedback = await getMessageFeedback(userId, messageId);
        if (existingFeedback) {
          setRating(existingFeedback.rating);
          if (existingFeedback.comment) {
            setComment(existingFeedback.comment);
          }
        }
      } catch (error) {
        console.error('Error loading feedback:', error);
      }
    };

    if (userId && messageId) {
      loadFeedback();
    }
  }, [messageId, userId]);

  const handleSubmitFeedback = async (selectedRating: 'helpful' | 'unhelpful') => {
    setIsSubmitting(true);
    try {
      const feedback: Feedback = {
        userId,
        sessionId,
        messageId,
        messageContent,
        rating: selectedRating,
        comment: comment || undefined,
        topic,
        timestamp: new Date(),
      };

      await saveFeedback(feedback);
      setRating(selectedRating);

      if (onFeedbackSubmitted) {
        onFeedbackSubmitted(selectedRating);
      }

      // Reset comment after submission
      if (!comment) {
        setShowComment(false);
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
      alert('Failed to save feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Always show feedback buttons - no loading state
  return (
    <div className="flex items-center gap-2 text-xs mt-2">
      <span className="text-gray-600 font-medium">Helpful?</span>

      {/* Helpful Button */}
      <button
        onClick={() => handleSubmitFeedback('helpful')}
        disabled={isSubmitting}
        className={`p-1.5 rounded-lg transition-all ${
          rating === 'helpful'
            ? 'bg-green-100 text-green-600'
            : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
        }`}
        title="This response was helpful"
      >
        <ThumbsUp className="h-4 w-4" />
      </button>

      {/* Unhelpful Button */}
      <button
        onClick={() => {
          setRating('unhelpful');
          setShowComment(true);
        }}
        disabled={isSubmitting}
        className={`p-1.5 rounded-lg transition-all ${
          rating === 'unhelpful'
            ? 'bg-red-100 text-red-600'
            : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
        }`}
        title="This response needs improvement"
      >
        <ThumbsDown className="h-4 w-4" />
      </button>

      {/* Comment Button */}
      <button
        onClick={() => setShowComment(!showComment)}
        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
        title="Add feedback comment"
      >
        <MessageSquare className="h-4 w-4" />
      </button>

      {/* Comment Input */}
      {showComment && (
        <div className="flex items-center gap-1 ml-2">
          <input
            type="text"
            placeholder="Tell us why..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={100}
            className="text-xs px-2 py-1 border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-purple-400 w-40"
          />
          <button
            onClick={() => {
              if (rating) {
                handleSubmitFeedback(rating);
              } else {
                handleSubmitFeedback('unhelpful');
              }
            }}
            disabled={isSubmitting || !comment.trim()}
            className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? '...' : 'Send'}
          </button>
          <button
            onClick={() => setShowComment(false)}
            className="p-0.5 text-gray-400 hover:text-gray-600"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
};

export default FeedbackComponent;
