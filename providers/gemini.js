/**
 * Google Gemini provider — gemini-1.5-pro, gemini-1.5-flash
 * Docs: https://ai.google.dev/api/generate-content
 */

const fetch = require('node-fetch');

const DEFAULT_MODEL = 'gemini-1.5-pro';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function translate({ apiKey, model, systemPrompt, userMessage }) {
  if (!apiKey) throw new Error('Google Gemini API key is required');

  const m   = model || DEFAULT_MODEL;
  const url = `${API_BASE}/${m}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userMessage }] }],
      generationConfig: { maxOutputTokens: 4096 },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Gemini error ${response.status}: ${err?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

module.exports = { translate };
