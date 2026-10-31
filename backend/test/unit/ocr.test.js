import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { parseAttestation } from '../../src/modules/scans/parse.js';
import { createOcr, imageOfPdf, imageSize, MAX_PIXELS } from '../../src/services/ocr.js';

// The real offline reader on a synthetic filled attestation (test/fixtures/make-attestation.mjs).
const picture = readFileSync(new URL('../fixtures/attestation-synthetique.png', import.meta.url));
const ocr = createOcr();
afterAll(() => ocr.close());

describe('offline reading of a scanned attestation', () => {
  it('reads every printed value of a filled attestation, without any network', async () => {
    const reading = await ocr.recognize(picture, 'image/png');
    expect(reading.confidence).toBeGreaterThan(70);
    expect(parseAttestation(reading.text)).toMatchObject({
      seriesCode: '14 A',
      insurerCode: 'RMA',
      usage: 'TOURISME',
      holderName: 'TEST SYNTHETIQUE',
      holderIdNumber: 'ZZ999999',
      policyNumber: '4099000111',
      intermediary: 'AGENCE ESSAI',
      registration: '99999-A-6',
      makeAndType: 'DACIA LOGAN',
      bodyType: 'BERLINE',
      validFrom: '2026-11-01',
      validTo: '2027-10-31',
    });
    // The number is read with one digit too many on this picture: the right reading is offered.
    const { number, numberCandidates } = parseAttestation(reading.text);
    expect([number, ...(numberCandidates ?? [])]).toContain('999000111');
  }, 60_000);

  it('finds the scanned picture inside a PDF and its size', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 100, 0, 200, 3, 0, 0, 0]);
    const pdf = Buffer.concat([
      Buffer.from('%PDF-1.4\nstream\n'),
      jpeg,
      Buffer.from('\nendstream'),
    ]);
    expect(imageOfPdf(pdf).equals(Buffer.concat([jpeg, Buffer.from('\n')]))).toBe(true);
    expect(imageSize(jpeg)).toEqual({ width: 200, height: 100 });
    expect(imageSize(picture)).toEqual({ width: 980, height: expect.any(Number) });
    expect(imageOfPdf(Buffer.from('%PDF-1.7\nno picture\n'))).toBeNull();
  });
});

describe('a file that only looks like a picture', () => {
  it('is "not read", and never stops the server', async () => {
    // A JPEG start marker found by chance inside other data (e.g. a font of a PDF).
    const pdf = Buffer.concat([
      Buffer.from('%PDF-1.7\nstream\n'),
      Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x12, 0x34]),
      Buffer.alloc(200, 7),
      Buffer.from('\nendstream\n'),
    ]);
    const uncaught = [];
    const listener = (error) => uncaught.push(error);
    process.on('uncaughtException', listener);
    try {
      expect(await ocr.recognize(pdf, 'application/pdf')).toBeNull();
      // A broken JPEG given directly: the reader fails, the request answers "not read".
      const broken = Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 200, 0, 200, 3]),
        Buffer.alloc(300, 1),
      ]);
      expect(await ocr.recognize(broken, 'image/jpeg')).toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(uncaught).toEqual([]);
    } finally {
      process.off('uncaughtException', listener);
    }
  }, 60_000);

  it('does not decode a picture that declares itself huge (an image bomb)', async () => {
    // A few bytes claiming 30 000 × 30 000 pixels: decoding it would take gigabytes.
    const header = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header);
    header.writeUInt32BE(30_000, 16);
    header.writeUInt32BE(30_000, 20);
    expect(30_000 * 30_000).toBeGreaterThan(MAX_PIXELS);
    const warnings = [];
    const ocr = createOcr({ logger: { warn: (details, message) => warnings.push(message) } });
    try {
      expect(await ocr.recognize(header, 'image/png')).toBeNull();
      expect(warnings).toEqual(['ocr skipped a picture too large']);
    } finally {
      await ocr.close();
    }
  });
});
