// src/firebase.ts
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore, collection, addDoc, doc, setDoc, getDoc, serverTimestamp, deleteDoc } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// 🔹 Your Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyAvZ6RfqbNQ9c0tMQUhowz5R7MSlgQeKos",
  authDomain: "intellimark-4ceed.firebaseapp.com",
  projectId: "intellimark-4ceed",
  storageBucket: "intellimark-4ceed.firebasestorage.app",
  messagingSenderId: "69851076764",
  appId: "1:69851076764:web:f61ce9f9294be7771df559",
  measurementId: "G-D2LD0HG8YV"
};

// 🔹 Initialize Firebase
const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// 🔹 Initialize Collections
export async function initializeCollections() {
  try {
    console.log("✅ Collections will be auto-created when you first add documents to them.");
    console.log("   - course-materials collection will be created when you upload a document");
    
    // Initialize assignment_help collection
    await initializeAssignmentHelpCollection();
    
    return true;
  } catch (error) {
    console.error("Error during initialization:", error);
    return false;
  }
}

// 🔹 Initialize Assignment Help Collection
export async function initializeAssignmentHelpCollection() {
  try {
    console.log("🔄 Initializing Assignment Help Collection...");

    // Create a sample document structure (will be deleted immediately)
    const sampleHelpRequest = {
      assignmentId: "sample_assignment_1",
      assignmentTitle: "Sample Assignment",
      courseId: "course_sample",
      courseName: "SAMPLE-001",
      studentId: "student_sample_uid",
      studentName: "Sample Student",
      studentEmail: "student@example.com",
      teacherId: "teacher_sample_uid",
      teacherName: "Sample Teacher", 
      teacherEmail: "teacher@example.com",
      type: "assignment", // "assignment" | "quiz"
      subject: "Sample Help Request",
      initialMessage: "This is a sample help request to initialize the collection.",
      status: "open", // "open" | "responded" | "resolved"
      priority: "medium", // "low" | "medium" | "high"
      messages: [
        {
          id: "msg_sample_001",
          senderId: "student_sample_uid",
          senderName: "Sample Student",
          senderRole: "student",
          text: "This is a sample help request to initialize the collection.",
          timestamp: new Date(), // Use regular Date instead of serverTimestamp for arrays
          attachments: []
        }
      ],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      resolvedAt: null,
      isDeletedByStudent: false
    };

    // Add sample document to create collection
    const docRef = await addDoc(collection(db, "assignment_help"), sampleHelpRequest);
    console.log("✅ Assignment Help Collection created with sample doc:", docRef.id);
    
    // Delete the sample document (we only needed it to create the collection)
    await deleteDoc(docRef);
    console.log("✅ Sample document removed - collection is ready for use");

    console.log("\n📋 Collection: assignment_help");
    console.log("📝 Schema: Student-Teacher communication for assignments/quizzes");
    console.log("🔐 Security rules need to be set manually in Firebase Console\n");

    return true;
  } catch (error) {
    console.error("❌ Error initializing Assignment Help Collection:", error);
    return false;
  }
}

// 🔹 Test connection (optional)
export async function testFirebaseConnection() {
  try {
    await addDoc(collection(db, "testConnection"), {
      message: "Connected Successfully!",
      time: new Date(),
    });
    console.log("🔥 Firebase Connected Successfully!");
  } catch (error) {
    console.error("❌ Firebase Connection Error:", error);
  }
}
