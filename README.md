# Spanish Coach Backend

This is the backend service for the Spanish Coach application, which uses Google's Gemini AI to provide Spanish language learning assistance.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file:
```bash
cp .env.example .env
```

3. Add your Gemini API key to the `.env` file:
```
GEMINI_API_KEY=your_api_key_here
PORT=3000
```

## Running the Server

Development mode with auto-reload:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Endpoints

### POST /spanishHelp
Translates text between English and Spanish with detailed context and explanations.

Request body:
```json
{
  "text": "Your English or Spanish text to translate"
}
```

### POST /englishHelp
Provides assistance for Spanish speakers learning English.

Request body:
```json
{
  "text": "Your Spanish or English text for assistance"
}
```

The response is streamed using Server-Sent Events (SSE).

### GET /health
Health check endpoint to verify the server is running.

## Frontend Integration

The backend uses CORS and supports streaming responses through SSE (Server-Sent Events). To connect from the frontend, use the EventSource API:

```javascript
const eventSource = new EventSource('http://localhost:3000/translate');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.text);
};

eventSource.onerror = (error) => {
  console.error('EventSource failed:', error);
  eventSource.close();
};
``` 