const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const CourseMaterial = require('./models/CourseMaterial');
const CourseMaterialRaw = require('./models/CourseMaterialRaw');

const FAISS_INDEX_PATH = path.join(__dirname, 'rag_marking', 'faiss_index');

async function cleanup() {
  try {
    console.log('🔍 Starting duplicate cleanup process...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/intelimark');
    console.log('✅ Connected to MongoDB');

    // Find duplicates: group by courseId + originalFileName
    const duplicates = await CourseMaterial.aggregate([
      {
        $group: {
          _id: { courseId: '$courseId', fileName: '$originalFileName' },
          count: { $sum: 1 },
          ids: { $push: '$_id' },
          materials: { $push: '$$ROOT' }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);

    console.log(`📊 Found ${duplicates.length} duplicate groups\n`);

    let totalRemoved = 0;
    let totalRawRemoved = 0;
    let faissCleanupNeeded = false;

    // Process each duplicate group
    for (const dupGroup of duplicates) {
      const { _id, count, materials } = dupGroup;
      console.log(`📋 Duplicate Group: ${_id.fileName}`);
      console.log(`   Course: ${_id.courseId}`);
      console.log(`   Found ${count} copies\n`);

      // Sort by status priority: embedded > extracted > uploaded > failed
      const statusPriority = { 'embedded': 3, 'extracted': 2, 'uploaded': 1, 'failed': 0 };
      materials.sort((a, b) => {
        const priorityDiff = (statusPriority[b.processingStatus] || 0) - (statusPriority[a.processingStatus] || 0);
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(b.createdAt) - new Date(a.createdAt); // If same status, keep newest
      });

      const keepMaterial = materials[0];
      const removeMaterials = materials.slice(1);

      console.log(`   ✅ KEEP: ${keepMaterial._id} (${keepMaterial.processingStatus}, ${new Date(keepMaterial.createdAt).toLocaleString()})`);

      for (const removeMaterial of removeMaterials) {
        console.log(`   ❌ REMOVE: ${removeMaterial._id} (${removeMaterial.processingStatus})`);

        try {
          // Delete from CourseMaterial
          await CourseMaterial.deleteOne({ _id: removeMaterial._id });
          totalRemoved++;

          // Delete from CourseMaterialRaw
          const rawDocs = await CourseMaterialRaw.find({ materialId: removeMaterial._id });
          for (const rawDoc of rawDocs) {
            await CourseMaterialRaw.deleteOne({ _id: rawDoc._id });
            totalRawRemoved++;
            faissCleanupNeeded = true; // Mark that FAISS needs cleanup
          }

          console.log(`      ✓ Deleted from MongoDB`);
        } catch (err) {
          console.error(`      ❌ Error deleting:`, err.message);
        }
      }
      console.log('');
    }

    console.log('\n📊 Cleanup Summary:');
    console.log(`   ✅ Removed ${totalRemoved} duplicate CourseMaterial entries`);
    console.log(`   ✅ Removed ${totalRawRemoved} corresponding CourseMaterialRaw entries`);

    if (faissCleanupNeeded) {
      console.log('\n⚠️  IMPORTANT: FAISS vector database needs cleanup:');
      console.log('   The FAISS index still contains vectors for removed materials.');
      console.log('   To fully clean FAISS, run: python backend/rag_marking/clean_faiss_orphans.py');
      console.log('   OR delete and rebuild the index:');
      console.log('   - Delete: backend/rag_marking/faiss_index/');
      console.log('   - Re-upload all materials to rebuild');
    } else {
      console.log('\n✅ No duplicates found!');
    }

    await mongoose.disconnect();
    console.log('✅ MongoDB cleanup complete!\n');
  } catch (error) {
    console.error('❌ Cleanup error:', error.message);
    process.exit(1);
  }
}

cleanup();
