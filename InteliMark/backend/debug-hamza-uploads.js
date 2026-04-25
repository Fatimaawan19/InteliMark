/**
 * Debug script to find Hamza's submissions and uploads
 * Run this with: node debug-hamza-uploads.js
 */

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config();

// Import models
const Upload = require("./models/Upload");
const Submission = require("./models/Submission");
const { db } = require("./config/db");

async function debugHamzaUploads() {
  try {
    console.log("\n" + "=".repeat(80));
    console.log("🔍 DEBUGGING HAMZA'S SUBMISSION & UPLOADS");
    console.log("=".repeat(80));

    // 1. Find Hamza's submissions
    console.log("\n1️⃣  Looking for Hamza's submissions...");
    const hamzaSubmissions = await Submission.find({
      $or: [
        { studentName: { $regex: "Hamza", $options: "i" } },
        { studentEmail: { $regex: "hamza", $options: "i" } }
      ]
    })
      .populate("assessmentId", "title type")
      .populate("courseId", "courseCode courseName");

    console.log(`✅ Found ${hamzaSubmissions.length} submission(s) for Hamza`);

    if (hamzaSubmissions.length > 0) {
      hamzaSubmissions.forEach((sub, idx) => {
        console.log(`\n   Submission ${idx + 1}:`);
        console.log(`   - Student: ${sub.studentName} (${sub.studentEmail})`);
        console.log(`   - Student ID: ${sub.studentId}`);
        console.log(`   - Assessment: ${sub.assessmentTitle} (${sub.assessmentType})`);
        console.log(`   - Course: ${sub.courseCode}`);
        console.log(`   - Submitted: ${sub.submittedAt}`);
        console.log(`   - Files: ${sub.uploadedFilesCount}`);
        console.log(`   - Status: ${sub.status}`);
        console.log(`   - Submission ID: ${sub._id}`);
      });
    }

    // 2. Find Hamza's uploads (now stored in submission files)
    console.log("\n2️⃣  Looking for Hamza's files in submissions...");
    // Files are now embedded in submission records
    let hamzaFiles = [];
    hamzaSubmissions.forEach(sub => {
      if (sub.submissionFiles && sub.submissionFiles.length > 0) {
        sub.submissionFiles.forEach((file, idx) => {
          hamzaFiles.push({
            submissionId: sub._id,
            fileName: file.filename,
            originalFileName: file.originalName,
            fileUrl: file.fileUrl,
            fileSize: file.fileSize,
            uploadedAt: file.uploadedAt,
            assessmentTitle: sub.assessmentTitle,
            courseCode: sub.courseCode
          });
        });
      }
    });

    console.log(`✅ Found ${hamzaFiles.length} file(s) in Hamza's submissions`);

    if (hamzaFiles.length > 0) {
      hamzaFiles.forEach((file, idx) => {
        console.log(`\n   File ${idx + 1}:`);
        console.log(`   - File: ${file.originalFileName}`);
        console.log(`   - File Size: ${file.fileSize} bytes`);
        console.log(`   - Assessment: ${file.assessmentTitle}`);
        console.log(`   - Course: ${file.courseCode}`);
        console.log(`   - Uploaded: ${file.uploadedAt}`);
        console.log(`   - Submission ID: ${file.submissionId}`);
      });
    } else {
      console.log("\n❌ NO FILES FOUND IN HAMZA'S SUBMISSIONS!");
      console.log("\n   If submissions exist but no files, this indicates:");
      console.log("   - File upload may have failed");
      console.log("   - Check submission submission details");
    }

    // 3. Check total counts
    console.log("\n3️⃣  Collection Statistics...");
    const submissionCount = await Submission.countDocuments();

    console.log(`   - Total Submissions: ${submissionCount}`);

    // 4. Check if Hamza exists in Firebase users
    console.log("\n4️⃣  Looking for Hamza in Firebase...");
    const firestore = require("./config/firebase").firestore;
    const usersSnapshot = await firestore
      .collection("users")
      .where("name", ">=", "Hamza")
      .where("name", "<=", "Hamzz")
      .get();

    if (!usersSnapshot.empty) {
      usersSnapshot.forEach((doc) => {
        console.log(`   - Found: ${doc.data().name} (${doc.id})`);
        console.log(`     Email: ${doc.data().email}`);
      });
    } else {
      console.log("   ❌ Hamza not found in Firebase users");
    }

    // 5. Check MongoDB collections
    console.log("\n5️⃣  MongoDB Collections Info...");
    const collections = await mongoose.connection.db.listCollections().toArray();
    const relevantCollections = collections.filter(c =>
      c.name.includes("upload") ||
      c.name.includes("submission") ||
      c.name.includes("student")
    );

    console.log(`   Relevant collections found:`);
    relevantCollections.forEach(c => {
      console.log(`   - ${c.name}`);
    });

    console.log("\n" + "=".repeat(80));
    console.log("✅ DEBUG COMPLETE");
    console.log("=".repeat(80) + "\n");

  } catch (error) {
    console.error("❌ Error during debug:", error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

// Run the debug script
debugHamzaUploads();
