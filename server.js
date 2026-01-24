require('dotenv').config();
const systemInstructions = require('./systeminstructions');
const port = require('./setup-log.json')['port'];

const express = require('express');
const cors = require('cors');
const {
  GoogleGenerativeAI,
} = require("@google/generative-ai");

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_DOMAINS ? process.env.FRONTEND_DOMAINS.split(',') : false,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  credentials: true
}));
app.use(express.json());

// Initialize Gemini AI
const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const systemInstruction = systemInstructions;


const spanishCoach = genAI.getGenerativeModel({ model: "gemini-flash-latest", systemInstruction: systemInstruction.spanishLearner });
const englishCoach = genAI.getGenerativeModel({ model: "gemini-flash-latest", systemInstruction: systemInstruction.englishLearner });

const generationConfig = { 
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
};

app.get('/', (req, res) => {
  res.send('Hello World');
});

// Remove the app.all middleware and modify the translate route
app.route('/spanishHelp')
  .get((req, res) => {
    console.log('GET request received when POST expected');
    res.status(405).json({ error: 'Method not allowed. Please use POST.' });
  })
  .post(async (req, res) => {
    console.log('Received POST request to /translate');
    console.log('Request body:', req.body);
    console.log('Request method:', req.method);
    console.log('Request headers:', req.headers);

    // Add OPTIONS handling for preflight requests
    if (req.method === 'OPTIONS') {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'POST');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      return res.status(200).json({});
    }

    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    try {
      // Set up SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const chat = spanishCoach.startChat({
        generationConfig,
        history: [
          {
            role: "user",
            parts: [{ text: systemInstruction.spanishLearner }]
          }
        ]
      });
      
      const result = await chat.sendMessageStream(`"${text}"`);
      
      // Stream each chunk as it arrives
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
        }
      }
      
      res.end();
    } catch (error) {
      console.error('Error:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  });

app.route('/englishHelp')
  .get((req, res) => {
    console.log('GET request received when POST expected');
    res.status(405).json({ error: 'Method not allowed. Please use POST.' });
  })
  .post(async (req, res) => {
    console.log('Received POST request to /englishHelp');
    console.log('Request body:', req.body);
    console.log('Request method:', req.method);
    console.log('Request headers:', req.headers);

    if (req.method === 'OPTIONS') {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'POST');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      return res.status(200).json({});
    }

    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    try {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const chat = englishCoach.startChat({
        generationConfig,
        history: [
          {
            role: "user",
            parts: [{ text: systemInstruction.englishLearner }]
          }
        ]
      });
      
      const result = await chat.sendMessageStream(`"${text}"`);
      
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
        }
      }
      
      res.end();
    } catch (error) {
      console.error('Error:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  });

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 