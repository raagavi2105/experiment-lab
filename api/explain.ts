// Vercel serverless function: turns computed statistics into a plain-English
// summary using Groq. The API key lives only in the GROQ_API_KEY env var.
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(500).json({ error: 'Server is missing GROQ_API_KEY' });
  const payload = JSON.stringify(req.body ?? {});
  if (payload.length > 8000) return res.status(413).json({ error: 'Payload too large' });

  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'qwen/qwen3.8-27b',
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        { role: 'system', content: 'You are a senior product analyst. Given computed experiment or metric-drop results, write a concise decision memo for a product manager: 1) the call, 2) the evidence with the key numbers, 3) risks and the next step. Use only the numbers provided. Never invent figures. Max 150 words.' },
        { role: 'user', content: payload },
      ],
    }),
  });
  if (!r.ok) return res.status(502).json({ error: 'Upstream model error' });
  const data = await r.json();
  return res.status(200).json({ text: data.choices?.[0]?.message?.content ?? '' });
}
