// Run with: npm test  (Node's built-in test runner, no extra packages)
// Same cases as server/tests/youtube.test.js and mobile/src/lib/__tests__/youtube.test.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getYouTubeId } from './youtube.js'

const ID = 'dQw4w9WgXcQ'

test('reads video ids from every supported link', () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s`,
    `https://www.youtube.com/watch?feature=share&v=${ID}`,
    `https://youtu.be/${ID}?si=abc123`,
    `http://youtu.be/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://youtube.com/shorts/${ID}?feature=share`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}?si=abc123`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/shorts/${ID}`,
    `https://music.youtube.com/watch?v=${ID}&list=RDAMVM${ID}`,
    `youtube.com/watch?v=${ID}`,
    `HTTPS://WWW.YOUTUBE.COM/SHORTS/${ID}`,
    `  https://youtu.be/${ID}  `,
  ]) {
    assert.equal(getYouTubeId(url), ID, url)
  }
  assert.equal(getYouTubeId('https://youtu.be/a_b-C1d2E3f'), 'a_b-C1d2E3f')
})

test('refuses links that are not a YouTube video', () => {
  for (const url of [
    'https://www.youtube.com/@somechannel',
    'https://www.youtube.com/playlist?list=PL1234567890',
    'https://www.youtube.com/watch?v=short',
    `https://youtu.be/${ID}extra`,
    'https://vimeo.com/123456789',
    `https://notyoutube.com/watch?v=${ID}`,
    `https://youtube.com.evil.example/watch?v=${ID}`,
    `https://evil.example/?u=https://youtube.com/watch?v=${ID}`,
    '',
    null,
    undefined,
    42,
  ]) {
    assert.equal(getYouTubeId(url), null, String(url))
  }
})
