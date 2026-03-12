/**
 * PDF extractor — uses pdf-parse (pure Node.js, no Python needed)
 * Returns array of sections: [{ index, type, text }]
 */

const pdfParse = require('pdf-parse');
const fs = require('fs');

async function extract(filePath) {
  const buffer = fs.readFileSync(filePath);
  const data   = await pdfParse(buffer);

  // Split by form-feed (page break) characters or double-newlines
  const rawPages = data.text.split(/\f/).filter(p => p.trim());

  const sections = rawPages.map((pageText, i) => ({
    index: i,
    type:  'page',
    text:  pageText.trim(),
  }));

  return sections.length ? sections : [{ index: 0, type: 'page', text: data.text.trim() }];
}

module.exports = { extract };
