/**
 * Bloom Taxonomy Utilities
 * 
 * MASTER REFERENCE IMPLEMENTATION:
 * 
 * Bloom levels are stored as immutable, universal reference data:
 * - Only 6 Bloom levels exist (Remembering → Creating)
 * - Stored in `bloomtaxonomies` collection (initialized once via seedBloomLevels.js)
 * - NEVER modified after seeding (immutable master reference)
 * 
 * CLOs reference Bloom levels:
 * - Each CLO has a `bloomLevelId` field (ObjectId pointing to bloomtaxonomies)
 * - When new courses are uploaded, only new CLO records are created
 * - CLOs reference existing Bloom levels without modifying them
 * - Bloom levels are NEVER created, updated, or deleted during normal operations
 * 
 * This ensures:
 * ✅ Bloom levels remain consistent across all courses
 * ✅ No duplicate levels when new courses are added
 * ✅ Referential integrity through ObjectId foreign keys
 * ✅ Clean separation: Bloom levels (master) vs CLOs (transactional)
 */

const mongoose = require("mongoose");
const BloomTaxonomy = require("../models/BloomTaxonomy");
const CLO = require("../models/CLO");

/**
 * GET: Fetch all Bloom levels (with caching option)
 * Returns all 6 universal Bloom levels sorted by level number
 * 
 * @returns {Promise<Array>} Array of Bloom level documents with ObjectIds
 */
async function getAllBloomLevels() {
  try {
    const levels = await BloomTaxonomy.find({ isActive: true }).sort({ levelNumber: 1 });
    if (!levels || levels.length === 0) {
      throw new Error(
        'No Bloom levels found in database. Run seedBloomLevels.js to initialize data.'
      );
    }
    return levels;
  } catch (error) {
    console.error('Error fetching Bloom levels:', error);
    throw error;
  }
}

/**
 * GET: Fetch a single Bloom level by name
 * 
 * @param {string} levelName - One of: 'Remembering', 'Understanding', 'Applying', 'Analyzing', 'Evaluating', 'Creating'
 * @returns {Promise<Object>} Bloom level document with ObjectId
 * @throws {Error} If level name is invalid or not found
 */
async function getBloomLevelByName(levelName) {
  try {
    if (!levelName || typeof levelName !== 'string') {
      throw new Error('Level name must be a non-empty string');
    }

    const level = await BloomTaxonomy.findOne({ levelName: levelName.trim() });
    if (!level) {
      throw new Error(
        `Bloom level "${levelName}" not found. Valid levels: Remembering, Understanding, Applying, Analyzing, Evaluating, Creating`
      );
    }
    return level;
  } catch (error) {
    console.error(`Error fetching Bloom level "${levelName}":`, error.message);
    throw error;
  }
}

/**
 * GET: Fetch a Bloom level by number (1-6)
 * 
 * @param {number} levelNumber - 1-6
 * @returns {Promise<Object>} Bloom level document with ObjectId
 * @throws {Error} If level number is invalid or not found
 */
async function getBloomLevelByNumber(levelNumber) {
  try {
    if (!Number.isInteger(levelNumber) || levelNumber < 1 || levelNumber > 6) {
      throw new Error('Level number must be an integer between 1 and 6');
    }

    const level = await BloomTaxonomy.findOne({ levelNumber });
    if (!level) {
      throw new Error(`Bloom level ${levelNumber} not found`);
    }
    return level;
  } catch (error) {
    console.error(`Error fetching Bloom level ${levelNumber}:`, error.message);
    throw error;
  }
}

/**
 * CREATE: Create a new CLO with Bloom level reference
 * 
 * @param {Object} cloData - CLO data
 * @param {string} cloData.courseId - MongoDB ObjectId of course
 * @param {string} cloData.courseCode - Course code (e.g., "CSC101")
 * @param {string} cloData.cloNumber - CLO number (e.g., "CLO1.1")
 * @param {string} cloData.description - CLO description
 * @param {string} cloData.bloomLevelName - Bloom level name (or pass bloomLevelId instead)
 * @param {string} cloData.bloomLevelId - Bloom level ObjectId (use if you have it)
 * @param {string} [cloData.unitNumber] - Optional unit number
 * @param {string} [cloData.learningLevel] - Optional learning level
 * @param {string} [cloData.graduateAttribute] - Optional graduate attribute
 * @param {boolean} [cloData.isLabCLO] - Whether this is a lab CLO
 * @returns {Promise<Object>} Created CLO document
 * @throws {Error} If validation fails or Bloom level not found
 */
async function createCLOWithBloomLevel(cloData) {
  try {
    // Validate required fields
    if (!cloData.courseId || !cloData.courseCode || !cloData.cloNumber || !cloData.description) {
      throw new Error(
        'Missing required fields: courseId, courseCode, cloNumber, description'
      );
    }

    // Get Bloom level ID
    let bloomLevelId = cloData.bloomLevelId;
    if (!bloomLevelId && cloData.bloomLevelName) {
      const level = await getBloomLevelByName(cloData.bloomLevelName);
      bloomLevelId = level._id;
    }

    if (!bloomLevelId) {
      throw new Error('Must provide either bloomLevelId or bloomLevelName');
    }

    // Create CLO
    const clo = await CLO.create({
      courseId: cloData.courseId,
      courseCode: cloData.courseCode,
      cloNumber: cloData.cloNumber,
      description: cloData.description,
      bloomLevelId: bloomLevelId,
      unitNumber: cloData.unitNumber || '',
      learningLevel: cloData.learningLevel || '',
      graduateAttribute: cloData.graduateAttribute || '',
      isLabCLO: cloData.isLabCLO || false
    });

    // Populate the Bloom level data before returning
    await clo.populate('bloomLevelId');
    return clo;
  } catch (error) {
    console.error('Error creating CLO:', error.message);
    throw error;
  }
}

/**
 * READ: Get CLO with Bloom level populated
 * 
 * @param {string} cloId - CLO ObjectId
 * @returns {Promise<Object>} CLO document with populated Bloom level
 */
async function getCLOWithBoomLevel(cloId) {
  try {
    const clo = await CLO.findById(cloId).populate('bloomLevelId');
    if (!clo) {
      throw new Error(`CLO with ID ${cloId} not found`);
    }
    return clo;
  } catch (error) {
    console.error('Error fetching CLO:', error);
    throw error;
  }
}

/**
 * READ: Get all CLOs for a course with Bloom levels populated
 * 
 * @param {string} courseId - Course ObjectId
 * @returns {Promise<Array>} Array of CLO documents with populated Bloom levels
 */
async function getCLOsByCoursWithBloomLevels(courseId) {
  try {
    const clos = await CLO.find({ courseId })
      .populate('bloomLevelId')
      .sort({ cloNumber: 1 });
    return clos;
  } catch (error) {
    console.error('Error fetching CLOs for course:', error);
    throw error;
  }
}

/**
 * READ: Get all CLOs at a specific Bloom level
 * 
 * @param {string} bloomLevelName - Bloom level name (e.g., "Creating")
 * @returns {Promise<Array>} Array of CLOs at that level
 */
async function getCLOsByBloomLevel(bloomLevelName) {
  try {
    const bloomLevel = await getBloomLevelByName(bloomLevelName);
    const clos = await CLO.find({ bloomLevelId: bloomLevel._id })
      .populate('bloomLevelId')
      .sort({ courseCode: 1, cloNumber: 1 });
    return clos;
  } catch (error) {
    console.error(`Error fetching CLOs at Bloom level "${bloomLevelName}":`, error);
    throw error;
  }
}

/**
 * UPDATE: Update a CLO's Bloom level
 * 
 * @param {string} cloId - CLO ObjectId
 * @param {string} newBloomLevelName - New Bloom level name
 * @returns {Promise<Object>} Updated CLO document
 */
async function updateCLOBloomLevel(cloId, newBloomLevelName) {
  try {
    const bloomLevel = await getBloomLevelByName(newBloomLevelName);
    const clo = await CLO.findByIdAndUpdate(
      cloId,
      { bloomLevelId: bloomLevel._id },
      { new: true, runValidators: true }
    ).populate('bloomLevelId');

    if (!clo) {
      throw new Error(`CLO with ID ${cloId} not found`);
    }
    return clo;
  } catch (error) {
    console.error('Error updating CLO Bloom level:', error);
    throw error;
  }
}

/**
 * ANALYTICS: Get CLO distribution by Bloom level
 * 
 * @param {string} [courseId] - Optional: limit to specific course
 * @returns {Promise<Object>} Object with Bloom levels as keys and CLO counts as values
 */
async function getBloomLevelDistribution(courseId) {
  try {
    const bloomLevels = await getAllBloomLevels();
    const distribution = {};

    for (const level of bloomLevels) {
      const query = { bloomLevelId: level._id };
      if (courseId) {
        query.courseId = new mongoose.Types.ObjectId(courseId);
      }
      const count = await CLO.countDocuments(query);
      distribution[level.levelName] = {
        count,
        levelNumber: level.levelNumber,
        complexity: level.complexityLabel || (level.levelNumber <= 3 ? 'LOTS' : 'HOTS')
      };
    }

    return distribution;
  } catch (error) {
    console.error('Error calculating Bloom level distribution:', error);
    throw error;
  }
}

/**
 * BULK OPERATION: Update CLOs extracted from syllabus
 * When syllabus parsing gives you CLOs with Bloom level names,
 * use this to bulk create/update them with proper references
 * 
 * @param {string} courseId - Course ObjectId
 * @param {Array} clos - Array of CLO objects with bloomLevelName field
 * @returns {Promise<Object>} { created: count, updated: count, errors: [] }
 */
async function bulkUpsertCLOsWithBloomLevels(courseId, clos) {
  try {
    if (!Array.isArray(clos) || clos.length === 0) {
      throw new Error('CLOs must be a non-empty array');
    }

    const results = {
      created: 0,
      updated: 0,
      errors: []
    };

    for (const cloData of clos) {
      try {
        // Get Bloom level by name
        if (!cloData.bloomLevelName) {
          throw new Error(
            `CLO "${cloData.cloNumber}" missing bloomLevelName. Valid values: Remembering, Understanding, Applying, Analyzing, Evaluating, Creating`
          );
        }

        const bloomLevel = await getBloomLevelByName(cloData.bloomLevelName);

        // Try to find existing CLO
        const existingCLO = await CLO.findOne({
          courseId,
          cloNumber: cloData.cloNumber
        });

        if (existingCLO) {
          // Update existing
          await CLO.findByIdAndUpdate(
            existingCLO._id,
            {
              description: cloData.description,
              bloomLevelId: bloomLevel._id,
              unitNumber: cloData.unitNumber || '',
              graduateAttribute: cloData.graduateAttribute || ''
            },
            { runValidators: true }
          );
          results.updated++;
        } else {
          // Create new
          await CLO.create({
            courseId,
            courseCode: cloData.courseCode,
            cloNumber: cloData.cloNumber,
            description: cloData.description,
            bloomLevelId: bloomLevel._id,
            unitNumber: cloData.unitNumber || '',
            learningLevel: cloData.learningLevel || '',
            graduateAttribute: cloData.graduateAttribute || ''
          });
          results.created++;
        }
      } catch (error) {
        results.errors.push({
          cloNumber: cloData.cloNumber,
          error: error.message
        });
      }
    }

    return results;
  } catch (error) {
    console.error('Error in bulk CLO upsert:', error);
    throw error;
  }
}

module.exports = {
  getAllBloomLevels,
  getBloomLevelByName,
  getBloomLevelByNumber,
  createCLOWithBloomLevel,
  getCLOWithBoomLevel,
  getCLOsByCoursWithBloomLevels,
  getCLOsByBloomLevel,
  updateCLOBloomLevel,
  getBloomLevelDistribution,
  bulkUpsertCLOsWithBloomLevels
};
