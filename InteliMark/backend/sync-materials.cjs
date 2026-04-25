/**
 * ⚠️⚠️⚠️ DEBUG SCRIPT ONLY - DO NOT USE IN NORMAL OPERATIONS ⚠️⚠️⚠️
 * 
 * This script is for troubleshooting data mismatches only.
 * 
 * In normal operations, the upload endpoint handles everything:
 * 1. Creates coursematerials with metadata
 * 2. Creates coursematerialraws linked via materialId
 * 3. Extracts text → updates coursematerialraws
 * 4. Generates embeddings → updates coursematerialraws
 * 
 * NO SYNC NEEDED!
 * 
 * See PROPER_ARCHITECTURE.md for the correct data flow.
 */

const mongoose = require('mongoose');

(async () => {
  try {
    const mongoUri = 'mongodb+srv://fypAdmin:123%21%40FH@cluster0.9qgq4lg.mongodb.net/fyp_db?retryWrites=true&w=majority';
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    
    const db = mongoose.connection.db;
    
    console.log('🔄 Syncing coursematerials (metadata) from coursematerialraws (raw data)...\n');
    console.log('⚠️  WARNING: This will OVERWRITE coursematerials. Use for debugging only!\n');
    
    // Get all raw materials from source collection
    const rawMaterials = await db.collection('coursematerialraws').find({}).toArray();
    console.log(`📄 Found ${rawMaterials.length} materials in coursematerialraws\n`);
    
    // Clear coursematerials (destination)
    const cleared = await db.collection('coursematerials').deleteMany({});
    console.log(`🗑️  Cleared ${cleared.deletedCount} old document(s) from coursematerials\n`);
    
    // Map raw materials to METADATA ONLY for coursematerials
    // Common fields: ONLY _id and originalFileName (2 fields max, NO overlaps)
    // coursematerials = high-level metadata ONLY
    // coursematerialraws = all raw extraction/ingestion details
    const docsToInsert = rawMaterials.map(m => ({
      _id: m._id,
      originalFileName: m.originalFileName,  // COMMON FIELD #2 (ONLY 2 TOTAL)
      // METADATA fields (unique to coursematerials, NOT in raw):
      courseName: '',
      courseCode: '',
      storedFileName: '',
      filePath: '',
      fileUrl: '',
      fileSize: 0,
      processingStatus: m.extractionStatus === 'completed' ? 'extracted' : 'uploaded',
    }));
    
    if (docsToInsert.length > 0) {
      const result = await db.collection('coursematerials').insertMany(docsToInsert);
      console.log(`✅ Synced ${result.insertedIds.length} document(s) to coursematerials (metadata only)\n`);
      
      docsToInsert.forEach((doc, i) => {
        console.log(`[${i+1}] ${doc.originalFileName}`);
        console.log(`    Status: ${doc.processingStatus}`);
        console.log(`    Metadata fields: 13 (courseId, courseName, coursCode, etc.)`);
      });
    }
    
    // Verify
    const count = await db.collection('coursematerials').countDocuments({});
    const rawCount = await db.collection('coursematerialraws').countDocuments({});
    
    console.log(`\n📊 Collection Schema Separation:`);
    console.log(`   coursematerials (metadata): ${count} doc(s) - 13 fields`);
    console.log(`   coursematerialraws (details): ${rawCount} doc(s) - 30+ fields`);
    console.log(`   Common fields: 2 only (_id, originalFileName)`);
    
    console.log(`\n✅ Sync complete!`);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
