import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ConfigError } from '../../src/config/env.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { requestContext } from '../../src/middleware/requestContext.js';
import { workspacesRoutes } from '../../src/modules/workspaces/routes.js';
import { memoryLogger, testConfig } from '../helpers.js';

// Synthetic images: only the first bytes are checked.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 5, 6, 7, 8]);

/** A branding folder with the JSON file and the images it names. */
function folder(json, images = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'insurer-branding-'));
  for (const [name, bytes] of Object.entries(images)) writeFileSync(join(dir, name), bytes);
  const file = join(dir, 'insurers.json');
  writeFileSync(file, typeof json === 'string' ? json : JSON.stringify(json));
  return file;
}
const load = (file) => testConfig({ INSURER_BRANDING_FILE: file });
const refused = (file) => {
  try {
    load(file);
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigError);
    return err.message;
  }
  throw new Error('accepted');
};

describe('insurer branding settings', () => {
  it('reads the colour, the texts and the images of each insurer code', () => {
    const config = load(
      folder(
        {
          RMA: { tagline: 'Assurance automobile', colour: '#272f65', logo: 'rma.png' },
          CAT: { title: 'CAT', photo: 'cat.jpg', photoCredit: 'Photo X, CC BY 4.0' },
        },
        { 'rma.png': PNG, 'cat.jpg': JPEG },
      ),
    );
    expect(config.INSURER_BRANDING.RMA).toMatchObject({
      title: null,
      tagline: 'Assurance automobile',
      colour: '#272F65',
      photo: null,
      logo: { type: 'image/png' },
    });
    expect(config.INSURER_BRANDING.CAT).toMatchObject({
      title: 'CAT',
      photoCredit: 'Photo X, CC BY 4.0',
      photo: { type: 'image/jpeg' },
    });
    expect(testConfig().INSURER_BRANDING).toBeNull();
  });

  it('refuses a broken file, naming the setting and the entry, never the content', () => {
    expect(refused(join(tmpdir(), 'absent-insurers.json'))).toMatch(
      /INSURER_BRANDING_FILE: file not found/,
    );
    expect(refused(folder('{ pas du json'))).toMatch(/INSURER_BRANDING_FILE: not valid JSON/);
    expect(refused(folder({ RMA: { colour: 'navy' } }))).toMatch(/RMA\.colour/);
    expect(refused(folder({ RMA: { colour: '#000000', extra: 1 } }))).toMatch(/RMA/);
    expect(refused(folder({ 'rma lower': {} }))).toMatch(/INSURER_BRANDING_FILE/);
    // Only a file of the same folder: no path to elsewhere on the server.
    expect(refused(folder({ RMA: { logo: '../../etc/logo.png' } }))).toMatch(/RMA\.logo/);
    expect(refused(folder({ RMA: { logo: 'logo.svg' } }))).toMatch(/RMA\.logo/);
    expect(refused(folder({ RMA: { logo: 'absent.png' } }))).toMatch(
      /INSURER_BRANDING_FILE RMA\.logo: file not found/,
    );
    // Named .png, but a script inside: refused by its content.
    const message = refused(
      folder({ CAT: { photo: 'cat.png' } }, { 'cat.png': Buffer.from('<svg onload="x()"/>') }),
    );
    expect(message).toMatch(/CAT\.photo: must be a PNG or JPEG image/);
    expect(message).not.toContain('onload');
  });
});

describe('workspace cards and images', () => {
  const insurers = [
    { id: '00000000-0000-4000-8000-000000000001', code: 'CAT', name: 'CAT Assurance' },
    { id: '00000000-0000-4000-8000-000000000002', code: 'RMA', name: 'RMA' },
  ];
  const server = (config) => {
    const app = express();
    app.use(requestContext(memoryLogger().logger));
    const prisma = { insurer: { findMany: async () => insurers } };
    // Signed in: the real guard is covered by the integration tests.
    const guards = { requireActive: (req, res, next) => next() };
    app.use('/api', workspacesRoutes({ prisma, config, guards }));
    app.use(errorHandler);
    return app;
  };

  it('dresses the cards from the settings and sends the checked images', async () => {
    const config = load(
      folder(
        { RMA: { colour: '#272F65', logo: 'rma.png', photoCredit: 'Sans photo' } },
        { 'rma.png': PNG },
      ),
    );
    const app = server(config);
    const cards = (await request(app).get('/api/workspaces')).body.items;
    expect(cards[0]).toMatchObject({ code: 'CAT', title: 'CAT Assurance', colour: null });
    // A credit without a photo is not shown.
    expect(cards[1]).toMatchObject({ code: 'RMA', colour: '#272F65', logo: true, photo: false });
    expect(cards[1].photoCredit).toBeNull();

    const logo = await request(app).get('/api/workspaces/RMA/logo');
    expect(logo.status).toBe(200);
    expect(logo.headers['content-type']).toBe('image/png');
    expect(logo.headers['cache-control']).toBe('private, max-age=3600');
    expect(Buffer.compare(logo.body, PNG)).toBe(0);
    for (const path of ['RMA/photo', 'CAT/logo', 'RMA/icon', 'rma/logo', '..%2Fx/logo']) {
      expect((await request(app).get(`/api/workspaces/${path}`)).status, path).toBe(404);
    }
  });
});
