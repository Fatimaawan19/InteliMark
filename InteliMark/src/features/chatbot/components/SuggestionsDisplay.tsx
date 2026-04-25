import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { Suggestion } from '@/services/followUpSuggestionsService';

interface SuggestionsDisplayProps {
  suggestions: Suggestion[];
  onSuggestionClick: (suggestion: Suggestion) => void;
  isLoading?: boolean;
}

export const SuggestionsDisplay = ({
  suggestions,
  onSuggestionClick,
  isLoading = false,
}: SuggestionsDisplayProps) => {
  if (!suggestions.length && !isLoading) {
    return null;
  }

  const categoryColors: { [key: string]: string } = {
    prerequisite: 'bg-blue-50 border-blue-200 text-blue-700',
    deepdive: 'bg-purple-50 border-purple-200 text-purple-700',
    application: 'bg-green-50 border-green-200 text-green-700',
    relatedconcept: 'bg-orange-50 border-orange-200 text-orange-700',
  };

  const categoryLabels: { [key: string]: string } = {
    prerequisite: 'Foundation',
    deepdive: 'Deep Dive',
    application: 'Application',
    relatedconcept: 'Related',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-4 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200"
    >
      <p className="text-xs font-semibold text-gray-600 mb-3 flex items-center gap-1">
        💡 You might also want to learn about:
      </p>

      <div className="space-y-2">
        {isLoading ? (
          <div className="flex items-center gap-2 p-2 bg-white/50 rounded border border-gray-200">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse animation-delay-100" />
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse animation-delay-200" />
            </div>
            <span className="text-xs text-gray-600">Generating suggestions...</span>
          </div>
        ) : (
          suggestions.map((suggestion, idx) => {
            const colorClass = categoryColors[suggestion.category] || categoryColors.relatedconcept;
            return (
              <motion.button
                key={suggestion.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                onClick={() => onSuggestionClick(suggestion)}
                className={`w-full text-left p-3 rounded-lg border transition-all hover:shadow-md hover:scale-105 hover:-translate-y-0.5 ${colorClass}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{suggestion.icon}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/70">
                        {categoryLabels[suggestion.category]}
                      </span>
                    </div>
                    <p className="text-sm font-medium leading-snug">{suggestion.text}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 mt-1 opacity-50" />
                </div>
              </motion.button>
            );
          })
        )}
      </div>

      <style>{`
        @keyframes pulse-delay {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .animation-delay-100 {
          animation-delay: 100ms;
        }
        .animation-delay-200 {
          animation-delay: 200ms;
        }
      `}</style>
    </motion.div>
  );
};

export default SuggestionsDisplay;
