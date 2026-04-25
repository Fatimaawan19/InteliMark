/**
 * Topic Extraction Service
 * Uses Grok LLM to extract main topic from document text
 */

import axios from 'axios';

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export interface DocumentAnalysis {
  documentType: string; // quiz, lecture, assignment, notes, image, etc.
  courseName: string; // extracted course name
  topic: string; // main topic
  conversationalMessage: string; // friendly message for user
}

/**
 * Extract main topic from document text using Grok LLM
 * @deprecated Use extractDocumentInfo for enhanced extraction
 */
export async function extractTopicFromText(text: string): Promise<string> {
  try {
    const response = await axios.post(
      GROQ_API_URL,
      {
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: `You are a topic extraction expert. Your task is to analyze text and extract the MAIN TOPIC in one short phrase (2-5 words). 
          
Rules:
- Return ONLY the topic name, nothing else
- Be specific but concise
- Focus on the primary subject matter
- Do not summarize the content
- Examples: "Machine Learning", "Data Structures", "React Hooks", "Database Design"`,
          },
          {
            role: 'user',
            content: `Extract the main topic of this text:\n\n${text}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 50,
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const topic = response.data?.choices?.[0]?.message?.content?.trim();
    
    if (!topic) {
      throw new Error('Failed to extract topic from response');
    }
    
    return topic;
  } catch (error) {
    console.error('Error extracting topic:', error);
    throw new Error('Failed to extract topic from document');
  }
}

/**
 * Extract comprehensive document information including type, course, and topic
 */
export async function extractDocumentInfo(text: string): Promise<DocumentAnalysis> {
  try {
    const response = await axios.post(
      GROQ_API_URL,
      {
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: `You are a document analysis expert. Analyze ANY type of document and extract:
1. Document Type (can be: quiz, assignment, lecture notes, presentation/slides, textbook chapter, research paper, tutorial, study guide, practice problems, summary, handout, worksheet, exam, lab manual, case study, diagram/image, reference material, or any other educational content type)
2. Course Name (search for words like "course", "subject", "class", "module", "unit" or infer from header/title)
3. Main Topic (the primary subject matter in 2-5 words)

Return ONLY a JSON object in this exact format:
{
  "documentType": "the specific type of content",
  "courseName": "Course Name or Unknown",
  "topic": "Main Topic"
}

Rules:
- Be flexible and identify ANY document type - not limited to quiz/assignment
- For images: try to determine what type of educational content it shows
- Look for course names in headers, footers, or near keywords like "course", "subject", "class"
- If no course found, return "Unknown"
- Topic should be specific and concise (2-5 words)
- Be descriptive with document type (e.g., "lecture slides", "practice quiz", "summary notes")
- Return ONLY the JSON object, nothing else`,
          },
          {
            role: 'user',
            content: `Analyze this document:\n\n${text}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 150,
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const content = response.data?.choices?.[0]?.message?.content?.trim();
    
    if (!content) {
      throw new Error('Failed to extract document info from response');
    }

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid JSON response format');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Create conversational message
    const courseInfo = parsed.courseName !== 'Unknown' 
      ? `of course **${parsed.courseName}**` 
      : '';
    
    const conversationalMessage = `It looks like it's a **${parsed.documentType}** ${courseInfo} about **${parsed.topic}**.\n\nWhat do you actually want to learn about this topic?`;

    return {
      documentType: parsed.documentType,
      courseName: parsed.courseName,
      topic: parsed.topic,
      conversationalMessage,
    };
  } catch (error) {
    console.error('Error extracting document info:', error);
    throw new Error('Failed to extract document information');
  }
}
