/**
 * Follow-up Question Suggestions Service
 * Generates intelligent follow-up suggestions based on discussed topics
 */

import axios from 'axios';

export interface Suggestion {
  id: string;
  text: string;
  category: string;
  icon: string;
}

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Generate follow-up suggestions based on a topic
 */
export async function generateFollowUpSuggestions(
  topic: string,
  previousMessages: string[] = [],
  maxSuggestions: number = 3
): Promise<Suggestion[]> {
  try {
    // Build context from previous messages
    const context = previousMessages.slice(-3).join('\n');

    const prompt = `Based on the topic "${topic}" and the following conversation context:
${context}

Generate exactly ${maxSuggestions} related topics or questions that would help deepen understanding of this subject.

Format your response as a JSON array with NO additional text:
[
  {
    "id": "unique-id-1",
    "text": "Question or topic text about a related concept",
    "category": "prerequisite|deepdive|application|relatedconcept",
    "icon": "emoji that fits the topic"
  }
]

Categories:
- prerequisite: Foundational concepts needed before this topic
- deepdive: More advanced aspects of this topic
- application: Real-world applications or examples
- relatedconcept: Connected topics in the same domain

Requirements:
- Each suggestion should be a clear, actionable learning question
- Suggestions should naturally flow from the current topic
- Mix different categories to provide comprehensive learning paths
- Make them specific and interesting
- Return ONLY the JSON array, no other text`;

    const response = await axios.post(
      GROQ_API_URL,
      {
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content:
              'You are an educational assistant that generates intelligent follow-up learning suggestions. Always respond with valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 512,
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const content = response.data.choices[0].message.content.trim();

    // Parse the JSON response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('Could not parse suggestions JSON');
      return getDefaultSuggestions(topic);
    }

    const suggestions = JSON.parse(jsonMatch[0]);

    // Validate and transform suggestions
    return suggestions
      .filter((s: any) => s.text && s.icon)
      .map((s: any, idx: number) => ({
        id: s.id || `suggestion-${Date.now()}-${idx}`,
        text: s.text,
        category: s.category || 'relatedconcept',
        icon: s.icon || '📚',
      }))
      .slice(0, maxSuggestions);
  } catch (error) {
    console.error('Error generating follow-up suggestions:', error);
    return getDefaultSuggestions(topic);
  }
}

/**
 * Get default suggestions if AI generation fails
 */
function getDefaultSuggestions(topic: string): Suggestion[] {
  const suggestions: { [key: string]: Suggestion[] } = {
    math: [
      {
        id: 'default-1',
        text: 'Practice problems and exercises',
        category: 'application',
        icon: '🧮',
      },
      {
        id: 'default-2',
        text: 'Real-world applications of this concept',
        category: 'application',
        icon: '🌍',
      },
      {
        id: 'default-3',
        text: 'Advanced topics building on this foundation',
        category: 'deepdive',
        icon: '📈',
      },
    ],
    science: [
      {
        id: 'default-1',
        text: 'Experimental demonstrations and examples',
        category: 'application',
        icon: '🔬',
      },
      {
        id: 'default-2',
        text: 'Historical development of this theory',
        category: 'prerequisite',
        icon: '📜',
      },
      {
        id: 'default-3',
        text: 'Related scientific concepts',
        category: 'relatedconcept',
        icon: '🔗',
      },
    ],
    default: [
      {
        id: 'default-1',
        text: `What are the practical applications of ${topic}?`,
        category: 'application',
        icon: '💡',
      },
      {
        id: 'default-2',
        text: `What are prerequisites for understanding ${topic}?`,
        category: 'prerequisite',
        icon: '🏗️',
      },
      {
        id: 'default-3',
        text: `What are advanced topics related to ${topic}?`,
        category: 'deepdive',
        icon: '🚀',
      },
    ],
  };

  const topicLower = topic.toLowerCase();
  let selectedSuggestions = suggestions.default;

  for (const key of Object.keys(suggestions)) {
    if (key !== 'default' && topicLower.includes(key)) {
      selectedSuggestions = suggestions[key];
      break;
    }
  }

  return selectedSuggestions;
}

/**
 * Extract learning keywords from messages for better suggestions
 */
export function extractLearningContext(messages: string[]): {
  topics: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
} {
  const combined = messages.join(' ').toLowerCase();

  // Simple keyword extraction
  const advancedKeywords = [
    'advanced',
    'complex',
    'optimization',
    'algorithm',
    'framework',
    'architecture',
    'performance',
    'scalability',
  ];
  const beginnerKeywords = [
    'what is',
    'how do',
    'explain',
    'basic',
    'introduction',
    'beginner',
    'simple',
    'easy',
  ];

  let difficulty: 'beginner' | 'intermediate' | 'advanced' = 'intermediate';
  const advancedCount = advancedKeywords.filter(k => combined.includes(k)).length;
  const beginnerCount = beginnerKeywords.filter(k => combined.includes(k)).length;

  if (advancedCount > beginnerCount) {
    difficulty = 'advanced';
  } else if (beginnerCount > advancedCount) {
    difficulty = 'beginner';
  }

  return { topics: [], difficulty };
}
