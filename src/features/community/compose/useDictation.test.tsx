import { act, renderHook } from '@testing-library/react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

import { appendDictation, useDictation } from './useDictation';

type Listener = (event: never) => void;

/** Event handlers the hook registered, by event name, so tests can play recognition events. */
const mockListeners = new Map<string, Listener>();

jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: jest.fn(() => true),
    requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
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

const result = (transcript: string, isFinal: boolean) => ({
  isFinal,
  results: [{ transcript, confidence: 1, segments: [] }],
});

async function startDictating(initialText: string) {
  let text = initialText;
  const onText = jest.fn((next: string) => {
    text = next;
  });
  const hook = await renderHook(() => useDictation(text, onText));
  await act(async () => {
    hook.result.current.toggle();
  });
  await emit('start');
  return { ...hook, onText, current: () => text };
}

beforeEach(() => mockListeners.clear());

describe('appendDictation', () => {
  it('joins typed and spoken text with one space', () => {
    expect(appendDictation('Great soup.  ', ' Added lime ')).toBe('Great soup. Added lime');
    expect(appendDictation('', 'Hello')).toBe('Hello');
    expect(appendDictation('Typed', '   ')).toBe('Typed');
  });
});

describe('useDictation', () => {
  it('keeps each finished phrase when the next one starts', async () => {
    const session = await startDictating('Notes:');

    await emit('result', result('Used less', false));
    expect(session.current()).toBe('Notes: Used less');
    await emit('result', result('Used less oil.', true));
    await emit('result', result('Baked it', false));
    expect(session.current()).toBe('Notes: Used less oil. Baked it');
    await emit('result', result('Baked it instead.', true));

    expect(session.current()).toBe('Notes: Used less oil. Baked it instead.');
  });

  it('shuts the microphone off when the screen goes away mid-dictation', async () => {
    const session = await startDictating('');
    expect(speech.start).toHaveBeenCalledTimes(1);

    await session.unmount();

    expect(speech.abort).toHaveBeenCalledTimes(1);
  });

  it('does nothing on unmount when it was not dictating', async () => {
    const hook = await renderHook(() => useDictation('', jest.fn()));

    await hook.unmount();

    expect(speech.abort).not.toHaveBeenCalled();
  });

  it('cancel stops at once and ignores late results', async () => {
    const session = await startDictating('Draft');

    await act(async () => session.result.current.cancel());
    await emit('result', result('too late', true));

    expect(speech.abort).toHaveBeenCalledTimes(1);
    expect(session.current()).toBe('Draft');
    expect(session.result.current.listening).toBe(false);
  });
});
