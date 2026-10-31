import { crc32, deflateRawSync } from 'node:zlib';

/**
 * Report exports without a third-party library: CSV for any tool, and a minimal Excel workbook
 * (one sheet, text and numbers). `columns` = [{ key, label, type: 'text'|'date'|'money'|'int' }].
 */

/**
 * A cell starting with = + - @ (or a tab / carriage return) would be run as a formula by Excel:
 * it is prefixed with an apostrophe (CSV injection). Amounts and counts are numbers, not text,
 * so they are never touched.
 */
function safeText(value) {
  const text = String(value ?? '');
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** DD/MM/YYYY, the agency's way of writing dates. */
const frenchDate = (iso) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';

function cellText(column, value) {
  if (value === null || value === undefined) return '';
  if (column.type === 'date') return frenchDate(value);
  // French Excel reads "1234,50" as a number.
  if (column.type === 'money') return Number(value).toFixed(2).replace('.', ',');
  if (column.type === 'int') return String(value);
  return safeText(value);
}

/** Semicolon-separated with a UTF-8 BOM: what French Excel opens directly, accents included. */
export function toCsv(columns, rows) {
  const quote = (text) => (/[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
  const lines = [
    columns.map((c) => quote(safeText(c.label))).join(';'),
    ...rows.map((row) => columns.map((c) => quote(cellText(c, row[c.key]))).join(';')),
  ];
  return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
}

const xml = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Characters XML 1.0 cannot carry are dropped.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

function columnName(index) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

function sheetXml(columns, rows) {
  const cell = (ref, column, value) => {
    if (value === null || value === undefined || value === '') return '';
    if (column.type === 'money' || column.type === 'int') {
      const style = column.type === 'money' ? ' s="1"' : '';
      return `<c r="${ref}"${style}><v>${Number(value)}</v></c>`;
    }
    const text = column.type === 'date' ? frenchDate(value) : safeText(value);
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
  };
  const header = columns
    .map(
      (c, i) => `<c r="${columnName(i)}1" t="inlineStr" s="2"><is><t>${xml(c.label)}</t></is></c>`,
    )
    .join('');
  const body = rows
    .map((row, r) => {
      const cells = columns.map((c, i) => cell(`${columnName(i)}${r + 2}`, c, row[c.key])).join('');
      return `<row r="${r + 2}">${cells}</row>`;
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.type === 'text' ? 28 : 14}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData><row r="1">${header}</row>${body}</sheetData></worksheet>`
  );
}

/** A ZIP archive (deflate), the container of an .xlsx file. */
function zip(files) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const data = Buffer.from(content, 'utf8');
    const packed = deflateRawSync(data);
    const nameBytes = Buffer.from(name, 'utf8');
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0x0800, 6); // UTF-8 names
    header.writeUInt16LE(8, 8); // deflate
    header.writeUInt32LE(0, 10); // time and date (none)
    header.writeUInt32LE(crc32(data), 14);
    header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    header.writeUInt16LE(0, 28);
    local.push(header, nameBytes, packed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(0, 12);
    entry.writeUInt32LE(crc32(data), 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += header.length + nameBytes.length + packed.length;
  }
  const centralSize = central.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

/** An Excel workbook with one sheet: bold header row, amounts with two decimals. */
export function toXlsx(columns, rows, sheetName = 'Rapport') {
  const name = xml(sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  return zip([
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ],
    [
      'xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
    ],
    [
      'xl/styles.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        '</styleSheet>',
    ],
    ['xl/worksheets/sheet1.xml', sheetXml(columns, rows)],
  ]);
}
