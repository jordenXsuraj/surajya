import type { ComposeValues } from '@/lib/compose';
import { getStorage, readJson, writeJson } from '@/lib/storage';

// The compose form is saved to MMKV on every change so a crash or a killed app never loses it.
// Uploads still in progress are not saved (only finished image / PDF URLs are).
export const DRAFT_KEY = 'compose.draft';

export const EMPTY_DRAFT: ComposeValues = {
  type: 'social', // web default
  text: '',
  anonymous: false,
  todayOnly: false,
  tags: '',
  link: '',
  youtubeUrl: '',
  imageUrl: '',
  pdf: null,
};

export function loadDraft(): ComposeValues {
  const saved = readJson<Partial<ComposeValues>>(DRAFT_KEY);
  return saved ? { ...EMPTY_DRAFT, ...saved } : EMPTY_DRAFT;
}

export function saveDraft(values: ComposeValues): void {
  if (isEmptyDraft(values)) clearDraft();
  else writeJson(DRAFT_KEY, values);
}

export function clearDraft(): void {
  getStorage().remove(DRAFT_KEY);
}

/** Nothing worth keeping (type and toggles alone don't count). */
export function isEmptyDraft(v: ComposeValues): boolean {
  return (
    !v.text.trim() &&
    !v.tags.trim() &&
    !v.link.trim() &&
    !v.youtubeUrl.trim() &&
    !v.imageUrl &&
    !v.pdf
  );
}
