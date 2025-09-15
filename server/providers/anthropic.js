import fetch from 'node-fetch';

export async function chatAnthropic({ apiKey, model, messages, maxTokens }) {
  const url = 'https://api.anthropic.com/v1/messages';
  const sys = messages.find(m => m.role === 'system')?.content;
  const userAssistantMsgs = messages.filter(m => m.role !== 'system');
  const body = {
    model,
    max_tokens: maxTokens,
    system: sys,
    messages: userAssistantMsgs,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const text = data.content?.[0]?.text ?? '';
  return { text, raw: data };
}
