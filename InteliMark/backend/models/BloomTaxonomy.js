const mongoose = require("mongoose");

/**
 * BloomTaxonomy Schema
 * 
 * Represents universal Bloom's taxonomy levels (categories).
 * These are immutable, course-independent reference data.
 * CLOs reference Bloom levels via bloomLevelId ObjectId.
 * 
 * Core Principle: Bloom levels are CATEGORIES, NOT CONTAINERS
 * - Bloom levels DO NOT own CLOs
 * - CLOs reference Bloom levels
 * - Only 6 levels should ever exist in this collection
 */
const bloomTaxonomySchema = new mongoose.Schema({
  // Bloom level name (must be one of the 6 universal levels)
  levelName: {
    type: String,
    enum: ['Remembering', 'Understanding', 'Applying', 'Analyzing', 'Evaluating', 'Creating'],
    required: true,
    trim: true
  },
  
  // Numeric representation (1-6, for sorting and assessment)
  levelNumber: {
    type: Number,
    enum: [1, 2, 3, 4, 5, 6],
    required: true
  },
  
  // Cognitive complexity category
  complexity: {
    type: String,
    enum: ['Lower Order Thinking Skills (LOTS)', 'Higher Order Thinking Skills (HOTS)'],
    required: true
  },
  
  // Description of what this Bloom level entails
  description: {
    type: String,
    required: true
  },
  
  // Common action verbs for this level (e.g., "define", "list", "recall" for Remembering)
  actionVerbs: [{
    type: String,
    trim: true
  }],
  
  // Example question starters to help teachers create assessments
  questionStarters: [{
    type: String,
    trim: true
  }],
  
  // Keywords/concepts associated with this level
  keywords: [{
    type: String,
    trim: true
  }],
  
  // Whether this level is currently active
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

/**
 * UNIQUE INDEX: Ensures only 1 record per Bloom level name
 * Prevents accidental creation of duplicate "Remembering" levels, etc.
 * This is the PRIMARY constraint ensuring universality.
 */
bloomTaxonomySchema.index({ levelName: 1 }, { unique: true });

/**
 * UNIQUE INDEX: Prevents duplicate levelNumbers
 * Ensures no two entries claim to be "Level 5"
 */
bloomTaxonomySchema.index({ levelNumber: 1 }, { unique: true });

/**
 * TEXT INDEX for searching (optional, for future UI searches)
 */
bloomTaxonomySchema.index({ description: 'text', keywords: 'text', actionVerbs: 'text' });

/**
 * Static method to get a Bloom level by name
 * Usage: await BloomTaxonomy.getByName('Remembering')
 */
bloomTaxonomySchema.statics.getByName = async function(levelName) {
  return await this.findOne({ levelName: levelName.trim() });
};

/**
 * Static method to get all Bloom levels sorted by level number
 * Usage: await BloomTaxonomy.getAllLevels()
 */
bloomTaxonomySchema.statics.getAllLevels = async function() {
  return await this.find({ isActive: true }).sort({ levelNumber: 1 });
};

/**
 * Static method to get Bloom level by number
 * Usage: await BloomTaxonomy.getByNumber(3)
 */
bloomTaxonomySchema.statics.getByNumber = async function(levelNumber) {
  return await this.findOne({ levelNumber: levelNumber });
};

/**
 * Virtual to get complexity as a shortened label
 */
bloomTaxonomySchema.virtual('complexityLabel').get(function() {
  return this.complexity === 'Lower Order Thinking Skills (LOTS)' ? 'LOTS' : 'HOTS';
});

// Ensure virtuals are included in JSON output
bloomTaxonomySchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model("BloomTaxonomy", bloomTaxonomySchema);
