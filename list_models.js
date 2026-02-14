
require('dotenv').config();
const { GoogleGenAI } = require("@google/genai");

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

async function listModels() {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();
        console.log("Models:", data.models.map(m => m.name));
    } catch (error) {
        console.error("Error listing models:", error);
    }
}

listModels();
