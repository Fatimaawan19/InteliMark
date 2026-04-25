// Service for generating quizzes/assignments using Ollama
// This file re-exports the optimized functions from ollama.js

const { generateQuestions, testOllamaConnection } = require('./ollama');

/**
 * Generate questions using Ollama LLM
 * @param {Object} params - Generation parameters
 * @param {Array} params.clos - Course Learning Outcomes
 * @param {string} params.courseTitle - Course title
 * @param {string} params.questionType - Type of questions (mcq, short-answer, etc.)
 * @param {number} params.questionCount - Number of questions to generate
 * @param {string} params.difficultyLevel - Difficulty level (easy, medium, hard)
 * @returns {Promise<Array>} Array of generated questions
 */
async function generateAssessmentQuestions(params) {
  return await generateQuestions(params);
}

/**
 * Test Ollama connection and availability
 * @returns {Promise<boolean>} True if Ollama is running and accessible
 */
async function checkOllamaStatus() {
  return await testOllamaConnection();
}

module.exports = {
  // Re-export main functions
  generateQuestions,
  testOllamaConnection,

  // Aliased functions for backward compatibility
  generateAssessmentQuestions,
  checkOllamaStatus
};