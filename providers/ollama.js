/**
 * Ollama provider — fully local, free, no API key needed
 * Default model: llama3 or mistral
 * Requires Ollama running at http://localhost:11434
 * Docs: https://ollama.ai/
 */

const fetch = require('node-fetch');

const DEFAULT_MODEL   = 'llama3';
const DEFAULT_BASE_URL = 'http://localhost:11434';

async function translate({ model, systemPrompt, userMessage, baseUrl }) {
  const url = (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '') + '/api/chat';

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Ollama error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data.message?.content || '';
}

module.exports = { translate };
