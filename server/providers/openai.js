import fetch from 'node-fetch';

export async function chatOpenAI({ apiKey, model, messages, maxTokens }) {
  // Some models (Responses API style) want max_completion_tokens instead of max_tokens.
  // We attempt with max_tokens first, and if it fails with unsupported_parameter, retry.

  const url = 'https://api.openai.com/v1/chat/completions';
  const baseBody = {
    model,
    messages,
  };
  const body = { ...baseBody, max_tokens: maxTokens, temperature: 0.2 };
  let res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    // Retry if the model wants max_completion_tokens instead
    if (errText.includes("Use 'max_completion_tokens' instead")) {
      const body2 = { ...baseBody, max_completion_tokens: maxTokens, temperature: 0.2 };
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body2),
      });
      if (!res.ok) {
        const errText2 = await res.text();
        // If temperature is unsupported, retry without it
        if (errText2.includes("'temperature' does not support")) {
          const body3 = { ...baseBody, max_completion_tokens: maxTokens };
          res = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body3),
          });
          if (!res.ok) {
            const errText3 = await res.text();
            throw new Error(`OpenAI error ${res.status}: ${errText3}`);
          }
        } else {
          throw new Error(`OpenAI error ${res.status}: ${errText2}`);
        }
      }
    } else if (errText.includes("'temperature' does not support")) {
      // Retry without temperature for models that enforce default only
      const body2 = { ...baseBody, max_tokens: maxTokens };
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body2),
      });
      if (!res.ok) {
        const errText2 = await res.text();
        throw new Error(`OpenAI error ${res.status}: ${errText2}`);
      }
    } else {
      throw new Error(`OpenAI error ${res.status}: ${errText}`);
    }
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  return { text, raw: data };
}
