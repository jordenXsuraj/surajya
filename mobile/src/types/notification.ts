import type { IsoDate, ObjectId } from './api';
import type { PostAuthor } from './post';

export type NotificationType =
  | 'connection_request'
  | 'connection_accepted'
  | 'post_replied'
  | 'post_liked'
  | 'new_post'
  | 'interested';

export type Notification = {
  _id: ObjectId;
  recipient: ObjectId;
  /** null when the action was anonymous. */
  sender: PostAuthor | ObjectId | null;
  type: NotificationType;
  post: ObjectId | null;
  message: string;
  read: boolean;
  createdAt: IsoDate;
  __v?: number;
};
