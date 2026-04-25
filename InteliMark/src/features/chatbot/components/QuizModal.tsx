import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, Download, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Quiz } from '@/services/quizGenerator';
import { exportQuizAsPDF } from '@/services/quizPDFExporter';
import { submitChatbotFeedback } from '@/services/feedbackService';

interface QuizModalProps {
  isOpen: boolean;
  onClose: (feedbackSubmitted?: boolean) => void;
  quiz: Quiz | null;
  topic: string;
  userId?: string;
  sessionId?: string;
}

const QuizModal = ({ isOpen, onClose, quiz, topic, userId, sessionId }: QuizModalProps) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<number>(0); // 1-5 stars
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [hoveredStar, setHoveredStar] = useState<number>(0);

  if (!isOpen || !quiz) return null;

  const currentQuestion = quiz.questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === quiz.questions.length - 1;
  const isAnswered = selectedAnswers[currentQuestionIndex] !== undefined;

  const handleAnswerSelect = (optionIndex: number) => {
    const newAnswers = [...selectedAnswers];
    newAnswers[currentQuestionIndex] = optionIndex;
    setSelectedAnswers(newAnswers);
  };

  const handleNext = () => {
    if (isLastQuestion) {
      setShowResults(true);
    } else {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handleExportPDF = async () => {
    try {
      await exportQuizAsPDF(quiz, `${topic}-quiz.pdf`);
    } catch (error) {
      console.error('Error exporting quiz:', error);
    }
  };

  const handleClose = () => {
    const hadFeedback = feedbackSubmitted;
    setCurrentQuestionIndex(0);
    setSelectedAnswers([]);
    setShowResults(false);
    setFeedbackRating(0);
    setFeedbackComment('');
    setFeedbackSubmitted(false);
    setSubmittingFeedback(false);
    setHoveredStar(0);
    onClose(hadFeedback);
  };

  const handleSubmitFeedback = async () => {
    if (feedbackRating === 0) {
      alert('Please select a rating (1-5 stars) before submitting.');
      return;
    }

    setSubmittingFeedback(true);
    try {
      const quizId = `quiz-${topic}-${Date.now()}`;
      
      const feedbackData = {
        userId: userId || 'anonymous',
        topic: topic,
        quizId: quizId,
        rating: feedbackRating,
        comment: feedbackComment.trim() || '',
        source: 'quiz_feedback',
      };
      
      console.log('[QuizModal] Submitting chatbot feedback:', feedbackData);
      await submitChatbotFeedback(feedbackData);
      
      setFeedbackSubmitted(true);
      console.log('[QuizModal] Feedback submitted successfully');
    } catch (error) {
      console.error('[QuizModal] Error submitting feedback:', error);
      alert('Failed to submit feedback. Please try again.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  if (showResults) {
    const correctCount = selectedAnswers.filter(
      (answer, index) => answer === quiz.questions[index].correctAnswer
    ).length;
    const percentage = Math.round((correctCount / quiz.questions.length) * 100);

    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="sticky top-0 bg-gradient-to-r from-purple-500 to-blue-600 text-white p-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold">Quiz Results 📊</h2>
              <button
                onClick={handleClose}
                className="text-white hover:bg-white/20 rounded-full p-2 transition"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-8 text-center">
              <div className="mb-6">
                <div className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-blue-600 mb-4">
                  {percentage}%
                </div>
                <p className="text-xl text-gray-700 mb-2">
                  You got {correctCount} out of {quiz.questions.length} questions correct!
                </p>
                <p className="text-gray-600">
                  {percentage >= 80 && "Excellent work! 🎉"}
                  {percentage >= 60 && percentage < 80 && "Good job! Keep practicing 👍"}
                  {percentage < 60 && "Keep learning! You'll do better next time 💪"}
                </p>
              </div>

              {/* Chatbot Feedback Section */}
              <div className="mb-8 border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">
                  How was your experience with the chatbot?
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Rate the chatbot's guidance and quiz quality
                </p>
                
                {!feedbackSubmitted ? (
                  <div className="space-y-4">
                    {/* Star Rating */}
                    <div className="flex gap-2 justify-center">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setFeedbackRating(star)}
                          onMouseEnter={() => setHoveredStar(star)}
                          onMouseLeave={() => setHoveredStar(0)}
                          className="transition-transform hover:scale-110 focus:outline-none"
                          aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                        >
                          <Star
                            className={`h-10 w-10 transition-colors ${
                              star <= (hoveredStar || feedbackRating)
                                ? 'fill-yellow-400 text-yellow-400'
                                : 'fill-none text-gray-300'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                    
                    {feedbackRating > 0 && (
                      <p className="text-sm text-center text-gray-600">
                        {feedbackRating === 1 && '⭐ Poor'}
                        {feedbackRating === 2 && '⭐⭐ Fair'}
                        {feedbackRating === 3 && '⭐⭐⭐ Good'}
                        {feedbackRating === 4 && '⭐⭐⭐⭐ Very Good'}
                        {feedbackRating === 5 && '⭐⭐⭐⭐⭐ Excellent'}
                      </p>
                    )}

                    {/* Comment Textarea */}
                    <div className="max-w-md mx-auto">
                      <textarea
                        value={feedbackComment}
                        onChange={(e) => setFeedbackComment(e.target.value)}
                        placeholder="Optional: Tell us more about your experience..."
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                        rows={3}
                      />
                    </div>

                    {/* Submit Button */}
                    <Button
                      onClick={handleSubmitFeedback}
                      disabled={feedbackRating === 0 || submittingFeedback}
                      className="bg-gradient-to-r from-purple-500 to-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submittingFeedback ? (
                        <span className="flex items-center gap-2">
                          <span className="animate-spin">⏳</span>
                          Submitting...
                        </span>
                      ) : (
                        'Submit Feedback'
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="py-6">
                    <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 max-w-md mx-auto">
                      <p className="text-green-700 font-medium text-center flex items-center justify-center gap-2">
                        <span className="text-2xl">✅</span>
                        Thank you for your feedback!
                      </p>
                      <p className="text-sm text-green-600 text-center mt-2">
                        Your input helps us improve the chatbot experience.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4 justify-center">
                <Button
                  onClick={handleExportPDF}
                  className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export as PDF
                </Button>
                <Button
                  onClick={handleClose}
                  variant="outline"
                  className="border-purple-300 text-purple-600 hover:bg-purple-50"
                >
                  Close
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        >
          <div className="sticky top-0 bg-gradient-to-r from-purple-500 to-blue-600 text-white p-6 flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">{topic} Quiz</h2>
              <p className="text-sm text-purple-100 mt-1">
                Question {currentQuestionIndex + 1} of {quiz.questions.length}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="text-white hover:bg-white/20 rounded-full p-2 transition"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="p-8">
            <div className="mb-8">
              <div className="w-full bg-gray-200 rounded-full h-2 mb-6">
                <div
                  className="bg-gradient-to-r from-purple-500 to-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${((currentQuestionIndex + 1) / quiz.questions.length) * 100}%`,
                  }}
                />
              </div>

              <h3 className="text-xl font-semibold text-gray-800 mb-6">
                {currentQuestion.question}
              </h3>

              <div className="space-y-3">
                {currentQuestion.options.map((option, index) => (
                  <button
                    key={index}
                    onClick={() => handleAnswerSelect(index)}
                    className={`w-full p-4 text-left border-2 rounded-lg transition-all ${
                      selectedAnswers[currentQuestionIndex] === index
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-purple-300'
                    }`}
                  >
                    <span className="font-medium text-gray-900">{option}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-4">
              <Button
                onClick={handleNext}
                disabled={!isAnswered}
                className="flex-1 bg-gradient-to-r from-purple-500 to-blue-600 text-white disabled:opacity-50 flex items-center gap-2"
              >
                {isLastQuestion ? 'See Results' : 'Next Question'}
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                onClick={handleClose}
                variant="outline"
                className="border-gray-300 text-gray-600 hover:bg-gray-50"
              >
                Exit
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default QuizModal;

export const generateQuizForTopic = async (topic: string, subtopic?: string): Promise<Quiz> => {
  // Replace this with actual API call or AI-generated quiz
  return {
    topic: topic,
    title: `${topic}${subtopic ? ` - ${subtopic}` : ''} Quiz`,
    description: `Test your knowledge about ${subtopic || topic}`,
    difficulty: 'medium',
    totalQuestions: 2,
    generatedAt: new Date(),
    questions: [
      {
        id: 1,
        question: `What is a key concept in ${subtopic || topic}?`,
        options: ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
        correctAnswer: 0,
        explanation: 'This is the correct answer because...',
      },
      {
        id: 2,
        question: `Which is true about ${subtopic || topic}?`,
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctAnswer: 1,
        explanation: 'This option is correct because...',
      },
    ],
  };
};
