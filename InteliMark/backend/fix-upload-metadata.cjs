/**
 * ⚠️⚠️⚠️ DEBUG SCRIPT ONLY - FOR DATA RECOVERY ⚠️⚠️⚠️
 * 
 * Use ONLY if upload metadata is corrupted/missing.
 * 
 * In normal operations, use POST /api/courses/upload-material endpoint
 * which automatically:
 * 1. Creates coursematerials with all metadata
 * 2. Creates coursematerialraws linked via materialId
 * 3. Runs extraction and ingestion
 * 
 * See PROPER_ARCHITECTURE.md for correct data flow.
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

(async () => {
  try {
    const mongoUri = 'mongodb+srv://fypAdmin:123%21%40FH@cluster0.9qgq4lg.mongodb.net/fyp_db?retryWrites=true&w=majority';
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    
    const db = mongoose.connection.db;
    
    console.log('🔧 Fixing upload metadata...\n');
    
    // Get all coursematerialraws
    const raws = await db.collection('coursematerialraws').find({}).toArray();
    console.log(`Found ${raws.length} raw material(s) to fix\n`);
    
    let fixedCount = 0;
    let skippedCount = 0;
    
    for (const raw of raws) {
      console.log(`📄 Processing: ${raw.originalFileName}`);
      
      // Check if coursematerials exists
      const existing = await db.collection('coursematerials').findOne({ _id: raw._id });
      
      if (existing) {
        // Check if it has the empty fields problem
        if (!existing.storedFileName || existing.fileSize === 0) {
          console.log(`   ⚠️  Has empty fields, updating...`);
          
          // Try to find the actual stored file
          const uploadsDir = path.join(__dirname, 'uploads', 'course_materials_upload');
          let filePath = '';
          let fileSize = 0;
          let storedFileName = '';
          
          // Look for matching file in uploads directory
          if (fs.existsSync(uploadsDir)) {
            const files = fs.readdirSync(uploadsDir);
            const match = files.find(f => 
              f === raw.originalFileName || 
              f.includes(raw.originalFileName.replace(/\.[^.]+$/, ''))
            );
            if (match) {
              storedFileName = match;
              filePath = path.join(uploadsDir, match);
              const stats = fs.statSync(filePath);
              fileSize = stats.size;
              console.log(`      ✓ Found file: ${match} (${(fileSize/1024).toFixed(2)} KB)`);
            }
          }
          
          // Update coursematerials
          await db.collection('coursematerials').updateOne(
            { _id: raw._id },
            {
              $set: {
                storedFileName: storedFileName,
                filePath: filePath,
                fileSize: fileSize,
                fileUrl: `http://localhost:5000/api/courses/materials/${storedFileName}`,
                mimeType: raw.mimeType,
                processingStatus: raw.extractionStatus === 'completed' ? 'extracted' : 'uploaded'
              }
            }
          );
          
          fixedCount++;
          console.log(`   ✅ Updated coursematerials\n`);
        } else {
          console.log(`   ✓ Already has metadata, skipping\n`);
          skippedCount++;
        }
      } else {
        console.log(`   ⚠️  No coursematerials record found, creating...\n`);
        
        // Create new coursematerials from raw data
        await db.collection('coursematerials').insertOne({
          _id: raw._id,
          teacherId: raw.teacherId,
          courseId: raw.courseId,
          externalCourseId: '',
          courseCode: '',
          courseName: '',
          sourceType: raw.sourceType,
          originalFileName: raw.originalFileName,
          storedFileName: '',
          filePath: '',
          fileUrl: '',
          fileSize: 0,
          mimeType: raw.mimeType,
          processingStatus: raw.extractionStatus === 'completed' ? 'extracted' : 'uploaded',
          createdAt: raw.createdAt,
          updatedAt: new Date(),
        });
        
        fixedCount++;
        console.log(`   ✅ Created coursematerials\n`);
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   Fixed: ${fixedCount}`);
    console.log(`   Skipped: ${skippedCount}`);
    console.log(`\n⚠️  NOTE: Upload metadata fields are now fixed for tracking.`);
    console.log(`   courseCode, courseName still need to be populated manually or via API re-upload.\n`);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
