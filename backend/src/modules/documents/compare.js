import { canSeeIdentity, displayNameOf } from '../customers/service.js';
import {
  maskIdentityNumber,
  normalizeIdentityNumber,
  normalizeRegistration,
  normalizeVin,
  searchable,
} from '../../utils/identifiers.js';

/**
 * Compares what was typed from an insurer document with what the app records, field by field.
 * Statuses: MATCH; DIFFERENT; MISSING_IN_APP (the app has no value); NOT_ON_CONTRACT (no such
 * vehicle, attestation or cover note on the contract). Nothing is changed here.
 */
const fromDate = (date) => (date ? date.toISOString().slice(0, 10) : null);
const money = (decimal) => (decimal === null || decimal === undefined ? null : decimal.toFixed(2));
/** Letters and digits only: "POL 0001" and "POL-0001" are the same number. */
const compact = (value) =>
  String(value ?? '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toUpperCase();
/** Names match whatever the order and accents: documents often print "NOM Prénom". */
const sameName = (a, b) => {
  const words = (value) => searchable(value).split(' ').filter(Boolean).sort().join(' ');
  return words(a) === words(b);
};

/** Contract fields a document's fields correct (rule: the insurer's document is the proof). */
const CONTRACT_FIELDS = {
  CONDITIONS_PARTICULIERES: {
    effectDate: 'startDate',
    endDate: 'endDate',
    premiumTotal: 'premiumTotal',
  },
  QUITTANCE: { periodFrom: 'startDate', periodTo: 'endDate', premiumTotal: 'premiumTotal' },
};

function check(field, captured, recorded, same, extra = {}) {
  if (captured === undefined || captured === null || captured === '') return null;
  let status;
  if (recorded === null || recorded === undefined || recorded === '') status = 'MISSING_IN_APP';
  else status = same ? 'MATCH' : 'DIFFERENT';
  return { field, status, captured: String(captured), recorded: recorded ?? null, ...extra };
}

/**
 * `contract` is loaded with its customer, its current vehicles (with usage) and its
 * attestations (with series); `auth` decides whether the customer's identity number is shown.
 */
export function compareCapture({ type, fields, contract, auth }) {
  const checks = [];
  const add = (item) => item && checks.push(item);
  const customer = contract.customer;
  const vehicles = contract.vehicles.map((cv) => cv.vehicle);
  const contractValue = {
    policyNumber: contract.policyNumber,
    startDate: fromDate(contract.startDate),
    endDate: fromDate(contract.endDate),
    premiumTotal: money(contract.premiumTotal),
  };

  add(
    check(
      'policyNumber',
      fields.policyNumber,
      contract.policyNumber,
      compact(fields.policyNumber) === compact(contract.policyNumber),
      { apply: 'policyNumber' },
    ),
  );
  for (const [field, target] of Object.entries(CONTRACT_FIELDS[type] ?? {})) {
    add(
      check(field, fields[field], contractValue[target], fields[field] === contractValue[target], {
        apply: target,
      }),
    );
  }

  const customerLink = { link: { kind: 'customer', id: customer.id } };
  add(
    check(
      'holderName',
      fields.holderName,
      displayNameOf(customer),
      sameName(fields.holderName, displayNameOf(customer)),
      customerLink,
    ),
  );
  if (fields.holderIdNumber) {
    const recorded = customer.identityNumber;
    add(
      check(
        'holderIdNumber',
        fields.holderIdNumber,
        canSeeIdentity(auth, customer) ? recorded : maskIdentityNumber(recorded),
        normalizeIdentityNumber(fields.holderIdNumber) === recorded,
        customerLink,
      ),
    );
  }

  // The vehicle named by the document: found on the contract by its plate.
  let vehicle = null;
  if (fields.registration) {
    const { key } = normalizeRegistration(fields.registration);
    vehicle = vehicles.find((v) => v.registrationKey === key) ?? null;
    checks.push({
      field: 'registration',
      status: vehicle ? 'MATCH' : 'NOT_ON_CONTRACT',
      captured: fields.registration,
      recorded: vehicle
        ? vehicle.registration
        : vehicles.map((v) => v.registration).join(', ') || null,
      ...(vehicle ? { link: { kind: 'vehicle', id: vehicle.id } } : {}),
    });
  } else if (vehicles.length === 1) {
    vehicle = vehicles[0];
  }
  if (vehicle) {
    const vehicleLink = { link: { kind: 'vehicle', id: vehicle.id } };
    add(
      check('vin', fields.vin, vehicle.vin, normalizeVin(fields.vin) === vehicle.vin, vehicleLink),
    );
    add(
      check(
        'usage',
        fields.usage,
        vehicle.usage?.label,
        searchable(fields.usage) === searchable(vehicle.usage?.label),
        vehicleLink,
      ),
    );
    add(
      check(
        'seats',
        fields.seats,
        vehicle.seats === null ? null : String(vehicle.seats),
        Number(fields.seats) === vehicle.seats,
        vehicleLink,
      ),
    );
  }

  // The attestation itself: its series and number recorded on the contract.
  if (fields.seriesCode && fields.number) {
    const attestation = contract.attestations.find(
      (a) => !a.cancelledAt && a.series.code === fields.seriesCode && a.number === fields.number,
    );
    checks.push({
      field: 'attestation',
      status: attestation ? 'MATCH' : 'NOT_ON_CONTRACT',
      captured: `${fields.seriesCode} n° ${fields.number}`,
      recorded: attestation ? `${attestation.series.code} n° ${attestation.number}` : null,
      link: { kind: 'attestations', id: contract.id },
    });
    if (attestation) {
      for (const [field, value] of [
        ['validFrom', fromDate(attestation.validFrom)],
        ['validTo', fromDate(attestation.validTo)],
      ]) {
        add(check(field, fields[field], value, fields[field] === value));
      }
    }
  }
  if (fields.coverNoteNumber) {
    const withNote = contract.attestations.find(
      (a) => !a.cancelledAt && compact(a.coverNoteRef) === compact(fields.coverNoteNumber),
    );
    checks.push({
      field: 'coverNoteNumber',
      status: withNote ? 'MATCH' : 'NOT_ON_CONTRACT',
      captured: fields.coverNoteNumber,
      recorded: withNote ? withNote.coverNoteRef : null,
      link: { kind: 'attestations', id: contract.id },
    });
  }
  return checks;
}
