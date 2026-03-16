/**
 * Ollama provider — fully local, free, no API key needed
 * Default model: llama3:8b
 * Requires Ollama running at http://localhost:11434
 * Docs: https://ollama.ai/
 */

const fetch = require('node-fetch');

const DEFAULT_MODEL    = 'llama3:8b';
const DEFAULT_BASE_URL = 'http://localhost:11434';
const TIMEOUT_MS       = 300000; // 5 minutes per chunk

async function translate({ model, systemPrompt, userMessage, baseUrl }) {
  const url = (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '') + '/api/chat';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
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
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Ollama error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data.message?.content || '';
}

module.exports = { translate };
