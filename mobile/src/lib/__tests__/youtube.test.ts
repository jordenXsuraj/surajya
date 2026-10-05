import { getYouTubeId, youTubeThumbnail } from '@/lib/youtube';

// Same cases as server/tests/youtube.test.js and nexusnetwork/src/utils/youtube.test.js.
const ID = 'dQw4w9WgXcQ';

describe('getYouTubeId', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://youtube.com/watch?v=${ID}&t=42s`],
    [`https://www.youtube.com/watch?feature=share&v=${ID}`],
    [`https://youtu.be/${ID}?si=abc123`],
    [`http://youtu.be/${ID}`],
    [`https://www.youtube.com/embed/${ID}`],
    [`https://youtube.com/shorts/${ID}?feature=share`],
    [`https://www.youtube.com/shorts/${ID}`],
    [`https://www.youtube.com/live/${ID}?si=abc123`],
    [`https://m.youtube.com/watch?v=${ID}`],
    [`https://m.youtube.com/shorts/${ID}`],
    [`https://music.youtube.com/watch?v=${ID}&list=RDAMVM${ID}`],
    [`youtube.com/watch?v=${ID}`],
    [`HTTPS://WWW.YOUTUBE.COM/SHORTS/${ID}`],
    [`  https://youtu.be/${ID}  `],
  ])('%s', (url) => {
    expect(getYouTubeId(url)).toBe(ID);
  });

  it('ids keep their case and may contain - and _', () => {
    expect(getYouTubeId('https://youtu.be/a_b-C1d2E3f')).toBe('a_b-C1d2E3f');
  });

  it.each([
    ['https://www.youtube.com/@somechannel'],
    ['https://www.youtube.com/playlist?list=PL1234567890'],
    ['https://www.youtube.com/watch?v=short'],
    [`https://youtu.be/${ID}extra`],
    ['https://vimeo.com/123456789'],
    [`https://notyoutube.com/watch?v=${ID}`],
    [`https://youtube.com.evil.example/watch?v=${ID}`],
    [`https://evil.example/?u=https://youtube.com/watch?v=${ID}`],
    [''],
  ])('refuses %s', (url) => {
    expect(getYouTubeId(url)).toBeNull();
  });

  it('no link, no id', () => {
    expect(getYouTubeId(null)).toBeNull();
    expect(getYouTubeId(undefined)).toBeNull();
  });

  it('thumbnail is mqdefault', () => {
    expect(youTubeThumbnail(ID)).toBe(`https://img.youtube.com/vi/${ID}/mqdefault.jpg`);
  });
});
