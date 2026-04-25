/**
 * Count slides in MongoDB
 */

const mongoose = require('mongoose');

(async () => {
  try {
    const mongoUri = 'mongodb+srv://fypAdmin:123%21%40FH@cluster0.9qgq4lg.mongodb.net/fyp_db?retryWrites=true&w=majority';
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    
    const db = mongoose.connection.db;
    const materials = await db.collection('coursematerialraws').find({}).toArray();
    
    console.log('📊 Slides/Materials in MongoDB:\n');
    
    let totalPages = 0;
    materials.forEach((m, idx) => {
      const pages = m.pageCount || 0;
      totalPages += pages;
      const status = m.extractionStatus === 'completed' ? '✅' : '❌';
      console.log(`[${idx+1}] ${m.originalFileName}`);
      console.log(`    Status: ${status} ${m.extractionStatus}`);
      console.log(`    Pages: ${pages}`);
      console.log(`    Chunks: ${m.numChunks || 0}`);
      console.log('');
    });
    
    console.log(`Total slides/pages: ${totalPages}`);
    console.log(`Total materials: ${materials.length}`);
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
