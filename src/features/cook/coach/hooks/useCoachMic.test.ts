import { act, renderHook } from '@testing-library/react-native';

import { useCoachMic } from './useCoachMic';

const mockVoice = {
  /** Settles the permission prompt the hook is waiting on. */
  answer: null as ((result: { granted: boolean }) => void) | null,
  module: {
    isRecognitionAvailable: () => true,
    supportsOnDeviceRecognition: () => true,
    requestPermissionsAsync: jest.fn(
      () =>
        new Promise<{ granted: boolean }>((resolve) => {
          mockVoice.answer = resolve;
        }),
    ),
    start: jest.fn(),
    abort: jest.fn(),
  },
};
jest.mock('expo-speech-recognition', () => ({
  get ExpoSpeechRecognitionModule() {
    return mockVoice.module;
  },
  useSpeechRecognitionEvent: jest.fn(),
}));

const handlers = { onPhrase: jest.fn(), onPartial: jest.fn() };

beforeEach(() => {
  mockVoice.answer = null;
  mockVoice.module.start.mockClear();
});

async function grant() {
  await act(async () => mockVoice.answer?.({ granted: true }));
}

describe('useCoachMic', () => {
  it('starts recognising once the microphone is allowed', async () => {
    const { result } = await renderHook(() => useCoachMic(handlers));
    await act(async () => void result.current.start());
    expect(result.current.status).toBe('starting');
    await grant();
    expect(mockVoice.module.start).toHaveBeenCalledTimes(1);
  });

  it('does not start when the permission answer arrives after the screen has gone', async () => {
    const { result, unmount } = await renderHook(() => useCoachMic(handlers));
    await act(async () => void result.current.start());
    await act(async () => unmount());
    await grant();
    expect(mockVoice.module.start).not.toHaveBeenCalled();
  });

  it('does not start when listening was stopped while the prompt was open', async () => {
    const { result } = await renderHook(() => useCoachMic(handlers));
    await act(async () => void result.current.start());
    await act(async () => result.current.stop());
    await grant();
    expect(mockVoice.module.start).not.toHaveBeenCalled();
    expect(result.current.status).toBe('off');
  });

  it('uses only the latest start when it is asked to start again during the prompt', async () => {
    const { result } = await renderHook(() => useCoachMic(handlers));
    await act(async () => void result.current.start());
    const first = mockVoice.answer;
    await act(async () => result.current.stop());
    await act(async () => void result.current.start());
    await act(async () => first?.({ granted: true }));
    expect(mockVoice.module.start).not.toHaveBeenCalled();
    await grant();
    expect(mockVoice.module.start).toHaveBeenCalledTimes(1);
  });
});
