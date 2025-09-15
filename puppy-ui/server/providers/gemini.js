import fetch from 'node-fetch';

export async function chatGemini({ apiKey, model, messages, maxTokens }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
  // Gemini uses a different content schema. We'll convert.
  const system = messages.find(m => m.role === 'system')?.content;
  const userAssistantMsgs = messages.filter(m => m.role !== 'system');

  const parts = [];
  if (system) parts.push({ text: `System: ${system}` });
  for (const m of userAssistantMsgs) {
    const prefix = m.role === 'user' ? 'User' : 'Assistant';
    parts.push({ text: `${prefix}: ${m.content}` });
  }

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.2,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ?? '';
  return { text, raw: data };
}
