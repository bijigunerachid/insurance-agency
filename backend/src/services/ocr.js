import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createWorker } from 'tesseract.js';

/**
 * Offline text recognition of scanned attestations (owner's choice, 24/10/2026: on the office
 * server, nothing sent outside). The French language data ships with @tesseract.js-data/fra and
 * the engine with tesseract.js-core: no download, ever.
 */
const require = createRequire(import.meta.url);
const LANG_PATH = join(dirname(require.resolve('@tesseract.js-data/fra/package.json')), '4.0.0');
/**
 * Pictures larger than this are not read: a small file can declare a huge picture (an A4 page at
 * 600 dpi is about 35 million pixels) that would take gigabytes of memory to decode.
 */
export const MAX_PIXELS = 50_000_000;

/** The largest JPEG inside a scanned PDF: what a scanner stores (one image per page). */
export function imageOfPdf(pdf) {
  let best = null;
  let at = 0;
  for (;;) {
    const start = pdf.indexOf(Buffer.from([0xff, 0xd8, 0xff]), at);
    if (start < 0) break;
    const end = pdf.indexOf(Buffer.from('endstream'), start);
    if (end < 0) break;
    const image = pdf.subarray(start, end);
    if (!best || image.length > best.length) best = image;
    at = end;
  }
  return best;
}

/** Width and height of a JPEG (SOF marker) or PNG (IHDR). */
export function imageSize(image) {
  if (image[0] === 0x89) return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
  let i = 2;
  while (i + 9 < image.length) {
    if (image[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = image[i + 1];
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: image.readUInt16BE(i + 5), width: image.readUInt16BE(i + 7) };
    }
    i += 2 + image.readUInt16BE(i + 2);
  }
  return null;
}

/** The form is recognised when its title is read; the number when "NUMERO D'ORDRE" is followed by it. */
const looksLikeAttestation = (text) => /ATTESTATION/i.test(text);
const twoDocuments = (text) =>
  /Souscripteur|Conditions\s+Particuli|Prime\s+nette|NOTE\s+DE\s+COUVERTURE/i.test(text);
const hasNumber = (text) => /\b\d{2}\s*[A-ZÀ]\s*(?:\d\s*){9,}/.test(text);

/**
 * Reads a scan. Scanners often store the page sideways and RMA prints the conditions
 * particulières beside the attestation: the turns are tried in turn, then each half of the
 * page, until the attestation and its number are read. One reading at a time.
 */
export function createOcr({ logger } = {}) {
  let worker = null;
  let queue = Promise.resolve();

  async function engine() {
    // Without an error handler, tesseract.js throws a second time, outside any request, when it
    // cannot read an image: that would stop the whole server. The request still fails and is
    // answered as "not read".
    worker ??= await createWorker('fra', 1, {
      langPath: LANG_PATH,
      cacheMethod: 'none',
      errorHandler: (error) =>
        logger?.warn({ error: String(error) }, 'ocr could not read an image'),
    });
    await worker.setParameters({ tessedit_pageseg_mode: '4' });
    return worker;
  }

  async function read(image) {
    const size = imageSize(image);
    const w = await engine();
    const attempt = async (angle, rectangle) => {
      const { data } = await w.recognize(image, {
        rotateRadians: (angle * Math.PI) / 180,
        ...(rectangle ? { rectangle } : {}),
      });
      return { text: data.text, confidence: Math.round(data.confidence), angle };
    };
    let best = null;
    for (const angle of [90, 0, 270, 180]) {
      const result = await attempt(angle);
      if (!best || result.confidence > best.confidence) best = result;
      if (looksLikeAttestation(result.text) && result.confidence >= 60) {
        best = result;
        break;
      }
    }
    // RMA prints the conditions particulières beside the attestation, CAT its note de couverture:
    // the attestation half is read alone, so the two columns are not mixed.
    if (size && (twoDocuments(best.text) || !hasNumber(best.text))) {
      const half = Math.round(size.width / 2);
      for (const rectangle of [
        { left: half, top: 0, width: size.width - half, height: size.height },
        { left: 0, top: 0, width: half, height: size.height },
      ]) {
        const result = await attempt(best.angle, rectangle);
        if (hasNumber(result.text) && /PROPRI[ÉE]TAIRE/i.test(result.text)) return result;
      }
    }
    return best;
  }

  return {
    /** `{ text, confidence (0–100), angle }` of the image; null when the file holds no image. */
    recognize(file, mimeType) {
      const image = mimeType === 'application/pdf' ? imageOfPdf(file) : file;
      // Only a real picture is read: a marker found by chance inside other data (a font, say)
      // has no size, and the scan is then typed instead; so is a picture too large to decode.
      const size = image ? imageSize(image) : null;
      if (!size || size.width < 50 || size.height < 50) return Promise.resolve(null);
      if (size.width * size.height > MAX_PIXELS) {
        logger?.warn({ width: size.width, height: size.height }, 'ocr skipped a picture too large');
        return Promise.resolve(null);
      }
      // A failed reading is "not read": the scan is kept and its values are typed.
      const run = queue
        .then(() => read(image))
        .catch((err) => {
          logger?.warn({ err: String(err?.message ?? err) }, 'ocr failed');
          return null;
        });
      queue = run;
      return run;
    },

    async close() {
      await worker?.terminate();
      worker = null;
    },
  };
}
