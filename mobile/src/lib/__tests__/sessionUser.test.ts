import { suggestColleges, COLLEGES } from '@/lib/colleges';
import { needsEmailAttention, toSessionUser } from '@/lib/sessionUser';
import { decodeEntities, initials } from '@/lib/text';
import { authUser, me, sessionUser } from '@/test/helpers';
import { fillDigits, EMPTY_CODE } from '@/components/CodeInput';

describe('toSessionUser', () => {
  it('normalises AuthUser (signup/login, id lists)', () => {
    const user = toSessionUser(authUser);
    expect(user).toMatchObject({
      _id: 'u1',
      email: 'asha@example.com',
      username: 'asha',
      followingIds: ['u2', 'u3'],
      followerIds: ['u4'],
      followingCount: 2,
      followerCount: 1,
      emailVerified: false,
      verificationRequired: true,
      isSenior: false,
    });
  });

  it('normalises GET /users/me (populated following)', () => {
    const user = toSessionUser(me);
    expect(user.followingIds).toEqual(['u2', 'u3']);
    expect(user.followingCount).toBe(2);
    expect(user.emailVerified).toBe(true);
  });

  it('normalises PUT /users/me/email (Me with id lists) and fills missing optional fields', () => {
    const older = {
      ...me,
      following: ['u9'],
      username: undefined,
      avatar: undefined,
      bio: undefined,
      isSenior: undefined,
      year: '4th' as const,
    };
    const user = toSessionUser(older);
    expect(user.followingIds).toEqual(['u9']);
    expect(user.username).toBeNull();
    expect(user.avatar).toBe('');
    expect(user.bio).toBe('');
    expect(user.isSenior).toBe(true);
  });

  it('needsEmailAttention: unverified or bounced', () => {
    expect(needsEmailAttention(null)).toBe(false);
    expect(needsEmailAttention(sessionUser({ emailVerified: false }))).toBe(true);
    expect(needsEmailAttention(sessionUser({ emailVerified: true }))).toBe(false);
    expect(needsEmailAttention(sessionUser({ emailVerified: true, emailBounced: true }))).toBe(
      true,
    );
  });
});

describe('toSessionUser: profile and follow fields (Prompt 5)', () => {
  it('keeps incoming requests, blocks, cover, contributor and media from GET /users/me', () => {
    const user = toSessionUser({
      ...me,
      pendingRequests: [{ _id: 'r1', name: 'Rohan' }, 'r2'],
      sentRequests: ['t1'],
      blockedUsers: ['d1'],
      coverImage: 'http://localhost:5000/uploads/images/c.jpg',
      isContributor: true,
      mediaItems: [{ type: 'instagram', url: 'https://instagram.com/asha' }],
    });
    expect(user).toMatchObject({
      incomingRequestIds: ['r1', 'r2'],
      sentRequestIds: ['t1'],
      blockedIds: ['d1'],
      coverImage: 'http://localhost:5000/uploads/images/c.jpg',
      isContributor: true,
      mediaItems: [{ type: 'instagram', url: 'https://instagram.com/asha' }],
    });
  });

  it('defaults them for signup / login answers', () => {
    expect(toSessionUser(authUser)).toMatchObject({
      incomingRequestIds: [],
      blockedIds: [],
      coverImage: '',
      isContributor: false,
    });
  });
});

describe('decodeEntities', () => {
  it('turns the API escaping back into text', () => {
    expect(decodeEntities('a &lt;b&gt; &amp; &quot;c&quot; &#39;d&#x27;')).toBe(
      'a <b> & "c" \'d\'',
    );
    expect(decodeEntities('&lt;script&gt;')).toBe('<script>');
  });

  it('leaves unknown entities and plain text alone', () => {
    expect(decodeEntities('R&D &unknown; 5 & 6')).toBe('R&D &unknown; 5 & 6');
    expect(decodeEntities(null)).toBe('');
  });
});

describe('initials (web av())', () => {
  it.each([
    ['Asha Patil', 'AP'],
    ['asha', 'A'],
    ['Asha Rani Patil', 'AR'],
    ['', '??'],
    [null, '??'],
  ])('%s → %s', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

describe('colleges', () => {
  it('trims entries and drops the exact duplicate', () => {
    expect(COLLEGES).toHaveLength(84);
    expect(new Set(COLLEGES).size).toBe(COLLEGES.length);
    expect(COLLEGES.every((c) => c === c.trim())).toBe(true);
  });

  it('suggests from 2 characters, case-insensitive, at most 6', () => {
    expect(suggestColleges('s')).toEqual([]);
    expect(suggestColleges('pict')).toEqual(['Pune Institute of Computer Technology (PICT)']);
    expect(suggestColleges('SINH').length).toBe(6);
  });
});

describe('fillDigits (code boxes)', () => {
  it('spreads a pasted code over the boxes', () => {
    expect(fillDigits(EMPTY_CODE, 0, '12-34 56')).toEqual({
      next: ['1', '2', '3', '4', '5', '6'],
      focus: 5,
    });
  });

  it('types one digit and moves on; ignores non-digits', () => {
    expect(fillDigits(EMPTY_CODE, 2, '7')).toEqual({ next: ['', '', '7', '', '', ''], focus: 3 });
    expect(fillDigits(EMPTY_CODE, 0, 'abc')).toBeNull();
  });

  it('never writes past the last box', () => {
    expect(fillDigits(EMPTY_CODE, 4, '98765')?.next).toEqual(['', '', '', '', '9', '8']);
  });
});
