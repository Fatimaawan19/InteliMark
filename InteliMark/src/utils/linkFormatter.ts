// Link detection and formatting utility

export interface DetectedLink {
  title: string;
  url: string;
  type: 'resource' | 'video' | 'documentation';
  icon: string;
}

/**
 * Detect and format clickable links from text
 * Extracts links and returns formatted version with icons
 */
export const detectAndFormatLinks = (text: string): { formattedText: string; links: DetectedLink[] } => {
  const links: DetectedLink[] = [];
  let formattedText = text;

  // Pattern: Title: URL
  const linkPattern = /([^:\n]+?):\s*(https?:\/\/[^\s\n]+)/gi;
  let match;
  let linkCount = 0;

  while ((match = linkPattern.exec(text)) !== null && linkCount < 2) {
    const title = match[1].trim();
    const url = match[2].trim();

    if (!title.includes('\n') && title.length < 100) {
      let type: 'resource' | 'video' | 'documentation' = 'resource';
      let icon = '📄';

      // Detect link type
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        type = 'video';
        icon = '🎥';
      } else if (url.includes('docs') || url.includes('documentation') || url.includes('developer.mozilla.org')) {
        type = 'documentation';
        icon = '📚';
      }

      links.push({ title, url, type, icon });
      linkCount++;
    }
  }

  return { formattedText, links };
};

/**
 * Check if text contains clickable links
 */
export const hasLinks = (text: string): boolean => {
  return /https?:\/\/[^\s\n]+/i.test(text);
};

/**
 * Extract all URLs from text
 */
export const extractUrls = (text: string): string[] => {
  const urlPattern = /https?:\/\/[^\s\n)]+/gi;
  const urls = text.match(urlPattern) || [];
  return urls;
};

/**
 * Format error message with retry suggestion
 */
export const formatErrorMessage = (error: string): string => {
  return `⚠️ ${error}\n\nPlease try again or ask me something else!`;
};
