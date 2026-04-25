import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Paperclip, Bot, User, Loader2, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useChat } from '../hooks/useChat';
import { useUpload } from '../hooks/useUpload';
import { handleConversationFlow } from '@/utils/conversationFlow';
import { isLearningQuestion, parseStructuredResponse } from '@/utils/learningTopicHandler';
import { saveChatMessage, getChatHistory, createChatSession, updateChatSession, extractTopics } from '@/services/chatHistoryService';
import { useAuth } from '@/context/AuthContext';
import QuizModal from './QuizModal';
import { generateQuiz, Quiz } from '@/services/quizGenerator';
import SuggestionsDisplay from './SuggestionsDisplay';
import { generateFollowUpSuggestions, Suggestion } from '@/services/followUpSuggestionsService';
import FeedbackComponent from './FeedbackComponent';
import { classifyTopic, generateSubtopicPrompt, parseSubtopicSelection } from '@/services/topicClassificationService';
import { generateStepBasedTutoringResponse, formatLinksForMessage } from '@/services/stepBasedTutoringService';
import { extractTextFromDocument, truncateTextForAnalysis } from '@/utils/documentParser';
import { extractTopicFromText, extractDocumentInfo } from '@/services/topicExtractionService';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  attachments?: { name: string; type: string }[];
  suggestions?: Suggestion[];
  topic?: string;
  isGreeting?: boolean;
  isActionPrompt?: boolean;
}

interface ChatbotModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
}

// Add this helper component for formatted messages with clickable links
const FormattedMessage = ({ content }: { content: string }) => {
  // Convert markdown-style formatting to React elements
  const formatText = (text: string) => {
    return text
      .split('\n')
      .map((line, idx) => {
        // Detect and format links: "Title: https://url"
        const linkMatch = line.match(/^(.+?):\s*(https?:\/\/[^\s\n]+)$/);
        if (linkMatch) {
          const title = linkMatch[1].trim();
          const url = linkMatch[2].trim();
          
          // Determine icon based on URL
          let icon = '📄';
          if (url.includes('youtube.com') || url.includes('youtu.be')) {
            icon = '🎥';
          } else if (url.includes('docs') || url.includes('developer') || url.includes('official')) {
            icon = '📚';
          }
          
          return (
            <a
              key={idx}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-blue-600 mb-2 p-3 bg-blue-50 rounded-lg border border-blue-200 transition-all duration-200 hover:scale-105 hover:shadow-md hover:-translate-y-1"
            >
              <span className="text-lg flex-shrink-0">{icon}</span>
              <span className="text-sm font-medium flex-1 text-left">{title}</span>
              <svg className="h-4 w-4 flex-shrink-0 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M11 3a1 1 0 100 2h3.586L9.293 9.293a1 1 0 001.414 1.414L16 6.414V10a1 1 0 102 0V4a1 1 0 00-1-1h-6z" />
                <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
              </svg>
            </a>
          );
        }
        
        // Bold text
        if (line.includes('**')) {
          const parts = line.split('**');
          return (
            <p key={idx} className="mb-2 text-sm">
              {parts.map((part, i) => 
                i % 2 === 1 ? <strong key={i} className="font-bold text-gray-900">{part}</strong> : part
              )}
            </p>
          );
        }
        
        // Bullet points
        if (line.trim().startsWith('-') || line.trim().startsWith('•')) {
          return (
            <li key={idx} className="ml-4 mb-1.5 text-sm text-gray-700">
              {line.replace(/^[-•]\s*/, '')}
            </li>
          );
        }
        
        // Numbered lists
        if (/^\d+\./.test(line.trim())) {
          return (
            <li key={idx} className="ml-4 mb-1.5 text-sm text-gray-700">
              {line.replace(/^\d+\.\s*/, '')}
            </li>
          );
        }
        
        // Emojis and icons (section headers)
        if (line.includes('📚') || line.includes('📝') || line.includes('🎥') || 
            line.includes('📖') || line.includes('💡') || line.includes('📄') ||
            line.includes('Learning Resources')) {
          return (
            <p key={idx} className="font-bold mt-4 mb-2 text-base text-purple-700">
              {line}
            </p>
          );
        }
        
        // Regular text
        return line.trim() ? <p key={idx} className="mb-2 text-sm text-gray-800 leading-relaxed">{line}</p> : <br key={idx} />;
      });
  };

  return <div className="space-y-1">{formatText(content)}</div>;
};

export const ChatbotModal = ({ isOpen, onClose, userName = "Student" }: ChatbotModalProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [learningTopic, setLearningTopic] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [currentQuiz, setCurrentQuiz] = useState<Quiz | null>(null);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [quizTopic, setQuizTopic] = useState<string>('');
  const [generatingSuggestions, setGeneratingSuggestions] = useState<string | null>(null);
  const [awaitingSubtopicSelection, setAwaitingSubtopicSelection] = useState<string | null>(null);
  const [availableSubtopics, setAvailableSubtopics] = useState<string[]>([]);
  const [currentTopic, setCurrentTopic] = useState<string | null>(null);
  const [currentSubtopic, setCurrentSubtopic] = useState<string | null>(null);
  const [awaitingNotesConfirmation, setAwaitingNotesConfirmation] = useState<string | null>(null);
  const [pendingTutoringResponse, setPendingTutoringResponse] = useState<any>(null);
  const [isExtractingTopic, setIsExtractingTopic] = useState(false);
  const [extractedTopicFromDocument, setExtractedTopicFromDocument] = useState<string | null>(null);
  const [awaitingDocumentTopicConfirmation, setAwaitingDocumentTopicConfirmation] = useState(false);
  const [uploadedDocumentText, setUploadedDocumentText] = useState<string | null>(null);
  const [documentInfo, setDocumentInfo] = useState<{type: string; course: string; topic: string} | null>(null);
  const [quizFeedbackSubmitted, setQuizFeedbackSubmitted] = useState(false);
  const [generalError, setGeneralError] = useState<{message: string; canRetry: boolean} | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  const { sendMessage, isLoading } = useChat();
  const { uploadFiles, isUploading } = useUpload();

  // Clear all state when modal closes
  const handleClose = () => {
    // Reset all state flags
    setAwaitingSubtopicSelection(null);
    setAvailableSubtopics([]);
    setCurrentTopic(null);
    setCurrentSubtopic(null);
    setAwaitingNotesConfirmation(null);
    setPendingTutoringResponse(null);
    setLearningTopic(null);
    setInputValue('');
    setIsSending(false);
    setGeneratingQuiz(false);
    setGeneratingSuggestions(null);
    setIsExtractingTopic(false);
    setExtractedTopicFromDocument(null);
    setAwaitingDocumentTopicConfirmation(false);
    setUploadedDocumentText(null);
    setDocumentInfo(null);
    
    // Call the parent's onClose
    onClose();
  };

  // Initialize or load chat session
  useEffect(() => {
    if (isOpen && user?.uid) {
      const initializeSession = async () => {
        try {
          console.log('🔄 Creating chat session for user:', user.uid);
          // Create a new session when opening the chatbot
          const newSessionId = await createChatSession(user.uid, `Chat - ${new Date().toLocaleDateString()}`);
          setSessionId(newSessionId);
          console.log('✅ Chat session created:', newSessionId);
        } catch (error) {
          console.error("❌ Error initializing chat session:", error);
          // Create a temporary session ID for demo purposes
          const tempSessionId = `session-${Date.now()}`;
          setSessionId(tempSessionId);
          console.warn('⚠️ Using temporary session ID:', tempSessionId);
        }
      };

      initializeSession();
    } else if (isOpen && !user?.uid) {
      console.warn('⚠️ Chatbot opened without authentication - chat history will NOT be saved');
    }
  }, [isOpen, user?.uid]);

  // Auto-speak personalized greeting on mount - ENHANCED VERSION
  useEffect(() => {
    if (isOpen) {
      // Clear previous messages when reopening
      setMessages([]);
      
      // Small delay to ensure clean state
      setTimeout(() => {
        // Check if returning from quiz with feedback
        if (quizFeedbackSubmitted) {
          const thankYouMsg: Message = {
            id: Date.now().toString(),
            role: 'assistant',
            content: `Thank you for your feedback! 🙏✨\n\nYour input helps us improve the learning experience. What would you like to learn next?`,
            timestamp: new Date(),
          };
          setMessages([thankYouMsg]);
          setQuizFeedbackSubmitted(false);
        } else {
          const greeting = `Hello ${userName}! 👋 How can I help you today? I can:

• Answer questions about your courses
• Provide study resources and video recommendations
• Help with assignment guidance
• Explain complex topics
• Track your academic progress

Just ask me anything!`;
        
          const greetingMsg: Message = {
            id: Date.now().toString(),
            role: 'assistant',
            content: greeting,
            timestamp: new Date(),
            isGreeting: true,
          };
          setMessages([greetingMsg]);
        }

        // Speak greeting using Web Speech API with better settings
        if ('speechSynthesis' in window) {
          // Cancel any ongoing speech
          window.speechSynthesis.cancel();
          
          // Create and configure utterance
          const utterance = new SpeechSynthesisUtterance(`Hello ${userName}! How can I help you today?`);
          utterance.rate = 0.9; // Slightly slower for clarity
          utterance.pitch = 1.1; // Slightly higher pitch for friendliness
          utterance.volume = 1; // Full volume
          utterance.lang = 'en-US'; // English US
          
          // Wait a moment for UI to render, then speak
          setTimeout(() => {
            window.speechSynthesis.speak(utterance);
          }, 300);
        }
      }, 100);
    }
    
    // Cleanup: Stop speech when closing chatbot
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isOpen, userName, quizFeedbackSubmitted]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Helper function to save assistant message to Firebase
  const saveAssistantMessage = async (content: string) => {
    if (user?.uid && sessionId) {
      try {
        const topics = extractTopics(content);
        await saveChatMessage({
          userId: user.uid,
          content,
          role: 'assistant',
          timestamp: new Date(),
          sessionId,
          topicsCovered: topics,
        });
        console.log('✅ Assistant message saved to Firebase');
      } catch (error) {
        console.error("❌ Error saving assistant message to Firebase:", error);
      }
    } else {
      console.warn('⚠️ Message not saved - User not authenticated or session not initialized', {
        hasUser: !!user?.uid,
        hasSession: !!sessionId
      });
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    // Helper function to detect casual intent
    const detectCasualIntent = (input: string): string | null => {
      const lower = input.toLowerCase().trim();
      
      // Greetings
      if (/^(hi|hello|hey|hey there|greetings)[\s!?]*$/.test(lower)) {
        return 'greeting';
      }
      
      // How are you
      if (/how are you|how are ya|how you doing|how's it going/.test(lower)) {
        return 'status';
      }
      
      // Who are you
      if (/who are you|what are you|tell me about yourself|what is your name|your name/.test(lower)) {
        return 'identity';
      }
      
      // What's my name
      if (/what.?s my name|who am i|my name/.test(lower)) {
        return 'name_question';
      }
      
      // Date/Time requests
      if (/what.*time|current time|what date|today's date|what day|tell me.*today|today day|what is today|today's day/.test(lower)) {
        return 'datetime';
      }
      
      return null;
    };

    // Helper function to get casual response
    const getCasualResponse = (intent: string, userName: string): string => {
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      
      switch (intent) {
        case 'greeting':
          return `Hi ${userName}! 👋 How are you? What would you like to learn today?`;
        case 'status':
          return `I'm doing great! 😊 What would you like to learn today?`;
        case 'identity':
          return `I'm InteliMark AI Chatbot! 🤖 I'm your personal learning assistant designed to help you with:

• 📚 Answering questions about any topic
• 🎥 Finding relevant learning resources and videos
• 📝 Creating study notes and summaries
• ✅ Generating practice quizzes
• 💡 Breaking down complex topics into subtopics
• 📊 Tracking your learning progress

I use advanced AI to provide step-by-step guidance and personalized learning experiences. How can I help you learn today?`;
        case 'name_question':
          return `I don't know your name yet! You can tell me if you want 🙂`;
        case 'datetime':
          return `Today is ${today}, and the current time is ${time}. ⏰`;
        default:
          return `I'm here to help you learn! Could you please tell me a topic or question you want to explore?`;
      }
    };

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const userInput = inputValue;
    setInputValue('');
    setIsSending(true);

    // Save user message to Firebase
    if (user?.uid && sessionId) {
      try {
        const topics = extractTopics(userInput);
        await saveChatMessage({
          userId: user.uid,
          content: userInput,
          role: 'user',
          timestamp: new Date(),
          sessionId,
          topicsCovered: topics,
        });
        console.log('✅ User message saved to Firebase');
      } catch (error) {
        console.error("❌ Error saving user message to Firebase:", error);
      }
    } else {
      console.warn('⚠️ User message not saved - User not authenticated or session not initialized', {
        hasUser: !!user?.uid,
        hasSession: !!sessionId
      });
    }

    try {
      // FIRST: Check if user has uploaded a document and is asking a specific question about it
      // This should be checked BEFORE topic confirmations
      if (uploadedDocumentText && documentInfo && !awaitingNotesConfirmation && !awaitingSubtopicSelection) {
        // Detect if this is a specific question about the document
        const casualIntent = detectCasualIntent(userInput);
        
        // Patterns that indicate document-specific questions
        const isDocumentQuestion = 
          /question\s*\d+/i.test(userInput) || // "question 3", "question 1"
          /q\d+/i.test(userInput) || // "q3", "q1"
          /explain.*(?:question|problem|exercise)/i.test(userInput) || // "explain question/problem"
          /what.*(?:question|problem|exercise)/i.test(userInput) || // "what is question 3"
          /solve.*(?:question|problem|exercise)/i.test(userInput) || // "solve question 2"
          /answer.*(?:question|problem|exercise)/i.test(userInput) || // "answer to question 1"
          (/explain/i.test(userInput) && /\d+/.test(userInput)); // "explain 3" with a number
        
        if (!casualIntent && isDocumentQuestion) {
          // User is asking a specific question about the uploaded document
          console.log('📄 User asking specific question about uploaded document');
          
          const docContext = {
            text: uploadedDocumentText,
            type: documentInfo.type,
            course: documentInfo.course,
            topic: documentInfo.topic
          };
          
          const response = await sendMessage(userInput, messages, docContext);
          
          const assistantMessage: Message = {
            id: Date.now().toString(),
            role: 'assistant',
            content: response,
            timestamp: new Date(),
            topic: documentInfo.topic,
          };
          setMessages(prev => [...prev, assistantMessage]);
          saveAssistantMessage(response);
          setIsSending(false);
          return;
        }
      }
      
      // Check for document topic confirmation first
      if (awaitingDocumentTopicConfirmation && extractedTopicFromDocument) {
        const isConfirming = /^\s*(yes|yeah|yep|sure|ok|okay|alright|fine|sounds good|go ahead|start|let's go|lets go)\s*$/i.test(userInput);
        const isDeclining = /^\s*(no|nope|skip|nevermind|not now|later|cancel)\s*$/i.test(userInput);
        
        // If user types something that's not yes/no, treat it as the subtopic they want to learn
        if (!isConfirming && !isDeclining) {
          const subtopic = userInput.trim();
          console.log('🎯 User specified subtopic from document:', subtopic);
          
          setAwaitingDocumentTopicConfirmation(false);
          setExtractedTopicFromDocument(null);
          setCurrentTopic(extractedTopicFromDocument);
          setCurrentSubtopic(subtopic);
          setIsSending(true);
          
          // Generate step-based tutoring response for the subtopic
          const tutoringResponse = await generateStepBasedTutoringResponse('General', subtopic);
          console.log('📖 Tutoring response generated for document subtopic:', tutoringResponse);
          
          // Step 1: Send Overview
          setTimeout(() => {
            const overviewMsg: Message = {
              id: Date.now().toString(),
              role: 'assistant',
              content: tutoringResponse.overview,
              timestamp: new Date(),
              topic: subtopic,
            };
            setMessages(prev => [...prev, overviewMsg]);
            saveAssistantMessage(tutoringResponse.overview);
          }, 300);
          
          // Step 2: Ask if user wants learning resources
          setTimeout(() => {
            setPendingTutoringResponse(tutoringResponse);
            
            const askNotesMsg: Message = {
              id: (Date.now() + 100).toString(),
              role: 'assistant',
              content: `📚 Would you like me to suggest notes and resources related to **${subtopic}**?`,
              timestamp: new Date(),
              topic: subtopic,
            };
            setMessages(prev => [...prev, askNotesMsg]);
            saveAssistantMessage(askNotesMsg.content);
            
            setAwaitingNotesConfirmation(subtopic);
            setIsSending(false);
          }, 600);
          
          return;
        }
        
        if (isConfirming) {
          // User confirmed - start tutoring flow with extracted topic
          const topic = extractedTopicFromDocument;
          setAwaitingDocumentTopicConfirmation(false);
          setExtractedTopicFromDocument(null);
          
          // Check if this is a predefined topic
          const topicInfo = classifyTopic(topic);
          
          if (topicInfo.isBroadTopic) {
            // Ask for subtopic selection
            const subtopicPrompt = generateSubtopicPrompt(topicInfo.topic, topicInfo.subtopics);
            const promptMsg: Message = {
              id: Date.now().toString(),
              role: 'assistant',
              content: subtopicPrompt,
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, promptMsg]);
            setAwaitingSubtopicSelection(topicInfo.topic);
            setAvailableSubtopics(topicInfo.subtopics);
            saveAssistantMessage(subtopicPrompt);
            setIsSending(false);
            return;
          } else {
            // Undefined topic - generate content directly
            console.log('🎯 Processing extracted topic (undefined):', topic);
            setCurrentTopic(topic);
            setCurrentSubtopic(topic);
            setIsSending(true);
            
            // Generate step-based tutoring response
            const tutoringResponse = await generateStepBasedTutoringResponse('General', topic);
            console.log('📖 Tutoring response generated for extracted topic:', tutoringResponse);
            
            // Step 1: Send Overview
            setTimeout(() => {
              const overviewMsg: Message = {
                id: Date.now().toString(),
                role: 'assistant',
                content: tutoringResponse.overview,
                timestamp: new Date(),
                topic: topic,
              };
              setMessages(prev => [...prev, overviewMsg]);
              saveAssistantMessage(tutoringResponse.overview);
            }, 300);
            
            // Step 2: Ask if user wants learning resources
            setTimeout(() => {
              setPendingTutoringResponse(tutoringResponse);
              
              const askNotesMsg: Message = {
                id: (Date.now() + 100).toString(),
                role: 'assistant',
                content: `📚 Would you like me to suggest notes and resources related to **${topic}**?`,
                timestamp: new Date(),
                topic: topic,
              };
              setMessages(prev => [...prev, askNotesMsg]);
              saveAssistantMessage(askNotesMsg.content);
              
              setAwaitingNotesConfirmation(topic);
              setIsSending(false);
            }, 600);
            
            return;
          }
        } else if (isDeclining) {
          // User declined - reset state
          setAwaitingDocumentTopicConfirmation(false);
          setExtractedTopicFromDocument(null);
          
          const declineMsg: Message = {
            id: Date.now().toString(),
            role: 'assistant',
            content: `No problem! Feel free to upload another document or ask me about any topic you'd like to learn. 😊`,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, declineMsg]);
          saveAssistantMessage(declineMsg.content);
          setIsSending(false);
          return;
        } else {
          // Unclear response - ask again
          const clarifyMsg: Message = {
            id: Date.now().toString(),
            role: 'assistant',
            content: `I didn't quite understand. Would you like to start learning about **"${extractedTopicFromDocument}"**? (Please say "yes" or "no")`,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, clarifyMsg]);
          saveAssistantMessage(clarifyMsg.content);
          setIsSending(false);
          return;
        }
      }

      // Check for casual intent first
      const casualIntent = detectCasualIntent(userInput);
      if (casualIntent) {
        const casualResponse = getCasualResponse(casualIntent, userName || 'Student');
        const assistantMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: casualResponse,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, assistantMessage]);
        saveAssistantMessage(casualResponse);
        setIsSending(false);
        return;
      }

      // Check if awaiting subtopic selection
      if (awaitingSubtopicSelection) {
        const selectedSubtopic = parseSubtopicSelection(userInput, availableSubtopics);
        
        if (selectedSubtopic) {
          // User selected a subtopic - reset the flag and start tutoring
          const topicName = awaitingSubtopicSelection;
          const subtopicName = selectedSubtopic;
          
          setCurrentTopic(topicName);
          setCurrentSubtopic(subtopicName);
          setAwaitingSubtopicSelection(null);
          setAvailableSubtopics([]);
          setIsSending(true);
          
          // Generate step-based tutoring response
          const tutoringResponse = await generateStepBasedTutoringResponse(
            topicName,
            subtopicName
          );
          console.log('📖 Tutoring response generated:', tutoringResponse);
          
          // Step 1: Send Overview (separate message)
          setTimeout(() => {
            console.log('📝 Sending overview message');
            const overviewMsg: Message = {
              id: Date.now().toString(),
              role: 'assistant',
              content: tutoringResponse.overview,
              timestamp: new Date(),
              topic: `${topicName} - ${subtopicName}`,
            };
            setMessages(prev => [...prev, overviewMsg]);
            saveAssistantMessage(tutoringResponse.overview);
          }, 300);
          
          // Step 2: Ask if user wants learning resources (BEFORE setting pending response)
          setTimeout(() => {
            console.log('❓ Showing ask notes message');
            // Set the pending response FIRST
            setPendingTutoringResponse(tutoringResponse);
            // THEN show the ask notes message
            const askNotesMsg: Message = {
              id: (Date.now() + 100).toString(),
              role: 'assistant',
              content: `📚 Would you like me to suggest notes and resources related to **${subtopicName}**?`,
              timestamp: new Date(),
              topic: `${topicName} - ${subtopicName}`,
            };
            console.log('📚 Setting ask notes message:', askNotesMsg);
            setMessages(prev => [...prev, askNotesMsg]);
            saveAssistantMessage(askNotesMsg.content);
            
            // Set the confirmation flag LAST (so it's set when message is rendered)
            setAwaitingNotesConfirmation(`${topicName} - ${subtopicName}`);
            setIsSending(false);
            console.log('✅ Notes confirmation flag set');
          }, 600);
          
          return;
        } else {
          // Invalid selection, ask again with helpful message
          const errorMsg: Message = {
            id: Date.now().toString(),
            role: 'assistant',
            content: `I didn't quite understand that. Please pick one from the list above or type the number (1-6).`,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, errorMsg]);
          setIsSending(false);
          return;
        }
      }

      // FIRST: Check if awaiting notes confirmation (before checking new topics)
      if (awaitingNotesConfirmation && pendingTutoringResponse) {
        console.log('🔍 Checking notes confirmation. Input:', userInput, 'Flag:', awaitingNotesConfirmation);
        
        // Check if user is asking for a NEW topic instead of answering the confirmation
        // Detect learning questions or broad topics to reset the flow
        const hasDocContext = !!(uploadedDocumentText && documentInfo);
        const isNewTopicRequest = isLearningQuestion(userInput, hasDocContext) || classifyTopic(userInput).isBroadTopic;
        
        if (isNewTopicRequest) {
          console.log('🔄 User asking for new topic, resetting notes confirmation state');
          setAwaitingNotesConfirmation(null);
          setPendingTutoringResponse(null);
          // Don't return - continue to process the new topic below
        } else {
          // Accept common ways of saying yes/no
          const isStrictlyConfirming = /^\s*(yes|yeah|yep|sure|ok|okay|alright|fine|sounds good|go ahead|show|send)\s*$/i.test(userInput);
          const isStrictlyDeclining = /^\s*(no|nope|skip|nevermind|not now|later)\s*$/i.test(userInput);
        
        if (isStrictlyConfirming) {
          console.log('✅ User confirmed notes!');
          // User confirmed - show notes and videos in separate messages
          const topicInfo = awaitingNotesConfirmation;
          // Extract just the subtopic part (after the dash)
          const subtopicPart = topicInfo.includes(' - ') ? topicInfo.split(' - ')[1] : topicInfo;
          setAwaitingNotesConfirmation(null);
          setLearningTopic(subtopicPart); // Set learning topic for quiz generation
          const response = pendingTutoringResponse;
          
          // Send notes and videos as separate messages
          if (response.notes.length > 0 || response.videos.length > 0) {
            let messageDelay = 300;
            
            // Step 1: Send Notes/Documentation Links (separate message)
            if (response.notes.length > 0) {
              setTimeout(() => {
                const notesMsg: Message = {
                  id: Date.now().toString(),
                  role: 'assistant',
                  content: formatLinksForMessage(response.notes, 'notes'),
                  timestamp: new Date(),
                  topic: topicInfo,
                };
                setMessages(prev => [...prev, notesMsg]);
                saveAssistantMessage(formatLinksForMessage(response.notes, 'notes'));
              }, messageDelay);
              messageDelay += 400;
            }
            
            // Step 2: Send YouTube Links (separate message)
            if (response.videos.length > 0) {
              setTimeout(() => {
                const videosMsg: Message = {
                  id: Date.now().toString(),
                  role: 'assistant',
                  content: formatLinksForMessage(response.videos, 'videos'),
                  timestamp: new Date(),
                  topic: topicInfo,
                };
                setMessages(prev => [...prev, videosMsg]);
                saveAssistantMessage(formatLinksForMessage(response.videos, 'videos'));
              }, messageDelay);
              messageDelay += 400;
            }
            
            // Step 3: Show action prompt after resources
            setTimeout(() => {
              console.log('📤 Showing action prompt after notes/videos');
              const actionPromptMsg: Message = {
                id: (Date.now() + 500).toString(),
                role: 'assistant',
                content: `💡 What would you like to do next?`,
                timestamp: new Date(),
                isActionPrompt: true,
                topic: topicInfo,
              };
              setMessages(prev => [...prev, actionPromptMsg]);
              saveAssistantMessage(actionPromptMsg.content);
              setPendingTutoringResponse(null);
              setIsSending(false);
            }, messageDelay);
          } else {
            const noResourcesMsg: Message = {
              id: Date.now().toString(),
              role: 'assistant',
              content: `I couldn't find resources for this topic right now. Would you like to explore another subtopic or try a different topic?`,
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, noResourcesMsg]);
            saveAssistantMessage(noResourcesMsg.content);
            setPendingTutoringResponse(null);
            setAwaitingNotesConfirmation(null);
            setIsSending(false);
          }
          return;
        } else if (isStrictlyDeclining) {
          console.log('❌ User declined notes');
          // User declined - skip resources and show action prompt
          const topicInfo = awaitingNotesConfirmation;
          const subtopicPart = topicInfo ? (topicInfo.includes(' - ') ? topicInfo.split(' - ')[1] : topicInfo) : null;
          setAwaitingNotesConfirmation(null);
          if (subtopicPart) {
            setLearningTopic(subtopicPart); // Set learning topic for quiz generation
          }
          const declineMsg = `No problem! 😊 Let me know if you'd like to explore another topic.`;
          const declineMessage: Message = {
            id: Date.now().toString(),
            role: 'assistant',
            content: declineMsg,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, declineMessage]);
          saveAssistantMessage(declineMsg);
          
          // Show action prompt after declining
          setTimeout(() => {
            const actionPromptMsg: Message = {
              id: (Date.now() + 50).toString(),
              role: 'assistant',
              content: `💡 What would you like to do next?`,
              timestamp: new Date(),
              isActionPrompt: true,
              topic: topicInfo,
            };
            setMessages(prev => [...prev, actionPromptMsg]);
            saveAssistantMessage(actionPromptMsg.content);
            setPendingTutoringResponse(null);
            setIsSending(false);
          }, 300);
          return;
        } else {
          // User didn't confirm or decline - ask again
          const clarifyMsg: Message = {
            id: Date.now().toString(),
            role: 'assistant',
            content: `I didn't quite understand. Would you like to see learning resources? (You can say "yes", "yeah", "sure", "ok", "alright" or "no", "nope", "skip")`,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, clarifyMsg]);
          saveAssistantMessage(clarifyMsg.content);
          setIsSending(false);
          return;
        }
        }
      }

      // Check if input is a broad topic
      const topicInfo = classifyTopic(userInput);
      if (topicInfo.isBroadTopic) {
        // Ask for subtopic selection
        const subtopicPrompt = generateSubtopicPrompt(topicInfo.topic, topicInfo.subtopics);
        const promptMsg: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: subtopicPrompt,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, promptMsg]);
        setAwaitingSubtopicSelection(topicInfo.topic);
        setAvailableSubtopics(topicInfo.subtopics);
        saveAssistantMessage(subtopicPrompt);
        setIsSending(false);
        return;
      }

      // Check if this is a special conversation pattern (greeting, date/time, notes request)
      const conversationResponse = handleConversationFlow(userInput);
      
      if (conversationResponse.isHandled) {
        const assistantMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: conversationResponse.response || '',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, assistantMessage]);
        saveAssistantMessage(conversationResponse.response || '');
        setIsSending(false);
        return;
      }

      // Check if it's a learning question (for undefined topics)
      const hasDocContext = !!(uploadedDocumentText && documentInfo);
      const isLearning = isLearningQuestion(userInput, hasDocContext);
      if (isLearning) {
        // Extract topic from learning question
        const extractedTopic = userInput
          .replace(/^(i want to|i would like to|i'd like to|please|can you|could you)\s+/i, '')
          .replace(/\b(learn about|learn|teach me|explain|understand|study|know about|about|help me with)\s+/i, '')
          .replace(/[?!.]+$/, '')
          .trim();
        
        if (extractedTopic && extractedTopic.length > 2) {
          const formattedTopic = extractedTopic.charAt(0).toUpperCase() + extractedTopic.slice(1);
          
          console.log('🎯 Processing undefined topic:', formattedTopic);
          setCurrentTopic(formattedTopic);
          setCurrentSubtopic(formattedTopic);
          setIsSending(true);
          
          // Generate step-based tutoring response for undefined topic
          const tutoringResponse = await generateStepBasedTutoringResponse(
            'General',
            formattedTopic
          );
          console.log('📖 Tutoring response generated for undefined topic:', tutoringResponse);
          
          // Step 1: Send Overview
          setTimeout(() => {
            console.log('📝 Sending overview message for undefined topic');
            const overviewMsg: Message = {
              id: Date.now().toString(),
              role: 'assistant',
              content: tutoringResponse.overview,
              timestamp: new Date(),
              topic: formattedTopic,
            };
            setMessages(prev => [...prev, overviewMsg]);
            saveAssistantMessage(tutoringResponse.overview);
          }, 300);
          
          // Step 2: Ask if user wants learning resources
          setTimeout(() => {
            console.log('❓ Showing ask notes message for undefined topic');
            setPendingTutoringResponse(tutoringResponse);
            
            const askNotesMsg: Message = {
              id: (Date.now() + 100).toString(),
              role: 'assistant',
              content: `📚 Would you like me to suggest notes and resources related to **${formattedTopic}**?`,
              timestamp: new Date(),
              topic: formattedTopic,
            };
            setMessages(prev => [...prev, askNotesMsg]);
            saveAssistantMessage(askNotesMsg.content);
            
            setAwaitingNotesConfirmation(formattedTopic);
            setIsSending(false);
            console.log('✅ Notes confirmation flag set for undefined topic');
          }, 600);
          
          return;
        }
      }

      // Not a recognized learning topic or pattern - show default response
      const defaultResponse = `I'm here to help you learn! 📚\n\nSome topics I can help with:\n• Data Structures & Algorithms\n• Programming Languages (Python, JavaScript, Java, C++)\n• Machine Learning\n• Web Development\n• Web Design\n• Mathematics\n• React\n• Database\n• Git\n\nJust tell me what you'd like to learn!`;
        
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: defaultResponse,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
      saveAssistantMessage(defaultResponse);
      setIsSending(false);
    } catch (error: any) {
      console.error('Error sending message:', error);
      
      // Determine error type and provide specific guidance
      let errorContent = '⚠️ Something went wrong. ';
      
      if (error.message?.includes('network') || error.code === 'ECONNABORTED') {
        errorContent = '🌐 Network Error: Please check your internet connection and try again.';
      } else if (error.response?.status === 429) {
        errorContent = '⏳ Rate Limit: Too many requests. Please wait 30 seconds and try again.';
      } else if (error.response?.status === 401 || error.response?.status === 403) {
        errorContent = '🔐 Authentication Error: API key issue detected. Please contact support.';
      } else if (error.response?.status === 500) {
        errorContent = '🔧 Server Error: Our servers are experiencing issues. Please try again in a few moments.';
      } else {
        errorContent = '❌ Unexpected Error: Please try:\n\n• Refreshing the page\n• Rephrasing your question\n• Starting a new chat session\n\nIf the problem persists, contact support.';
      }
      
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: errorContent,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      setIsSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    
    // Separate PDF/Word documents from other files
    const documentFiles = fileArray.filter(f => {
      const fileName = f.name.toLowerCase();
      return fileName.endsWith('.pdf') || fileName.endsWith('.docx') || fileName.endsWith('.doc');
    });
    
    const otherFiles = fileArray.filter(f => {
      const fileName = f.name.toLowerCase();
      return !fileName.endsWith('.pdf') && !fileName.endsWith('.docx') && !fileName.endsWith('.doc');
    });

    // Handle document files (PDF/Word) - Extract topic
    if (documentFiles.length > 0) {
      for (const file of documentFiles) {
        const attachments = [{ name: file.name, type: file.type }];

        const userMessage: Message = {
          id: Date.now().toString(),
          role: 'user',
          content: `📄 Uploaded: ${file.name}`,
          timestamp: new Date(),
          attachments,
        };

        setMessages(prev => [...prev, userMessage]);

        // Show extracting message
        const extractingMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `🔍 Analyzing document to identify type, course, and topic...`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, extractingMessage]);
        setIsExtractingTopic(true);

        try {
          // Extract text from document
          const extractedText = await extractTextFromDocument(file);
          if (!extractedText || extractedText.trim().length < 50) {
            throw new Error('Document appears to be empty or has insufficient content');
          }
          // Extract comprehensive document information using full text (no truncation/summarization)
          const docInfo = await extractDocumentInfo(extractedText);
          setUploadedDocumentText(extractedText);
          setDocumentInfo({
            type: docInfo.documentType,
            course: docInfo.courseName,
            topic: docInfo.topic
          });
          setExtractedTopicFromDocument(docInfo.topic);
          setAwaitingDocumentTopicConfirmation(true);
          setCurrentTopic(docInfo.topic);
          // Remove the "extracting" message
          setMessages(prev => prev.filter(msg => msg.id !== extractingMessage.id));
          // Show confirmation message asking what they want to learn (NO action buttons yet)
          const confirmationMessage: Message = {
            id: (Date.now() + 2).toString(),
            role: 'assistant',
            content: `✅ ${docInfo.conversationalMessage}`,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, confirmationMessage]);
          saveAssistantMessage(confirmationMessage.content);

        } catch (error: any) {
          console.error('Error processing document:', error);
          
          // Remove the "extracting" message
          setMessages(prev => prev.filter(msg => msg.id !== extractingMessage.id));

          // Determine specific error type
          let errorContent = '❌ Failed to process document. ';
          let errorGuidance = '';
          
          if (error.message?.includes('empty') || error.message?.includes('insufficient content')) {
            errorContent = '📄 Document appears to be empty or unreadable.';
            errorGuidance = 'Please try:\n• A different file format (PDF or Word)\n• Making sure the document has text content\n• Scanning documents with OCR enabled';
          } else if (error.message?.includes('extract') || error.message?.includes('parse')) {
            errorContent = '⚠️ Unable to extract text from document.';
            errorGuidance = 'This might happen with:\n• Image-only PDFs (try OCR conversion)\n• Password-protected files\n• Corrupted documents\n\nTry uploading a different file or manually type your topic.';
          } else if (error.message?.includes('network') || error.code === 'ECONNABORTED') {
            errorContent = '🌐 Network error while processing document.';
            errorGuidance = 'Check your internet connection and try again.';
          } else {
            errorContent = '❌ Unexpected error processing document.';
            errorGuidance = 'You can:\n• Try uploading the file again\n• Try a different document\n• Manually type your learning topic instead';
          }

          const errorMessage: Message = {
            id: (Date.now() + 3).toString(),
            role: 'assistant',
            content: `${errorContent}\n\n${errorGuidance}`,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, errorMessage]);
          saveAssistantMessage(errorMessage.content);
          
          // Show general error banner for retry
          setGeneralError({
            message: 'Document upload failed. You can retry or manually enter your topic.',
            canRetry: true
          });
        } finally {
          setIsExtractingTopic(false);
        }
      }
    }

    // Handle other file types (images, etc.) with existing logic
    if (otherFiles.length > 0) {
      const attachments = otherFiles.map(f => ({ name: f.name, type: f.type }));

      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: `Uploaded ${otherFiles.length} file(s)`,
        timestamp: new Date(),
        attachments,
      };

      setMessages(prev => [...prev, userMessage]);

      // Process files and extract content
      const extractedContent = await uploadFiles(otherFiles);

      // Pass document context if available
      const docContext = uploadedDocumentText && documentInfo ? {
        text: uploadedDocumentText,
        type: documentInfo.type,
        course: documentInfo.course,
        topic: documentInfo.topic
      } : undefined;

      const response = await sendMessage(
        `I uploaded these files: ${otherFiles.map(f => f.name).join(', ')}. Here's the content: ${extractedContent}`,
        messages,
        docContext
      );

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    }

    // Clear file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Copy message to clipboard
  const handleCopyMessage = (content: string, messageId: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  };

  // Clear chat history
  const handleClearChat = () => {
    if (window.confirm('Are you sure you want to clear chat history?')) {
      setMessages([]);
      const greeting = `Hello ${userName}! 👋 How can I help you today?`;
      const greetingMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: greeting,
        timestamp: new Date(),
      };
      setMessages([greetingMsg]);
    }
  };

  // Generate quiz for a topic
  const handleGenerateQuiz = async (topic: string) => {
    if (!topic.trim()) {
      alert('Please enter a topic to generate a quiz');
      return;
    }
    
    // Remove action prompt from messages
    setMessages(prev => prev.filter(msg => !msg.isActionPrompt));
    
    // Add "generating quiz" message
    const generatingMessage: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `⏳ Your quiz on "${topic}" will be generated in a moment...`,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, generatingMessage]);
    
    setGeneratingQuiz(true);
    setQuizTopic(topic);
    try {
      // Add a small delay for better UX
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const quiz = await generateQuiz(topic, 'medium', 5);
      setCurrentQuiz(quiz);
      setShowQuizModal(true);
    } catch (error) {
      console.error('Error generating quiz:', error);
      alert('Failed to generate quiz. Please try again.');
    } finally {
      setGeneratingQuiz(false);
    }
  };

  // Generate follow-up suggestions for a topic
  const handleGenerateSuggestions = async (topic: string, messageId: string) => {
    setGeneratingSuggestions(messageId);
    try {
      const previousMessages = messages
        .filter(m => m.role === 'assistant')
        .map(m => m.content)
        .slice(-2);

      const suggestions = await generateFollowUpSuggestions(topic, previousMessages, 3);

      // Update the message with suggestions
      setMessages(prevMessages =>
        prevMessages.map(msg =>
          msg.id === messageId ? { ...msg, suggestions } : msg
        )
      );
    } catch (error) {
      console.error('Error generating suggestions:', error);
    } finally {
      setGeneratingSuggestions(null);
    }
  };

  // Handle suggestion click - automatically send the suggestion
  const handleSuggestionClick = (suggestion: Suggestion) => {
    setInputValue(suggestion.text);
    // Trigger sending the message after a brief delay
    setTimeout(() => {
      const messageEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
      });
      // We'll use the suggestion text to automatically process it
      processNextTopicSelection(suggestion.text);
    }, 100);
  };

  // Process next topic selection
  const processNextTopicSelection = async (nextTopic: string) => {
    // Remove action prompt from messages
    setMessages(prev => prev.filter(msg => !msg.isActionPrompt));
    
    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: nextTopic,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setIsSending(true);
    
    // Check if it's a broad topic and ask for subtopic
    const topicInfo = classifyTopic(nextTopic);
    if (topicInfo.isBroadTopic) {
      const subtopicPrompt = generateSubtopicPrompt(topicInfo.topic, topicInfo.subtopics);
      const promptMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: subtopicPrompt,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, promptMsg]);
      setAwaitingSubtopicSelection(topicInfo.topic);
      setAvailableSubtopics(topicInfo.subtopics);
      setIsSending(false);
    } else {
      // For non-broad topics (like suggestions), process them as learning questions
      // Treat it like a normal message that should generate tutoring content
      try {
        // Generate step-based tutoring response for the specific topic
        const subtopicName = nextTopic;
        const tutoringResponse = await generateStepBasedTutoringResponse('General', subtopicName);
        
        // Update current topic to the NEW suggestion topic
        setCurrentTopic(subtopicName);
        setCurrentSubtopic(subtopicName);
        setLearningTopic(subtopicName);
        
        console.log('🔄 Updated currentTopic to:', subtopicName);
        
        // Step 1: Send Overview
        setTimeout(() => {
          console.log('📝 [Suggestion] Sending overview message');
          const overviewMsg: Message = {
            id: Date.now().toString(),
            role: 'assistant',
            content: tutoringResponse.overview,
            timestamp: new Date(),
            topic: subtopicName,
          };
          setMessages(prev => [...prev, overviewMsg]);
          saveAssistantMessage(tutoringResponse.overview);
        }, 300);
        
        // Step 2: Ask if user wants learning resources
        setTimeout(() => {
          console.log('❓ [Suggestion] Showing ask notes message');
          setPendingTutoringResponse(tutoringResponse);
          const askNotesMsg: Message = {
            id: (Date.now() + 100).toString(),
            role: 'assistant',
            content: `📚 Would you like to see learning resources for this topic? (I can show you documentation, tutorials, and video links)`,
            timestamp: new Date(),
            topic: subtopicName,
          };
          console.log('📚 [Suggestion] Setting ask notes message:', askNotesMsg);
          setMessages(prev => [...prev, askNotesMsg]);
          saveAssistantMessage(askNotesMsg.content);
          
          setAwaitingNotesConfirmation(subtopicName);
          setLearningTopic(subtopicName);
          setIsSending(false);
          console.log('✅ [Suggestion] Notes confirmation flag set');
        }, 600);
      } catch (error) {
        console.error('Error processing suggestion:', error);
        const errorMsg: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `Sorry, I couldn't process that topic. Could you try rephrasing your question?`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMsg]);
        setIsSending(false);
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop with blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={handleClose}
          />

          {/* Chatbot Modal - Purple Theme */}
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed right-6 top-20 bottom-6 w-[400px] max-w-[90vw] bg-white rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header - Purple Gradient Theme */}
            <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-[#6a11cb] to-[#2575fc] flex-shrink-0">
              <div className="flex items-center gap-3">
                <motion.div
                  animate={{ 
                    scale: [1, 1.05, 1],
                    rotate: [0, 5, -5, 0]
                  }}
                  transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                >
                  <Avatar className="h-12 w-12 bg-white border-2 border-white/50">
                    <AvatarFallback className="bg-gradient-to-br from-[#6a11cb] to-[#2575fc]">
                      <Bot className="h-6 w-6 text-white" />
                    </AvatarFallback>
                  </Avatar>
                </motion.div>
                <div>
                  <h3 className="font-bold text-base text-white">AI Assistant</h3>
                  <p className="text-xs text-white/80">Always here to help</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClose}
                  className="text-white rounded-full h-8 w-8"
                  title="Close chatbot"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Status Banner */}
            <div className="px-4 py-2 bg-gradient-to-r from-green-50 to-purple-50 border-b flex-shrink-0">
              <p className="text-xs text-center text-gray-600 flex items-center justify-center gap-2">
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                We are online!
              </p>
            </div>

            {/* Messages Area - Scrollable */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-gray-50 to-purple-50/30" ref={scrollRef}>
              {messages.map((message) => {
                // Hide entire action prompt message if it has suggestions - only show the suggestions
                if (message.role === 'assistant' && message.isActionPrompt && message.suggestions && message.suggestions.length > 0) {
                  return (
                    <div key={message.id} className="w-full mt-2 ml-0">
                      <SuggestionsDisplay
                        suggestions={message.suggestions}
                        onSuggestionClick={handleSuggestionClick}
                        isLoading={generatingSuggestions === message.id}
                      />
                    </div>
                  );
                }

                return (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-2 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {/* Avatar */}
                  <div className="flex-shrink-0">
                    {message.role === 'assistant' ? (
                      <div className="relative">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 via-purple-600 to-blue-600 flex items-center justify-center shadow-lg">
                          <Bot className="h-5 w-5 text-white" />
                        </div>
                        <div className="absolute inset-0 rounded-full bg-white/20 blur-md -z-10"></div>
                      </div>
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center shadow-md">
                        <User className="h-5 w-5 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Message Bubble with Formatted Content */}
                  <div className={`flex-1 ${message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}`}>
                    <div className="relative group w-full">
                      {/* Skip rendering normal message bubble for action prompt - it will be rendered as buttons below */}
                      {!message.isActionPrompt && (
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm ${
                            message.role === 'user'
                              ? 'bg-gradient-to-r from-[#6a11cb] to-[#2575fc] text-white rounded-tr-none'
                              : 'bg-white text-gray-800 border border-purple-100 rounded-tl-none'
                          }`}
                        >
                          {message.role === 'assistant' ? (
                            <FormattedMessage content={message.content} />
                          ) : (
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                          )}
                          
                          {message.attachments && message.attachments.length > 0 && (
                            <div className="mt-2 space-y-1 pt-2 border-t border-white/20">
                              {message.attachments.map((att, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-xs opacity-80">
                                  <Paperclip className="h-3 w-3" />
                                  <span className="truncate">{att.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          
                          <p className={`text-[10px] mt-1.5 ${
                            message.role === 'user' ? 'text-white/70' : 'text-gray-500'
                          }`}>
                            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      )}
                      
                      {/* Feedback Component for Assistant Messages - RIGHT AFTER MESSAGE BUBBLE */}
                      {message.role === 'assistant' && user?.uid && !message.isActionPrompt && (
                        <div className="mt-2 max-w-[85%]">
                          <FeedbackComponent
                            messageId={message.id}
                            messageContent={message.content}
                            userId={user.uid}
                            sessionId={sessionId || 'temp-session'}
                            topic={message.topic || learningTopic || 'General'}
                          />
                        </div>
                      )}
                      
                      {/* Copy Button - Shows on Hover */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyMessage(message.content, message.id)}
                        className={`absolute -right-8 top-0 opacity-0 group-hover:opacity-100 transition-all h-6 w-6 hover:scale-110 ${
                          copiedMessageId === message.id 
                            ? 'text-green-500' 
                            : 'text-gray-400 hover:text-gray-600'
                        }`}
                        title="Copy message"
                      >
                        {copiedMessageId === message.id ? (
                          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Suggestions Display for "Suggest next topics" message */}
                  {message.role === 'assistant' && message.content === '💡 Suggest next topics' && message.suggestions && (
                    <div className="w-full mt-2 ml-0">
                      <SuggestionsDisplay
                        suggestions={message.suggestions}
                        onSuggestionClick={handleSuggestionClick}
                        isLoading={generatingSuggestions === message.id}
                      />
                    </div>
                  )}
                  
                  {/* Suggestions Display for other Assistant Messages (but not action prompt or greeting) */}
                  {message.role === 'assistant' && message.suggestions && !message.isGreeting && message.content !== '💡 Suggest next topics' && !message.isActionPrompt && (
                    <div className="w-full mt-2 ml-0">
                      <SuggestionsDisplay
                        suggestions={message.suggestions}
                        onSuggestionClick={handleSuggestionClick}
                        isLoading={generatingSuggestions === message.id}
                      />
                    </div>
                  )}
                  
                  {/* If this message IS an action prompt with NO suggestions yet, show buttons */}
                  {message.role === 'assistant' && message.isActionPrompt && (!message.suggestions || message.suggestions.length === 0) && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="w-full flex gap-3 mt-3"
                    >
                      {/* Check if this is document-based or topic-based */}
                      {(() => {
                        // Check if we have uploaded document context
                        const hasDocument = uploadedDocumentText && documentInfo;
                        const topicInfo = currentTopic ? classifyTopic(currentTopic) : null;
                        const isPredefined = topicInfo && topicInfo.isBroadTopic;
                        
                        console.log('🔍 Action prompt rendering - hasDocument:', hasDocument, 'currentTopic:', currentTopic, 'isPredefined:', isPredefined);
                        
                        return (
                          <>
                            {/* Next Topic button - always show */}
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => {
                                if (hasDocument) {
                                  // For document-based: Generate AI suggestions based on document topic
                                  const generateSuggestions = async () => {
                                    try {
                                      const suggestions = await generateFollowUpSuggestions(
                                        documentInfo?.topic || 'General',
                                        [],
                                        3
                                      );
                                      
                                      if (suggestions.length > 0) {
                                        setMessages(prevMessages =>
                                          prevMessages.map(msg =>
                                            msg.id === message.id ? { ...msg, suggestions } : msg
                                          )
                                        );
                                      }
                                    } catch (error) {
                                      console.error('Error generating suggestions:', error);
                                    }
                                  };
                                  generateSuggestions();
                                } else if (isPredefined) {
                                  // For predefined topics: Show other subtopics from the same broad topic
                                  const otherSubtopics = topicInfo.subtopics.filter(
                                    st => st.toLowerCase() !== (currentSubtopic || '').toLowerCase()
                                  );
                                  
                                  if (otherSubtopics.length > 0) {
                                    const subtopicSuggestions: Suggestion[] = otherSubtopics.map((st, idx) => ({
                                      id: `subtopic-${idx}`,
                                      text: st,
                                      category: 'relatedconcept',
                                      icon: '📚',
                                    }));
                                    
                                    setMessages(prevMessages =>
                                      prevMessages.map(msg =>
                                        msg.id === message.id ? { ...msg, suggestions: subtopicSuggestions } : msg
                                      )
                                    );
                                  }
                                } else {
                                  // For undefined topics: Generate AI-based suggestions
                                  const generateSuggestions = async () => {
                                    try {
                                      const suggestions = await generateFollowUpSuggestions(
                                        currentSubtopic || currentTopic || 'General',
                                        [],
                                        3
                                      );
                                      
                                      if (suggestions.length > 0) {
                                        setMessages(prevMessages =>
                                          prevMessages.map(msg =>
                                            msg.id === message.id ? { ...msg, suggestions } : msg
                                          )
                                        );
                                      }
                                    } catch (error) {
                                      console.error('Error generating suggestions:', error);
                                    }
                                  };
                                  generateSuggestions();
                                }
                              }}
                              className="flex-1 rounded-xl px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 transition-all duration-200 text-sm font-semibold shadow-md"
                              title="Continue to next topic"
                            >
                              📚 Next Topic
                            </motion.button>
                            
                            {/* Take Quiz button - show for documents or predefined topics */}
                            {(hasDocument || isPredefined) && (
                              <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => {
                                  const quizTopicName = documentInfo?.topic || currentSubtopic || learningTopic || 'General Knowledge';
                                  handleGenerateQuiz(quizTopicName);
                                }}
                                disabled={generatingQuiz}
                                className="flex-1 rounded-xl px-4 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700 transition-all duration-200 text-sm font-semibold shadow-md disabled:opacity-60"
                                title="Take a quiz"
                              >
                                {generatingQuiz ? '⏳ Generating...' : '✓ Take Quiz'}
                              </motion.button>
                            )}
                          </>
                        );
                      })()}
                    </motion.div>
                  )}
                </motion.div>
                );
              })}

              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-2"
                >
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 via-purple-600 to-blue-600 flex items-center justify-center shadow-lg flex-shrink-0">
                    <Bot className="h-5 w-5 text-white" />
                  </div>
                  <div className="bg-white border border-purple-100 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
                    <div className="flex gap-1">
                      <motion.span
                        className="w-2 h-2 bg-[#6a11cb] rounded-full"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 0.8, delay: 0 }}
                      />
                      <motion.span
                        className="w-2 h-2 bg-[#2575fc] rounded-full"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 0.8, delay: 0.2 }}
                      />
                      <motion.span
                        className="w-2 h-2 bg-[#6a11cb] rounded-full"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 0.8, delay: 0.4 }}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* General Error Banner */}
            {generalError && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="px-4 py-3 bg-amber-50 border-t border-amber-200 flex-shrink-0"
              >
                <div className="flex items-start gap-3">
                  <svg
                    className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm text-amber-900 font-medium">{generalError.message}</p>
                    {generalError.canRetry && (
                      <button
                        onClick={() => {
                          setGeneralError(null);
                          // Retry last action - user can retype or click send again
                        }}
                        className="mt-2 text-xs text-amber-700 underline hover:text-amber-900 font-medium"
                      >
                        Try Again
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => setGeneralError(null)}
                    className="text-amber-600 hover:text-amber-800 transition-colors"
                    aria-label="Dismiss error"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Input Area - Fixed at Bottom */}
            <div className="p-3 border-t bg-white flex-shrink-0">
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  multiple
                  accept=".pdf,.docx,.doc"
                  onChange={handleFileUpload}
                />
                
                {/* File Upload Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || isExtractingTopic}
                  className="text-[#6a11cb] h-9 w-9 flex-shrink-0 transition-transform duration-200 hover:scale-110 hover:-translate-y-1"
                  title="Upload PDF or Word document"
                >
                  {isExtractingTopic ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Paperclip className="h-4 w-4" />
                  )}
                </Button>

                {/* Text Input */}
                <div className="flex-1 relative">
                  <Input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Enter your message..."
                    className="rounded-full border-purple-200 focus:border-[#6a11cb] focus:ring-[#6a11cb] pr-3 h-9 text-sm"
                    disabled={isLoading}
                  />
                </div>

                {/* Send Button */}
                <Button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isLoading}
                  className="rounded-full bg-gradient-to-r from-[#6a11cb] to-[#2575fc] hover:opacity-90 h-9 w-9 p-0 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  size="icon"
                  title="Send message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>

          {/* Quiz Modal */}
          <QuizModal
            isOpen={showQuizModal}
            onClose={(feedbackSubmitted) => {
              setShowQuizModal(false);
              if (feedbackSubmitted) {
                setQuizFeedbackSubmitted(true);
              }
            }}
            quiz={currentQuiz}
            topic={quizTopic}
            userId={user?.uid}
            sessionId={sessionId}
          />
        </>
      )}
    </AnimatePresence>
  );
};