const GVL_CHECK_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function normalizeGvlUrl(value: string | null | undefined) {
  const uuid = value?.match(GVL_CHECK_RE)?.[0].toLowerCase();
  return uuid ? `https://gvlcertcheck.ai/check/${uuid}` : null;
}
