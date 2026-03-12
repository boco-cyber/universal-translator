const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const PORT = 3333;

// ── Providers ──────────────────────────────────────────────────────────────
const anthropicProvider = require('./providers/anthropic');
const openaiProvider    = require('./providers/openai');
const geminiProvider    = require('./providers/gemini');
const ollamaProvider    = require('./providers/ollama');

// ── Extractors ─────────────────────────────────────────────────────────────
const pdfExtractor  = require('./extractors/pdf');
const docxExtractor = require('./extractors/docx');
const txtExtractor  = require('./extractors/txt');

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// ── File upload ────────────────────────────────────────────────────────────
const upload = multer({
  dest: path.join(__dirname, 'data', 'uploads'),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

// ── Translations DB ────────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'data', 'translations.json');

function loadDB() {
  if (!fs.existsSync(DB_PATH)) return { jobs: {} };
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return { jobs: {} }; }
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ── Provider router ────────────────────────────────────────────────────────
const PROVIDERS = {
  anthropic: anthropicProvider,
  openai:    openaiProvider,
  gemini:    geminiProvider,
  ollama:    ollamaProvider,
};

// ── Cost estimator ─────────────────────────────────────────────────────────
function estimateCost(text, provider, model) {
  const charCount = text.length;
  const approxTokens = Math.ceil(charCount / 4);
  // Output roughly same size as input for translation
  const totalTokens = approxTokens * 2;

  const pricing = {
    anthropic: {
      'claude-sonnet-4-5': { input: 3.00, output: 15.00 },
      'claude-opus-4-5':   { input: 15.00, output: 75.00 },
      'claude-haiku-4-5':  { input: 0.80, output: 4.00 },
    },
    openai: {
      'gpt-4o':       { input: 5.00, output: 15.00 },
      'gpt-4-turbo':  { input: 10.00, output: 30.00 },
      'gpt-3.5-turbo':{ input: 0.50, output: 1.50 },
    },
    gemini: {
      'gemini-1.5-pro':   { input: 3.50, output: 10.50 },
      'gemini-1.5-flash': { input: 0.075, output: 0.30 },
    },
    ollama: { default: { input: 0, output: 0 } },
  };

  const providerPricing = pricing[provider] || {};
  const modelPricing = providerPricing[model] || providerPricing['default'] || { input: 5.00, output: 15.00 };
  const inputCost  = (approxTokens / 1_000_000) * modelPricing.input;
  const outputCost = (approxTokens / 1_000_000) * modelPricing.output;
  return {
    inputTokens: approxTokens,
    outputTokens: approxTokens,
    totalTokens,
    estimatedCost: (inputCost + outputCost).toFixed(4),
    currency: 'USD',
  };
}

// ── Text chunker ───────────────────────────────────────────────────────────
function chunkText(text, maxChunkChars = 3000) {
  const paragraphs = text.split(/\n{2,}/);
  const chunks = [];
  let current = '';

  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > maxChunkChars && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// ── RTL languages ──────────────────────────────────────────────────────────
const RTL_LANGS = ['ar', 'he', 'fa', 'ur', 'yi', 'dv', 'ps'];
function isRTL(langCode) {
  return RTL_LANGS.includes(langCode.toLowerCase().split('-')[0]);
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// ── POST /api/upload ───────────────────────────────────────────────────────
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const ext = path.extname(req.file.originalname).toLowerCase();
  let sections = [];

  try {
    if (ext === '.pdf')  sections = await pdfExtractor.extract(req.file.path);
    else if (ext === '.docx') sections = await docxExtractor.extract(req.file.path);
    else if (['.txt', '.srt', '.html', '.htm', '.epub'].includes(ext))
      sections = await txtExtractor.extract(req.file.path, ext);
    else return res.status(400).json({ error: `Unsupported file type: ${ext}` });

    const jobId = uuidv4();
    const db = loadDB();
    db.jobs[jobId] = {
      id: jobId,
      originalName: req.file.originalname,
      uploadedAt: new Date().toISOString(),
      sections,
      status: 'uploaded',
      chunks: [],
      translatedChunks: [],
      config: null,
    };
    saveDB(db);

    res.json({
      jobId,
      filename: req.file.originalname,
      sectionCount: sections.length,
      charCount: sections.reduce((n, s) => n + s.text.length, 0),
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/estimate ─────────────────────────────────────────────────────
app.post('/api/estimate', (req, res) => {
  const { jobId, provider, model } = req.body;
  const db = loadDB();
  const job = db.jobs[jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const fullText = job.sections.map(s => s.text).join('\n\n');
  const estimate = estimateCost(fullText, provider, model);
  res.json(estimate);
});

// ── POST /api/translate ────────────────────────────────────────────────────
app.post('/api/translate', async (req, res) => {
  const {
    jobId, provider, model, apiKey,
    sourceLang, targetLang, domain,
    glossary, customPrompt, chunkSize,
    baseUrl,
  } = req.body;

  const db = loadDB();
  const job = db.jobs[jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const providerModule = PROVIDERS[provider];
  if (!providerModule) return res.status(400).json({ error: `Unknown provider: ${provider}` });

  // Build full text from sections
  const fullText = job.sections.map(s => s.text).join('\n\n');
  const chunks   = chunkText(fullText, chunkSize || 3000);

  job.config = { provider, model, sourceLang, targetLang, domain, glossary, customPrompt };
  job.chunks  = chunks.map((text, i) => ({ index: i, text, status: 'pending' }));
  job.translatedChunks = new Array(chunks.length).fill(null);
  job.status  = 'translating';
  job.startedAt = new Date().toISOString();
  job.rtl = isRTL(targetLang);
  saveDB(db);

  // Respond immediately — client polls /api/status/:jobId
  res.json({ jobId, chunkCount: chunks.length, rtl: isRTL(targetLang) });

  // Run translation async
  (async () => {
    const glossaryText = glossary
      ? Object.entries(glossary).map(([k, v]) => `"${k}" → "${v}"`).join(', ')
      : '';

    const domainInstructions = {
      literary:    'Maintain literary style, metaphor, and emotional tone.',
      legal:       'Use precise legal terminology. Do not paraphrase legal constructs.',
      medical:     'Use accurate medical/clinical terminology.',
      theological: 'Preserve theological terms and reverent register. Note: treat sacred names with care.',
      technical:   'Use domain-specific technical vocabulary. Preserve code snippets and technical identifiers.',
      casual:      'Use natural, conversational language appropriate for everyday communication.',
    };

    const domainNote = domainInstructions[domain] || '';

    for (let i = 0; i < chunks.length; i++) {
      const dbNow = loadDB();
      const jobNow = dbNow.jobs[jobId];
      if (jobNow.status === 'cancelled') break;

      const prevChunk = i > 0 ? chunks[i - 1].slice(-500) : '';
      const systemPrompt = customPrompt || [
        `You are a professional translator. Translate from ${sourceLang} to ${targetLang}.`,
        domainNote,
        glossaryText ? `Locked glossary (never deviate): ${glossaryText}.` : '',
        'Translate ONLY the user text. Output the translation only, no commentary.',
        'Preserve paragraph structure, line breaks, and formatting.',
      ].filter(Boolean).join(' ');

      const userMessage = prevChunk
        ? `[Previous context for coherence — do not retranslate]:\n${prevChunk}\n\n[Translate this]:\n${chunks[i]}`
        : chunks[i];

      try {
        jobNow.chunks[i].status = 'translating';
        saveDB(dbNow);

        const translated = await providerModule.translate({
          apiKey, model, baseUrl,
          systemPrompt, userMessage,
        });

        const db2 = loadDB();
        db2.jobs[jobId].chunks[i].status = 'done';
        db2.jobs[jobId].translatedChunks[i] = translated;

        const done    = db2.jobs[jobId].chunks.filter(c => c.status === 'done').length;
        const total   = db2.jobs[jobId].chunks.length;
        if (done === total) db2.jobs[jobId].status = 'done';
        saveDB(db2);
      } catch (err) {
        console.error(`Chunk ${i} failed:`, err.message);
        const db2 = loadDB();
        db2.jobs[jobId].chunks[i].status = 'failed';
        db2.jobs[jobId].chunks[i].error  = err.message;

        // ── Fatal error detection: stop the whole job immediately ──────────
        // These errors will never resolve by retrying the next chunk.
        const msg = err.message.toLowerCase();
        const isFatal = (
          msg.includes('credit balance') ||
          msg.includes('insufficient_quota') ||
          msg.includes('billing') ||
          msg.includes('invalid api key') ||
          msg.includes('invalid_api_key') ||
          msg.includes('authentication') ||
          msg.includes('unauthorized') ||
          (msg.includes('403')) ||
          msg.includes('permission denied') ||
          msg.includes('account has been disabled')
        );
        if (isFatal) {
          db2.jobs[jobId].status = 'failed';
          db2.jobs[jobId].fatalError = err.message;
          saveDB(db2);
          console.error('Fatal error — stopping job:', err.message);
          break;
        }

        saveDB(db2);
      }
    }
  })();
});

// ── GET /api/status/:jobId ─────────────────────────────────────────────────
app.get('/api/status/:jobId', (req, res) => {
  const db  = loadDB();
  const job = db.jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const done    = job.chunks.filter(c => c.status === 'done').length;
  const failed  = job.chunks.filter(c => c.status === 'failed').length;
  const total   = job.chunks.length;

  res.json({
    jobId: job.id,
    status: job.status,
    progress: total ? Math.round((done / total) * 100) : 0,
    done, failed, total,
    rtl: job.rtl,
    config: job.config,
    fatalError: job.fatalError || null,
  });
});

// ── POST /api/cancel/:jobId ────────────────────────────────────────────────
app.post('/api/cancel/:jobId', (req, res) => {
  const db = loadDB();
  if (!db.jobs[req.params.jobId]) return res.status(404).json({ error: 'Job not found' });
  db.jobs[req.params.jobId].status = 'cancelled';
  saveDB(db);
  res.json({ ok: true });
});

// ── GET /api/result/:jobId ─────────────────────────────────────────────────
app.get('/api/result/:jobId', (req, res) => {
  const db  = loadDB();
  const job = db.jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const translated = job.translatedChunks.filter(Boolean).join('\n\n');
  const original   = job.chunks.map(c => c.text).join('\n\n');

  res.json({
    jobId: job.id,
    original,
    translated,
    bilingual: job.chunks.map((c, i) => ({
      original:   c.text,
      translated: job.translatedChunks[i] || '[not translated]',
      status:     c.status,
    })),
    rtl:       job.rtl,
    config:    job.config,
    filename:  job.originalName,
  });
});

// ── GET /api/jobs ──────────────────────────────────────────────────────────
app.get('/api/jobs', (req, res) => {
  const db = loadDB();
  const jobs = Object.values(db.jobs).map(j => ({
    id:           j.id,
    originalName: j.originalName,
    uploadedAt:   j.uploadedAt,
    status:       j.status,
    config:       j.config,
  }));
  res.json(jobs.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)));
});

// ── DELETE /api/jobs/:jobId ────────────────────────────────────────────────
app.delete('/api/jobs/:jobId', (req, res) => {
  const db = loadDB();
  if (!db.jobs[req.params.jobId]) return res.status(404).json({ error: 'Not found' });
  delete db.jobs[req.params.jobId];
  saveDB(db);
  res.json({ ok: true });
});

// ── POST /api/retry-failed/:jobId ─────────────────────────────────────────
app.post('/api/retry-failed/:jobId', async (req, res) => {
  const { apiKey, baseUrl } = req.body;
  const db  = loadDB();
  const job = db.jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const failedIndices = job.chunks
    .filter(c => c.status === 'failed')
    .map(c => c.index);

  if (failedIndices.length === 0)
    return res.json({ message: 'No failed chunks to retry' });

  // Reset failed chunks
  failedIndices.forEach(i => {
    job.chunks[i].status = 'pending';
    delete job.chunks[i].error;
  });
  job.status = 'translating';
  saveDB(db);

  res.json({ retrying: failedIndices.length });

  const providerModule = PROVIDERS[job.config.provider];
  const { model, sourceLang, targetLang, domain, glossary, customPrompt } = job.config;

  (async () => {
    for (const i of failedIndices) {
      const db2    = loadDB();
      const jobNow = db2.jobs[job.id];

      const glossaryText = glossary
        ? Object.entries(glossary).map(([k, v]) => `"${k}" → "${v}"`).join(', ')
        : '';

      const systemPrompt = customPrompt || [
        `You are a professional translator. Translate from ${sourceLang} to ${targetLang}.`,
        glossaryText ? `Locked glossary: ${glossaryText}.` : '',
        'Output the translation only.',
      ].filter(Boolean).join(' ');

      const prevChunk = i > 0 ? jobNow.chunks[i - 1].text.slice(-500) : '';
      const userMessage = prevChunk
        ? `[Context]:\n${prevChunk}\n\n[Translate]:\n${jobNow.chunks[i].text}`
        : jobNow.chunks[i].text;

      try {
        jobNow.chunks[i].status = 'translating';
        saveDB(db2);

        const translated = await providerModule.translate({
          apiKey, model, baseUrl, systemPrompt, userMessage,
        });

        const db3 = loadDB();
        db3.jobs[job.id].chunks[i].status = 'done';
        db3.jobs[job.id].translatedChunks[i] = translated;
        const done = db3.jobs[job.id].chunks.filter(c => c.status === 'done').length;
        if (done === db3.jobs[job.id].chunks.length) db3.jobs[job.id].status = 'done';
        saveDB(db3);
      } catch (err) {
        const db3 = loadDB();
        db3.jobs[job.id].chunks[i].status = 'failed';
        db3.jobs[job.id].chunks[i].error  = err.message;
        saveDB(db3);
      }
    }
  })();
});

// ── Download result as TXT ─────────────────────────────────────────────────
app.get('/api/download/:jobId/:format', (req, res) => {
  const db  = loadDB();
  const job = db.jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const { format } = req.params;
  const translated = job.translatedChunks.filter(Boolean).join('\n\n');
  const original   = job.chunks.map(c => c.text).join('\n\n');
  const base       = path.basename(job.originalName, path.extname(job.originalName));

  if (format === 'txt') {
    res.setHeader('Content-Disposition', `attachment; filename="${base}_translated.txt"`);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(translated);
  }

  if (format === 'bilingual-txt') {
    const lines = job.chunks.map((c, i) =>
      `--- [${i + 1}] ORIGINAL ---\n${c.text}\n\n--- [${i + 1}] TRANSLATED ---\n${job.translatedChunks[i] || '[pending]'}`
    ).join('\n\n' + '='.repeat(60) + '\n\n');
    res.setHeader('Content-Disposition', `attachment; filename="${base}_bilingual.txt"`);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(lines);
  }

  res.status(400).json({ error: 'Unsupported format. Use txt or bilingual-txt.' });
});

// ── Serve index.html for all other routes ─────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── POST /api/detect ──────────────────────────────────────────────────────
// Detects source language from the first ~1500 chars of extracted text.
// Uses the configured provider (API key required); falls back to heuristic.
app.post('/api/detect', async (req, res) => {
  const { jobId, provider, model, apiKey, baseUrl } = req.body;
  const db  = loadDB();
  const job = db.jobs[jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const sample = job.sections
    .slice(0, 3)
    .map(s => s.text)
    .join('\n')
    .slice(0, 1500);

  // Heuristic: look for high-frequency characters of known scripts
  const heuristic = detectByScript(sample);

  if (!apiKey && provider !== 'ollama') {
    // No API key — return heuristic only
    return res.json({ detected: heuristic, method: 'heuristic' });
  }

  const providerModule = PROVIDERS[provider === 'openai-custom' ? 'openai' : provider];
  if (!providerModule) return res.json({ detected: heuristic, method: 'heuristic' });

  try {
    const result = await providerModule.translate({
      apiKey, model, baseUrl,
      systemPrompt: 'You are a language detection expert. Reply with ONLY the BCP-47 language code (e.g. "en", "ar", "fr", "he"). No explanation.',
      userMessage: `What language is this text written in?\n\n${sample}`,
    });
    const code = result.trim().split(/[\s,\n]/)[0].toLowerCase().replace(/[^a-z-]/g, '');
    res.json({ detected: code || heuristic, method: 'ai' });
  } catch {
    res.json({ detected: heuristic, method: 'heuristic' });
  }
});

// ── Script-based heuristic language detector ──────────────────────────────
function detectByScript(text) {
  const counts = {
    ar: (text.match(/[\u0600-\u06FF]/g) || []).length,
    he: (text.match(/[\u0590-\u05FF]/g) || []).length,
    zh: (text.match(/[\u4E00-\u9FFF]/g) || []).length,
    ja: (text.match(/[\u3040-\u30FF]/g) || []).length,
    ko: (text.match(/[\uAC00-\uD7AF]/g) || []).length,
    ru: (text.match(/[\u0400-\u04FF]/g) || []).length,
    th: (text.match(/[\u0E00-\u0E7F]/g) || []).length,
    hi: (text.match(/[\u0900-\u097F]/g) || []).length,
  };

  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (best[1] > 20) return best[0];

  // Latin script — try common patterns
  const lower = text.toLowerCase();
  if (/\b(the|and|is|of|in|to|that)\b/.test(lower)) return 'en';
  if (/\b(und|der|die|das|ist|nicht)\b/.test(lower)) return 'de';
  if (/\b(le|la|les|est|et|de|du)\b/.test(lower)) return 'fr';
  if (/\b(el|la|los|las|es|en|que)\b/.test(lower)) return 'es';
  if (/\b(il|la|le|che|di|un|una)\b/.test(lower)) return 'it';
  if (/\b(o|a|os|as|de|que|em|para)\b/.test(lower)) return 'pt';

  return 'en'; // default
}

// ── Start server ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  Universal Translator running at http://localhost:${PORT}\n`);
});
