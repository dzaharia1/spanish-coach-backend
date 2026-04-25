require('dotenv').config();
const { completeInstructions, conciseInstructions } = require('./systeminstructions');
const port = require('./setup-log.json')['port'];

const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require("@google/genai");
const { admin, db } = require('./firebase');
const { requireAuth, optionalAuth } = require('./authMiddleware');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_DOMAINS ? process.env.FRONTEND_DOMAINS.split(',') : false,
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());

// Initialize Gemini AI
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

const getModelConfig = (modelType) => {
  if (modelType === 'concise') {
    return {
      model: "gemini-flash-latest",
      systemInstruction: conciseInstructions,
      generationConfig: {
        temperature: 1,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
        responseMimeType: "text/plain",
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    };
  }
  // Default to complete
  return {
    model: "gemini-flash-latest",
    systemInstruction: completeInstructions,
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
      responseMimeType: "text/plain",
      responseModalities: ["TEXT"], // Ensure text output
      thinkingConfig: {
        thinkingBudget: 0
      }
    }
  };
};

async function saveTranslation({ uid, languageMode, model, inputText, outputText }) {
  if (!uid || !outputText) return;
  try {
    await db
      .collection('users')
      .doc(uid)
      .collection('translations')
      .add({
        languageMode,
        model,
        inputText,
        outputText,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.error('Failed to save translation:', err);
  }
}

async function streamCoaching(req, res, instructionsKey) {
  const { text, model = 'complete' } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const config = getModelConfig(model);
    const instructions = config.systemInstruction[instructionsKey];

    const chat = ai.chats.create({
      model: config.model,
      config: {
        systemInstruction: instructions,
        ...config.generationConfig,
      },
      history: []
    });

    const response = await chat.sendMessageStream({ message: `"${text}"` });

    let fullOutput = '';
    for await (const chunk of response) {
      const chunkText = chunk.text;
      if (chunkText) {
        fullOutput += chunkText;
        res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
      }
    }

    res.end();

    if (req.user && fullOutput) {
      await saveTranslation({
        uid: req.user.uid,
        languageMode: instructionsKey === 'spanishLearner' ? 'spanishHelp' : 'englishHelp',
        model,
        inputText: text,
        outputText: fullOutput,
      });
    }
  } catch (error) {
    console.error('Error:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
}

app.get('/', (req, res) => {
  res.send('Hello World');
});

app.route('/spanishHelp')
  .get((req, res) => {
    res.status(405).json({ error: 'Method not allowed. Please use POST.' });
  })
  .post(optionalAuth, (req, res) => streamCoaching(req, res, 'spanishLearner'));

app.route('/englishHelp')
  .get((req, res) => {
    res.status(405).json({ error: 'Method not allowed. Please use POST.' });
  })
  .post(optionalAuth, (req, res) => streamCoaching(req, res, 'englishLearner'));

// History endpoints — all require auth

app.get('/history', requireAuth, async (req, res) => {
  try {
    const search = (req.query.search || '').toString().trim().toLowerCase();
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);

    const snapshot = await db
      .collection('users')
      .doc(req.user.uid)
      .collection('translations')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    let items = snapshot.docs.map((doc) => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate?.() || null;
      return {
        id: doc.id,
        languageMode: data.languageMode,
        model: data.model,
        inputText: data.inputText,
        outputText: data.outputText,
        createdAt: createdAt ? createdAt.toISOString() : null,
      };
    });

    if (search) {
      items = items.filter((t) => {
        const haystack = `${t.inputText || ''}\n${t.outputText || ''}`.toLowerCase();
        return haystack.includes(search);
      });
    }

    res.json({ items });
  } catch (err) {
    console.error('Error listing history:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

app.get('/history/:id', requireAuth, async (req, res) => {
  try {
    const doc = await db
      .collection('users')
      .doc(req.user.uid)
      .collection('translations')
      .doc(req.params.id)
      .get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Translation not found' });
    }

    const data = doc.data();
    const createdAt = data.createdAt?.toDate?.() || null;
    res.json({
      id: doc.id,
      languageMode: data.languageMode,
      model: data.model,
      inputText: data.inputText,
      outputText: data.outputText,
      createdAt: createdAt ? createdAt.toISOString() : null,
    });
  } catch (err) {
    console.error('Error fetching translation:', err);
    res.status(500).json({ error: 'Failed to fetch translation' });
  }
});

app.delete('/history/:id', requireAuth, async (req, res) => {
  try {
    const ref = db
      .collection('users')
      .doc(req.user.uid)
      .collection('translations')
      .doc(req.params.id);

    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Translation not found' });
    }

    await ref.delete();
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting translation:', err);
    res.status(500).json({ error: 'Failed to delete translation' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
