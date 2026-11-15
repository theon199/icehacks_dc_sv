import { prepareCoachStill } from './coachPhoto';

const mockFiles = {
  /** Cache files still on disk. */
  present: new Set<string>(),
  deleted: [] as string[],
  failDelete: false,
};

jest.mock('expo-file-system', () => ({
  File: class {
    readonly mockUri: string;
    constructor(path: string) {
      this.mockUri = path;
    }
    get exists() {
      return mockFiles.present.has(this.mockUri);
    }
    delete() {
      if (mockFiles.failDelete) throw new Error('busy');
      if (!mockFiles.present.delete(this.mockUri)) throw new Error('no such file');
      mockFiles.deleted.push(this.mockUri);
    }
  },
}));

const mockSaved = { base64: 'c21hbGw=' as string | undefined, uri: 'file:///cache/small.jpg' };
const mockSave = jest.fn(async () => {
  mockFiles.present.add(mockSaved.uri);
  return { uri: mockSaved.uri, width: 768, height: 1024, base64: mockSaved.base64 };
});

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => ({
      resize: jest.fn(),
      release: jest.fn(),
      renderAsync: async () => ({ saveAsync: mockSave, release: jest.fn() }),
    }),
  },
}));

const FRAME = { uri: 'file:///cache/Camera/frame.jpg', width: 3024, height: 4032 };

beforeEach(() => {
  mockFiles.present = new Set([FRAME.uri]);
  mockFiles.deleted = [];
  mockFiles.failDelete = false;
  mockSaved.base64 = 'c21hbGw=';
  mockSave.mockClear();
});

describe('prepareCoachStill', () => {
  it('deletes the camera frame and the re-encoded file once the still is read', async () => {
    const still = await prepareCoachStill(FRAME);
    expect(still).toEqual({ base64: 'c21hbGw=', width: 768, height: 1024 });
    expect(mockFiles.deleted.sort()).toEqual([mockSaved.uri, FRAME.uri].sort());
    expect(mockFiles.present.size).toBe(0);
  });

  it('deletes both files when the still cannot be used', async () => {
    mockSaved.base64 = undefined;
    await expect(prepareCoachStill(FRAME)).rejects.toThrow('small enough');
    expect(mockFiles.present.size).toBe(0);
  });

  it('deletes the camera frame when re-encoding fails', async () => {
    mockSave.mockRejectedValueOnce(new Error('encoder'));
    await expect(prepareCoachStill(FRAME)).rejects.toThrow('encoder');
    expect(mockFiles.deleted).toEqual([FRAME.uri]);
  });

  it('never fails a question over a file that is already gone or cannot be deleted', async () => {
    mockFiles.present.clear();
    await expect(prepareCoachStill(FRAME)).resolves.toMatchObject({ width: 768 });
    mockFiles.present.add(FRAME.uri);
    mockFiles.failDelete = true;
    await expect(prepareCoachStill(FRAME)).resolves.toMatchObject({ width: 768 });
  });
});
