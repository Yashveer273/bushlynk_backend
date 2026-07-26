const admin = require("firebase-admin");

let db, messaging;

try {
  const serviceAccount = require("../serviceAccountKey.json");

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL:
      "https://easzauth-default-rtdb.firebaseio.com/",
  });

  db = admin.database();
  messaging = admin.messaging();

  console.log("🔥 Firebase Connected Successfully");
} catch (error) {
  console.log("❌ Firebase Connection Failed:", error.message);
}

module.exports = {
  db,
  messaging,
};