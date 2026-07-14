import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('field photo privacy architecture gate', () => {
  it('does not mount field photo services or evidence in Customer Portal', async () => {
    const customerPortalSource = await readFile('src/components/CustomerPortal.jsx', 'utf8');

    expect(customerPortalSource).not.toMatch(/FieldPhotoEvidence|fieldPhotoService|fieldPhotos|field-photos/);
  });
});
