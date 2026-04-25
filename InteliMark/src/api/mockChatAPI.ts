// TODO: Replace with actual backend API when database is connected

interface ChatRequest {
  message: string;
  history: { role: string; content: string }[];
}

interface ChatResponse {
  response: string;
  success: boolean;
}

export const mockChatAPI = async (request: ChatRequest): Promise<ChatResponse> => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Mock AI responses based on keywords
  const message = request.message.toLowerCase();
  let response = '';

  if (message.includes('assignment') || message.includes('homework')) {
    response = "I can help you with your assignments! You currently have 2 upcoming assignments: Machine Learning Assignment 3 due on March 25th, and Data Structures Quiz 2 due on March 23rd. Would you like more details about any of these?";
  } else if (message.includes('grade') || message.includes('score')) {
    response = "Your recent grades are looking good! You scored 92% on your Python Functions Test and 88% on your Database Design Project. Your overall GPA is 3.8. Keep up the great work!";
  } else if (message.includes('performance') || message.includes('progress')) {
    response = "Your academic performance is excellent! You've completed 85% of your assignments on time, with an average grade of 87%. You're doing particularly well in CS-401 (Machine Learning) with a current grade of 91%.";
  } else if (message.includes('schedule') || message.includes('calendar')) {
    response = "Let me check your schedule. You have upcoming events including: Assignment Due on March 25th for CS-401, and a Quiz on March 18th for Data Structures. Would you like me to add any new events?";
  } else if (message.includes('help') || message.includes('hello') || message.includes('hi')) {
    response = "Hello! I'm your AI study assistant. I can help you with:\n• Checking assignment deadlines\n• Reviewing your grades and performance\n• Managing your schedule\n• Answering questions about your courses\n\nWhat would you like to know?";
  } else {
    response = "I understand you're asking about: " + request.message + ". While I'm still learning, I can help you with assignments, grades, schedules, and course information. What specific information would you like?";
  }

  return {
    response,
    success: true
  };
};