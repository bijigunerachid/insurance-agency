import { z } from 'zod';
import { normalizeRegistration, normalizeVin } from '../../utils/identifiers.js';
import { paginationFields } from '../../utils/pagination.js';

export const CATEGORIES = [
  'CAR',
  'MOTORCYCLE',
  'TAXI',
  'PASSENGER_TRANSPORT',
  'COMMERCIAL',
  'TRIPORTEUR',
];

export const idParams = z.strictObject({ id: z.uuid() });

export const listVehiclesQuery = z.strictObject({
  q: z.string().trim().max(80).optional(),
  category: z.enum(CATEGORIES).optional(),
  customerId: z.uuid().optional(),
  fleetId: z.uuid().optional(),
  archived: z.enum(['exclude', 'include', 'only']).default('exclude'),
  /** The workspace chosen after sign-in: vehicles with a contract there, or with none. */
  insurerId: z.uuid().optional(),
  ...paginationFields,
});

const blankToNull = (value) => (typeof value === 'string' && value.trim() === '' ? null : value);
const isSet = (value) => value !== null && value !== undefined;
const optional = (schema) => z.preprocess(blankToNull, schema.nullable().optional());
const integer = (min, max) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() !== '' ? Number(value) : blankToNull(value),
    z.int().min(min).max(max).nullable().optional(),
  );

const registration = z
  .string()
  .max(30)
  .transform((value, ctx) => {
    const { display, key } = normalizeRegistration(value);
    if (key.length < 3 || key.length > 20 || display.length > 20) {
      ctx.addIssue({ code: 'custom', message: 'INVALID_REGISTRATION' });
    }
    return display;
  });

const fields = {
  make: z.string().trim().min(1).max(40),
  // Optional: the RMA platform sheet prints the make alone (owner, 29/10/2026).
  model: optional(z.string().trim().min(1).max(60)),
  firstRegistrationDate: optional(z.iso.date()),
  vin: optional(
    z
      .string()
      .max(30)
      .transform(normalizeVin)
      .pipe(z.string().regex(/^[A-Z0-9]{5,25}$/, 'INVALID_VIN')),
  ),
  fiscalPowerCv: integer(1, 100),
  engineCc: integer(1, 20000),
  seats: integer(1, 100),
  fuel: optional(z.enum(['PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID', 'OTHER'])),
  taxiType: optional(z.enum(['PETIT', 'GRAND'])),
  passengerTransportKind: optional(z.enum(['TOURISTIQUE', 'PERSONNEL', 'SCOLAIRE', 'AUTOCAR'])),
  fleetId: optional(z.uuid()),
  /** Attestation usage (rule L16); must be a confirmed, active usage of the catalogue. */
  usageId: optional(z.uuid()),
  /** The insurer's own usage (RMA GAMA list); it sets the usage above. */
  insurerUsageId: optional(z.uuid()),
};

/**
 * Rules per category. Only legal requirements are enforced (rule L14): seats for paid
 * passenger transport; for two-wheelers the fiscal power or the cylindrée (art. 123 only needs the
 * CV for a cover below 50 million DH, and the RMA sheet of a moped prints its cylindrée: owner,
 * 29/10/2026). Other fields stay optional.
 */
export function categoryIssues(vehicle, { today }) {
  const issues = [];
  const add = (path, message) => issues.push({ path: [path], message });
  if (['TAXI', 'PASSENGER_TRANSPORT'].includes(vehicle.category) && !isSet(vehicle.seats)) {
    add('seats', 'REQUIRED');
  }
  if (
    vehicle.category === 'MOTORCYCLE' &&
    !isSet(vehicle.fiscalPowerCv) &&
    !isSet(vehicle.engineCc)
  ) {
    add('fiscalPowerCv', 'REQUIRED');
    add('engineCc', 'REQUIRED');
  }
  if (isSet(vehicle.taxiType) && vehicle.category !== 'TAXI') add('taxiType', 'NOT_FOR_CATEGORY');
  if (isSet(vehicle.passengerTransportKind) && vehicle.category !== 'PASSENGER_TRANSPORT') {
    add('passengerTransportKind', 'NOT_FOR_CATEGORY');
  }
  const date = vehicle.firstRegistrationDate;
  if (isSet(date) && (date < '1900-01-01' || date > today))
    add('firstRegistrationDate', 'INVALID_DATE');
  return issues;
}

export const createVehicleBody = z.strictObject({
  ownerId: z.uuid(),
  registration,
  category: z.enum(CATEGORIES),
  ...fields,
});

/** The owner cannot change here (a transfer will be its own action, with history). */
export const updateVehicleBody = z.strictObject({
  registration: registration.optional(),
  category: z.enum(CATEGORIES).optional(),
  make: fields.make.optional(),
  model: fields.model.optional(),
  firstRegistrationDate: fields.firstRegistrationDate,
  vin: fields.vin,
  fiscalPowerCv: fields.fiscalPowerCv,
  engineCc: fields.engineCc,
  seats: fields.seats,
  fuel: fields.fuel,
  taxiType: fields.taxiType,
  passengerTransportKind: fields.passengerTransportKind,
  fleetId: fields.fleetId,
  usageId: fields.usageId,
  insurerUsageId: fields.insurerUsageId,
  version: z.int().min(1),
});

export const archiveBody = z.strictObject({
  reason: z.string().trim().min(5).max(200),
  version: z.int().min(1),
});

export const restoreBody = z.strictObject({ version: z.int().min(1) });

export const listFleetsQuery = z.strictObject({ customerId: z.uuid() });

export const createFleetBody = z.strictObject({
  customerId: z.uuid(),
  name: z.string().trim().min(1).max(80),
});

export const renameFleetBody = z.strictObject({
  name: z.string().trim().min(1).max(80),
  version: z.int().min(1),
});
