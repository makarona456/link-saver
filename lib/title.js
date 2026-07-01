const FETCH_TIMEOUT_MS = 8000;

// Fetch a page and pull out its <title>. This is best-effort: any failure
// (network error, timeout, non-HTML, missing title) falls back to the
// hostname so saving a link never fails just because the title is unknown.
export async function fetchPageTitle(url) {
  const hostnameFallback = safeHostname(url);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'LinkSaver/1.0 (+https://example.com)' },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) return hostnameFallback;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return hostnameFallback;

    const html = await response.text();
    return extractTitle(html) || hostnameFallback;
  } catch {
    // DNS failure, refused connection, timeout, etc. — keep the fallback.
    return hostnameFallback;
  }
}

// Tolerant <title> parse: case-insensitive, allows attributes on the tag,
// and spans newlines (the [\s\S] trick, since JS regex has no dotall by default).
function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  return decodeEntities(match[1]).replace(/\s+/g, ' ').trim() || null;
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
