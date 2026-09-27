import { Parser } from 'htmlparser2';

export interface ParsedMetadata {
  title: string | null;
  description: string | null;
  siteName: string | null;
  /** Resolved against `baseUrl`; `null` if absent or unparseable. */
  imageUrl: string | null;
}

/**
 * Extracts Open Graph / Twitter Card / plain `<title>` and
 * `<meta name=description>` metadata from an HTML document (technical.md
 * §S10), with a streaming parser (`htmlparser2`) rather than loading a DOM.
 * `og:*` wins over `twitter:*`, which wins over the plain tags.
 */
export function parseHtmlMetadata(html: string, baseUrl: string): ParsedMetadata {
  let ogTitle: string | null = null;
  let ogDescription: string | null = null;
  let ogSiteName: string | null = null;
  let ogImage: string | null = null;
  let twitterTitle: string | null = null;
  let twitterDescription: string | null = null;
  let twitterImage: string | null = null;
  let plainDescription: string | null = null;
  let titleText = '';
  let inTitle = false;

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (name === 'title') {
          inTitle = true;
          return;
        }
        if (name !== 'meta') {
          return;
        }
        const content = attribs.content?.trim();
        if (!content) {
          return;
        }
        const property = attribs.property?.toLowerCase();
        const nameAttr = attribs.name?.toLowerCase();
        switch (property) {
          case 'og:title':
            ogTitle = content;
            break;
          case 'og:description':
            ogDescription = content;
            break;
          case 'og:site_name':
            ogSiteName = content;
            break;
          case 'og:image':
            ogImage = content;
            break;
        }
        switch (nameAttr) {
          case 'twitter:title':
            twitterTitle = content;
            break;
          case 'twitter:description':
            twitterDescription = content;
            break;
          case 'twitter:image':
            twitterImage = content;
            break;
          case 'description':
            plainDescription = content;
            break;
        }
      },
      ontext(text) {
        if (inTitle) {
          titleText += text;
        }
      },
      onclosetag(name) {
        if (name === 'title') {
          inTitle = false;
        }
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();

  const rawImage = ogImage ?? twitterImage;
  const imageUrl = rawImage ? resolveUrl(rawImage, baseUrl) : null;
  const title = ogTitle ?? twitterTitle ?? (titleText.trim() || null);

  return {
    title,
    description: ogDescription ?? twitterDescription ?? plainDescription,
    siteName: ogSiteName,
    imageUrl,
  };
}

function resolveUrl(url: string, baseUrl: string): string | null {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return null;
  }
}
