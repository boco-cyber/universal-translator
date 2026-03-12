/**
 * OpenAI provider — gpt-4o, gpt-4-turbo, gpt-3.5-turbo
 * Also supports any OpenAI-compatible API via baseUrl override
 */

const fetch = require('node-fetch');

const DEFAULT_MODEL = 'gpt-4o';

async function translate({ apiKey, model, systemPrompt, userMessage, baseUrl }) {
  if (!apiKey) throw new Error('OpenAI API key is required');

  const url = (baseUrl || 'https://api.openai.com').replace(/\/$/, '') + '/v1/chat/completions';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`OpenAI error ${response.status}: ${err?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

module.exports = { translate };
