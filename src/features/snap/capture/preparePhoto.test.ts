import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { FALLBACK_QUALITY, JPEG_QUALITY, MAX_UPLOAD_BYTES } from './photoSize';
import { preparePhoto } from './preparePhoto';
import { PhotoPrepError } from '../logic/snapErrors';

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: jest.fn() },
}));

interface Saved {
  uri: string;
  width: number;
  height: number;
  base64?: string;
}

/** Base64 text that decodes to roughly `bytes` bytes. */
const base64Of = (bytes: number) => 'A'.repeat(Math.ceil((bytes * 4) / 3));

/**
 * Fakes the manipulator: each `manipulate` call records the source and resize, and each save hands
 * back the next prepared output.
 */
function fakeManipulator(outputs: Saved[]) {
  const calls: { uri: string; resize: unknown; options: unknown }[] = [];
  jest.mocked(ImageManipulator.manipulate).mockImplementation((uri) => {
    const call: { uri: string; resize: unknown; options: unknown } = {
      uri: String(uri),
      resize: null,
      options: null,
    };
    calls.push(call);
    interface FakeContext {
      resize: (size: unknown) => FakeContext;
      renderAsync: () => Promise<unknown>;
      release: () => void;
    }
    const context: FakeContext = {
      resize: jest.fn((size: unknown): FakeContext => {
        call.resize = size;
        return context;
      }),
      renderAsync: jest.fn(async () => ({
        width: 0,
        height: 0,
        release: jest.fn(),
        saveAsync: jest.fn(async (options: unknown) => {
          call.options = options;
          const next = outputs.shift();
          if (!next) throw new Error('no more outputs');
          return next;
        }),
      })),
      release: jest.fn(),
    };
    return context as never;
  });
  return calls;
}

const source = { uri: 'file:///big.jpg', width: 4032, height: 3024 };

describe('preparePhoto', () => {
  it('resizes to the longest edge limit and encodes a JPEG once when it fits', async () => {
    const calls = fakeManipulator([
      { uri: 'file:///one.jpg', width: 1280, height: 960, base64: base64Of(400_000) },
    ]);
    const photo = await preparePhoto(source);
    expect(photo).toMatchObject({ uri: 'file:///one.jpg', width: 1280, height: 960 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      uri: 'file:///big.jpg',
      resize: { width: 1280, height: 960 },
      options: { base64: true, compress: JPEG_QUALITY, format: SaveFormat.JPEG },
    });
  });

  it('makes a smaller second pass from the first result when that is still too large', async () => {
    const calls = fakeManipulator([
      { uri: 'file:///one.jpg', width: 1280, height: 960, base64: base64Of(MAX_UPLOAD_BYTES + 1) },
      { uri: 'file:///two.jpg', width: 960, height: 720, base64: base64Of(900_000) },
    ]);
    const photo = await preparePhoto(source);
    expect(photo.uri).toBe('file:///two.jpg');
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({
      uri: 'file:///one.jpg',
      resize: { width: 960, height: 720 },
      options: { compress: FALLBACK_QUALITY },
    });
  });

  it('gives up with a photo error when even the second pass is too large', async () => {
    fakeManipulator([
      { uri: 'file:///one.jpg', width: 1280, height: 960, base64: base64Of(MAX_UPLOAD_BYTES + 1) },
      { uri: 'file:///two.jpg', width: 960, height: 720, base64: base64Of(MAX_UPLOAD_BYTES + 1) },
    ]);
    await expect(preparePhoto(source)).rejects.toBeInstanceOf(PhotoPrepError);
  });

  it('turns a manipulator failure into a photo error', async () => {
    fakeManipulator([]);
    await expect(preparePhoto(source)).rejects.toBeInstanceOf(PhotoPrepError);
  });
});
