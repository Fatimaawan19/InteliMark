// Content filter for detecting vulgar and abusive language
export const isContentAppropriate = (text: string): boolean => {
  // List of vulgar and abusive words/patterns to filter
  const vulgarPatterns = [
    // Profanities (common censored variations)
    /\b(fuck|shit|damn|crap|ass|bitch|bastard|asshole|prick|dick|cock|pussy|whore|slut|retard|dumbass|motherfucker|goddamn|bullshit|fuckup|fuckhead)\b/gi,
    // Abusive language
    /\b(kill|die|suicide|stupid|idiot|loser|waste|worthless|go.*hell|f.*off|drop.*dead|get.*fucked)\b/gi,
    // Offensive slurs and discriminatory language patterns
    /\b(hate|racist|homophobic|sexist|discrimination|abuse|rape|pedophile|terrorist)\b/gi,
    // Spam/scam patterns
    /\b(hack|crack|stolen|counterfeit|fake|pirate|crack.*password)\b/gi,
  ];

  const lowerText = text.toLowerCase();
  
  for (const pattern of vulgarPatterns) {
    if (pattern.test(lowerText)) {
      return false; // Content is not appropriate
    }
  }
  
  return true; // Content is appropriate
};

export const getWarningMessage = (): string => {
  return "Let's keep the conversation respectful 🙂 Please ask your question in a proper way so I can help you.";
};
