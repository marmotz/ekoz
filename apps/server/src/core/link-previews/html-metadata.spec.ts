import { describe, expect, it } from 'vitest';
import { parseHtmlMetadata } from './html-metadata.js';

describe('parseHtmlMetadata', () => {
  it('prefers Open Graph tags over Twitter tags and the plain title', () => {
    const html = `<html><head>
      <title>Plain title</title>
      <meta name="description" content="Plain description">
      <meta name="twitter:title" content="Twitter title">
      <meta name="twitter:description" content="Twitter description">
      <meta name="twitter:image" content="/twitter.png">
      <meta property="og:title" content="OG title">
      <meta property="og:description" content="OG description">
      <meta property="og:site_name" content="Example">
      <meta property="og:image" content="/og.png">
    </head></html>`;

    const result = parseHtmlMetadata(html, 'https://example.com/page');
    expect(result).toEqual({
      title: 'OG title',
      description: 'OG description',
      siteName: 'Example',
      imageUrl: 'https://example.com/og.png',
    });
  });

  it('falls back to Twitter tags, then the plain title and meta description', () => {
    const html = `<html><head>
      <title>Plain title</title>
      <meta name="description" content="Plain description">
      <meta name="twitter:title" content="Twitter title">
      <meta name="twitter:description" content="Twitter description">
      <meta name="twitter:image" content="https://cdn.example.com/twitter.png">
    </head></html>`;

    const result = parseHtmlMetadata(html, 'https://example.com/page');
    expect(result).toEqual({
      title: 'Twitter title',
      description: 'Twitter description',
      siteName: null,
      imageUrl: 'https://cdn.example.com/twitter.png',
    });
  });

  it('falls back to the plain <title> and meta description with no image', () => {
    const html = '<html><head><title>Just a title</title></head><body></body></html>';

    const result = parseHtmlMetadata(html, 'https://example.com/page');
    expect(result).toEqual({
      title: 'Just a title',
      description: null,
      siteName: null,
      imageUrl: null,
    });
  });

  it('returns all nulls for a page with no relevant metadata', () => {
    const html = '<html><head></head><body>hello</body></html>';

    const result = parseHtmlMetadata(html, 'https://example.com/page');
    expect(result).toEqual({ title: null, description: null, siteName: null, imageUrl: null });
  });

  it('resolves a relative image URL against the base URL', () => {
    const html = '<meta property="og:image" content="images/preview.jpg">';

    const result = parseHtmlMetadata(html, 'https://example.com/blog/post');
    expect(result.imageUrl).toBe('https://example.com/blog/images/preview.jpg');
  });
});
