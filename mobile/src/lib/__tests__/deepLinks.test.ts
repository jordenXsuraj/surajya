import { allowedAppPath, linkPath, resolveIncomingLink } from '@/lib/deepLinks';
import { postUrl } from '@/lib/postView';
import { profileUrl } from '@/lib/profile';

describe('linkPath', () => {
  it.each([
    ['https://themeetnet.com/post/abc123', '/post/abc123'],
    ['https://www.themeetnet.com/profile/u1', '/profile/u1'],
    ['https://THEMEETNET.com/post/abc/?utm_source=wa#top', '/post/abc'],
    ['http://themeetnet.com/post/abc', '/post/abc'],
    ['meetnet://post/abc', '/post/abc'],
    ['meetnet-dev://profile/u1/', '/profile/u1'],
    ['meetnet://profile//u1', '/profile/u1'],
    ['meetnet://', '/'],
    ['https://themeetnet.com', '/'],
    ['https://themeetnet.com/', '/'],
    ['/post/abc?x=1', '/post/abc'],
    ['meetnet-dev://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081', '/'],
    ['exp+meetnet://expo-development-client/?url=x', '/'],
  ])('%s → %s', (url, path) => {
    expect(linkPath(url)).toBe(path);
  });

  it.each([
    'https://example.com/post/abc',
    'https://themeetnet.com.evil.io/post/abc',
    'mailto:support@themeetnet.com',
    'other://post/abc',
    'not a link',
  ])('leaves %s alone', (url) => {
    expect(linkPath(url)).toBeNull();
  });
});

describe('allowedAppPath', () => {
  it('accepts only the screens links may open', () => {
    expect(allowedAppPath('/post/abc')).toBe('/post/abc');
    expect(allowedAppPath('/profile/u1/followers')).toBe('/profile/u1/followers');
    expect(allowedAppPath('/notifications')).toBe('/notifications');
    expect(allowedAppPath('/me/settings')).toBeNull();
    expect(allowedAppPath('/reset-password')).toBeNull();
    expect(allowedAppPath('/post/abc/extra')).toBeNull();
    expect(allowedAppPath('/')).toBeNull();
  });
});

describe('resolveIncomingLink (+native-intent)', () => {
  it('signed in: opens the path, unknown paths go to +not-found', () => {
    expect(resolveIncomingLink('https://themeetnet.com/post/abc', true)).toEqual({
      kind: 'open',
      path: '/post/abc',
    });
    expect(resolveIncomingLink('meetnet://nope', true)).toEqual({ kind: 'open', path: '/nope' });
  });

  it('signed out: keeps the screen for after sign-in and shows the start screen', () => {
    expect(resolveIncomingLink('https://themeetnet.com/profile/u1', false)).toEqual({
      kind: 'afterSignIn',
      path: '/profile/u1',
    });
    expect(resolveIncomingLink('meetnet://nope', false)).toEqual({ kind: 'open', path: '/' });
  });

  it('home and other apps’ links', () => {
    expect(resolveIncomingLink('meetnet://', false)).toEqual({ kind: 'open', path: '/' });
    expect(resolveIncomingLink('https://example.com/x', true)).toEqual({ kind: 'passthrough' });
  });
});

describe('share links', () => {
  it('always use https://themeetnet.com', () => {
    expect(postUrl('abc')).toBe('https://themeetnet.com/post/abc');
    expect(profileUrl('u1')).toBe('https://themeetnet.com/profile/u1');
    expect(linkPath(postUrl('abc'))).toBe('/post/abc');
    expect(linkPath(profileUrl('u1'))).toBe('/profile/u1');
  });
});
