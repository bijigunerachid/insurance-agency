import { describe, expect, it } from 'vitest';
import { recordRemittanceBody } from '../../src/modules/remittances/schemas.js';
import { remittanceDueOn } from '../../src/modules/remittances/service.js';

describe('remittance due date (rule L5)', () => {
  it('is the 15th of the month after the month of collection', () => {
    expect(remittanceDueOn('2026-10')).toBe('2026-11-15');
    expect(remittanceDueOn('2026-01')).toBe('2026-02-15');
  });

  it('moves to January of the next year for December', () => {
    expect(remittanceDueOn('2026-12')).toBe('2027-01-15');
  });
});

describe('remittance request', () => {
  const body = {
    insurerId: '6f1c1f9e-3f53-4c43-9a0e-0d3c7d0d2b11',
    collectedUntil: '2026-10-31',
    expectedAmount: '1 234,50',
    method: 'CASH',
    remittedOn: '2026-11-05',
    idempotencyKey: '0b6f4c6e-4f8a-4b8e-9d8e-2a1d3c4b5e6f',
  };

  it('reads the amount as typed in French and needs no reference for cash', () => {
    expect(recordRemittanceBody.parse(body)).toMatchObject({ expectedAmount: '1234.50' });
  });

  it('needs a reference for every other method', () => {
    for (const method of ['TRANSFER', 'CHEQUE', 'PLATFORM', 'OTHER']) {
      const result = recordRemittanceBody.safeParse({ ...body, method });
      expect(result.success).toBe(false);
      expect(result.error.issues[0]).toMatchObject({ path: ['reference'], message: 'REQUIRED' });
    }
  });

  it('refuses an unknown method or a malformed amount', () => {
    expect(recordRemittanceBody.safeParse({ ...body, method: 'CARD' }).success).toBe(false);
    expect(recordRemittanceBody.safeParse({ ...body, expectedAmount: '12,345' }).success).toBe(
      false,
    );
  });
});
