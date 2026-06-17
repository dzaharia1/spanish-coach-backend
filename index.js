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

exports.api = onRequest({ region: 'us-central1', timeoutSeconds: 120 }, root);
