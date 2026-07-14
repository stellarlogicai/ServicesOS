import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCsv, csvFileName, csvValue, downloadCsv, escapeCsvValue } from '../utils/csvExport';

describe('csvExport', () => {
  it('creates a header row and escapes commas, quotes, and line breaks', () => {
    const csv = createCsv(
      [{ key: 'name', label: 'Name' }, { key: 'note', label: 'Note' }],
      [{ name: 'Aunt B, Cleaning', note: 'She said "hello"\nand left a note.' }],
    );

    expect(csv).toBe('Name,Note\r\n"Aunt B, Cleaning","She said ""hello""\nand left a note."');
  });

  it('uses blank values for null and undefined while safely serializing arrays and objects', () => {
    expect(csvValue(null)).toBe('');
    expect(csvValue(undefined)).toBe('');
    expect(csvValue(['cash', 'check'])).toBe('["cash","check"]');
    expect(csvValue({ payment: 'manual' })).toBe('{"payment":"manual"}');
    expect(escapeCsvValue({ payment: 'manual' })).toBe('"{""payment"":""manual""}"');
  });

  it('converts Date and Firestore Timestamp-like values to ISO text', () => {
    const date = new Date('2026-07-13T12:00:00.000Z');
    expect(csvValue(date)).toBe('2026-07-13T12:00:00.000Z');
    expect(csvValue({ toDate: () => date })).toBe('2026-07-13T12:00:00.000Z');
    expect(csvValue({ seconds: 1783944000, nanoseconds: 0 })).toBe('2026-07-13T12:00:00.000Z');
  });

  it('builds date-stamped ServicesOS filenames', () => {
    expect(csvFileName('customers', new Date('2026-07-13T12:00:00.000Z')))
      .toBe('servicesos-customers-2026-07-13.csv');
  });

  it('triggers a browser CSV download and cleans up the temporary URL', () => {
    const createObjectURL = vi.fn(() => 'blob:servicesos-export');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadCsv('name\r\nAunt B', 'servicesos-customers-2026-07-13.csv');

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:servicesos-export');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
