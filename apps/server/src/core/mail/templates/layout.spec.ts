import { describe, expect, it } from 'vitest';
import { render, wrapHtml, wrapText } from './layout.js';
import { renderTemplate } from './template.js';

describe('email layout (unit)', () => {
  it('interpolates ${var} placeholders and drops unknown ones', () => {
    expect(render('Hi ${name}, code ${code}${missing}', { name: 'Sam', code: 42 })).toBe(
      'Hi Sam, code 42',
    );
  });

  it('wrapText appends the server footer', () => {
    expect(wrapText('Body.', { domain: 'chat.example', webUrl: 'https://chat.example' })).toBe(
      'Body.\n\n--\nchat.example\nhttps://chat.example\n',
    );
  });

  it('wrapHtml embeds the body and a link back to the web client', () => {
    const html = wrapHtml('<p>Hello</p>', {
      domain: 'chat.example',
      webUrl: 'https://chat.example',
    });
    expect(html).toContain('<p>Hello</p>');
    expect(html).toContain('href="https://chat.example"');
    expect(html.startsWith('<!doctype html>')).toBe(true);
  });

  it('renderTemplate interpolates all three parts and wraps text/html', () => {
    const out = renderTemplate(
      { subject: 'Verify ${email}', text: 'Go to ${url}', html: '<a href="${url}">Verify</a>' },
      { email: 'a@b.co', url: 'https://chat.example/v/abc' },
      { domain: 'chat.example', webUrl: 'https://chat.example' },
    );
    expect(out.subject).toBe('Verify a@b.co');
    expect(out.text).toContain('Go to https://chat.example/v/abc');
    expect(out.text).toContain('--\nchat.example');
    expect(out.html).toContain('<a href="https://chat.example/v/abc">Verify</a>');
  });
});
