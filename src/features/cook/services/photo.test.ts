import { compressPhoto, PHOTO_QUALITY } from './photo';

const mockNative = {
  context: { resize: jest.fn(), renderAsync: jest.fn(), release: jest.fn() },
  image: { saveAsync: jest.fn(), release: jest.fn() },
};

jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn(() => mockNative.context) },
  SaveFormat: { JPEG: 'jpeg' },
}));

beforeEach(() => {
  mockNative.context.renderAsync.mockResolvedValue(mockNative.image);
  mockNative.image.saveAsync.mockResolvedValue({
    uri: 'file:///dish.jpg',
    width: 1600,
    height: 1200,
  });
});

describe('compressPhoto', () => {
  it('shrinks to the size limit, saves a JPEG and frees the native image', async () => {
    const photo = await compressPhoto({ uri: 'file:///big.heic', width: 4032, height: 3024 });

    expect(photo).toEqual({ uri: 'file:///dish.jpg', width: 1600, height: 1200 });
    expect(mockNative.context.resize).toHaveBeenCalledWith({ width: 1600, height: 1200 });
    expect(mockNative.image.saveAsync).toHaveBeenCalledWith({
      compress: PHOTO_QUALITY,
      format: 'jpeg',
    });
    expect(mockNative.image.release).toHaveBeenCalledTimes(1);
    expect(mockNative.context.release).toHaveBeenCalledTimes(1);
  });

  it('frees the native image even when saving fails', async () => {
    mockNative.image.saveAsync.mockRejectedValueOnce(new Error('disk full'));

    await expect(
      compressPhoto({ uri: 'file:///big.heic', width: 4032, height: 3024 }),
    ).rejects.toThrow('disk full');
    expect(mockNative.image.release).toHaveBeenCalledTimes(1);
    expect(mockNative.context.release).toHaveBeenCalledTimes(1);
  });
});
