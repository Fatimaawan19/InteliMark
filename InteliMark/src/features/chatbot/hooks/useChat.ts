import { useState } from 'react';
import { chatAPI } from '@/api/chatAPI'; // Import real AI API

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export const useChat = () => {
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async (
    content: string, 
    history: Message[], 
    documentContext?: { text: string; type: string; course: string; topic: string },
    retryCount: number = 0
  ): Promise<string> => {
    setIsLoading(true);
    const maxRetries = 2;
    
    try {
      // Save user message to localStorage
      const chatHistory = JSON.parse(localStorage.getItem('chatHistory') || '[]');
      chatHistory.push({ 
        role: 'user', 
        content, 
        timestamp: new Date().toISOString() 
      });
      localStorage.setItem('chatHistory', JSON.stringify(chatHistory));

      // Build enhanced message with document context if available
      let enhancedMessage = content;
      if (documentContext) {
        enhancedMessage = `[DOCUMENT CONTEXT]
Document Type: ${documentContext.type}
Course: ${documentContext.course}
Main Topic: ${documentContext.topic}

[FULL DOCUMENT CONTENT]
${documentContext.text.substring(0, 4000)}
${documentContext.text.length > 4000 ? '\n[Document truncated - showing first 4000 characters]' : ''}

[END OF DOCUMENT]

[USER QUESTION]
${content}

Instructions: Please answer the user's question based on the document content above. If they ask about a specific question number, find that question in the document and provide a detailed explanation with the solution.`;
      }

      // Call real AI API
      const data = await chatAPI({
        message: enhancedMessage,
        history: history.map(m => ({ 
          role: m.role, 
          content: m.content 
        })),
        ...(documentContext?.course ? { courseHint: documentContext.course } : {}),
      });

      if (!data.success) {
        console.warn('AI response unsuccessful:', data.response);
      }

      // Save AI response to localStorage
      chatHistory.push({ 
        role: 'assistant', 
        content: data.response, 
        timestamp: new Date().toISOString() 
      });
      localStorage.setItem('chatHistory', JSON.stringify(chatHistory));

      return data.response;

    } catch (error: any) {
      console.error('Chat error:', error);
      
      // Retry logic for network errors
      const isNetworkError = error.message?.includes('network') || error.code === 'ECONNABORTED' || error.message?.includes('timeout');
      const isRateLimitError = error.response?.status === 429;
      
      if ((isNetworkError || isRateLimitError) && retryCount < maxRetries) {
        console.log(`🔄 Retrying API call (attempt ${retryCount + 1}/${maxRetries})...`);
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
        return sendMessage(content, history, documentContext, retryCount + 1);
      }
      
      // Specific error messages based on error type
      if (isNetworkError) {
        return '🌐 Network connection issue detected. Please check your internet connection and try again.';
      }
      
      if (isRateLimitError) {
        return '⏳ Too many requests. Please wait a moment before trying again.';
      }
      
      if (error.response?.status === 401 || error.response?.status === 403) {
        return '🔐 Authentication failed. Please check your API configuration or contact support.';
      }
      
      if (error.response?.status === 400) {
        return '⚠️ Invalid request. Please try rephrasing your question or try a different topic.';
      }
      
      return '❌ I encountered an unexpected error. Please try:\n• Refreshing the page\n• Rephrasing your question\n• Contacting support if the issue persists';
    } finally {
      setIsLoading(false);
    }
  };

  return { sendMessage, isLoading };
};