import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * The text of a PDF made by an insurer's platform (to print on the pre-printed form), line by
 * line, with the half of the page each line is on: the RMA sheet has the conditions
 * particulières on the left and the attestation on the right. Only the first page is read: the
 * others are the same document for the other copies. No script, font or network: text only.
 */

/**
 * Spaces read inside a word: the platform spaces the letters of some fields ("2 3 - 0 4 - 2 0 2 6"
 * for "23-04-2026"), and the narrow capital I leaves gaps read as spaces ("M I RN I L" for
 * "MIRNIL"). Real word spaces are kept.
 */
export function collapseSpacing(text) {
  let result = text.replace(/\s+/g, ' ').trim();
  if (result.split(' ').every((token) => token.length === 1)) result = result.replace(/ /g, '');
  // Twice: "M I RN I L" holds two of them.
  for (let i = 0; i < 2; i += 1) {
    result = result.replace(/(?<=\p{Lu}) I (?=\p{Lu})/gu, 'I').replace(/^I (?=\p{Lu})/u, 'I');
  }
  // The letter left alone after an I ("MIRNI L"), an I ending a word ("TEST I").
  return result
    .replace(/(?<=\p{Lu}I) (?=\p{Lu}(?: |$))/gu, '')
    .replace(/(?<=\p{Lu}{2}) I(?= |$)/gu, 'I');
}

const ROW_TOLERANCE = 4;

export async function readPdfText(buffer) {
  const task = getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  let pdf;
  try {
    pdf = await task.promise;
  } catch {
    await task.destroy();
    return null;
  }
  try {
    const page = await pdf.getPage(1);
    const { items } = await page.getTextContent();
    const texts = items.filter((item) => item.str && item.str.trim());
    if (texts.length === 0) return null;
    // A page turned by 90° (printed sideways) runs its lines along x; otherwise along y.
    const sideways = page.rotate % 180 !== 0;
    const [, , width, height] = page.view;
    const middle = (sideways ? height : width) / 2;
    const rows = [];
    for (const item of texts) {
      const [, , , , x, y] = item.transform;
      // Lines from the top of the printed page, columns from its left.
      const line = sideways ? x : height - y;
      const column = sideways ? y : x;
      const side = column < middle ? 'left' : 'right';
      let row = rows.find((r) => r.side === side && Math.abs(r.line - line) <= ROW_TOLERANCE);
      if (!row) {
        row = { side, line, parts: [] };
        rows.push(row);
      }
      row.parts.push({ column, end: column + item.width, text: item.str });
    }
    for (const row of rows) {
      row.parts.sort((a, b) => a.column - b.column);
      // Pieces that touch are one word ("H7KD" + "W" + "YKF2S…"); others are separate values.
      let text = '';
      row.parts.forEach((part, i) => {
        const touching = i > 0 && part.column <= row.parts[i - 1].end + 1.5;
        text += (i > 0 && !touching ? ' ' : '') + part.text;
      });
      row.text = collapseSpacing(text);
      for (const part of row.parts) part.text = collapseSpacing(part.text);
    }
    rows.sort((a, b) => a.line - b.line);
    return {
      pages: pdf.numPages,
      left: rows.filter((r) => r.side === 'left'),
      right: rows.filter((r) => r.side === 'right'),
    };
  } finally {
    await task.destroy();
  }
}
