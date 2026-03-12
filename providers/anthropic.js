/**
 * Anthropic provider — uses claude-sonnet-4-5 / claude-opus-4-5 / claude-haiku-4-5
 * Docs: https://docs.anthropic.com/en/api/messages
 */

const fetch = require('node-fetch');

const DEFAULT_MODEL = 'claude-sonnet-4-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

async function translate({ apiKey, model, systemPrompt, userMessage }) {
  if (!apiKey) throw new Error('Anthropic API key is required');

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Anthropic error ${response.status}: ${err?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

module.exports = { translate };
