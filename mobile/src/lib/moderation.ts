import moderationWords from '@/lib/moderationWords.json';

// Basic profanity filter (App Store guideline 1.2). The server refuses posts and replies with these
// words (server/utils/moderation.js, 400 `PROFANITY`); the app warns before sending, with the same
// list (moderationWords.json) and the same rules: whole words only, so "Scunthorpe", "class" or
// "assess" never match, after undoing a few disguises (accents, leet digits, "fuuuck").

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};
const ENDINGS = '(?:s|es|ed|er|ers|ing|in|y|ty)?';
const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERN = new RegExp(
  `(?:^|[^a-z])(?:${moderationWords.words.map(escape).join('|')})${ENDINGS}(?![a-z])`,
  'i',
);

export const PROFANITY_POST = 'Please remove offensive language before posting.';
export const PROFANITY_REPLY = 'Please remove offensive language before replying.';

function stripAccents(text: string): string {
  try {
    return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); // é → e
  } catch {
    return text; // an engine without normalize(): the server still checks
  }
}

export function normalise(text: string | null | undefined): string {
  return stripAccents(String(text ?? ''))
    .toLowerCase()
    .replace(/[013457@$]/g, (c) => LEET[c] ?? c)
    .replace(/([a-z])\1{2,}/g, '$1'); // fuuuck → fuck (3+ repeats only: "assess" keeps its ss)
}

/** True when any of the texts contains a word from the list. */
export function hasProfanity(...texts: (string | null | undefined)[]): boolean {
  return texts.some((t) => PATTERN.test(normalise(t)));
}
