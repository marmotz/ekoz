import { describe, expect, it } from 'vitest';
import { parseUploadMetadata, sanitizeFilename } from './tus-headers.js';

describe('parseUploadMetadata', () => {
  it('parses a single key/value pair', () => {
    const header = `filename ${Buffer.from('a.png').toString('base64')}`;
    expect(parseUploadMetadata(header)).toEqual({ filename: 'a.png' });
  });

  it('parses several comma-separated pairs', () => {
    const header = [
      `filename ${Buffer.from('a.png').toString('base64')}`,
      `type ${Buffer.from('image/png').toString('base64')}`,
    ].join(',');
    expect(parseUploadMetadata(header)).toEqual({ filename: 'a.png', type: 'image/png' });
  });

  it('a bare key with no value maps to an empty string', () => {
    expect(parseUploadMetadata('is_extension_upload')).toEqual({ is_extension_upload: '' });
  });

  it('returns an empty object for an undefined header', () => {
    expect(parseUploadMetadata(undefined)).toEqual({});
  });

  it('tolerates surrounding whitespace around pairs', () => {
    const header = `  filename ${Buffer.from('a.png').toString('base64')} , type ${Buffer.from('image/png').toString('base64')}  `;
    expect(parseUploadMetadata(header)).toEqual({ filename: 'a.png', type: 'image/png' });
  });
});

describe('sanitizeFilename', () => {
  it('keeps a plain filename as is', () => {
    expect(sanitizeFilename('report.pdf')).toBe('report.pdf');
  });

  it('strips a POSIX path down to the basename', () => {
    expect(sanitizeFilename('/etc/passwd')).toBe('passwd');
  });

  it('strips a Windows-style path down to the basename', () => {
    expect(sanitizeFilename('C:\\Users\\alice\\report.pdf')).toBe('report.pdf');
  });

  it('normalises to NFC', () => {
    // "é" as e + combining acute accent (NFD) vs the precomposed NFC form.
    const nfd = 'caf\u0065\u0301.txt';
    expect(sanitizeFilename(nfd)).toBe('café.txt');
  });

  it('caps the length at 255 characters', () => {
    const long = `${'a'.repeat(300)}.txt`;
    expect(sanitizeFilename(long).length).toBe(255);
  });

  it('throws for a name that is empty after sanitisation', () => {
    expect(() => sanitizeFilename('  ')).toThrow();
    expect(() => sanitizeFilename('/')).toThrow();
  });
});
