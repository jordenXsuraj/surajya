// The API's xss filter stores user text HTML-escaped (`<` arrives as `&lt;`). Render every
// user-provided string through decodeEntities.

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const hex = entity[1] === 'x' || entity[1] === 'X';
      const code = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return NAMED[entity.toLowerCase()] ?? match;
  });
}

/** Web Avatar initials: first letter of each word, upper-cased, at most 2; '??' without a name. */
export function initials(name: string | null | undefined): string {
  if (!name) return '??';
  return name
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
