/**
 * Values of the PDF that the RMA platform makes to print on the agency's pre-printed sheet
 * (owner, 24/10/2026: "the pdf sent after we fill the platform … to print it on top of the
 * assurance"). The text is exact, unlike a scan. Left half: the conditions particulières;
 * right half: the attestation. Lines are recognised by what they hold, not by their exact place.
 */

const DATE = /(\d{2})-(\d{2})-(\d{4})/;
const MONTHS = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
};
const plain = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
const noSpace = (text) => String(text ?? '').replace(/\s/g, '');

export function isoDate(day, month, year) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCDate() !== Number(day) || date.getUTCMonth() !== Number(month) - 1) return null;
  return date.toISOString().slice(0, 10);
}
/** "23-04-2026" → "2026-04-23". */
function dashDate(text) {
  const match = DATE.exec(noSpace(text));
  return match ? isoDate(match[1], match[2], match[3]) : null;
}
/**
 * "Jeu 23 Avril 2026 18H" → "2026-04-23"; the month may be printed letter by letter
 * ("Ju i l l e t"), so the spaces are left out first.
 */
export function wordDate(text) {
  const match = /(\d{1,2})(\p{L}+?)(\d{4})/u.exec(noSpace(text));
  const month = match && MONTHS[plain(match[2])];
  return month ? isoDate(match[1], month, match[3]) : null;
}
/** "421 . 40" → "421.40", "1.277.00" → "1277.00"; null when it is not an amount. */
export function amount(text) {
  const value = noSpace(text)
    .replace(/#/g, '')
    .replace(',', '.')
    // A dot between thousands ("1.277.00"): only the last dot marks the decimals.
    .replace(/\.(?=\d{3}\.)/g, '');
  return /^\d{1,9}(\.\d{1,2})?$/.test(value) ? Number(value).toFixed(2) : null;
}
/** "Re s p o n s a b i l i t e" → "Responsabilite"; a word printed normally is kept. */
const unspaced = (text) =>
  String(text ?? '')
    .split(' ')
    .every((token) => token.length <= 3)
    ? noSpace(text)
    : String(text ?? '');
/** The guarantees a platform sheet prints: their words read without accents, and their name. */
const GUARANTEES = [
  ['responsabilite civile', 'Responsabilité civile'],
  ['evenement catastrophique', 'Événement catastrophique'],
  ['dommages collision', 'Dommages collision'],
  ['dommages au vehicule', 'Dommages au véhicule'],
  ['incendie', 'Incendie'],
  ['vol', 'Vol'],
  ['bris de glace', 'Bris de glace'],
  ['defense et recours', 'Défense et recours'],
  ['assistance', 'Assistance'],
];
// The two compulsory guarantees, printed without the formula.
const COMPULSORY = new Set(['Responsabilité civile', 'Événement catastrophique']);

/**
 * The words every optional guarantee ends with (a single one: only its last word), when they
 * name a formula (the word RC or DC); null otherwise.
 */
function formulaOf(guarantees) {
  const words = guarantees
    .filter((g) => !COMPULSORY.has(g.label) && g.details)
    .map((g) => g.details.split(/\s+/));
  if (words.length === 0) return null;
  let common = words.length === 1 ? words[0].slice(-1) : words[0];
  for (const list of words.slice(1)) {
    let n = 0;
    while (n < common.length && n < list.length && common.at(-1 - n) === list.at(-1 - n)) n += 1;
    common = n ? common.slice(-n) : [];
  }
  return common.some((word) => /^(RC|DC)$/.test(word)) ? common.join(' ') : null;
}

/** The platform's own reference of the document ("78fa99e5-6154-…"), printed above the name. */
const isReference = (compact) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(compact);
/** Where the spaces fall in a text, counted in letters ("KI LI TESTI" → 2, 4). */
function spaceIndexes(texts) {
  const indexes = new Set();
  let at = 0;
  for (const text of texts) {
    if (at > 0) indexes.add(at);
    for (const token of String(text).split(/\s+/).filter(Boolean)) {
      if (at > 0) indexes.add(at);
      at += token.length;
    }
  }
  return indexes;
}
/**
 * A value printed on both halves (the holder's name, the make and type) with its real spaces.
 * The narrow capital I leaves gaps that read as spaces, at other places on each half
 * ("KIL I TEST I" on the right, "KI LI" + "TESTI" on the left): a space is real when both
 * halves have it ("KILI TESTI").
 */
function realSpaces(rightText, left) {
  const name = noSpace(rightText);
  const row = left.find((r) => noSpace(r.text).startsWith(name));
  if (!name || !row) return rightText;
  const both = spaceIndexes([rightText]);
  const other = spaceIndexes(row.parts.map((p) => p.text));
  let result = '';
  [...name].forEach((letter, i) => {
    result += (i > 0 && both.has(i) && other.has(i) ? ' ' : '') + letter;
  });
  return result;
}

const joined = (row) => row.text;
/**
 * A body type printed with no other half to compare (the provisional sheet): the narrow capital I
 * leaves a gap before the rest of its word (« CONDUI TE INTERI EURE »). A word of the body type
 * never ends with I, so such a gap is joined; one-letter codes (« C. I ») are left as they are.
 */
const bodyTypeOf = (text) =>
  String(text ?? '')
    .replace(/(?<=\p{Lu}{2}I) (?=\p{Lu}{2})/gu, '')
    .replace(/\s*\.\s*/g, '.');
const PAYMENT_METHODS = [
  [/esp/i, 'CASH'],
  [/ch.?q/i, 'CHEQUE'],
  [/vir/i, 'TRANSFER'],
  [/carte/i, 'CARD'],
];
// The kind of avenant from its title, without spaces or accents. Only the vehicle change is
// known; any other title is OTHER and the employee says what it is.
const AMENDMENT_KINDS = [
  [/changementdevehicule/, 'VEHICLE_CHANGE'],
  [/immatriculation/, 'REGISTRATION_CHANGE'],
];
export const FUELS = [
  [/electri/i, 'ELECTRIC'],
  [/hybrid/i, 'HYBRID'],
  [/diesel|gasoil/i, 'DIESEL'],
  [/essence/i, 'PETROL'],
];

/** True when the text looks like an RMA platform sheet: an attestation number and a policy. */
export function isPlatformSheet(text) {
  return (
    Boolean(text && text.left.length && text.right.length) &&
    text.left.some((row) => /\d{2}[A-Z]\d{9}(?!\d)/.test(noSpace(joined(row)))) &&
    [...text.left, ...text.right].some((row) => /\b\d{15}\b/.test(joined(row)))
  );
}

/**
 * The platform's PDF of a provisional attestation : only the
 * attestation half is printed (usage, holder, policy, intermediary and its code, vehicle, « DUREE
 * FERME », period), on the pink pre-printed form that carries the series and the number. So no
 * attestation number at all, and no premium.
 */
export function isProvisionalSheet(text) {
  if (!text?.right.length || isPlatformSheet(text)) return false;
  const rows = text.right.map((row) => noSpace(joined(row)));
  return (
    rows.some((row) => /^\d{15}$/.test(row)) &&
    rows.some((row) => /DUREEFERME/i.test(row)) &&
    rows.filter((row) => wordDate(row)).length >= 2
  );
}

/**
 * Reads a provisional sheet like the attestation half of a platform sheet. Its first line is the
 * usage; the series is the insurer's provisional one (RMA 14 P, agency rule of 23/10/2026) and the
 * employee types the number printed on the pink form.
 */
export function parseProvisionalSheet({ right }) {
  const [usage, ...rest] = right;
  const fields = parsePlatformSheet({ left: [], right: rest });
  const issued = rest.map((row) => joined(row)).find((text) => DATE.test(noSpace(text)));
  const sheet = {
    ...fields,
    provisional: true,
    seriesCode: '14 P',
    usage: joined(usage).replace(/\s+/g, ' ').trim(),
  };
  if (issued) {
    sheet.issuedOn = dashDate(issued);
    sheet.issuedAt = issued
      .replace(DATE, '')
      .replace(/[\d\s-]+$/, '')
      .trim();
  }
  return sheet;
}

export function parsePlatformSheet({ left, right }) {
  const fields = { insurerCode: 'RMA' };
  const set = (key, value) => {
    if (value !== null && value !== undefined && value !== '' && fields[key] === undefined) {
      fields[key] = value;
    }
  };

  // --- Conditions particulières (left) ---------------------------------------------------
  for (const row of left) {
    const text = joined(row);
    const compact = noSpace(text);
    if (/AFFAIRE\s*NOUVELLE/i.test(text)) set('newBusiness', true);
    if (/RENOUVELLEMENT/i.test(text)) set('newBusiness', false);
    // « REMPLACEMENT DE POLICE N <15 digits> »: the
    // new policy replaces that one, a contract the agency may already follow.
    const replaced = /^REMPLACEMENTDEPOLICEN[°O]?(\d{15})$/i.exec(compact);
    if (replaced) {
      set('newBusiness', false);
      set('replacesPolicy', replaced[1]);
    }
    // "AVENANT DE CHANGEMENT DE VEHICULE N 2600012345". A renewal
    // is also printed as an avenant; it stays a renewal.
    // Its number may be letter-spaced ("N 2 6 0 0 …").
    const avenant = /^AVENANT\s*DE\s*(.+?)\s*N[°o]?\s*(\d{6,20})$/i.exec(
      text
        .replace(/(\d)\s+(?=\d)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim(),
    );
    if (avenant && !/RENOUVELLEMENT/i.test(avenant[1])) {
      const kind = AMENDMENT_KINDS.find(([pattern]) => pattern.test(noSpace(plain(avenant[1]))));
      set('amendmentKind', kind?.[1] ?? 'OTHER');
      set('amendmentLabel', `Avenant de ${avenant[1].toLowerCase()}`);
      set('amendmentNumber', avenant[2]);
    }
    const order = /(\d{2})([A-Z])(\d{9})(?!\d)/.exec(compact);
    if (order && fields.seriesCode === undefined) {
      set('seriesCode', `${order[1]} ${order[2]}`);
      set('number', order[3]);
      set('policyNumber', /^\d{15}/.exec(noSpace(row.parts[0].text))?.[0]);
    }
    // Effect and end, then the usage written by the platform.
    const dates = row.parts.map((p) => dashDate(p.text)).filter(Boolean);
    if (dates.length >= 2 && /\d\s*H/i.test(text) && fields.effectDate === undefined) {
      set('effectDate', dates[0]);
      set('endDate', dates[1]);
      const usage = row.parts
        .filter((p) => !dashDate(p.text) && !/^\d+\s*H$/i.test(noSpace(p.text)))
        .map((p) => p.text)
        .join(' ')
        .trim();
      set('usage', usage);
    }
    if (/^\d{20}$/.test(noSpace(row.parts[0]?.text))) {
      set('quittanceNumber', noSpace(row.parts[0].text));
      const duration = row.parts
        .slice(1)
        .map((p) => p.text)
        .filter((t) => !/^#+$/.test(noSpace(t)))
        .join(' ');
      set('duration', duration);
    }
    // A star may sit just above the line ("Dont 2.06 Dh…"): only the #amounts# are read.
    const totals = compact.replace(/[^#\d.,]/g, '');
    if (/^#.*#$/.test(totals) && (totals.match(/#/g) ?? []).length >= 14) {
      // Prime nette, taxes, accessoires, total TTC, CNPAC, timbre, total à payer (the form's order).
      const values = totals.split('#').filter(Boolean).map(amount);
      if (values.length === 7 && values.every(Boolean)) {
        const [premiumNet, taxes, fees, totalTtc, cnpac, stamp, totalToPay] = values;
        Object.assign(fields, {
          premiumNet,
          taxes,
          fees,
          totalTtc,
          cnpac,
          stamp,
          premiumTotal: totalToPay,
        });
      }
    }
    // The platform drops the accented letters: "Mode de r g l ement :Esp ce".
    if (/modeder.?glement/i.test(compact)) {
      set('issuedOn', dates[0]);
      set('issuedAt', row.parts[0]?.text);
      const paid = noSpace(text.split(':').pop());
      const method = PAYMENT_METHODS.find(([pattern]) => pattern.test(paid));
      set('paymentMethod', method?.[1]);
    }
  }
  // Vehicle block of the left half: the line with the chassis (or the plate, when the chassis is
  // not printed) and the fuel, then first registration, then power / genre / seats, then
  // trailer / CRM.
  let vehicleAt = left.findIndex((row) =>
    row.parts.some((p) => /^[A-HJ-NPR-Z0-9]{17}$/.test(noSpace(p.text))),
  );
  if (vehicleAt < 0) {
    vehicleAt = left.findIndex(
      (row) =>
        row.parts.length >= 2 && FUELS.some(([pattern]) => pattern.test(row.parts.at(-1).text)),
    );
  }
  if (vehicleAt >= 0) {
    const row = left[vehicleAt];
    const fuelText = row.parts.at(-1).text;
    set('fuel', FUELS.find(([pattern]) => pattern.test(fuelText))?.[1]);
    set('firstRegistrationDate', dashDate(joined(left[vehicleAt + 1] ?? { parts: [] })));
    const power = left[vehicleAt + 2]?.parts ?? [];
    // Before "2.R" / "3.R" the agency types (owner, 29/10/2026): the engine size of a moped (49
    // for "< 50 CM3"); 3 for an electric one, which has no cm3, until the law says otherwise (kept
    // as printed, never converted); the fiscal power of a motorcycle (5 on a 14 E > 125 cm3, 3 on
    // a driving-school one). No petrol two-wheeler has an engine under 30 cm3, nor 30 CV.
    const wheels = /^[23]\.R$/.test(noSpace(power[1]?.text));
    const first = noSpace(power[0]?.text);
    const number = /^\d{1,4}$/.test(first) ? Number(first) : null;
    if (wheels && number !== null) {
      set(fields.fuel === 'ELECTRIC' || number >= 30 ? 'engineCc' : 'fiscalPowerCv', number);
    } else if (!wheels && number !== null && number > 0 && number < 1000) {
      // A lorry may print 0 (owner's C2 sheet, 29/10/2026): no fiscal power given.
      set('fiscalPowerCv', number);
    }
    if (/^\d{1,3}$/.test(noSpace(power.at(-1)?.text)) && power.length >= 3) {
      set('seats', Number(noSpace(power.at(-1).text)));
    }
    const crm = left[vehicleAt + 3]?.parts.at(-1)?.text;
    if (/^\d(\.\d{1,2})?$/.test(noSpace(crm))) set('crm', noSpace(crm));
  }
  // The driver: the second name line with a birth date.
  const driver = left.find(
    (row) =>
      row.parts.length >= 2 &&
      dashDate(row.parts.at(-1).text) &&
      /[A-Z]{2}/.test(row.parts[0].text),
  );
  set('driverBirthDate', driver ? dashDate(driver.parts.at(-1).text) : null);
  // Guarantees: a label (its words may be letter-spaced), what the platform prints after it
  // (capital, basis, franchise, then the formula), and its premium when one is printed. A full cover prints
  // Dommages collision, Incendie, Vol, Défense et recours, Assistance without a premium (owner's
  // motorcycle sheet, 29/10/2026): kept as printed, never priced by the app.
  const guarantees = left
    .map((row) => {
      // An amount keeps its thousands spaces (« 50 000 000 »); a letter-spaced word is rejoined.
      const parts = row.parts.map((part) =>
        /^[\d\s.,]+$/.test(part.text) ? part.text.replace(/\s+/g, ' ').trim() : unspaced(part.text),
      );
      // The label's words, compared without spaces: « Domma g e s | Co l l i s i o n ».
      let taken = 0;
      const found = GUARANTEES.find(([name]) => {
        const wanted = noSpace(name);
        let read = '';
        for (let i = 0; i < parts.length && read.length < wanted.length; i += 1) {
          read += noSpace(plain(parts[i]));
          if (read === wanted) {
            taken = i + 1;
            return true;
          }
        }
        return false;
      });
      if (!found) return null;
      const premium = taken < parts.length ? amount(row.parts.at(-1).text) : null;
      const rest = parts
        .slice(taken, premium ? -1 : undefined)
        .filter((part) => !/^-+$/.test(part));
      // « pour l ' app l i cat i on de cet te garant i e, se référer à l a c l ause 14 ».
      const clause = /clause(\d+)/i.exec(noSpace(rest.join('')));
      const details = clause ? `Voir la clause ${clause[1]}` : rest.join(' ').trim();
      return {
        label: found[1],
        ...(details ? { details } : {}),
        ...(premium ? { premium } : {}),
      };
    })
    .filter(Boolean);
  // The formula chosen on the platform ends every guarantee after the two compulsory ones: « RC »,
  // « BOOST RC », « RC POIDS LOURDS », « DC » (owner, 29/10/2026: RC = responsabilité civile, DC =
  // dommages collision). Kept once, off the guarantees.
  const formula = formulaOf(guarantees);
  if (formula) {
    fields.formula = formula;
    for (const g of guarantees) {
      if (g.details?.endsWith(formula)) {
        const left = g.details.slice(0, -formula.length).trim();
        if (left) g.details = left;
        else delete g.details;
      }
    }
  }
  if (guarantees.length) fields.guarantees = guarantees;

  // --- Attestation (right) ---------------------------------------------------------------
  const rows = right
    .map((row) => ({ row, text: joined(row), compact: noSpace(joined(row)) }))
    .filter((r) => !isReference(r.compact));
  const policyAt = rows.findIndex((r) => /^\d{15}$/.test(r.compact));
  if (policyAt >= 0) {
    set('policyNumber', rows[policyAt].compact);
    // Before the policy: owner name, identity number, address.
    const owner = rows.slice(0, policyAt);
    if (owner[0]) set('holderName', realSpaces(owner[0].text, left));
    const identity = owner.find((r) => /^[A-Z]{1,2}\d{1,8}$/.test(r.compact));
    set('holderIdNumber', identity?.compact);
    // A long address runs on two lines ("… BLOC B" / "HAY ESSAI CASABLANCA").
    const address = owner.filter((r) => r !== owner[0] && r !== identity).map((r) => r.text);
    set('holderAddress', address.join(' ').replace(/\s+/g, ' ').trim());
    // After the policy: intermediary (name and code), plate or chassis, chassis, make and type,
    // body type, trailer.
    const after = rows.slice(policyAt + 1);
    if (after[0]) {
      // The intermediary's name, then its code at the end of the line ("A9999").
      const parts = after[0].row.parts.map((p) => p.text);
      const code = /^[A-Z]\d{3,5}$/.test(noSpace(parts.at(-1))) ? noSpace(parts.pop()) : null;
      set(
        'intermediary',
        [parts.join(' ').replace(/\s+/g, ' ').trim(), code].filter(Boolean).join(' '),
      );
    }
    // A utility vehicle also gets its weight class under the body type ("Inferieur ou egal a
    // 3T500"), a lorry its weight ("7.0 T"); the usage already says it, so the line is skipped and the trailer comes next.
    const vehicle = after.filter(
      (r) =>
        !/DUREE|FERME/i.test(r.text) &&
        !wordDate(r.text) &&
        !/^(inferieur|superieur)/.test(plain(r.compact)) &&
        !/^\d{1,2}(\.\d{1,3})?T(\d{1,3})?$/i.test(r.compact),
    );
    set('registration', vehicle[1]?.text);
    // The chassis line is left out when the vehicle has a plate and no chassis is printed.
    let next = 2;
    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(vehicle[2]?.compact ?? '')) {
      set('vin', vehicle[2].compact);
      next = 3;
    }
    // "RENAULT -": the make, its type left blank by the platform.
    if (vehicle[next]) {
      set(
        'makeAndType',
        realSpaces(vehicle[next].text, left)
          .replace(/[\s-]+$/, '')
          .trim(),
      );
    }
    // A short code such as "2.R" (two-wheeler) or "C. I" is printed letter by letter.
    if (vehicle[next + 1]) set('bodyType', bodyTypeOf(vehicle[next + 1].text));
    set('trailer', vehicle[next + 2]?.text);
    // Only the provisional sheet prints the seats on this half, on the pink form's « Nombre de
    // places » row under the trailer (the full sheet prints them with the vehicle, on the left).
    const seats = vehicle[next + 3]?.compact;
    if (/^\d{1,3}$/.test(seats ?? '') && Number(seats) > 0) set('seats', Number(seats));
  }
  const period = rows.map((r) => wordDate(r.text)).filter(Boolean);
  set('validFrom', period[0] ?? fields.effectDate);
  set('validTo', period[1] ?? fields.endDate);

  for (const key of Object.keys(fields)) if (fields[key] === null) delete fields[key];
  return fields;
}
