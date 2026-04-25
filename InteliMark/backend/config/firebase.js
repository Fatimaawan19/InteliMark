const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
    storageBucket: "intellimark-4ceed.firebasestorage.app",
  });

  console.log("✅ Firebase Admin initialized correctly");
}

const bucket = admin.storage().bucket();
const firestore = admin.firestore();

module.exports = { admin, bucket, firestore };