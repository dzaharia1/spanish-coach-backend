const admin = require('firebase-admin');
const fs = require('fs');

let initialized = false;

function init() {
  if (initialized) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (serviceAccountPath) {
    let credentials;
    try {
      const raw = fs.readFileSync(serviceAccountPath, 'utf8');
      credentials = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `FIREBASE_SERVICE_ACCOUNT file could not be read or parsed as JSON: ${err.message}`
      );
    }
    admin.initializeApp({
      credential: admin.credential.cert(credentials),
      projectId: projectId || credentials.project_id,
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
  }

  initialized = true;
}

init();

const auth = admin.auth();
const db = admin.firestore();

module.exports = { admin, auth, db };
