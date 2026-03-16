import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import path from 'path';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize Gemini API
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // API routes FIRST
  app.post('/api/curriculum/generate', async (req, res) => {
    const { topic, level, audience, accreditation_context } = req.body;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const prompt = `You are an expert curriculum designer. Generate a curriculum for the following:
Topic: ${topic}
Level: ${level}
Audience: ${audience}
Accreditation Context: ${accreditation_context}

Provide the output in a structured JSON format with the following keys:
- modules: an array of objects, each with 'title', 'learning_objectives' (array of strings), and 'narrative_preview' (string).
- sources: an array of objects, each with 'url', 'domain', and 'retrieved_at' (string date).

Do NOT output markdown code blocks. Output ONLY valid JSON.`;

      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });

      for await (const chunk of responseStream) {
        if (chunk.text) {
          // Send the chunk text as an SSE event
          res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      console.error('Error generating curriculum:', error);
      res.write(`data: ${JSON.stringify({ error: 'Failed to generate curriculum' })}\n\n`);
      res.end();
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
