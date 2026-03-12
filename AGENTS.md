# Universal AI Translator — Agent Handbook

This document is the canonical reference for any AI agent (Claude Code, Cursor,
Copilot, etc.) working inside this repository.  Read it before touching any file.

---

## 1. What this project is

A **local desktop translation app** — Node.js HTTP server + single-page HTML UI.
The user drops a document into the browser, picks languages & AI provider, and
gets a translated document back.  No cloud service, no database beyond a single
JSON file, runs entirely on `localhost:3333`.

---

## 2. Folder map

```
universal-translator/
├── server.js               # Express server — all API routes live here
├── index.html              # Single-page UI (vanilla JS, no framework)
├── package.json
│
├── providers/              # One file per AI provider
│   ├── anthropic.js        # claude-sonnet-4-5 / opus / haiku
│   ├── openai.js           # gpt-4o / gpt-4-turbo — also handles custom base URLs
│   ├── gemini.js           # gemini-1.5-pro / flash
│   └── ollama.js           # local models via http://localhost:11434
│
├── extractors/             # One file per input format
│   ├── pdf.js              # pdf-parse (pure Node, no Python)
│   ├── docx.js             # mammoth
│   └── txt.js              # plain text, HTML, SRT subtitles, EPUB (via adm-zip)
│
├── data/
│   ├── translations.json   # persisted job state  { jobs: { [uuid]: Job } }
│   └── uploads/            # temp upload dir (auto-created by multer)
│
├── START.bat               # Windows one-click launcher
└── AGENTS.md               # ← you are here
```

---

## 3. Data model — Job object

```js
{
  id:               string,          // uuid v4
  originalName:     string,          // e.g. "book.pdf"
  uploadedAt:       ISO8601,
  status:           "uploaded" | "translating" | "done" | "failed" | "cancelled",
  sections:         [{ index, type, text }],   // raw extracted sections
  chunks:           [{ index, text, status, error? }],  // translation chunks
  translatedChunks: string[],        // parallel array — null if not yet done
  config: {
    provider, model, sourceLang, targetLang,
    domain, glossary, customPrompt
  },
  rtl: boolean,     // true when targetLang is Arabic/Hebrew/Farsi/Urdu/etc.
}
```

`data/translations.json` is a flat `{ jobs: { [id]: Job } }` map.
It is read & written synchronously on every request (small files, fine for local use).

---

## 4. API surface

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/upload` | Multipart file upload → returns `{ jobId, sectionCount, charCount }` |
| POST | `/api/detect` | Detect source language from first ~1500 chars |
| POST | `/api/estimate` | Token/cost estimate before translating |
| POST | `/api/translate` | Start async translation job → responds immediately, runs in background |
| GET  | `/api/status/:jobId` | Poll progress: `{ status, progress, done, failed, total }` |
| GET  | `/api/result/:jobId` | Full result: original, translated, bilingual array |
| POST | `/api/cancel/:jobId` | Set job status to "cancelled" |
| POST | `/api/retry-failed/:jobId` | Re-queue chunks with status "failed" |
| GET  | `/api/download/:jobId/:format` | `format` = `txt` or `bilingual-txt` |
| GET  | `/api/jobs` | List all jobs (summary only) |
| DELETE | `/api/jobs/:jobId` | Delete a job |

---

## 5. Provider interface

Every file in `providers/` must export exactly one function:

```js
async function translate({ apiKey, model, systemPrompt, userMessage, baseUrl })
  → Promise<string>   // the translated text
```

- Throw a descriptive `Error` on failure (the server catches it and marks the chunk "failed").
- `baseUrl` is only used by `openai.js` and `ollama.js`.
- `apiKey` is undefined/empty for Ollama — don't require it.

---

## 6. Extractor interface

Every file in `extractors/` must export:

```js
async function extract(filePath, ext?)
  → Promise<Array<{ index: number, type: string, text: string, [timecode?]: string }>>
```

- `type` should be `"page"`, `"paragraph"`, `"heading"`, or `"subtitle"`.
- Keep each section ≤ ~5 000 chars; the chunker in `server.js` will further split if needed.

---

## 7. Adding a new provider

1. Create `providers/yourprovider.js` — implement `translate()`.
2. In `server.js`, require it and add it to the `PROVIDERS` map.
3. In `index.html`:
   - Add `<option value="yourprovider">` in `#providerSelect`.
   - Add a model list in the `MODELS` object.
4. Add pricing info to the `pricing` object in `estimateCost()`.

---

## 8. Adding a new file format

1. Create `extractors/yourformat.js` — implement `extract()`.
2. In `server.js` `/api/upload`, add a branch for the new extension.
3. In `index.html`, add the extension to the `accept` attribute on `#fileInput`
   and to the drop-zone hint text.

---

## 9. Chunking logic

`chunkText(text, maxChunkChars)` in `server.js`:
- Splits on `\n\n` (paragraph boundaries).
- Accumulates paragraphs until the next addition would exceed `maxChunkChars`.
- Default: 3 000 chars; user-configurable 500–8 000 in the UI.
- Each chunk is sent with the last 500 chars of the previous chunk as **context**
  (inside a `[Context — do not retranslate]` prefix), so translations stay coherent
  across chunk boundaries.

---

## 10. RTL detection

`isRTL(langCode)` checks against the list:
`['ar','he','fa','ur','yi','dv','ps']`

When `rtl === true`, the result view adds `direction: rtl; text-align: right` via
the CSS class `rtl`.

---

## 11. Glossary locking

Glossary entries (stored in browser `localStorage`) are injected into the system
prompt as:

```
Locked glossary (never deviate): "Logos" → "الكلمة", "grace" → "نعمة"
```

The model is explicitly instructed not to deviate.  This is best-effort — models
occasionally ignore glossary locks on rare terms, especially in very long chunks.

---

## 12. Key dependencies

| Package | Purpose |
|---------|---------|
| `express` | HTTP server |
| `multer` | File upload handling |
| `pdf-parse` | PDF text extraction |
| `mammoth` | DOCX → plain text |
| `adm-zip` | EPUB unpacking |
| `node-fetch` | HTTP calls to AI provider APIs |
| `uuid` | Job IDs |
| `docx` | (reserved) future DOCX output generation |

---

## 13. Things NOT to change without good reason

- The `translations.json` schema — changing it will corrupt saved jobs.
- The provider `translate()` signature — all providers must stay compatible.
- The polling mechanism (`/api/status` every 1 500 ms) — it's intentionally simple.
- The `START.bat` auto-install logic — users may not have npm in PATH separately.

---

## 14. Running locally

```
cd universal-translator
npm install
node server.js
# → http://localhost:3333
```

Or just double-click `START.bat` on Windows.

---

## 15. Known limitations / future work

- **DOCX output**: `docx` package is installed but not yet wired to an export route.
  A `POST /api/export/docx/:jobId` endpoint needs to be added.
- **PDF output**: Requires a headless browser or `pdfkit`; not yet implemented.
- **Bilingual DOCX**: Side-by-side table output — high value, not yet done.
- **Coherence pass**: A second-pass "smooth transitions" sweep is planned but not built.
- **Translation memory**: Glossary is per-session; a persistent cross-job term memory
  would improve consistency on long projects.
- **Progress persistence**: If the server restarts mid-job, in-progress chunks are
  orphaned.  A startup recovery pass could re-queue them.
