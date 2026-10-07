import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getPost } from '@/api/endpoints/posts';
import { ApiError } from '@/api/errors';
import { findPost } from '@/api/postCache';
import { queryKeys } from '@/api/queryKeys';

/**
 * GET /posts/:id — full replies. Shows the copy from any feed immediately while the full post loads
 * (deep links with nothing cached simply load).
 */
export function usePost(id: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.post(id ?? ''),
    enabled: Boolean(id),
    queryFn: () => getPost(id!),
    placeholderData: () => (id ? findPost(qc, id) : undefined),
    // A deleted / hidden post won't come back by retrying
    retry: (count, error) =>
      count < 2 && !(error instanceof ApiError && (error.status === 404 || error.status === 400)),
  });
}
