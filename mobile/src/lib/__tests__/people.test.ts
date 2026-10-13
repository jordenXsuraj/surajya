import { peopleParams, SKILL_FILTERS } from '@/lib/people';

describe('Find people query', () => {
  it('has the web skill pills in order', () => {
    expect(SKILL_FILTERS[0]).toBe('All');
    expect(SKILL_FILTERS).toContain('C++');
    expect(SKILL_FILTERS).toHaveLength(13);
  });

  it('sends only what is set, the skill as typed (the server matches it literally)', () => {
    expect(peopleParams({ search: '  ', skill: 'All' }, 1)).toEqual({ page: 1 });
    expect(peopleParams({ search: ' aditi ', skill: 'UI/UX' }, 3)).toEqual({
      page: 3,
      search: 'aditi',
      skill: 'UI/UX',
    });
    expect(peopleParams({ search: '', skill: 'C++' }, 1)).toEqual({ page: 1, skill: 'C++' });
  });
});
