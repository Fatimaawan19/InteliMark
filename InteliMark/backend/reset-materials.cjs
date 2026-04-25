/**
 * Delete all incomplete materials and start fresh
 */

const mongoose = require('mongoose');

(async () => {
  try {
    const mongoUri = 'mongodb+srv://fypAdmin:123%21%40FH@cluster0.9qgq4lg.mongodb.net/fyp_db?retryWrites=true&w=majority';
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    
    const db = mongoose.connection.db;
    
    console.log('🗑️  Deleting all incomplete materials...\n');
    
    // Delete all from coursematerials
    const result1 = await db.collection('coursematerials').deleteMany({});
    
    // Delete all from coursematerialsraw
    const result2 = await db.collection('coursematerialsraw').deleteMany({});
    
    console.log('✅ Deleted:');
    console.log(`  coursematerials: ${result1.deletedCount} doc(s)`);
    console.log(`  coursematerialsraw: ${result2.deletedCount} doc(s)\n`);
    
    console.log('✅ Database is clean and ready for fresh uploads!');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
