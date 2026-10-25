const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A bare certificate code is allowed only when explicitly entered, never inferred from arbitrary text. */
export function normalizeGvlUrl(value: string | null | undefined, allowBareCode = true) {
  const text = value?.trim();
  if (!text) return null;
  if (allowBareCode && UUID.test(text)) return `https://gvlcertcheck.ai/check/${text.toLowerCase()}`;
  try {
    const url = new URL(text.startsWith('gvlcertcheck.ai/') ? `https://${text}` : text);
    if (!['https:', 'http:'].includes(url.protocol) || !['gvlcertcheck.ai', 'www.gvlcertcheck.ai', 'user.globalvetlink.com'].includes(url.hostname.toLowerCase()) || url.username || url.password || url.port) return null;
    const pattern = url.hostname.toLowerCase() === 'user.globalvetlink.com' ? /^\/gvl2\/check\/([^/]+)\/?$/ : /^\/check\/([^/]+)\/?$/;
    const code = pattern.exec(url.pathname)?.[1];
    return code && UUID.test(code) ? `https://gvlcertcheck.ai/check/${code.toLowerCase()}` : null;
  } catch { return null; }
}
