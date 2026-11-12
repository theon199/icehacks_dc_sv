import { parseTargetRef } from './model';
import { OTHER_DETAILS_MIN, reasonsFor, reportDraftProblem } from './reasons';

describe('reasonsFor', () => {
  it('offers impersonation only for people and food-safety reasons for recipes', () => {
    expect(reasonsFor('user').map((r) => r.value)).toContain('impersonation');
    expect(reasonsFor('post').map((r) => r.value)).not.toContain('impersonation');
    expect(reasonsFor('recipe').map((r) => r.value)).toEqual([
      'unsafe_food',
      'misinformation',
      'other',
    ]);
  });

  it('always ends with "Something else"', () => {
    for (const kind of ['post', 'comment', 'user', 'recipe'] as const) {
      expect(reasonsFor(kind).at(-1)?.value).toBe('other');
    }
  });
});

describe('reportDraftProblem', () => {
  it('needs a reason that fits the target', () => {
    expect(reportDraftProblem('post', { reason: null, details: '' })).toBe('Choose a reason.');
    expect(reportDraftProblem('recipe', { reason: 'harassment', details: '' })).toBe(
      'Choose a reason from the list.',
    );
    expect(reportDraftProblem('post', { reason: 'spam', details: '' })).toBeNull();
  });

  it('asks for details when the reason is "Something else"', () => {
    expect(reportDraftProblem('post', { reason: 'other', details: '  short ' })).not.toBeNull();
    expect(
      reportDraftProblem('post', { reason: 'other', details: 'x'.repeat(OTHER_DETAILS_MIN) }),
    ).toBeNull();
  });

  it('caps details at 1000 characters', () => {
    expect(reportDraftProblem('comment', { reason: 'spam', details: 'x'.repeat(1001) })).toMatch(
      /under 1000/,
    );
  });
});

describe('parseTargetRef', () => {
  const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  it('accepts uuids for members’ content and catalog ids for recipes', () => {
    expect(parseTargetRef('post', uuid)).toEqual({ kind: 'post', id: uuid });
    expect(parseTargetRef('recipe', 'jollof-rice_02')).toEqual({
      kind: 'recipe',
      id: 'jollof-rice_02',
    });
  });

  it('stores uuids in the canonical lower-case form the database uses', () => {
    expect(parseTargetRef('comment', uuid.toUpperCase())).toEqual({ kind: 'comment', id: uuid });
  });

  it('rejects unknown kinds and malformed ids', () => {
    expect(parseTargetRef('playlist', uuid)).toBeNull();
    expect(parseTargetRef('user', 'not-a-uuid')).toBeNull();
    expect(parseTargetRef('recipe', '../etc')).toBeNull();
    expect(parseTargetRef('post', undefined)).toBeNull();
  });
});
