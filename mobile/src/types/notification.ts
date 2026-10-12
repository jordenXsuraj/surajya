import type { IsoDate, ObjectId } from './api';
import type { PostAuthor, PostType } from './post';

export type NotificationType =
  | 'connection_request'
  | 'connection_accepted'
  | 'post_replied'
  | 'post_liked'
  | 'new_post'
  | 'interested';

export type NotificationPost = { _id: ObjectId; type: PostType; text: string };

export type Notification = {
  _id: ObjectId;
  recipient: ObjectId;
  /** null when the action was anonymous. */
  sender: PostAuthor | ObjectId | null;
  type: NotificationType;
  /** Populated as `{ _id, type, text }` by GET /notifications; null when the post is gone. */
  post: NotificationPost | ObjectId | null;
  message: string;
  read: boolean;
  createdAt: IsoDate;
  __v?: number;
};
