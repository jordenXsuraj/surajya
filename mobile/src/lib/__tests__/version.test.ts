import { compareVersions, isOlderVersion } from '@/lib/version';

describe('compareVersions', () => {
  it.each([
    ['1.0.0', '1.0.0', 0],
    ['1.0.0', '1.0.1', -1],
    ['1.0.10', '1.0.9', 1],
    ['1.2.0', '1.10.0', -1],
    ['2.0.0', '1.99.99', 1],
    [' 1.0.0 ', '1.0.0', 0],
  ])('%s vs %s → %s', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });

  it.each([
    ['1.0', '1.0.0'],
    ['1.0.0-beta', '1.0.0'],
    ['', '1.0.0'],
    [null, '1.0.0'],
    ['1.0.0', undefined],
  ])('%s vs %s → null (not a version)', (a, b) => {
    expect(compareVersions(a, b)).toBeNull();
  });
});

describe('isOlderVersion (forced update)', () => {
  it('only an installed version below the minimum blocks', () => {
    expect(isOlderVersion('1.0.0', '1.0.1')).toBe(true);
    expect(isOlderVersion('1.0.9', '1.0.10')).toBe(true);
    expect(isOlderVersion('1.0.0', '1.0.0')).toBe(false);
    expect(isOlderVersion('1.1.0', '1.0.9')).toBe(false);
    expect(isOlderVersion('1.0.0', '0.0.0')).toBe(false);
  });

  it('never blocks on a broken or missing value', () => {
    expect(isOlderVersion(null, '9.9.9')).toBe(false);
    expect(isOlderVersion('1.0.0', 'latest')).toBe(false);
    expect(isOlderVersion('1.0.0', undefined)).toBe(false);
  });
});
