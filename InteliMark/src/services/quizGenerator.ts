/**
 * Quiz Generator Service
 * Generates quiz questions based on topics using the Groq API
 */

import axios from 'axios';

export interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctAnswer: number; // Index of correct option
  explanation: string;
}

export interface Quiz {
  topic: string;
  title: string;
  description: string;
  questions: QuizQuestion[];
  difficulty: 'easy' | 'medium' | 'hard';
  totalQuestions: number;
  generatedAt: Date;
}

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Generate a quiz for a given topic using Groq API
 */
export async function generateQuiz(
  topic: string,
  difficulty: 'easy' | 'medium' | 'hard' = 'medium',
  numberOfQuestions: number = 5
): Promise<Quiz> {
  try {
    const prompt = `Generate a ${difficulty} level quiz with ${numberOfQuestions} multiple-choice questions about "${topic}".

Format the response EXACTLY as JSON (no markdown, no extra text):
{
  "topic": "${topic}",
  "title": "[A catchy quiz title about the topic]",
  "description": "[Brief description of the quiz]",
  "difficulty": "${difficulty}",
  "questions": [
    {
      "id": 1,
      "question": "[Question text]",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "[Detailed explanation of the correct answer]"
    }
  ]
}

Important:
- Generate exactly ${numberOfQuestions} questions
- Each question must have exactly 4 options
- Ensure options are realistic and educational
- Provide clear explanations for correct answers
- Make explanations helpful for learning`;

    const response = await axios.post(
      GROQ_API_URL,
      {
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content:
              'You are a quiz generator for educational purposes. Generate well-structured quizzes with multiple-choice questions. Always respond with valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 2048,
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const content = response.data.choices[0].message.content;

    // Parse the JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse quiz JSON from response');
    }

    const quizData = JSON.parse(jsonMatch[0]);

    return {
      topic,
      title: quizData.title || `${topic} Quiz`,
      description: quizData.description || `A ${difficulty} level quiz about ${topic}`,
      questions: quizData.questions || [],
      difficulty,
      totalQuestions: numberOfQuestions,
      generatedAt: new Date(),
    };
  } catch (error) {
    console.error('Error generating quiz:', error);
    throw error;
  }
}

/**
 * Calculate quiz score based on answers
 */
export function calculateQuizScore(
  quiz: Quiz,
  answers: number[] // Index of selected answer for each question
): { score: number; percentage: number; correct: number; total: number } {
  let correct = 0;

  quiz.questions.forEach((question, index) => {
    if (answers[index] === question.correctAnswer) {
      correct++;
    }
  });

  const percentage = (correct / quiz.questions.length) * 100;

  return {
    score: correct,
    percentage: Math.round(percentage),
    correct,
    total: quiz.questions.length,
  };
}

/**
 * Get quiz feedback based on performance
 */
export function getQuizFeedback(percentage: number): string {
  if (percentage === 100) {
    return '🎉 Perfect score! You have mastered this topic!';
  } else if (percentage >= 80) {
    return '🌟 Excellent! You understand this topic very well.';
  } else if (percentage >= 60) {
    return '👍 Good job! You have a solid understanding. Review the explanations for questions you missed.';
  } else if (percentage >= 40) {
    return '📚 You need more practice. Review the topic and try again.';
  } else {
    return '💪 Keep learning! Go back to the learning resources and try again.';
  }
}
