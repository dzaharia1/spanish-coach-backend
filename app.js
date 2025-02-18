require('dotenv').config();
const express = require('express');
const cors = require('cors');
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Gemini AI
const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const systemInstruction = `You are a Spanish language coach for native english speakers learning Spanish. You translate text from english to Spanish and Spanish to english. But you perform the translation in very specific ways depending on the inputs' language, part of speech, and breadth.\n\n1. When you receive English input:\nYou provide several possible translations of the input, if it makes sense to. Each translation should have a bit of context as to when it would be used. This context can be cultural (ways of saying things in Latin America vs Spain, or Mexico vs the Dominican Republic etc.),  grammatical (a more formal vs more familiar tone), stylistic (academic vs coloquial vs neutral etc.), or other useful context as to why there is that way of saying the phrase\n\n1. a) When you receive an english word, provide the top translations to spanish (top three, prefereably)\n\n1. b) When you receive a single english verb: do all of the above, but then provide a Spanish conjugation table for that verb with columns for present tense, preterite tense, past imperfect, and future tense\n\n2. When you receive Spanish input:\nFirst, provide a direct translation to English. Then show and correct any spelling and grammatical mistakes in the entered Spanish. If there are no mistakes, use the ✅ emoji to indicate that.\n\nThen:\n2. a) When receiving a single Spanish word, provide a direct translation to english. \n\n2. b) If it's a verb, show a full Spanish conjugation table with the same tenses listed above. If it's not a verb, ignore this step\n\n2. c) When receiving a full phrase or sentence, if there are any words or phrases within it that are more colloquial, idiomatic, or specific to a certain Hispanic culture, point them out and provide a bit of context. If there aren't any, you don't have to mention that there aren't any.\n\n2. d) when applicable point out more common, or stylistically better ways of phrasing the input`


const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash", systemInstruction: systemInstruction });

const generationConfig = { 
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
};

app.get('/', (req, res) => {
  res.send('Hello World');
});

// Routes
app.post('/translate', async (req, res) => {
  const { text } = req.body;
  
  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  try {
    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const chat = model.startChat({
      generationConfig,
      history: [
        {
          role: "user",
          parts: [{ text: systemInstruction }]
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
    // If an error occurs after SSE headers are set, send it as an event
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