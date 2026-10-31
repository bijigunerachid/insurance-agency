import { describe, expect, it } from 'vitest';
import { memoryLogger } from '../helpers.js';

describe('logger redaction', () => {
  it('removes passwords, tokens, CIN and headers from log lines', () => {
    const { logger, lines } = memoryLogger();
    logger.info(
      {
        password: 'hunter2-password',
        token: 'tok-123456',
        user: { cin: 'AB123456', password: 'nested-password' },
        req: { headers: { cookie: '__Host-session=abc' } },
      },
      'event',
    );
    const output = lines.join('');
    for (const secret of ['hunter2-password', 'tok-123456', 'AB123456', 'nested-password', 'abc']) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain('[redacted]');
  });
});
