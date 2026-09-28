import { describe, expect, it } from 'vitest';
import { contentDispositionFor, parseRange } from './files-http.js';

describe('contentDispositionFor', () => {
  it('is inline for image types', () => {
    expect(contentDispositionFor('image/png', 'a.png')).toBe('inline');
  });

  it('is attachment for SVG (never inline, XSS risk)', () => {
    expect(contentDispositionFor('image/svg+xml', 'a.svg')).toContain('attachment');
  });

  it('is inline for audio and video', () => {
    expect(contentDispositionFor('audio/mpeg', 'a.mp3')).toBe('inline');
    expect(contentDispositionFor('video/mp4', 'a.mp4')).toBe('inline');
  });

  it('is attachment for PDF (downloads instead of opening in the browser)', () => {
    expect(contentDispositionFor('application/pdf', 'a.pdf')).toBe(
      "attachment; filename*=UTF-8''a.pdf",
    );
  });

  it('is attachment with an encoded filename for everything else', () => {
    const result = contentDispositionFor('application/zip', 'my file.zip');
    expect(result).toBe("attachment; filename*=UTF-8''my%20file.zip");
  });

  it('falls back to a default name when none is given', () => {
    expect(contentDispositionFor('application/zip', undefined)).toContain('download');
  });
});

describe('parseRange', () => {
  const size = 1000;

  it('parses a bounded range', () => {
    expect(parseRange('bytes=0-99', size)).toEqual({ start: 0, end: 99 });
  });

  it('parses an open-ended range', () => {
    expect(parseRange('bytes=900-', size)).toEqual({ start: 900, end: 999 });
  });

  it('parses a suffix range', () => {
    expect(parseRange('bytes=-100', size)).toEqual({ start: 900, end: 999 });
  });

  it('rejects a malformed header', () => {
    expect(parseRange('bogus', size)).toBeNull();
    expect(parseRange('bytes=-', size)).toBeNull();
  });

  it('rejects an unsatisfiable range', () => {
    expect(parseRange('bytes=2000-3000', size)).toBeNull();
    expect(parseRange('bytes=500-100', size)).toBeNull();
  });

  it('rejects a multi-range request', () => {
    expect(parseRange('bytes=0-10,20-30', size)).toBeNull();
  });
});
