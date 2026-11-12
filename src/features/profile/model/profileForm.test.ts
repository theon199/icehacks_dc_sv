import { ApiError } from '@/lib/api/errors';

import {
  BIO_MAX,
  charCount,
  hasUnsavedChanges,
  isEmptyPatch,
  profilePatch,
  saveErrorView,
  validateProfileDraft,
  type ProfileDraft,
} from './profileForm';

const valid: ProfileDraft = {
  displayName: 'Ama Owusu',
  handle: 'ama_cooks',
  bio: 'Jollof every Sunday.',
  cuisines: ['west_african', 'indian'],
};

function errorsFor(draft: Partial<ProfileDraft>) {
  const result = validateProfileDraft({ ...valid, ...draft });
  return result.ok ? {} : result.errors;
}

describe('validateProfileDraft', () => {
  it('accepts a complete profile and trims it', () => {
    const result = validateProfileDraft({
      ...valid,
      displayName: '  Ama Owusu ',
      handle: ' @ama_cooks ',
      bio: ' Jollof\r\nevery Sunday. ',
    });
    expect(result).toEqual({
      ok: true,
      value: { ...valid, bio: 'Jollof\nevery Sunday.' },
    });
  });

  it('requires a display name', () => {
    expect(errorsFor({ displayName: '   ' }).displayName).toMatch(/add the name/i);
  });

  it('limits the display name to 50 characters, counting emoji as one', () => {
    expect(errorsFor({ displayName: 'a'.repeat(51) }).displayName).toMatch(/50 characters/);
    expect(errorsFor({ displayName: '🍲'.repeat(50) }).displayName).toBeUndefined();
  });

  it('refuses control characters in the display name', () => {
    expect(errorsFor({ displayName: 'Ama\u0007' }).displayName).toMatch(/regular characters/);
  });

  it.each([
    ['ab', /3 to 24/],
    ['a'.repeat(25), /3 to 24/],
    ['ama cooks', /letters, numbers and underscores/],
    ['amá_cooks', /letters, numbers and underscores/],
  ])('rejects the handle %p', (handle, message) => {
    expect(errorsFor({ handle }).handle).toMatch(message);
  });

  it('limits the bio', () => {
    expect(errorsFor({ bio: 'x'.repeat(BIO_MAX) }).bio).toBeUndefined();
    expect(errorsFor({ bio: 'x'.repeat(BIO_MAX + 1) }).bio).toMatch(/280/);
  });

  it('limits cuisines to ten valid, distinct ids', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `cuisine_${'abcdefghijk'[i]}`);
    expect(errorsFor({ cuisines: eleven }).cuisines).toMatch(/up to 10/);
    expect(errorsFor({ cuisines: ['Indian'] }).cuisines).toMatch(/not recognised/);
    expect(errorsFor({ cuisines: ['thai', 'thai'] }).cuisines).toMatch(/not recognised/);
  });

  it('reports every problem at once', () => {
    expect(Object.keys(errorsFor({ displayName: '', handle: 'x', bio: 'y'.repeat(300) }))).toEqual([
      'displayName',
      'handle',
      'bio',
    ]);
  });
});

describe('charCount', () => {
  it('counts code points', () => {
    expect(charCount('a🍜b')).toBe(3);
  });
});

describe('profilePatch', () => {
  it('is empty when nothing changed', () => {
    expect(isEmptyPatch(profilePatch(valid, { ...valid, cuisines: [...valid.cuisines] }))).toBe(
      true,
    );
  });

  it('contains only the changed columns', () => {
    expect(
      profilePatch(valid, { ...valid, bio: 'New bio', cuisines: ['indian', 'west_african'] }),
    ).toEqual({ bio: 'New bio', cuisines: ['indian', 'west_african'] });
  });

  it('sends a change of case in the handle', () => {
    expect(profilePatch(valid, { ...valid, handle: 'Ama_Cooks' })).toEqual({ handle: 'Ama_Cooks' });
  });
});

describe('hasUnsavedChanges', () => {
  it('ignores whitespace that saving would trim anyway', () => {
    expect(hasUnsavedChanges(valid, { ...valid, displayName: '  Ama Owusu ' })).toBe(false);
  });

  it('notices a real edit', () => {
    expect(hasUnsavedChanges(valid, { ...valid, cuisines: ['indian'] })).toBe(true);
    expect(hasUnsavedChanges(valid, { ...valid, bio: '' })).toBe(true);
  });
});

describe('saveErrorView', () => {
  const failure = (code: string, kind: 'validation' | 'network' = 'validation') =>
    new ApiError({ kind, functionName: 'profiles.update', code, status: 409 });

  it('points a taken handle at the handle field', () => {
    expect(saveErrorView(failure('unique_violation'))).toEqual({
      fields: { handle: expect.stringMatching(/taken/) },
      form: null,
    });
  });

  it('points a reserved handle at the handle field', () => {
    expect(saveErrorView(failure('handle_reserved')).fields.handle).toMatch(/reserved/);
  });

  it('falls back to a form-level message', () => {
    const view = saveErrorView(new ApiError({ kind: 'network', functionName: 'profiles.update' }));
    expect(view.fields).toEqual({});
    expect(view.form).toMatch(/offline/i);
  });
});
