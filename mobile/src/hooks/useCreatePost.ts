import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import { createPost } from '@/api/endpoints/posts';
import { insertNewPost } from '@/api/postCache';
import type { CreatePostBody } from '@/lib/compose';
import { clearDraft } from '@/lib/composeDraft';

/**
 * POST /api/posts. Runs even when the phone reports no connection (networkMode 'always'), so an
 * offline attempt fails with a clear message and the form keeps everything, instead of waiting.
 */
export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: (body: CreatePostBody) => createPost(body),
    onSuccess: (post) => {
      insertNewPost(qc, post);
      clearDraft();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });
}
