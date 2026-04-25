# CLAUDE.md — Spanish Coach Backend

This file provides guidance for AI assistants working in this codebase.

## Project Overview

A lightweight Node.js API server that provides bilingual language coaching using the Google Gemini AI API, with optional Firebase Authentication. It serves as a backend for a Spanish/English language learning app, offering streaming AI responses via Server-Sent Events (SSE). Authenticated users have their translations persisted to Firestore so they can be retrieved as a searchable history.

- **Production domain:** `https://spanish-coach-backend.danzaharia.com`
- **Runtime port:** `3101` (read from `setup-log.json`)
- **Node.js requirement:** >= 20.0.0

## Repository Structure

```
spanish-coach-backend/
├── server.js              # Entry point — all routes, middleware, and AI logic
├── systeminstructions.js  # AI system prompt definitions (complete vs. concise modes)
├── firebase.js            # Firebase Admin SDK initialization (auth + Firestore)
├── authMiddleware.js      # Express middleware: requireAuth, optionalAuth
├── list_models.js         # Utility script to list available Gemini models
├── setup-log.json         # Deployment metadata; port is read from here at startup
├── .env.example           # Environment variable template
├── .env                   # Local secrets (gitignored — do not commit)
├── package.json           # NPM config; scripts: start, dev
└── package-lock.json      # Locked dependency tree
```

There are no subdirectories for routes, controllers, models, or tests. The entire application lives in `server.js`, `systeminstructions.js`, `firebase.js`, and `authMiddleware.js`.

## Running the Server

```bash
# Install dependencies
npm install

# Development (auto-restarts on file changes via nodemon)
npm run dev

# Production
npm start
```

## Environment Variables

Copy `.env.example` to `.env` and fill in values before running.

| Variable                   | Required        | Description                                                                                  |
|----------------------------|-----------------|----------------------------------------------------------------------------------------------|
| `GEMINI_API_KEY`           | Yes             | Google Gemini API key                                                                        |
| `FRONTEND_DOMAINS`         | No              | Comma-separated allowed CORS origins (CORS disabled if unset)                                |
| `PORT`                     | No              | Ignored at runtime — port comes from `setup-log.json`                                        |
| `FIREBASE_PROJECT_ID`      | Yes (for auth)  | Firebase project ID                                                                          |
| `FIREBASE_SERVICE_ACCOUNT` | Yes (for auth)  | Service account key as raw JSON or base64-encoded JSON. Falls back to ADC when unset.        |

**Important:** The server reads its port from `setup-log.json`, not from `process.env.PORT`. The `.env.example` `PORT` variable is vestigial.

The Firebase Admin SDK is initialized at startup in `firebase.js`. If `FIREBASE_SERVICE_ACCOUNT` is missing the SDK will fall back to `applicationDefault()` credentials (works on GCP, fails locally without `GOOGLE_APPLICATION_CREDENTIALS`).

## API Endpoints

All coaching endpoints accept `POST` with a JSON body and respond with an SSE stream. GET requests to POST-only routes return `405`.

**Authentication:** The translation endpoints (`/spanishHelp`, `/englishHelp`) accept an optional `Authorization: Bearer <Firebase ID token>` header. When a valid token is presented, the resulting translation is persisted to Firestore under the user. Anonymous requests still work — they just don't get saved. The `/history*` endpoints **require** a valid token.

### `POST /spanishHelp`
For **English speakers learning Spanish**.

**Request body:**
```json
{
  "text": "to run",
  "model": "complete"
}
```

**`model` values:**
- `"complete"` (default) — detailed response with multiple translations, cultural context, conjugation tables for irregular verbs
- `"concise"` — single best translation, minimal explanation

**Response:** SSE stream. Each event is a JSON chunk:
```
data: {"text": "...chunk of AI response..."}\n\n
```
The stream ends when the connection closes. Errors are sent as:
```
data: {"error": "...message..."}\n\n
```

### `POST /englishHelp`
For **Spanish speakers learning English**. Identical request/response shape as `/spanishHelp`, but uses the `englishLearner` system instruction. The AI responds in Spanish.

### `GET /history`
Lists the authenticated user's saved translations, newest first.

**Headers:** `Authorization: Bearer <Firebase ID token>` (required)

**Query params:**
- `search` — optional substring filter applied to `inputText` + `outputText` (case-insensitive)
- `limit` — optional, defaults to 200, max 500

**Response:**
```json
{
  "items": [
    {
      "id": "abc123",
      "languageMode": "spanishHelp",
      "model": "complete",
      "inputText": "to run",
      "outputText": "...",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### `GET /history/:id`
Returns a single translation. 404 if it doesn't belong to the user or doesn't exist.

### `DELETE /history/:id`
Deletes a single translation. 404 if it doesn't belong to the user or doesn't exist. Returns `{ "ok": true }` on success.

### `GET /health`
Returns `{ "status": "ok" }`. Used for liveness checks.

### `GET /`
Returns `"Hello World"`. Basic connectivity test.

## AI Integration (`server.js`)

The app uses `@google/genai` (not the older `@google/generative-ai`). The client is initialized once at startup:

```js
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
```

Each request creates a fresh chat session with no history (stateless per-request):

```js
const chat = ai.chats.create({ model, config: { systemInstruction, ...generationConfig }, history: [] });
const response = await chat.sendMessageStream({ message: `"${text}"` });
```

User text is always wrapped in quotes when sent to the model: `` `"${text}"` ``

### Model Configuration (`getModelConfig` in `server.js:24`)

Both modes use `gemini-flash-latest` with `thinkingBudget: 0` (thinking disabled for speed).

| Setting             | `complete` mode | `concise` mode |
|---------------------|-----------------|----------------|
| `temperature`       | 0.7             | 1.0            |
| `topP`              | 0.95            | 0.95           |
| `topK`              | 40              | 40             |
| `maxOutputTokens`   | 8192            | 8192           |
| `thinkingBudget`    | 0               | 0              |

## System Instructions (`systeminstructions.js`)

Exports two objects, each with `spanishLearner` and `englishLearner` string properties:

- **`completeInstructions`** — Detailed coaching: top 3 translations, cultural/grammatical context, full irregular verb conjugation tables (present, preterite, imperfect, future for Spanish; present/past/past-participle for English), spelling correction with ✅ emoji when input is error-free.
- **`conciseInstructions`** — Brief: single best translation, minimal correction, no tables or cultural context.

When modifying AI behavior, edit the relevant string in `systeminstructions.js`. The `spanishLearner` instruction is in English; the `englishLearner` instruction is written in Spanish (the target audience's native language).

## CORS

Configured via the `FRONTEND_DOMAINS` environment variable:
```js
origin: process.env.FRONTEND_DOMAINS ? process.env.FRONTEND_DOMAINS.split(',') : false
```
If the variable is not set, CORS is fully disabled (requests from browsers will be blocked). For local frontend development, set `FRONTEND_DOMAINS=http://localhost:3000` (or the appropriate port).

## Persistence (Firestore)

When a request to `/spanishHelp` or `/englishHelp` comes in with a valid Firebase ID token, after the SSE stream completes the full output is saved to Firestore at:

```
users/{uid}/translations/{autoId}
```

Each document has:
```js
{
  languageMode: 'spanishHelp' | 'englishHelp',
  model: 'complete' | 'concise',
  inputText: string,
  outputText: string,
  createdAt: Timestamp,
}
```

Search is implemented server-side as a simple in-memory case-insensitive substring filter over the most recent `limit` documents (Firestore has no native full-text search). If the dataset grows beyond a few hundred translations per user, swap in a dedicated search index (Algolia, Typesense, or a tokenized prefix field).

## Key Conventions

- **Database is Firestore.** Used only for translation history, gated behind Firebase Auth. Translation generation itself remains stateless per-request.
- **No test framework.** There are currently no tests. If adding tests, use Jest + supertest and mock the Gemini API client.
- **Flat file structure.** New routes go in `server.js`. If the file grows significantly, consider splitting into a `routes/` directory, but do not add abstraction layers prematurely.
- **SSE streaming.** All AI responses must be streamed. Do not buffer and return a single JSON response — the frontend relies on the SSE event format.
- **System instructions are plain strings.** They are not templated or parameterized. If logic requires dynamic instructions, construct the string before passing it to `getModelConfig`.
- **Port source of truth is `setup-log.json`.** Do not change the port by editing `.env` — update `setup-log.json`.
- **Node.js >= 20 required.** The `@google/genai` library requires it. Do not lower the engine requirement.

## Dependencies

| Package          | Version   | Purpose                              |
|------------------|-----------|--------------------------------------|
| `@google/genai`  | ^1.41.0   | Google Gemini AI client (streaming)  |
| `firebase-admin` | ^13.x     | Auth token verification + Firestore  |
| `express`        | ^4.18.3   | HTTP server and routing              |
| `cors`           | ^2.8.5    | CORS middleware                      |
| `dotenv`         | ^16.4.5   | `.env` file loader                   |
| `nodemon` (dev)  | ^3.1.0    | Auto-restart in development          |

## Frontend Integration Pattern

The frontend should consume SSE using the `EventSource` API or `fetch` with a streaming reader. Example:

```js
const response = await fetch('https://spanish-coach-backend.danzaharia.com/spanishHelp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: 'to run', model: 'complete' }),
  credentials: 'include',
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  // Parse SSE lines: "data: {...}\n\n"
  for (const line of chunk.split('\n')) {
    if (line.startsWith('data: ')) {
      const { text, error } = JSON.parse(line.slice(6));
      if (error) { /* handle error */ }
      if (text) { /* append text to UI */ }
    }
  }
}
```
