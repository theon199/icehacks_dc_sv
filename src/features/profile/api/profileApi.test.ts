import { getSupabase } from '@/lib/supabase/client';

import { replaceAvatar } from './profileApi';

jest.mock('@/lib/supabase/client', () => ({ getSupabase: jest.fn() }));
jest.mock('@/lib/id', () => ({ newId: () => 'photo-1' }));
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
  })),
}));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => ({
      resize: jest.fn(),
      renderAsync: () =>
        Promise.resolve({ saveAsync: () => Promise.resolve({ uri: 'file:///small.jpg' }) }),
    }),
  },
}));

const USER = '00000000-0000-4000-8000-000000000001';
const UPLOADED = `${USER}/photo-1.jpg`;

const profileWith = (avatarPath: string | null) => ({
  data: {
    id: USER,
    handle: 'ama_cooks',
    display_name: 'Ama Owusu',
    avatar_path: avatarPath,
    bio: '',
    cuisines: [],
    is_team: false,
  },
  error: null,
});
const noResponse = { data: null, error: { code: '', message: 'Failed to fetch' } };
const refused = { data: null, error: { code: '42501', message: 'permission denied' } };

type Outcome = { data: unknown; error: unknown };

/** A client whose profile update and follow-up profile read answer with the given outcomes. */
function fakeClient(update: Outcome, read: Outcome) {
  const remove = jest.fn(() => Promise.resolve({ data: [], error: null }));
  const upload = jest.fn((path: string) => Promise.resolve({ data: { path }, error: null }));
  const single = (outcome: Outcome) => () => Promise.resolve(outcome);
  jest.mocked(getSupabase).mockReturnValue({
    from: () => ({
      update: () => ({ eq: () => ({ select: () => ({ single: single(update) }) }) }),
      select: () => ({ eq: () => ({ single: single(read) }) }),
    }),
    storage: { from: () => ({ upload, remove }) },
  } as unknown as ReturnType<typeof getSupabase>);
  return { remove, upload };
}

const picked = { uri: 'file:///big.jpg', width: 2000, height: 2000 };

describe('replaceAvatar', () => {
  it('keeps the upload when the update committed but its response was lost', async () => {
    const { remove, upload } = fakeClient(noResponse, profileWith(UPLOADED));
    const result = await replaceAvatar(USER, picked);
    expect(upload).toHaveBeenCalledWith(UPLOADED, expect.anything(), expect.anything());
    expect(result.avatar_path).toBe(UPLOADED);
    expect(remove).not.toHaveBeenCalled();
  });

  it('removes the upload once the profile is known not to use it', async () => {
    const { remove } = fakeClient(refused, profileWith('older/photo.jpg'));
    await expect(replaceAvatar(USER, picked)).rejects.toMatchObject({ kind: 'forbidden' });
    expect(remove).toHaveBeenCalledWith([UPLOADED]);
  });

  it('keeps the upload when it cannot tell whether the update landed', async () => {
    const { remove } = fakeClient(noResponse, noResponse);
    await expect(replaceAvatar(USER, picked)).rejects.toMatchObject({ kind: 'network' });
    expect(remove).not.toHaveBeenCalled();
  });
});
