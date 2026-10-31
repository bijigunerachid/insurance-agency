import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { toCsv, toXlsx } from '../../src/services/spreadsheet.js';

const columns = [
  { key: 'name', label: 'Client', type: 'text' },
  { key: 'day', label: 'Jour', type: 'date' },
  { key: 'amount', label: 'Montant (MAD)', type: 'money' },
  { key: 'count', label: 'Reçus', type: 'int' },
];
const rows = [
  { name: 'Saïda « El Amrani »; Rabat', day: '2026-10-24', amount: '1234.50', count: 2 },
  { name: '=HYPERLINK("http://x")', day: null, amount: '-500.00', count: 0 },
];

/** The files of a ZIP archive, read from its central directory. */
function unzip(buffer) {
  const files = {};
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let at = buffer.readUInt32LE(end + 16);
  for (let i = 0; i < buffer.readUInt16LE(end + 10); i += 1) {
    const nameLength = buffer.readUInt16LE(at + 28);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);
    const local = buffer.readUInt32LE(at + 42);
    const size = buffer.readUInt32LE(at + 20);
    const start = local + 30 + buffer.readUInt16LE(local + 26);
    files[name] = inflateRawSync(buffer.subarray(start, start + size)).toString('utf8');
    at += 46 + nameLength;
  }
  return files;
}

describe('CSV export', () => {
  it('opens in French Excel: BOM, semicolons, decimal comma, dates DD/MM/YYYY', () => {
    const text = toCsv(columns, rows).toString('utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.slice(1).split('\r\n');
    expect(lines[0]).toBe('Client;Jour;Montant (MAD);Reçus');
    expect(lines[1]).toBe('"Saïda « El Amrani »; Rabat";24/10/2026;1234,50;2');
  });

  it('never lets a cell run as a formula', () => {
    const line = toCsv(columns, rows).toString('utf8').split('\r\n')[2];
    expect(line).toBe(`"'=HYPERLINK(""http://x"")";;-500,00;0`);
  });
});

describe('Excel export', () => {
  it('is a workbook with one sheet, text cells, numeric amounts and no formula', () => {
    const files = unzip(toXlsx(columns, rows, 'Paiements par jour'));
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ]);
    expect(files['xl/workbook.xml']).toContain('<sheet name="Paiements par jour"');
    const sheet = files['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('<t xml:space="preserve">Saïda « El Amrani »; Rabat</t>');
    expect(sheet).toContain('<c r="C2" s="1"><v>1234.5</v></c>');
    expect(sheet).toContain('<c r="D3"><v>0</v></c>');
    expect(sheet).toContain('<t xml:space="preserve">\'=HYPERLINK(&quot;http://x&quot;)</t>');
    expect(sheet).not.toContain('<f>');
  });
});
