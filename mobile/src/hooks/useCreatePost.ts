import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import { createPost } from '@/api/endpoints/posts';
import { insertNewPost, rememberOwnPost } from '@/api/postCache';
import type { CreatePostBody } from '@/lib/compose';
import { clearDraft } from '@/lib/composeDraft';
import { useAuthStore } from '@/stores/auth.store';

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
      const userId = useAuthStore.getState().user?._id;
      if (userId) rememberOwnPost(post._id, String(userId));
      clearDraft();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });
}
