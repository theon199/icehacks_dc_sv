import { firebaseSignIn, firebaseSignOut, firebaseSignUp, getFirebaseSession } from './auth';
import type * as http from './http';
import { firebaseRequest } from './http';

jest.mock('./config', () => ({
  getFirebaseConfig: () => ({ projectId: 'famara-test', apiKey: 'test-key' }),
}));
jest.mock('./http', () => ({
  ...jest.requireActual<typeof http>('./http'),
  firebaseRequest: jest.fn(),
}));
jest.mock('../supabase/secureStorage', () => ({
  createChunkedSecureStorage: () => ({
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  }),
}));

const request = jest.mocked(firebaseRequest);

const passwordReply = {
  localId: 'user-1',
  email: 'new@example.com',
  idToken: 'id-token',
  refreshToken: 'refresh-token',
  expiresIn: '3600',
};

const calledActions = () => request.mock.calls.map(([url]) => String(url).split('accounts:')[1]);

describe('Firebase email auth without verification', () => {
  beforeEach(async () => {
    request.mockReset();
    await firebaseSignOut();
  });

  it('signs a new account in straight away, without sending a verification email', async () => {
    request.mockResolvedValueOnce(passwordReply);
    const account = await firebaseSignUp('new@example.com', 'long enough');
    expect(account.userId).toBe('user-1');
    expect(await getFirebaseSession()).toMatchObject({ userId: 'user-1' });
    expect(calledActions()).toEqual(['signUp?key=test-key']);
  });

  it('signs in an account whose email was never confirmed', async () => {
    request.mockResolvedValueOnce(passwordReply);
    await firebaseSignIn('new@example.com', 'long enough');
    expect(await getFirebaseSession()).toMatchObject({ email: 'new@example.com' });
    // No account lookup and no verified-email gate.
    expect(calledActions()).toEqual(['signInWithPassword?key=test-key']);
  });
});
