/**
 * Step-Based Tutoring Service
 * Manages the 3-step teaching sequence
 */

import axios from 'axios';

export interface StepBasedResponse {
  overview: string;
  notes: { title: string; url: string }[];
  videos: { title: string; url: string }[];
}

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Generate step-based tutoring response
 * Returns separate overview, notes links, and video links
 */
export async function generateStepBasedTutoringResponse(
  topic: string,
  subtopic: string
): Promise<StepBasedResponse> {
  try {
    const prompt = `You are an expert tutor. The student wants to learn about: ${topic} > ${subtopic}

Generate a structured response with:
1. A brief, friendly overview (3-5 lines max) explaining this subtopic
2. High-quality notes/documentation links (Google Docs, GeeksforGeeks, official docs, etc)
3. Relevant YouTube video links from popular educational channels

Format your response as JSON (NO markdown, NO extra text):
{
  "overview": "Brief, clear explanation of the subtopic (3-5 lines)",
  "notes": [
    {"title": "Resource Title", "url": "https://example.com"},
    {"title": "Another Resource", "url": "https://example.com"}
  ],
  "videos": [
    {"title": "Video Title - Channel Name", "url": "https://www.youtube.com/watch?v=VIDEO_ID"},
    {"title": "Another Video - Channel Name", "url": "https://www.youtube.com/watch?v=VIDEO_ID"}
  ]
}

Important:
- Overview should be beginner-friendly but informative
- Include ONLY real, functional URLs (no made-up links)
- For notes: prefer official docs (docs.python.org, mdn.mozilla.org), GeeksforGeeks, Tutorialspoint, or reputable sources
- For videos: provide direct YouTube video links (https://www.youtube.com/watch?v=...) from popular educational channels like freeCodeCamp, Traversy Media, Programming with Mosh, Tech With Tim, CS Dojo, etc.
- If you don't know specific video IDs, use YouTube channel URLs or playlist URLs instead
- Return ONLY the JSON, nothing else`;

    const response = await axios.post(
      GROQ_API_URL,
      {
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful tutor. Generate structured learning responses in JSON format only. Always provide real, working URLs.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const content = response.data.choices[0].message.content.trim();

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('Could not parse tutoring response JSON');
      return getDefaultTutoringResponse(topic, subtopic);
    }

    const data = JSON.parse(jsonMatch[0]);

    // Filter and validate URLs
    const validatedNotes = (data.notes || []).filter((n: any) => {
      if (!n.title || !n.url) return false;
      // Ensure it's a valid URL
      try {
        new URL(n.url);
        return true;
      } catch {
        return false;
      }
    }).slice(0, 2);

    const validatedVideos = (data.videos || []).filter((v: any) => {
      if (!v.title || !v.url) return false;
      // Ensure it's a valid URL (should be YouTube URL per LLM prompt)
      try {
        const url = new URL(v.url);
        // Accept YouTube URLs, search URLs, or any video hosting platform
        return true;
      } catch {
        return false;
      }
    }).slice(0, 2);

    return {
      overview: data.overview || `Let's learn about ${subtopic}!`,
      notes: validatedNotes,
      videos: validatedVideos,
    };
  } catch (error) {
    console.error('Error generating tutoring response:', error);
    return getDefaultTutoringResponse(topic, subtopic);
  }
}

/**
 * Fallback tutoring response if API fails
 */
function getDefaultTutoringResponse(topic: string, subtopic: string): StepBasedResponse {
  return {
    overview: `Let's explore ${subtopic} in ${topic}! This is a fundamental concept that will help you build strong foundations. We'll break it down step-by-step so it's easy to understand.`,
    notes: [
      {
        title: 'Official Documentation',
        url: `https://docs.python.org/ (replace with relevant docs for your topic)`,
      },
      {
        title: 'Tutorial & Examples',
        url: 'https://www.geeksforgeeks.org/ (search for your topic)',
      },
    ],
    videos: [
      {
        title: 'Introduction Video',
        url: 'https://www.youtube.com/ (search for your topic)',
      },
      {
        title: 'In-Depth Tutorial',
        url: 'https://www.youtube.com/ (search for detailed tutorial)',
      },
    ],
  };
}

/**
 * Format links for messaging (title: URL format)
 */
export function formatLinksForMessage(links: { title: string; url: string }[], type: 'notes' | 'videos'): string {
  if (!links || links.length === 0) {
    return `No ${type} available at the moment.`;
  }

  const icon = type === 'notes' ? '📚' : '🎥';
  const header = type === 'notes' ? 'Reading & Notes' : 'Video Tutorials';

  return (
    `${icon} **${header}**\n\n` +
    links.map(link => `${link.title}: ${link.url}`).join('\n\n')
  );
}
