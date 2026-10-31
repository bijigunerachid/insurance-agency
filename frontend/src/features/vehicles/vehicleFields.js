/**
 * Technical fields shown for each category. Required ones follow the law only (rule L14):
 * seats for paid passenger transport; the fiscal power or the cylindrée for two-wheelers (the RMA
 * sheet of a moped prints only its cylindrée). The server checks again.
 */
export const CATEGORY_FIELDS = {
  CAR: ['fiscalPowerCv', 'fuel', 'seats', 'firstRegistrationDate', 'vin'],
  MOTORCYCLE: ['fiscalPowerCv', 'engineCc', 'firstRegistrationDate', 'vin'],
  TAXI: ['taxiType', 'seats', 'fuel', 'fiscalPowerCv', 'firstRegistrationDate', 'vin'],
  PASSENGER_TRANSPORT: [
    'passengerTransportKind',
    'seats',
    'fuel',
    'fiscalPowerCv',
    'firstRegistrationDate',
    'vin',
  ],
  COMMERCIAL: ['fiscalPowerCv', 'fuel', 'seats', 'firstRegistrationDate', 'vin'],
  TRIPORTEUR: ['engineCc', 'fiscalPowerCv', 'firstRegistrationDate', 'vin'],
};

export const REQUIRED_FIELDS = {
  TAXI: ['seats'],
  PASSENGER_TRANSPORT: ['seats'],
};

/** One of these is required: both are marked until one is filled. */
export const REQUIRED_ONE_OF = {
  MOTORCYCLE: ['fiscalPowerCv', 'engineCc'],
};

export const TECHNICAL_FIELDS = [
  'fiscalPowerCv',
  'engineCc',
  'seats',
  'fuel',
  'taxiType',
  'passengerTransportKind',
  'firstRegistrationDate',
  'vin',
];
