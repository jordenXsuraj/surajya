import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { getSuggestions, searchPeople } from '@/api/endpoints/users';
import { queryKeys } from '@/api/queryKeys';
import { PEOPLE_PAGE_SIZE, SEARCH_DEBOUNCE_MS, type PeopleScope, type SkillFilter } from '@/lib/people';

/** `value`, but only after it stopped changing for `ms` (the web's 300 ms search debounce). */
export function useDebounced<T>(value: T, ms: number = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** Connect → Find people: one infinite list per scope + search + skill, 20 per page. */
export function usePeopleSearch(scope: PeopleScope, search: string, skill: SkillFilter) {
  const q = search.trim();
  const query = useInfiniteQuery({
    queryKey: queryKeys.peopleSearch(scope, q, skill),
    queryFn: ({ pageParam }) => searchPeople(scope, { search: q, skill }, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, all) => (last.length < PEOPLE_PAGE_SIZE ? undefined : all.length + 1),
    staleTime: 60_000,
  });
  // A student can move between pages while scrolling (new sign-ups): show each once.
  const people = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages.flat() ?? []).filter((u) => {
      const id = String(u._id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [query.data]);
  return { ...query, people };
}

/** Connect → Suggested. */
export function useSuggestions() {
  return useQuery({ queryKey: queryKeys.suggestions, queryFn: getSuggestions, staleTime: 60_000 });
}
