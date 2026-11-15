import { act, renderHook } from '@testing-library/react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

import { useSweepDictation } from './useSweepDictation';

type Listener = (event: never) => void;
const mockListeners = new Map<string, Listener>();

jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: jest.fn(() => true),
    requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
    supportsOnDeviceRecognition: jest.fn(() => true),
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
  },
  useSpeechRecognitionEvent: (name: string, handler: Listener) => {
    mockListeners.set(name, handler);
  },
}));
jest.mock('@/lib/format', () => ({ deviceLocale: () => 'en-GB' }));

const speech = jest.mocked(ExpoSpeechRecognitionModule);

async function emit(name: string, event: unknown = {}) {
  await act(async () => mockListeners.get(name)?.(event as never));
}

const heard = (transcript: string, isFinal = false) => ({
  isFinal,
  results: [{ transcript, confidence: 1, segments: [] }],
});

async function listen() {
  const onEnd = jest.fn();
  const hook = await renderHook(() => useSweepDictation(onEnd));
  await act(() => hook.result.current.start());
  await emit('start');
  return { ...hook, onEnd };
}

beforeEach(() => mockListeners.clear());

describe('useSweepDictation', () => {
  it('listens on the device for one utterance and hands over the whole phrase', async () => {
    const { result, onEnd } = await listen();
    expect(speech.start).toHaveBeenCalledWith(
      expect.objectContaining({
        lang: 'en-GB',
        continuous: false,
        interimResults: true,
        requiresOnDeviceRecognition: true,
      }),
    );
    expect(result.current.status).toBe('listening');

    await emit('result', heard('paneer in'));
    expect(result.current.transcript).toBe('paneer in');
    await emit('result', heard('paneer in the freezer', true));
    expect(onEnd).not.toHaveBeenCalled();

    await emit('end');
    expect(onEnd).toHaveBeenCalledWith('paneer in the freezer');
    expect(result.current.status).toBe('off');
  });

  it('stops on request and still hands over what it heard', async () => {
    const { result, onEnd } = await listen();
    await emit('result', heard('two lemons'));
    let stopped = false;
    await act(async () => {
      stopped = result.current.stop();
    });
    expect(stopped).toBe(true);
    expect(speech.stop).toHaveBeenCalled();
    await emit('end');
    expect(onEnd).toHaveBeenCalledWith('two lemons');
    // Nothing is running any more, so there is nothing to wait for.
    expect(result.current.stop()).toBe(false);
  });

  it('reports a microphone the person turned off', async () => {
    speech.requestPermissionsAsync.mockResolvedValueOnce({ granted: false } as never);
    const onEnd = jest.fn();
    const { result } = await renderHook(() => useSweepDictation(onEnd));
    await act(() => result.current.start());
    expect(result.current.status).toBe('denied');
    expect(speech.start).not.toHaveBeenCalled();
  });

  it('ends with an empty phrase when recognition is refused mid-way', async () => {
    const { result, onEnd } = await listen();
    await emit('error', { error: 'not-allowed', message: '' });
    expect(result.current.status).toBe('denied');
    expect(onEnd).toHaveBeenCalledWith('');
  });

  it('shuts the microphone off when the screen goes away', async () => {
    const { unmount } = await listen();
    await unmount();
    expect(speech.abort).toHaveBeenCalledTimes(1);
  });
});
