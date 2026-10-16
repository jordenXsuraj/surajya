import { hasProfanity, normalise } from '@/lib/moderation';
import moderationWords from '@/lib/moderationWords.json';

import serverWords from '../../../../server/utils/moderationWords.json';

// Same cases as server/tests/moderation.test.js: the app's warning and the server's refusal agree.
describe('hasProfanity()', () => {
  it.each([
    'you are a fucking idiot',
    'fuuuck this',
    'what a b1tch',
    'chutiya hai kya',
    'SHIT happens',
    'sh1tty notes',
    'madarchod',
    'you asshole!',
    'f.u.c.k? no; FUCK.',
    'bhenchod!!',
    'a$$hole',
    'Fück',
    '#bullshit',
  ])('flags %j', (text) => {
    expect(hasProfanity(text)).toBe(true);
  });

  it.each([
    'Scunthorpe United',
    'class assessment tomorrow',
    'I passed the test',
    'cocktail party',
    'Dickens novel',
    'shiitake mushrooms',
    'hello world, C++ notes',
    'grass is green',
    'titanic',
    'assassin creed',
    'Sussex',
    'pass the bass',
    'Hello!!! great post!',
    '4th year CSE, 100% placement',
    '',
    null,
    undefined,
  ])('allows %j', (text) => {
    expect(hasProfanity(text)).toBe(false);
  });

  // Same list as server/tests/moderation.test.js: names and words that only CONTAIN a listed word
  it.each([
    'Shital Patil',
    'Kshitij Deshmukh',
    'Shitanshu',
    'Ashita',
    'Mishita',
    'Randhir Kapoor',
    'Randeep',
    'Mahatma Gandhi Road',
    'Pandurang',
    'Chinali',
    'Lunawat',
    'Lundgren',
    'Bhadwal',
    'Harmanpreet',
    'Haramani',
    'Dhanashri',
    'Pushkar',
    'Kanchan',
    'Sunder',
    'Kulkarni',
    'Laudable work',
    'Analysis',
    'Matsushita',
    'Fukuoka',
    'Hancock',
    'Cockburn',
    'Essex',
    'Penistone',
    'therapist',
    'grasshopper',
    'bassist',
    'Slutsk',
    'Retardant',
    'SHITAL',
    'kshitij',
  ])('a name or word that contains a listed word passes: %j', (text) => {
    expect(hasProfanity(text)).toBe(false);
  });

  it('checks every text it is given (post text, PDF name, tags)', () => {
    expect(hasProfanity('fine', 'also fine')).toBe(false);
    expect(hasProfanity('fine', 'shit')).toBe(true);
  });

  it('normalise() undoes accents, leet digits and stretched letters, but not double letters', () => {
    expect(normalise('Fück')).toBe('fuck');
    expect(normalise('B1TCH')).toBe('bitch');
    expect(normalise('fuuuuck')).toBe('fuck');
    expect(normalise('assess')).toBe('assess');
  });

  it('uses exactly the server list', () => {
    expect(moderationWords.words).toEqual(serverWords.words);
  });
});
