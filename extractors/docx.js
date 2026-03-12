/**
 * DOCX extractor — uses mammoth to preserve structure
 * Returns array of sections: [{ index, type, text }]
 */

const mammoth = require('mammoth');

async function extract(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  const text   = result.value;

  // Split on double newlines to get paragraphs/sections
  const paragraphs = text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  if (!paragraphs.length) return [{ index: 0, type: 'paragraph', text: text.trim() }];

  return paragraphs.map((p, i) => ({
    index: i,
    type:  p.length < 80 && !p.endsWith('.') ? 'heading' : 'paragraph',
    text:  p,
  }));
}

module.exports = { extract };
