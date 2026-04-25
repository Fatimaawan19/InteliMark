/**
 * PDF Export Service
 * Generates PDF documents from quiz data
 */

import { Quiz, QuizQuestion } from './quizGenerator';

/**
 * Generate HTML string for quiz
 */
function generateQuizHTML(quiz: Quiz): string {
  const timestamp = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const questionsHTML = quiz.questions
    .map(
      (question, index) => `
    <div class="question-block">
      <h3>Question ${index + 1}:</h3>
      <p class="question-text">${question.question}</p>
      <div class="options">
        ${question.options
          .map(
            (option, optionIndex) => `
          <div class="option">
            <input type="radio" name="q${index}" id="q${index}_opt${optionIndex}" value="${optionIndex}" />
            <label for="q${index}_opt${optionIndex}">${option}</label>
          </div>
        `
          )
          .join('')}
      </div>
      <div class="explanation">
        <strong>Answer:</strong> ${question.options[question.correctAnswer]}
        <p>${question.explanation}</p>
      </div>
    </div>
  `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${quiz.title}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          padding: 20px;
          background: #f5f5f5;
        }
        
        .container {
          max-width: 900px;
          margin: 0 auto;
          background: white;
          padding: 40px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .header {
          text-align: center;
          margin-bottom: 40px;
          border-bottom: 3px solid #6a11cb;
          padding-bottom: 20px;
        }
        
        .header h1 {
          color: #6a11cb;
          font-size: 32px;
          margin-bottom: 10px;
        }
        
        .header .meta {
          display: flex;
          justify-content: space-around;
          margin-top: 15px;
          font-size: 14px;
          color: #666;
        }
        
        .meta-item {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: bold;
          text-transform: uppercase;
        }
        
        .difficulty-easy {
          background: #d4edda;
          color: #155724;
        }
        
        .difficulty-medium {
          background: #fff3cd;
          color: #856404;
        }
        
        .difficulty-hard {
          background: #f8d7da;
          color: #721c24;
        }
        
        .description {
          font-size: 16px;
          color: #666;
          margin: 20px 0;
          font-style: italic;
        }
        
        .instructions {
          background: #e7f3ff;
          border-left: 4px solid #2196F3;
          padding: 15px;
          margin: 20px 0;
          border-radius: 4px;
        }
        
        .instructions h3 {
          color: #2196F3;
          margin-bottom: 8px;
        }
        
        .instructions ul {
          margin-left: 20px;
        }
        
        .instructions li {
          margin: 5px 0;
          font-size: 14px;
        }
        
        .questions-container {
          margin-top: 40px;
        }
        
        .question-block {
          margin-bottom: 40px;
          padding: 20px;
          background: #f9f9f9;
          border-left: 4px solid #6a11cb;
          border-radius: 4px;
          page-break-inside: avoid;
        }
        
        .question-block h3 {
          color: #6a11cb;
          margin-bottom: 10px;
          font-size: 16px;
        }
        
        .question-text {
          font-size: 16px;
          font-weight: 500;
          margin-bottom: 15px;
          color: #333;
        }
        
        .options {
          margin: 15px 0;
          padding-left: 20px;
        }
        
        .option {
          margin: 10px 0;
          display: flex;
          align-items: center;
        }
        
        .option input[type="radio"] {
          margin-right: 10px;
          cursor: pointer;
        }
        
        .option label {
          cursor: pointer;
          font-size: 14px;
        }
        
        .explanation {
          margin-top: 15px;
          padding: 12px;
          background: #e8f5e9;
          border-radius: 4px;
          border-left: 3px solid #4caf50;
          font-size: 14px;
        }
        
        .explanation strong {
          color: #2e7d32;
        }
        
        .explanation p {
          margin-top: 8px;
          color: #555;
        }
        
        .footer {
          margin-top: 50px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          text-align: center;
          font-size: 12px;
          color: #999;
        }
        
        @media print {
          body {
            background: white;
            padding: 0;
          }
          
          .container {
            box-shadow: none;
            padding: 0;
          }
          
          .question-block {
            page-break-inside: avoid;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${quiz.title}</h1>
          <p class="description">${quiz.description}</p>
          <div class="meta">
            <div class="meta-item">
              <span class="badge difficulty-${quiz.difficulty}">${quiz.difficulty}</span>
            </div>
            <div class="meta-item">
              <span>📚 ${quiz.totalQuestions} Questions</span>
            </div>
            <div class="meta-item">
              <span>📅 ${timestamp}</span>
            </div>
          </div>
        </div>
        
        <div class="instructions">
          <h3>Instructions:</h3>
          <ul>
            <li>Read each question carefully</li>
            <li>Select the most appropriate answer</li>
            <li>Review the explanations provided for each question</li>
            <li>Use this as a self-assessment tool to gauge your understanding</li>
          </ul>
        </div>
        
        <div class="questions-container">
          ${questionsHTML}
        </div>
        
        <div class="footer">
          <p>Generated by InteliMark Tutoring Chatbot</p>
          <p>Use this quiz to assess your knowledge and prepare for exams</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Export quiz as PDF using browser print functionality
 */
export async function exportQuizAsPDF(quiz: Quiz, filename?: string): Promise<void> {
  try {
    const element = document.createElement('div');
    element.innerHTML = generateQuizHTML(quiz);
    element.style.display = 'none';
    document.body.appendChild(element);

    // Open print dialog
    const printWindow = window.open('', '', 'width=800,height=600');
    if (!printWindow) {
      throw new Error('Failed to open print window');
    }

    printWindow.document.write(generateQuizHTML(quiz));
    printWindow.document.close();

    // Add small delay to ensure content is rendered
    setTimeout(() => {
      printWindow.print();
      document.body.removeChild(element);
    }, 250);
  } catch (error) {
    console.error('Error exporting quiz as PDF:', error);
    // Fallback to HTML download
    downloadQuizAsHTML(quiz, filename);
  }
}

/**
 * Export quiz as HTML string (for preview or alternative download)
 */
export function getQuizHTMLString(quiz: Quiz): string {
  return generateQuizHTML(quiz);
}

/**
 * Download HTML as a file
 */
export function downloadQuizAsHTML(quiz: Quiz, filename?: string): void {
  const html = generateQuizHTML(quiz);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `${quiz.topic.replace(/\s+/g, '_')}_quiz.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
