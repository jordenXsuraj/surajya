// Connect → Find people: the web's filters (Connect.jsx) and the query the server expects.

/** Web SKILL_FILTERS, in the same order. */
export const SKILL_FILTERS = [
  'All',
  'React',
  'Python',
  'ML',
  'Java',
  'DSA',
  'Embedded System',
  'Node.js',
  'C++',
  'VLSI',
  'Flutter',
  'Figma',
  'UI/UX',
] as const;

export type SkillFilter = (typeof SKILL_FILTERS)[number];

/** My college (GET /users) or every college (GET /users/all). */
export type PeopleScope = 'campus' | 'all';

export const PEOPLE_PAGE_SIZE = 20; // fixed on the server

export const SEARCH_DEBOUNCE_MS = 300;

export type PeopleQuery = { search: string; skill: SkillFilter };

/**
 * Query parameters for one page of /users or /users/all, sent as typed: the server matches the
 * search and the skill literally ("C++" finds C++) and uses only their first 50 characters
 * (server/utils/searchText.js).
 */
export function peopleParams({ search, skill }: PeopleQuery, page: number) {
  const params: { page: number; search?: string; skill?: string } = { page };
  const q = search.trim();
  if (q) params.search = q;
  if (skill !== 'All') params.skill = skill;
  return params;
}
