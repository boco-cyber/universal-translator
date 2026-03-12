/**
 * Text-based extractor — handles .txt, .html, .htm, .srt, .epub
 * Returns array of sections: [{ index, type, text }]
 */

const fs   = require('fs');
const path = require('path');

async function extract(filePath, ext) {
  const raw = fs.readFileSync(filePath, 'utf8');

  if (ext === '.html' || ext === '.htm') return extractHTML(raw);
  if (ext === '.srt')                    return extractSRT(raw);
  if (ext === '.epub')                   return extractEPUB(filePath);
  return extractPlainText(raw);
}

// ── Plain text ─────────────────────────────────────────────────────────────
function extractPlainText(text) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  return paragraphs.length
    ? paragraphs.map((p, i) => ({ index: i, type: 'paragraph', text: p }))
    : [{ index: 0, type: 'paragraph', text: text.trim() }];
}

// ── HTML ───────────────────────────────────────────────────────────────────
function extractHTML(html) {
  // Simple tag-stripping (good enough for most docs)
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();

  return extractPlainText(text);
}

// ── SRT subtitles ──────────────────────────────────────────────────────────
function extractSRT(srt) {
  // SRT format:
  // 1
  // 00:00:01,000 --> 00:00:04,000
  // Subtitle text here
  const blocks = srt.trim().split(/\n\n+/);
  const sections = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 3) continue;
    const index    = parseInt(lines[0], 10) - 1;
    const timecode = lines[1];
    const text     = lines.slice(2).join(' ').replace(/<[^>]+>/g, '').trim();
    if (text) sections.push({ index, type: 'subtitle', timecode, text });
  }

  return sections;
}

// ── EPUB ───────────────────────────────────────────────────────────────────
async function extractEPUB(filePath) {
  try {
    const AdmZip = require('adm-zip');
    const zip    = new AdmZip(filePath);
    const entries = zip.getEntries();

    let allText = '';
    for (const entry of entries) {
      const name = entry.entryName.toLowerCase();
      if (name.endsWith('.html') || name.endsWith('.xhtml') || name.endsWith('.htm')) {
        const content = entry.getData().toString('utf8');
        const text = content
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (text.length > 50) allText += text + '\n\n';
      }
    }

    return extractPlainText(allText || 'Could not extract EPUB content.');
  } catch (err) {
    return [{ index: 0, type: 'paragraph', text: `EPUB extraction failed: ${err.message}` }];
  }
}

module.exports = { extract };
