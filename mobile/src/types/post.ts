import type { IsoDate, ObjectId } from './api';
import type { Year } from './user';

export type PostType = 'social' | 'placement' | 'qa' | 'project' | 'study' | 'confession';

export type PostAuthor = {
  _id: ObjectId;
  name: string;
  year?: Year;
  branch?: string;
  avatar?: string;
  isContributor?: boolean;
  username?: string;
  college?: string;
};

/**
 * `postedBy: null` = anonymous (also for the author's own replies on anonymous posts, which carry
 * `isAuthor: true`). Never try to identify anonymous authors.
 */
export type Reply = {
  _id: ObjectId;
  text: string;
  createdAt: IsoDate;
  postedBy: PostAuthor | null;
  isAuthor?: true;
  isMine?: true;
};

export type Post = {
  _id: ObjectId;
  type: PostType;
  text: string;
  tags: string[];
  link: string;
  imageUrl?: string;
  youtubeUrl?: string;
  youtubeId?: string;
  pdfUrl?: string;
  pdfName: string;
  pdfSize: number;
  isAnonymous: boolean;
  college: string;
  createdAt: IsoDate;
  expiresAt?: IsoDate | null;
  postedBy: PostAuthor | null;
  likes: ObjectId[];
  likeCount: number;
  likedByMe?: boolean;
  replyCount: number;
  replies: Reply[];
  __v?: number;
};
