// Conversation flow handler for friendly tutoring interactions

export interface ConversationResponse {
  isHandled: boolean;
  response?: string;
}

// Check for greeting patterns
const greetingPatterns = /\b(hi|hello|hey|greetings|good morning|good afternoon|good evening|sup|yo|howdy)\b/i;

// Check for "how are you" patterns
const howAreYouPatterns = /\b(how are you|how's it going|how do you do|how you doing|hows everything)\b/i;

// Check for date/time request patterns
const dateTimePatterns = /\b(what (is|'s|are) the (date|time|day)|current (date|time)|today's date|what time is it|when is it)\b/i;

// Check for notes request patterns
const notesPatterns = /\b(notes on|notes for|notes about|study notes|notes:)\s+(.+?)(?:\?|$)/i;

// Greeting responses (varied to avoid robotic behavior)
const greetingResponses = [
  "Hi! 😊 How can I help you today?",
  "Hello! What would you like to learn today?",
  "Hey there! 👋 What topic interests you?",
  "Hi! I'm here to help. What would you like to explore?",
];

// "How are you" responses
const howAreYouResponses = [
  "I'm doing great, thanks for asking! 😊 What would you like to learn today?",
  "I'm here and ready to help! What topic can I assist you with?",
  "All good! What would you like to explore today?",
  "Doing wonderful! How can I help you learn something new?",
];

// Get random response from array
const getRandomResponse = (responses: string[]): string => {
  return responses[Math.floor(Math.random() * responses.length)];
};

// Get current date and time
const getDateTimeString = (): string => {
  const now = new Date();
  
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  
  const date = dateFormatter.format(now);
  const time = timeFormatter.format(now);
  
  return `Today is ${date} and the current time is ${time}.`;
};

/**
 * Extract topic from notes request
 */
const extractTopicFromNotes = (userMessage: string): string => {
  const match = userMessage.match(notesPatterns);
  if (match && match[2]) {
    return match[2].trim();
  }
  return 'these topic';
};

/**
 * Handle special conversation patterns before sending to API
 * Reduces unnecessary API calls and improves response speed
 */
export const handleConversationFlow = (userMessage: string): ConversationResponse => {
  const trimmedMessage = userMessage.trim().toLowerCase();

  // Handle greetings
  if (greetingPatterns.test(trimmedMessage)) {
    return {
      isHandled: true,
      response: getRandomResponse(greetingResponses),
    };
  }

  // Handle "how are you"
  if (howAreYouPatterns.test(trimmedMessage)) {
    return {
      isHandled: true,
      response: getRandomResponse(howAreYouResponses),
    };
  }

  // Handle date/time queries
  if (dateTimePatterns.test(trimmedMessage)) {
    return {
      isHandled: true,
      response: getDateTimeString(),
    };
  }

  // Handle notes requests
  if (notesPatterns.test(trimmedMessage)) {
    const topic = extractTopicFromNotes(userMessage);
    const topicFormatted = topic.charAt(0).toUpperCase() + topic.slice(1);
    return {
      isHandled: true,
      response: `HERE ARE THE ${topicFormatted.toUpperCase()} NOTES 📖\n\nWould you like me to explain any specific concept from this topic in detail?`,
    };
  }

  // Not handled - send to AI
  return {
    isHandled: false,
  };
};
