// Design tokens ported from nexusnetwork/src/index.css (:root). Components use these only —
// no raw colours or font names in screens.

export const colors = {
  bg: '#0d0d0d',
  bg2: '#141414',
  bg3: '#1c1c1c',
  card: '#181818',
  br: 'rgba(255,255,255,0.06)',
  br2: 'rgba(255,255,255,0.11)',
  text: '#f0f0f0',
  muted: '#888888',
  dim: '#444444',
  accent: '#a73333',
  accentPressed: '#ff1f42', // web: .bn-center.active / .custom-skill-add-btn:hover
  al: 'rgba(255,59,92,0.12)',
  ag: 'rgba(255,59,92,0.25)',
  blue: '#3b82f6',
  bl: 'rgba(59,130,246,0.12)',
  green: '#22c55e',
  gl: 'rgba(34,197,94,0.12)',
  purple: '#a855f7',
  pl: 'rgba(168,85,247,0.12)',
  yellow: '#f59e0b',
  yl: 'rgba(245,158,11,0.1)',
  orange: '#f97316',
  ol: 'rgba(249,115,22,0.1)',
  white: '#ffffff',
  toast: '#222222',
  navBar: 'rgba(13,13,13,0.97)',
  // Feed (web index.css .post-card / .act-btn / .post-connect-btn / ContributorBadge)
  divider: '#1f1f1f',
  actBg: '#111111',
  actBorder: '#2a2a2a',
  actText: '#aaaaaa',
  like: '#ff2e63',
  likeEnd: '#ff4d6d',
  likeGlow: 'rgba(255,46,99,0.6)',
  connect: '#00c6ff',
  connectEnd: '#0072ff',
  sent: '#333333',
  contributor: '#f59e0b',
  contributorEnd: '#f97316',
  scrim: 'rgba(0,0,0,0.4)',
  overlay: 'rgba(0,0,0,0.94)',
  hint: 'rgba(255,255,255,0.7)',
  // Profile (web .prof-cover, .cover-edit-btn, media cards .yt-badge / .ig-*)
  coverFrom: '#0d0d0d',
  coverMid: '#1a0a14',
  coverTo: '#0a0d1a',
  shade: 'rgba(0,0,0,0.3)',
  shadeStrong: 'rgba(0,0,0,0.6)',
  shadeHeavy: 'rgba(0,0,0,0.7)',
  glassBorder: 'rgba(255,255,255,0.2)',
  playButton: 'rgba(255,255,255,0.9)',
  youtube: 'rgba(255,0,0,0.8)',
  igFrom: '#f09433',
  igMid: '#e6683c',
  igMain: '#dc2743',
  igTo: '#cc2366',
  igTintFrom: 'rgba(240,148,51,0.12)',
  igTintTo: 'rgba(204,39,102,0.12)',
  igBorder: 'rgba(204,39,102,0.2)',
} as const;

export type ColorName = keyof typeof colors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 9,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

// Minimum touch target (iOS HIG 44pt; Android 48dp is met by padding/hitSlop).
export const touch = {
  min: 44,
  hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
  // Longest gap between the two taps of a double-tap: Android's own double-tap timeout
  doubleTapMs: 300,
} as const;

export const layout = {
  tabBarHeight: 68, // web: --nav
  gutter: 18, // web: .ob-form-wrap / .doc-page side padding
  maxContentWidth: 430, // web: #root max-width
} as const;

// One font file per weight: Android ignores fontWeight for custom fonts.
export const fonts = {
  light: 'Outfit_300Light',
  regular: 'Outfit_400Regular',
  medium: 'Outfit_500Medium',
  semibold: 'Outfit_600SemiBold',
  bold: 'Outfit_700Bold',
  extrabold: 'Outfit_800ExtraBold',
  black: 'Outfit_900Black',
  displayBold: 'Fraunces_700Bold',
  display: 'Fraunces_800ExtraBold',
} as const;

export type FontWeightName =
  'light' | 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold' | 'black';

// Web sizes are rem-based (1rem = 16px).
export const fontSize = {
  xxs: 9.6, // .6rem — tab labels
  xs: 11.2, // .7rem — notes
  sm: 12.5, // .78rem — errors, chips
  md: 14, // .875rem — body, inputs
  lg: 16, // 1rem — buttons, h2
  xl: 20.8, // 1.3rem — step titles
  xxl: 24, // 1.5rem — page titles
  display: 48, // 3rem — logo
} as const;
