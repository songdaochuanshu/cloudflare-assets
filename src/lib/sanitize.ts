import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote',
  'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'span', 'div', 'hr',
];

const ALLOWED_ATTR = [
  'href', 'src', 'alt', 'title', 'class', 'id',
  'target', 'rel', 'width', 'height',
];

const ALLOWED_SCHEMES = ['http', 'https', 'mailto'];

/**
 * Sanitize HTML to prevent XSS attacks.
 * Only allows safe tags and attributes commonly used in blog content.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: new RegExp(`^(${ALLOWED_SCHEMES.join('|')}):`),
    // Force all links to open in new tab safely
    ADD_ATTR: ['target'],
    FORCE_BODY: false,
  });
}

/**
 * Sanitize a single image URL — strip dangerous protocols and params.
 */
export function sanitizeUrl(url: string): string {
  const clean = DOMPurify.sanitize(url, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  // Only allow safe CDN/image domains
  const allowedDomains = ['img-homepage.openservec loud', 'pub-', 'r2.dev', 'cloudflare.com'];
  try {
    const { hostname } = new URL(url.startsWith('http') ? url : `https://${url}`);
    const isAllowed = allowedDomains.some(d => hostname.includes(d));
    if (!isAllowed) return '';
  } catch {
    return '';
  }
  return clean;
}

/**
 * Strip all HTML tags, leaving only text content.
 * Useful for generating plain-text excerpts.
 */
export function stripHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
    .replace(/\s+/g, ' ')
    .trim();
}
