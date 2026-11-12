import {
  normalizeEmail,
  validateEmail,
  validateNewPassword,
  validatePasswordConfirmation,
  validateSignInPassword,
} from './validation';

describe('validateEmail', () => {
  it.each(['sam@example.com', '  Sam.Lee+food@Example.co.uk ', 'a@b.io'])('accepts %p', (email) => {
    expect(validateEmail(email)).toBeNull();
  });

  it('asks for an address when empty', () => {
    expect(validateEmail('   ')).toBe('Enter your email address.');
  });

  it.each([
    'sam',
    'sam@',
    '@example.com',
    'sam@example',
    'sam @example.com',
    'sam@example.c',
    'a..b@example.com',
    'sam.@example.com',
  ])('rejects %p', (email) => {
    expect(validateEmail(email)).toMatch(/doesn’t look right/);
  });

  it('normalizes case and whitespace', () => {
    expect(normalizeEmail('  Sam@Example.COM ')).toBe('sam@example.com');
  });
});

describe('validateNewPassword', () => {
  it('requires at least 8 characters', () => {
    expect(validateNewPassword('')).toBe('Choose a password.');
    expect(validateNewPassword('short7!')).toBe('Use at least 8 characters.');
    expect(validateNewPassword('eight888')).toBeNull();
  });

  it('counts characters, not bytes, for the minimum', () => {
    expect(validateNewPassword('ñandú🙂ok')).toBeNull();
  });

  it('rejects passwords the server would silently truncate', () => {
    expect(validateNewPassword('x'.repeat(72))).toBeNull();
    expect(validateNewPassword('x'.repeat(73))).toMatch(/too long/);
    expect(validateNewPassword('🙂'.repeat(19))).toMatch(/too long/);
  });

  it('rejects a password of only spaces', () => {
    expect(validateNewPassword('         ')).toMatch(/only spaces/);
  });
});

describe('sign-in password and confirmation', () => {
  it('only checks that a sign-in password was typed', () => {
    expect(validateSignInPassword('')).toBe('Enter your password.');
    expect(validateSignInPassword('old')).toBeNull();
  });

  it('compares the confirmation', () => {
    expect(validatePasswordConfirmation('abcdefgh', '')).toBe('Type the password again.');
    expect(validatePasswordConfirmation('abcdefgh', 'abcdefgx')).toMatch(/don’t match/);
    expect(validatePasswordConfirmation('abcdefgh', 'abcdefgh')).toBeNull();
  });
});
