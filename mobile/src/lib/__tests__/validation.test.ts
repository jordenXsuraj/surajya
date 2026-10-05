import {
  EMAIL_RE,
  buildSignupRequest,
  changeEmailSchema,
  loginSchema,
  otpSchema,
  signupStep1Schema,
  signupStep2Schema,
  type SignupStep1Values,
} from '@/lib/validation';

const step1 = {
  name: 'Asha',
  college: 'PICT',
  year: '2nd',
  branch: 'CS',
  email: 'asha@example.com',
  password: 'longenough',
} as const;

const step1Error = (values: Record<string, string>) => {
  const result = signupStep1Schema.safeParse({ ...step1, ...values });
  return result.success ? null : result.error.issues[0]?.message;
};

describe('signup step 1 (web order and messages)', () => {
  it('accepts a complete form', () => {
    expect(step1Error({})).toBeNull();
  });

  it('checks in the web order', () => {
    expect(step1Error({ email: '', name: '' })).toBe('Email and password required');
    expect(step1Error({ password: '' })).toBe('Email and password required');
    expect(step1Error({ name: '   ' })).toBe('All fields required');
    expect(step1Error({ college: '' })).toBe('All fields required');
    expect(step1Error({ year: '' })).toBe('Please select your year');
    expect(step1Error({ password: 'short', email: 'bad' })).toBe(
      'Password must be at least 8 characters',
    );
    expect(step1Error({ email: 'not-an-email' })).toBe('Enter a valid email');
  });

  it('rejects a 7-character password and accepts 8 (server rule)', () => {
    expect(step1Error({ password: '1234567' })).toBe('Password must be at least 8 characters');
    expect(step1Error({ password: '12345678' })).toBeNull();
  });

  it('reports one issue at a time, on the field it is about', () => {
    const result = signupStep1Schema.safeParse({ ...step1, year: '' });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toHaveLength(1);
    expect(result.error?.issues[0]?.path).toEqual(['year']);
  });
});

describe('email regex parity with the server', () => {
  it.each([
    ['a@b.co', true],
    ['first.last@college.edu.in', true],
    ['  spaced@example.com  '.trim(), true],
    ['a@b.c', false], // TLD needs 2+ characters
    ['no-at.example.com', false],
    ['two@@example.com', false],
    ['space in@example.com', false],
    ['a@b', false],
  ])('%s → %s', (email, ok) => {
    expect(EMAIL_RE.test(email)).toBe(ok);
  });
});

describe('signup step 2 / request', () => {
  const step2 = {
    skills: ['React'],
    projectName: '',
    projectLink: '',
    roadmap: '',
    acceptTerms: true,
  };

  it('terms must be accepted', () => {
    const result = signupStep2Schema.safeParse({ ...step2, acceptTerms: false });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Please accept the Terms and Privacy Policy');
  });

  it('builds the request like the web (trimmed, project only with a name, link max 200)', () => {
    const body = buildSignupRequest(
      { ...step1, name: '  Asha  ', email: ' asha@example.com ' } as SignupStep1Values,
      { ...step2, projectName: '  Robot  ', projectLink: ` ${'x'.repeat(250)} ` },
    );
    expect(body).toMatchObject({
      name: 'Asha',
      email: 'asha@example.com',
      year: '2nd',
      branch: 'CS',
      skills: ['React'],
      acceptTerms: true,
      roadmap: '',
    });
    expect(body.projects).toEqual([{ name: 'Robot', link: 'x'.repeat(200) }]);

    const noProject = buildSignupRequest(step1 as SignupStep1Values, {
      ...step2,
      projectLink: 'https://x.dev',
    });
    expect(noProject.projects).toEqual([]);
  });
});

describe('login', () => {
  it('needs both fields but no minimum length (old 6–7 character accounts)', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'abc1234' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).error?.issues[0]?.message).toBe(
      'Email and password required',
    );
    expect(loginSchema.safeParse({ email: '  ', password: 'x' }).success).toBe(false);
  });
});

describe('OTP', () => {
  it.each([
    ['012345', true],
    ['123456', true],
    ['12345', false],
    ['1234567', false],
    ['12a456', false],
    [' 12345', false],
  ])('%s → %s', (code, ok) => {
    expect(otpSchema.safeParse(code).success).toBe(ok);
  });
});

describe('change email', () => {
  it('validates email first, then password (web messages)', () => {
    expect(
      changeEmailSchema.safeParse({ newEmail: 'bad', password: '' }).error?.issues[0]?.message,
    ).toBe('Enter a valid email address');
    expect(
      changeEmailSchema.safeParse({ newEmail: 'new@example.com', password: '' }).error?.issues[0]
        ?.message,
    ).toBe('Enter your current password');
    expect(
      changeEmailSchema.safeParse({ newEmail: 'new@example.com', password: 'x' }).success,
    ).toBe(true);
  });
});
