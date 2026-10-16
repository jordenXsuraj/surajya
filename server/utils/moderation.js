// Basic profanity filter for posts and replies (App Store guideline 1.2: a method for filtering
// objectionable material). The server is the authority; the app warns with the same list before
// sending (mobile/src/lib/moderation.ts). Whole words only, so "Scunthorpe", "class" or "assess"
// never match; a few disguises are undone first (leet digits, stretched letters like "fuuuck").
const { words } = require('./moderationWords.json')

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' }
const ENDINGS = '(?:s|es|ed|er|ers|ing|in|y|ty)?'
const escape = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const PATTERN = new RegExp(`(?:^|[^a-z])(?:${words.map(escape).join('|')})${ENDINGS}(?![a-z])`, 'i')

function normalise(text) {
  return String(text ?? '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '') // é → e
    .toLowerCase()
    .replace(/[013457@$]/g, (c) => LEET[c] ?? c)
    .replace(/([a-z])\1{2,}/g, '$1') // fuuuck → fuck (3+ repeats only: "assess" keeps its ss)
}

/** True when any of the texts contains a word from the list. */
function hasProfanity(...texts) {
  return texts.some((t) => PATTERN.test(normalise(t)))
}

const PROFANITY = { code: 'PROFANITY', message: 'Please remove offensive language before posting.' }

module.exports = { hasProfanity, normalise, PROFANITY }
