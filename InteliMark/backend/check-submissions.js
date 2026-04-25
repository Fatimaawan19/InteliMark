const mongoose = require('mongoose');
const Submission = require('./models/Submission');
require('dotenv').config();

async function checkSubmissions() {
  try {
    const mongoURI = process.env.MONGO_URI || "mongodb+srv://fypAdmin:123%21%40FH@cluster0.9qgq4lg.mongodb.net/fyp_db?retryWrites=true&w=majority&appName=Cluster0";
    await mongoose.connect(mongoURI);
    console.log('✅ MongoDB Connected');
    
    const count = await Submission.countDocuments();
    console.log(`\n📊 Total Submissions in Database: ${count}`);
    
    if (count > 0) {
      const recentSubmissions = await Submission.find()
        .select('studentId assessmentTitle submissionFiles')
        .limit(5)
        .sort({ submittedAt: -1 });
      
      console.log('\n📋 Recent Submissions:');
      recentSubmissions.forEach((sub, idx) => {
        console.log(`  ${idx + 1}. StudentID: ${sub.studentId} | Assessment: ${sub.assessmentTitle} | Files: ${sub.submissionFiles.length}`);
      });
    } else {
      console.log('❌ No submissions found in database');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkSubmissions();
