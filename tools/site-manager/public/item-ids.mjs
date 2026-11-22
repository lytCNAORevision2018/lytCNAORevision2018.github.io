export function createItemId(sectionKey) {
  return `${sectionKey.toLowerCase()}-${crypto.randomUUID()}`;
}

export function normalizeLegacyItemIds(content) {
  const items = content?.outsideResearch;
  if (!Array.isArray(items) || !items.some((item) => /^outsideResearch-[a-z0-9]+$/.test(item?.id))) return content;
  const normalized = structuredClone(content);
  for (const item of normalized.outsideResearch) {
    if (/^outsideResearch-[a-z0-9]+$/.test(item?.id)) item.id = item.id.toLowerCase();
  }
  return normalized;
}
