import {
  availableActions,
  moderatorReasonProblem,
  noticeCopy,
  type ActionContext,
} from './actions';
import type { Decision } from './model';

function actions(context: Partial<ActionContext>) {
  return availableActions({ kind: 'post', hasOwner: true, snapshot: null, ...context }).map(
    (option) => option.action,
  );
}

describe('availableActions', () => {
  it('offers hide and remove for visible posts, never restore', () => {
    expect(actions({ snapshot: { status: 'visible' } })).toEqual([
      'hide',
      'remove',
      'warn',
      'suspend',
      'dismiss',
    ]);
  });

  it('offers restore for hidden or removed content', () => {
    expect(actions({ kind: 'comment', snapshot: { status: 'hidden' } })).toEqual([
      'remove',
      'restore',
      'warn',
      'suspend',
      'dismiss',
    ]);
    expect(actions({ snapshot: { status: 'removed' } })).toEqual([
      'restore',
      'warn',
      'suspend',
      'dismiss',
    ]);
  });

  it('only warns, suspends or dismisses for people, and lifts an active suspension', () => {
    expect(actions({ kind: 'user', snapshot: {} })).toEqual(['warn', 'suspend', 'dismiss']);
    expect(
      actions({ kind: 'user', snapshot: { suspended_until: '2027-01-01T00:00:00Z' } }),
    ).toEqual(['warn', 'unsuspend', 'dismiss']);
  });

  it('has no owner actions for catalog recipes', () => {
    expect(actions({ kind: 'recipe', hasOwner: false })).toEqual(['remove', 'dismiss']);
  });

  it('marks suspensions as needing a length', () => {
    const suspend = availableActions({ kind: 'user', hasOwner: true, snapshot: {} }).find(
      (option) => option.action === 'suspend',
    );
    expect(suspend).toMatchObject({ needsDays: true, destructive: true });
  });
});

describe('moderatorReasonProblem', () => {
  it('requires 1 to 500 characters', () => {
    expect(moderatorReasonProblem('   ')).not.toBeNull();
    expect(moderatorReasonProblem('Spam link')).toBeNull();
    expect(moderatorReasonProblem('x'.repeat(501))).not.toBeNull();
  });
});

describe('noticeCopy', () => {
  const decision: Decision = {
    action_id: 'a',
    action: 'hide',
    reason: 'Contains a phone number',
    target_kind: 'comment',
    target_id: 'c',
    automated: true,
    suspended_until: null,
    created_at: '2026-11-10T00:00:00Z',
    appealable: true,
    appeal_status: null,
    appeal_note: null,
  };

  it('says whether a person or the automatic checks decided, never who', () => {
    expect(noticeCopy(decision).body).toMatch(/^Our automatic checks/);
    expect(noticeCopy({ ...decision, automated: false }).body).toMatch(/^A Famara moderator/);
    expect(noticeCopy(decision).title).toBe('Your comment is hidden');
  });
});
