/**
 * Turns the text read from a scanned attestation into proposed values. Everything is a proposal:
 * the employee checks each value beside the scan before anything is saved. Labels are those of
 * the RMA and CAT forms supplied by the agency (22/10/2026); a value is looked for after its
 * label on the same line.
 */

/** Accented capitals read for plain ones ("14 À" for "14 A"). */
const plainLetter = (letter) =>
  letter
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase();

const LABELS = {
  holderName: /^\s*(?:nom|name)\b[\s:.|]*/i,
  holderIdNumber:
    /n°?\s*de\s*la\s*carte\s*d.identit[ée]\s*nationale(?:\s*ou\s*n°?\s*de\s*registre\s*de\s*commerce)?[\s:.|]*/i,
  holderAddress: /^\s*adresse\b[\s:.|]*/i,
  policyNumber: /num[ée]ro\s*de\s*la\s*police[\s:.|]*/i,
  intermediary: /^\s*interm[ée]diaire\b[\s:.|]*/i,
  registration: /n°?\s*d.immatriculation[\s:.|]*/i,
  makeAndType: /marque\s*et\s*type[\s:.|]*/i,
  bodyType: /type\s*de\s*carrosserie[\s:.|]*/i,
  trailer: /^\s*remorques?\b[\s:.|]*/i,
};

/** Text after the label, up to a column bar or Arabic text (the bilingual forms). */
function afterLabel(line, label) {
  const match = label.exec(line);
  if (!match) return null;
  const rest = line
    .slice(match.index + match[0].length)
    .split(/[|]|[\u0600-\u06ff]/)[0]
    .trim();
  // Another label read on the same line ("Attestation:") is not a value.
  return rest.length >= 2 && !/^[\p{L} ]+:$/u.test(rest) ? rest : null;
}

/** "01 11 2026", "01/11/2026" → "2026-11-01"; null when it is not a real date. */
function dateOf(text) {
  const match = /(\d{1,2})\s*[/.\-\s]\s*(\d{1,2})\s*[/.\-\s]\s*(\d{4})/.exec(text ?? '');
  if (!match) return null;
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || year < 2000 || year > 2100) return null;
  return date.toISOString().slice(0, 10);
}

export function parseAttestation(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const all = lines.join('\n');
  const fields = {};

  // The series ("14 A") and its 9-digit number, printed in the NUMERO D'ORDRE box. A frame
  // line can be read as an extra digit: the last nine digits are the number.
  const order =
    /NUM[ÉE]RO\s*D.ORDRE[\s|:]*(\d{2})\s*([A-ZÀ-Ý])\s*((?:\d\s*){9,12})/i.exec(all) ??
    /\b(14|91)\s*([A-ZÀ-Ý])\s*((?:\d\s*){9,12})/.exec(all);
  if (order) {
    fields.seriesCode = `${order[1]} ${plainLetter(order[2])}`;
    const digits = order[3].replace(/\s/g, '');
    fields.number = digits.slice(-9);
    // More than nine digits read (a frame line read as a digit, a doubled digit): every
    // nine-digit reading is offered, and the number is marked to check.
    if (digits.length > 9) {
      const windows = Array.from({ length: digits.length - 8 }, (_, i) => digits.slice(i, i + 9));
      const oneLess = Array.from(
        { length: digits.length },
        (_, i) => digits.slice(0, i) + digits.slice(i + 1),
      ).filter((n) => n.length === 9);
      fields.numberCandidates = [...new Set([...windows, ...oneLess])];
      fields.numberToCheck = true;
    }
  }

  if (/\bCAT\b|CAT\s*Assurance/i.test(all)) fields.insurerCode = 'CAT';
  if (/\bRMA\b|Royale\s*Marocaine/i.test(all))
    fields.insurerCode = fields.insurerCode ? null : 'RMA';
  if (fields.insurerCode === null) delete fields.insurerCode;

  const usage = /USAGE\s*:?\s*([A-ZÀ-Ý][A-ZÀ-Ý '-]+?)(?:\s*[|]|\s{2,}|$|[\u0600-\u06ff])/m.exec(
    all,
  );
  if (/ATTESTATION\s+PROVISOIRE/i.test(all)) fields.usage = 'Provisoire';
  else if (usage) fields.usage = usage[1].trim();

  for (const line of lines) {
    for (const [field, label] of Object.entries(LABELS)) {
      if (fields[field]) continue;
      const value = afterLabel(line, label);
      if (value) fields[field] = value.slice(0, field === 'holderAddress' ? 200 : 120);
    }
    if (!fields.validFrom && /\bDU\s*:/i.test(line))
      fields.validFrom = dateOf(line.split(/DU\s*:/i)[1]);
    if (!fields.validTo && /\bAU\s*:/i.test(line))
      fields.validTo = dateOf(line.split(/AU\s*:/i)[1]);
  }
  for (const key of Object.keys(fields)) if (fields[key] === null) delete fields[key];
  return fields;
}
