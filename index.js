const { onRequest } = require('firebase-functions/v2/https');
const express = require('express');
const app = require('./server');

// The frontend reaches this function through a Firebase Hosting rewrite of
// `/api/**` → function `api`, so the function receives paths prefixed with
// `/api`. Mounting the existing Express app under `/api` lets Express strip
// that prefix, so the app's existing routes (`/spanishHelp`, `/history`, ...)
// resolve unchanged.
const root = express();
root.use('/api', app);

// invoker: 'public' keeps the underlying Cloud Run service callable by
// unauthenticated requests (Firebase Hosting forwards the /api/** rewrite
// anonymously), so redeploys don't drop the allUsers invoker binding.
exports.api = onRequest(
  { region: 'us-central1', timeoutSeconds: 120, invoker: 'public' },
  root
);
