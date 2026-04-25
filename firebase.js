const admin = require('firebase-admin');

let initialized = false;

function init() {
  if (initialized) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (serviceAccountJson) {
    let credentials;
    try {
      const raw = serviceAccountJson.trim().startsWith('{')
        ? serviceAccountJson
        : Buffer.from(serviceAccountJson, 'base64').toString('utf8');
      credentials = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `FIREBASE_SERVICE_ACCOUNT could not be parsed as JSON or base64-encoded JSON: ${err.message}`
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
