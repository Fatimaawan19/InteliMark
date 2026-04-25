/**
 * Clean up duplicates and verify Phase 1 completion
 * Keep only 1 copy of each slide with all Phase 1 fields filled
 */

const mongoose = require('mongoose');

(async () => {
  try {
    const mongoUri = 'mongodb+srv://fypAdmin:123%21%40FH@cluster0.9qgq4lg.mongodb.net/fyp_db?retryWrites=true&w=majority';
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    
    const db = mongoose.connection.db;
    
    // Get all materials grouped by filename
    const materials = await db.collection('coursematerials').find({})
      .project({ _id: 1, originalFileName: 1, extractionStatus: 1, faissIngestionStatus: 1, courseCode: 1, numChunks: 1, numEmbeddings: 1 })
      .toArray();
    
    console.log('📊 Current materials:\n');
    
    // Group by filename
    const grouped = {};
    materials.forEach(m => {
      if (!grouped[m.originalFileName]) {
        grouped[m.originalFileName] = [];
      }
      grouped[m.originalFileName].push(m);
    });
    
    // Display grouped materials
    Object.entries(grouped).forEach(([filename, docs]) => {
      console.log(`📄 ${filename}: ${docs.length} copy(ies)`);
      docs.forEach((doc, idx) => {
        const extraction = doc.extractionStatus || 'pending';
        const ingestion = doc.faissIngestionStatus || 'pending';
        const chunks = doc.numChunks || 0;
        const embeddings = doc.numEmbeddings || 0;
        console.log(`  [${idx+1}] ID: ${doc._id}`);
        console.log(`      Extraction: ${extraction}, Ingestion: ${ingestion}, Chunks: ${chunks}, Embeddings: ${embeddings}`);
      });
      console.log('');
    });
    
    // Find duplicates to delete
    const toDelete = [];
    Object.entries(grouped).forEach(([filename, docs]) => {
      if (docs.length > 1) {
        // Find best copy (completed extraction and ingestion)
        const completed = docs.filter(d => d.extractionStatus === 'completed' && d.faissIngestionStatus === 'completed');
        
        if (completed.length > 0) {
          // Keep the first completed one, delete the rest
          const toKeep = completed[0];
          docs.forEach(doc => {
            if (doc._id.toString() !== toKeep._id.toString()) {
              toDelete.push(doc._id);
            }
          });
          console.log(`✅ Keeping best copy of "${filename}" (ID: ${toKeep._id})`);
          console.log(`   Status: extraction=${toKeep.extractionStatus}, ingestion=${toKeep.faissIngestionStatus}\n`);
        } else {
          // No completed copy, keep the first one anyway
          const toKeep = docs[0];
          docs.forEach((doc, idx) => {
            if (idx > 0) {
              toDelete.push(doc._id);
            }
          });
          console.log(`⚠️  "${filename}" - no completed copy found, keeping first one\n`);
        }
      }
    });
    
    if (toDelete.length === 0) {
      console.log('✅ No duplicates found! All materials are unique.\n');
      await mongoose.disconnect();
      return;
    }
    
    console.log(`\n🗑️  Deleting ${toDelete.length} duplicate(s)...`);
    
    // Delete duplicates from coursematerials
    const result1 = await db.collection('coursematerials').deleteMany({ _id: { $in: toDelete } });
    
    // Delete associated raw materials
    const result2 = await db.collection('coursematerialsraw').deleteMany({ materialId: { $in: toDelete } });
    
    console.log(`✅ Deleted:`);
    console.log(`  coursematerials: ${result1.deletedCount} doc(s)`);
    console.log(`  coursematerialsraw: ${result2.deletedCount} doc(s)\n`);
    
    // Show final state
    const finalMaterials = await db.collection('coursematerials').find({})
      .project({ originalFileName: 1, extractionStatus: 1, faissIngestionStatus: 1, numChunks: 1 })
      .toArray();
    
    console.log('📋 Final state:');
    finalMaterials.forEach(m => {
      const status = (m.extractionStatus === 'completed' && m.faissIngestionStatus === 'completed') ? '✅' : '⚠️';
      console.log(`  ${status} ${m.originalFileName} (chunks: ${m.numChunks || 0})`);
    });
    
    await mongoose.disconnect();
    console.log('\n✅ Cleanup complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
