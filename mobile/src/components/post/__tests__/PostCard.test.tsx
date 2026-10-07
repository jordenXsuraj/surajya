import { render, screen } from '@testing-library/react-native';

import { PostCard } from '@/components/post/PostCard';
import type { PostActions } from '@/hooks/usePostActions';
import type { Post } from '@/types/post';

const actions: PostActions = {
  like: jest.fn(),
  likeOnce: jest.fn(),
  openReplies: jest.fn(),
  interested: jest.fn(),
  openMenu: jest.fn(),
  openImage: jest.fn(),
  openVideo: jest.fn(),
  openLink: jest.fn(),
  openPdf: jest.fn(),
  openProfile: jest.fn(),
  openPost: jest.fn(),
  connect: jest.fn(),
};

const anonymous: Post = {
  _id: 'p1',
  type: 'confession',
  text: 'I never told anyone &lt;this&gt;',
  tags: ['secret'],
  link: '',
  pdfName: '',
  pdfSize: 0,
  isAnonymous: true,
  college: 'PICT',
  createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  postedBy: null,
  likes: [],
  likeCount: 3,
  likedByMe: false,
  replyCount: 1,
  replies: [
    {
      _id: 'r1',
      text: 'me again',
      createdAt: new Date().toISOString(),
      postedBy: null,
      isAuthor: true,
    },
  ],
};

describe('PostCard', () => {
  it('renders an anonymous post without any author', async () => {
    await render(
      <PostCard
        post={anonymous}
        viewerId="viewer"
        following={false}
        requested={false}
        actions={actions}
      />,
    );

    expect(screen.getByText('Anonymous')).toBeTruthy();
    expect(screen.getByText('👤')).toBeTruthy(); // anonymous avatar: no photo, no initials
    expect(screen.queryByText('??')).toBeNull();
    expect(screen.queryByText(/yr /)).toBeNull(); // no year / branch
    expect(screen.queryByText('🤝 Connect')).toBeNull(); // nobody to follow
    expect(screen.queryByRole('button', { name: /open profile/ })).toBeNull(); // not navigable
    expect(screen.getByText('2h ago')).toBeTruthy();
    expect(screen.getByText('🤫 Confession')).toBeTruthy();
    expect(screen.getByText('I never told anyone <this>')).toBeTruthy(); // entities decoded
    expect(screen.getByText('#secret')).toBeTruthy();
    expect(screen.getByText('🤍 3')).toBeTruthy();
    expect(screen.getByText('💬 (1)')).toBeTruthy();
  });

  it('shows a named author with year/branch and Connect when not followed', async () => {
    const named: Post = {
      ...anonymous,
      type: 'project',
      isAnonymous: false,
      postedBy: { _id: 'a1', name: 'Asha Patil', year: '3rd', branch: 'IT', isContributor: true },
      expiresAt: new Date(Date.now() + 5 * 3_600_000).toISOString(),
    };
    await render(
      <PostCard
        post={named}
        viewerId="viewer"
        following={false}
        requested={false}
        actions={actions}
      />,
    );

    expect(screen.getByText('Asha Patil')).toBeTruthy();
    expect(screen.getByText(/3rd yr IT · 2h ago/)).toBeTruthy();
    expect(screen.getByLabelText('Top Contributor')).toBeTruthy();
    expect(screen.getByText('🤝 Connect')).toBeTruthy();
    expect(screen.getByText('🚀 Project / Partner')).toBeTruthy();
    expect(screen.getByText('⏳ 5h left · Today Only')).toBeTruthy();
    expect(screen.getByText('🙋 Interested')).toBeTruthy();
  });
});
