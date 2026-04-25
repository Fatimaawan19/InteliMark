// Learning flow state management

export interface LearningFlowState {
  topicAsked?: string;
  isWaitingForNoteConfirmation?: boolean;
}

/**
 * Check if user is asking to learn (not directly asking for notes)
 * "Explain DSA" vs "Notes on DSA"
 */
export const isLearningTopicQuestion = (userMessage: string): string | null => {
  const message = userMessage.toLowerCase().trim();
  
  // Check if it's asking for notes directly
  const notesMatch = message.match(/\b(notes on|notes for|notes about|study notes|notes:)\s+(.+?)(?:\?|$)/i);
  if (notesMatch) {
    return null; // This is a notes request, not a learning question
  }
  
  // Check for learning intent patterns
  const learningPatterns = [
    /(?:explain|teach|tell me about|what is|what's|how do|how does|introduction to|learn about|understand)\s+(.+?)(?:\?|$)/i,
    /(?:help me with|assist with|guide on|tutorial|course on|teach me)\s+(.+?)(?:\?|$)/i,
    /(.+?)\s+(?:explanation|explanation|tutorial|guide|introduction|overview)/i,
  ];
  
  for (const pattern of learningPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      return match[1].trim().replace(/[?!.]+$/, '');
    }
  }
  
  return null;
};

/**
 * Create ask confirmation message for learning topics
 */
export const createNoteConfirmationMessage = (topic: string): string => {
  const topicFormatted = topic.charAt(0).toUpperCase() + topic.slice(1);
  return `I can help you understand ${topicFormatted}! 📚\n\nWould you like me to share learning notes and resources for ${topicFormatted}? I can provide you with an overview along with helpful links to study materials and video tutorials.`;
};

/**
 * Check if user confirmed they want notes
 */
export const isConfirmingNotes = (userMessage: string): boolean => {
  const message = userMessage.toLowerCase().trim();
  
  const confirmPatterns = [
    /\b(yes|yeah|yep|sure|okay|ok|please|go ahead|share|show me|send|give me)\b/i,
  ];
  
  return confirmPatterns.some(pattern => pattern.test(message));
};

/**
 * Check if user is declining notes
 */
export const isDecliningNotes = (userMessage: string): boolean => {
  const message = userMessage.toLowerCase().trim();
  
  const declinePatterns = [
    /\b(no|nope|not|don't|doesn't|won't|skip|nevermind|later)\b/i,
  ];
  
  return declinePatterns.some(pattern => pattern.test(message));
};
