import { z } from 'zod';

import { BRANCHES, YEARS } from '@/lib/skills';

// Mirrors server/routes/auth.js and the web's messages and order (Onboard.jsx, ChangeEmailForm.jsx).
// The web shows one message at a time, so the multi-field checks run in a single superRefine
// that stops at the first failure.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MIN_PASSWORD = 8; // server rule for new passwords
export const MAX_NAME = 60;
export const MAX_PROJECT_NAME = 60;
export const MAX_PROJECT_LINK = 200;

export const isValidEmail = (email: string): boolean => EMAIL_RE.test(email.trim());

const first =
  (ctx: z.RefinementCtx) =>
  (message: string, path: string): void => {
    ctx.addIssue({ code: 'custom', message, path: [path] });
  };

// ── Signup step 1 ────────────────────────────────────────────────
export const signupStep1Schema = z
  .object({
    name: z.string(),
    college: z.string(),
    year: z.union([z.enum(YEARS), z.literal('')]),
    branch: z.enum(BRANCHES),
    email: z.string(),
    password: z.string(),
  })
  .superRefine((v, ctx) => {
    const fail = first(ctx);
    if (!v.email || !v.password)
      return fail('Email and password required', v.email ? 'password' : 'email');
    if (!v.name.trim() || !v.college.trim())
      return fail('All fields required', v.name.trim() ? 'college' : 'name');
    if (!v.year) return fail('Please select your year', 'year');
    if (v.password.length < MIN_PASSWORD)
      return fail('Password must be at least 8 characters', 'password');
    if (!isValidEmail(v.email)) return fail('Enter a valid email', 'email');
  });

export type SignupStep1Input = z.input<typeof signupStep1Schema>;
export type SignupStep1Values = z.output<typeof signupStep1Schema>;

// ── Signup step 2 (profile is optional; terms are not) ───────────
export const signupStep2Schema = z.object({
  skills: z.array(z.string()),
  projectName: z.string().max(MAX_PROJECT_NAME),
  projectLink: z.string(),
  roadmap: z.string(),
  acceptTerms: z.boolean().refine((v) => v, 'Please accept the Terms and Privacy Policy'),
});

export type SignupStep2Values = z.infer<typeof signupStep2Schema>;

/** Body of POST /auth/signup, as the server validates it. */
export const signupRequestSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME),
  email: z.string().trim().regex(EMAIL_RE, 'Enter a valid email address'),
  password: z.string().min(MIN_PASSWORD, 'Password must be at least 8 characters'),
  college: z.string().trim().min(1),
  year: z.enum(YEARS),
  branch: z.string().min(1),
  skills: z.array(z.string()),
  projects: z.array(z.object({ name: z.string(), link: z.string() })),
  roadmap: z.string(),
  acceptTerms: z.literal(true, { error: 'Please accept the Terms and Privacy Policy to continue' }),
});

export type SignupRequest = z.infer<typeof signupRequestSchema>;

export function buildSignupRequest(
  step1: SignupStep1Values,
  step2: SignupStep2Values,
): SignupRequest {
  const projectName = step2.projectName.trim();
  return signupRequestSchema.parse({
    name: step1.name.trim(),
    email: step1.email.trim(),
    password: step1.password,
    college: step1.college.trim(),
    year: step1.year,
    branch: step1.branch,
    skills: step2.skills,
    projects: projectName
      ? [{ name: projectName, link: step2.projectLink.trim().slice(0, MAX_PROJECT_LINK) }]
      : [],
    roadmap: step2.roadmap,
    acceptTerms: step2.acceptTerms,
  });
}

// ── Login: any non-empty password (accounts from before the 8-character rule) ──
export const loginSchema = z
  .object({ email: z.string(), password: z.string() })
  .superRefine((v, ctx) => {
    if (!v.email.trim() || !v.password) {
      first(ctx)('Email and password required', v.email.trim() ? 'password' : 'email');
    }
  });

export type LoginValues = z.infer<typeof loginSchema>;

// ── Email verification ───────────────────────────────────────────
export const otpSchema = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from the email.');

// ── Change email (ChangeEmailForm.jsx) ───────────────────────────
export const changeEmailSchema = z
  .object({ newEmail: z.string(), password: z.string() })
  .superRefine((v, ctx) => {
    const fail = first(ctx);
    if (!isValidEmail(v.newEmail)) return fail('Enter a valid email address', 'newEmail');
    if (!v.password) return fail('Enter your current password', 'password');
  });

export type ChangeEmailValues = z.infer<typeof changeEmailSchema>;

// ── Change password (web AccountSettings.jsx) ────────────────────
export const changePasswordSchema = z
  .object({ current: z.string(), next: z.string(), repeat: z.string() })
  .superRefine((v, ctx) => {
    const fail = first(ctx);
    if (!v.current) return fail('Enter your current password', 'current');
    if (v.next.length < MIN_PASSWORD)
      return fail('New password must be at least 8 characters', 'next');
    if (v.next !== v.repeat) return fail("New passwords don't match", 'repeat');
  });

export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

// ── Edit profile (Profile.jsx edit mode + PUT /users/me rules) ───
export const MAX_BIO = 250;
export const MAX_ROADMAP = 1000;
export const MAX_PROJECTS = 10;
/** PUT /users/me refuses usernames over 20 characters (the model would allow 25). */
export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
export const USERNAME_HINT = '3-20 chars, only letters/numbers/._';

/** Web: the username box lowercases and drops anything but a-z, 0-9, _ and . while typing. */
export const normaliseUsername = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 20);

/**
 * `hadUsername`: accounts from before usernames existed may keep it empty (the web then fails
 * every save with "Username too short"); one that had a username cannot clear it.
 */
export const profileSchema = (hadUsername: boolean) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Name cannot be empty')
      .max(MAX_NAME, `Name can be at most ${MAX_NAME} characters`),
    username: z
      .string()
      .refine((v) => (v === '' ? !hadUsername : USERNAME_RE.test(v)), USERNAME_HINT),
    bio: z.string().max(MAX_BIO, `Bio can be at most ${MAX_BIO} characters`),
    year: z.enum(YEARS),
    branch: z.string().min(1),
    skills: z.array(z.string()),
    projects: z
      .array(
        z.object({
          name: z
            .string()
            .trim()
            .min(1, 'Project name required')
            .max(MAX_PROJECT_NAME, `Project names can be at most ${MAX_PROJECT_NAME} characters`),
          link: z.string().max(MAX_PROJECT_LINK),
        }),
      )
      .max(MAX_PROJECTS, `At most ${MAX_PROJECTS} projects`),
    roadmap: z.string().max(MAX_ROADMAP, `Roadmap can be at most ${MAX_ROADMAP} characters`),
    mediaItems: z
      .array(
        z.object({
          // Older profiles can still have the yt-* types (shown like 'youtube')
          type: z.enum([
            'youtube',
            'yt-video',
            'yt-short',
            'yt-channel',
            'yt-playlist',
            'instagram',
          ]),
          url: z.string(),
        }),
      )
      .max(30, 'At most 30 media items'),
  });

export type ProfileValues = z.infer<ReturnType<typeof profileSchema>>;

/** The first error message of a react-hook-form errors object, in field order. */
export function firstError(
  errors: Partial<Record<string, { message?: string } | undefined>>,
): string | undefined {
  for (const value of Object.values(errors)) {
    if (value?.message) return value.message;
  }
  return undefined;
}
