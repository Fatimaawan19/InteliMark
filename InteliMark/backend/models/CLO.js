const mongoose = require("mongoose");

/**
 * CLO (Course Learning Outcome) Schema
 * 
 * CLOs reference universal Bloom taxonomy levels.
 * The bloomLevelId field is a foreign key to BloomTaxonomy collection.
 * This ensures CLOs are always mapped to one of the 6 standard Bloom levels.
 */
const cloSchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true,
    index: true
  },
  courseCode: {
    type: String,
    required: true,
    trim: true
  },
  cloNumber: {
    type: String,
    required: true,
    trim: true
  },
  unitNumber: {
    type: String,
    default: "",
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  /**
   * Reference to universal Bloom taxonomy level
   * This is a FOREIGN KEY to the BloomTaxonomy collection
   * The BloomTaxonomy collection contains only 6 immutable levels:
   * 1. Remembering, 2. Understanding, 3. Applying, 4. Analyzing, 5. Evaluating, 6. Creating
   * 
   * Always use one of these 6 level ObjectIds when creating/updating CLOs.
   * Example: await BloomTaxonomy.getByName('Remembering') to get the ObjectId
   */
  bloomLevelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "BloomTaxonomy",
    required: true
  },
  
  /**
   * (Optional) Deprecated field, kept for backward compatibility
   * TODO: Remove in next major version after migration
   */
  bloomTaxonomyLevel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "BloomTaxonomy",
    default: null
  },
  
  learningLevel: {
    type: String,
    default: "",
    trim: true
  },
  graduateAttribute: {
    type: String,
    default: "",
    trim: true
  },
  isLabCLO: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

/**
 * UNIQUE INDEX: Ensures one CLO number per course
 * Multiple CLOs with same number cannot exist in same course
 */
cloSchema.index({ courseId: 1, cloNumber: 1 }, { unique: true });

/**
 * INDEX: For efficient queries filtering CLOs by Bloom level
 * Usage: Find all "Creating" level CLOs across all courses
 */
cloSchema.index({ bloomLevelId: 1 });

/**
 * INDEX: For efficient queries by course code
 */
cloSchema.index({ courseCode: 1 });

/**
 * Pre-hook to validate that bloomLevelId exists in BloomTaxonomy
 */
cloSchema.pre('save', async function(next) {
  try {
    if (this.bloomLevelId) {
      const BloomTaxonomy = mongoose.model('BloomTaxonomy');
      const bloomExists = await BloomTaxonomy.findById(this.bloomLevelId);
      if (!bloomExists) {
        throw new Error(`Invalid bloomLevelId: ${this.bloomLevelId}. Bloom level does not exist.`);
      }
    }
  } catch (error) {
    throw error;
  }
});

/**
 * Virtual to get Bloom level name from referenced document
 * Usage: clo.bloomLevelName (after populate)
 */
cloSchema.virtual('bloomLevelName').get(function() {
  if (this.populated('bloomLevelId') && this.bloomLevelId.levelName) {
    return this.bloomLevelId.levelName;
  }
  return null;
});

cloSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model("CLO", cloSchema);
