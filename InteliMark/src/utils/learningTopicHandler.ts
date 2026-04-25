// Learning topic detector and structured response handler

export interface StructuredLearningResponse {
  overview: string;
  resources: Array<{ title: string; url: string }>;
  videos: Array<{ title: string; url: string }>;
}

// Learning intent detection patterns - More specific patterns
const strongLearningPatterns = /\b(i want to learn|i would like to learn|teach me|help me learn|i need to learn|i'm learning|learning about|studying|course on|tutorial on|guide to|notes on)\b/i;

// Weaker patterns that need topic validation
const weakLearningPatterns = /\b(learn|understand|study|how to|what is|explain|tell me about|can you explain|what does|difference between|show me how|solve|answer)\b/i;

// Patterns that are NOT learning questions (unless document context exists)
const nonLearningPatternsWithoutDoc = /\b(my name|the time|today|date|who are you|what are you|how are you|thank you|thanks|hi|hello|hey|bye)\b/i;

// Document-related patterns (these are learning questions when document exists)
const documentQuestionPatterns = /\b(question \d+|q\d+|problem \d+|exercise \d+|explain.*(?:question|problem|exercise)|solve.*(?:question|problem)|what.*(?:question|problem))/i;

/**
 * Detect if user is asking a learning/tutoring question
 * Returns true only if it's clearly a learning intent
 * @param userMessage - The user's message
 * @param hasDocumentContext - Whether a document has been uploaded
 */
export const isLearningQuestion = (userMessage: string, hasDocumentContext: boolean = false): boolean => {
  const message = userMessage.toLowerCase().trim();
  
  // First check: if it matches non-learning patterns (greetings, personal), return false
  if (nonLearningPatternsWithoutDoc.test(message)) {
    return false;
  }
  
  // Special case: If document exists and message matches document question patterns, it's learning
  if (hasDocumentContext && documentQuestionPatterns.test(message)) {
    return true;
  }
  
  // Second check: if it matches strong learning patterns, return true
  if (strongLearningPatterns.test(message)) {
    return true;
  }
  
  // Third check: if it matches weak patterns, validate it has a topic
  if (weakLearningPatterns.test(message)) {
    // Extract potential topic after the learning keyword
    const topicMatch = message.match(/(?:learn|understand|explain|what is|tell me about|how to|study|solve|answer)\s+(.+)/i);
    if (topicMatch) {
      const potentialTopic = topicMatch[1].trim();
      // Check if topic is substantial (more than 2 words or a single technical term)
      const wordCount = potentialTopic.split(/\s+/).length;
      const isTechnicalTerm = /^[a-z]+(?:[A-Z][a-z]+)*$/.test(potentialTopic.replace(/\s+/g, '')); // camelCase or PascalCase
      
      return wordCount >= 2 || isTechnicalTerm || potentialTopic.length > 8;
    }
  }
  
  return false;
};

/**
 * Parse structured learning response from API
 * Expects response in format:
 * OVERVIEW:
 * [explanation text]
 * 
 * RESOURCES:
 * Title: https://url
 * Title: https://url
 * 
 * VIDEOS:
 * Title: https://youtube.com/watch?v=id
 * Title: https://youtube.com/watch?v=id
 */
export const parseStructuredResponse = (response: string): StructuredLearningResponse | null => {
  try {
    const overviewMatch = response.match(/OVERVIEW:?\s*([\s\S]*?)(?=RESOURCES:|VIDEOS:|$)/i);
    const resourcesMatch = response.match(/RESOURCES:?\s*([\s\S]*?)(?=VIDEOS:|$)/i);
    const videosMatch = response.match(/VIDEOS:?\s*([\s\S]*?)$/i);

    if (!overviewMatch) return null;

    const overview = overviewMatch[1].trim();
    
    const resources = parseLinks(resourcesMatch ? resourcesMatch[1] : '');
    const videos = parseLinks(videosMatch ? videosMatch[1] : '', true);

    if (resources.length === 0 && videos.length === 0) {
      return null; // Not a structured response
    }

    return { overview, resources, videos };
  } catch (error) {
    console.error('Error parsing structured response:', error);
    return null;
  }
};

/**
 * Parse links from text
 * Looks for patterns like:
 * Title: https://url
 * - Title: https://url
 */
const parseLinks = (text: string, isYoutube = false): Array<{ title: string; url: string }> => {
  const links: Array<{ title: string; url: string }> = [];
  
  // Match lines with title: url pattern
  const linePattern = /[-•]?\s*(.+?):\s*(https?:\/\/\S+)/gi;
  let match;

  while ((match = linePattern.exec(text)) !== null) {
    const title = match[1].trim();
    const url = match[2].trim();

    if (title && url) {
      links.push({ title, url });
    }
  }

  return links.slice(0, 2); // Return max 2 links
};

/**
 * Recommended high-quality resources for common topics
 */
export const defaultResources: { [key: string]: { title: string; url: string }[] } = {
  'dsa': [
    { title: 'GeeksforGeeks DSA', url: 'https://www.geeksforgeeks.org/data-structures/' },
    { title: 'Abdul Bari DSA Playlist', url: 'https://www.youtube.com/playlist?list=PLDN4rrl48XKpZkP4eTrMvDQ1IjZehl7Gi' }
  ],
  'data structures': [
    { title: 'GeeksforGeeks Data Structures', url: 'https://www.geeksforgeeks.org/data-structures/' },
    { title: 'MIT OpenCourseWare', url: 'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/' }
  ],
  'algorithms': [
    { title: 'GeeksforGeeks Algorithms', url: 'https://www.geeksforgeeks.org/algorithms/' },
    { title: 'LeetCode', url: 'https://leetcode.com/' }
  ],
  'javascript': [
    { title: 'MDN Web Docs - JavaScript', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/' },
    { title: 'freeCodeCamp JavaScript', url: 'https://www.freecodecamp.org/learn/javascript/' }
  ],
  'python': [
    { title: 'Python Official Docs', url: 'https://docs.python.org/3/' },
    { title: 'GeeksforGeeks Python', url: 'https://www.geeksforgeeks.org/python-programming-language/' }
  ],
  'react': [
    { title: 'React Official Docs', url: 'https://react.dev/' },
    { title: 'freeCodeCamp React', url: 'https://www.freecodecamp.org/learn/front-end-development-libraries/react/' }
  ],
  'web development': [
    { title: 'MDN Web Docs', url: 'https://developer.mozilla.org/' },
    { title: 'freeCodeCamp Web Dev', url: 'https://www.freecodecamp.org/learn/responsive-web-design/' }
  ],
};

/**
 * Recommended YouTube channels for common topics
 */
export const defaultVideos: { [key: string]: { title: string; url: string }[] } = {
  'dsa': [
    { title: 'Abdul Bari - Data Structures', url: 'https://www.youtube.com/watch?v=RBSUq3jIGQc' },
    { title: 'Jenny\'s Lectures - DSA', url: 'https://www.youtube.com/watch?v=AT14lCXuMKI' }
  ],
  'algorithms': [
    { title: 'MIT OpenCourseWare - Algorithms', url: 'https://www.youtube.com/watch?v=eKkXU3DFvyc' },
    { title: 'Abdul Bari - Algorithms', url: 'https://www.youtube.com/watch?v=0IAPZzGSbME' }
  ],
  'javascript': [
    { title: 'Traversy Media - JavaScript', url: 'https://www.youtube.com/watch?v=lfmg-EJ78ZU' },
    { title: 'freeCodeCamp JavaScript', url: 'https://www.youtube.com/watch?v=PkZYUXjMy4k' }
  ],
  'python': [
    { title: 'Corey Schafer - Python', url: 'https://www.youtube.com/watch?v=YYXdXT2l-Gg&list=PL-osiE80TeTt2d9bfVyTiXJA-UTHn6WwU' },
    { title: 'Programming with Mosh - Python', url: 'https://www.youtube.com/watch?v=_uQrJ0TkSuc' }
  ],
  'react': [
    { title: 'Scrimba - React Course', url: 'https://www.youtube.com/watch?v=I6nnxkVt3nU' },
    { title: 'Traversy Media - React', url: 'https://www.youtube.com/watch?v=A71aqufiNtQ' }
  ],
};
