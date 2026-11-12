import { dbError, storageError } from './errors';

describe('dbError', () => {
  it('maps our own raised errors with their human sentence', () => {
    const error = dbError('redeem_friend_invite', {
      code: 'PT409',
      message: 'invite_used',
      details: 'This invite link has already been used.',
    });
    expect(error).toMatchObject({
      kind: 'validation',
      status: 409,
      code: 'invite_used',
      serverMessage: 'This invite link has already been used.',
    });
  });

  it('maps 404s from functions', () => {
    expect(dbError('x', { code: 'PT404', message: 'invite_not_found' })).toMatchObject({
      kind: 'server',
      status: 404,
      code: 'invite_not_found',
    });
  });

  it('turns a unique violation into a code without leaking Postgres wording', () => {
    const error = dbError('profiles.update', {
      code: '23505',
      message: 'duplicate key value violates unique constraint "profiles_handle_key"',
      details: 'Key (handle)=(ama) already exists.',
    });
    expect(error).toMatchObject({ kind: 'validation', code: 'unique_violation', status: 409 });
    expect(error.serverMessage).toBeUndefined();
  });

  it('maps invalid input raised by functions', () => {
    expect(
      dbError('profiles.update', { code: '22023', message: 'handle_reserved', details: 'Reserved.' }),
    ).toMatchObject({ kind: 'validation', code: 'handle_reserved', serverMessage: 'Reserved.' });
  });

  it('treats a failed fetch as offline', () => {
    expect(dbError('x', { code: '', message: 'TypeError: Network request failed' }).kind).toBe(
      'network',
    );
  });

  it('treats unknown SQL states as server errors', () => {
    expect(dbError('x', { code: 'XX000', message: 'internal' })).toMatchObject({ kind: 'server' });
  });

  it('maps permission errors', () => {
    expect(dbError('x', { code: 'PT403', message: 'suspended' }).kind).toBe('forbidden');
  });
});

describe('storageError', () => {
  it('maps a too-large upload to a friendly validation error', () => {
    expect(storageError('avatars.upload', { status: 413, message: 'Payload too large' })).toMatchObject(
      { kind: 'validation', code: 'too_large' },
    );
  });

  it('maps missing status to offline', () => {
    expect(storageError('avatars.upload', { message: 'Network request failed' }).kind).toBe('network');
  });

  it('maps permission failures', () => {
    expect(storageError('avatars.upload', { statusCode: '403' }).kind).toBe('forbidden');
  });
});
