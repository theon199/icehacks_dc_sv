import { act, renderHook } from '@testing-library/react-native';
import * as Speech from 'expo-speech';
import Storage from 'expo-sqlite/kv-store';
import { Vibration } from 'react-native';

import type { CoachRequest, CoachResponse } from '@/lib/api/ai';
import { ApiError } from '@/lib/api/errors';
import type { RecipeDetail } from '@/lib/catalog';

import type { CoachCamera, CoachQuestionDeps } from './useCoachQuestion';
import { AWAKE_WINDOW_MS, useCoachSession } from './useCoachSession';

const mockScreen = { focused: true };
jest.mock('expo-router', () => ({ useIsFocused: () => mockScreen.focused }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-image-manipulator', () => ({}));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
  AndroidImportance: { HIGH: 4 },
  IosAuthorizationStatus: { PROVISIONAL: 3, EPHEMERAL: 4 },
}));

const mockVoice = {
  handlers: {} as Record<string, ((event: unknown) => void) | undefined>,
  module: {
    isRecognitionAvailable: () => true,
    supportsOnDeviceRecognition: () => true,
    requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
    start: jest.fn(),
    abort: jest.fn(),
  },
};
jest.mock('expo-speech-recognition', () => ({
  get ExpoSpeechRecognitionModule() {
    return mockVoice.module;
  },
  useSpeechRecognitionEvent: (name: string, handler: (event: unknown) => void) => {
    mockVoice.handlers[name] = handler;
  },
}));

const speak = jest.mocked(Speech.speak);
const spoken = () => speak.mock.calls.map(([text]) => text);
/** The system voice finishing its line. */
const finishSpeaking = () => speak.mock.calls.at(-1)?.[1]?.onDone?.();

const recipe = {
  id: 'mealdb:52865',
  title: 'Matar Paneer',
  steps: [
    { position: 0, text: 'Fry the onion until soft', timerSeconds: null },
    { position: 1, text: 'Add the peas and simmer for 2 minutes', timerSeconds: 120 },
    { position: 2, text: 'Divide between two bowls', timerSeconds: null },
  ],
} as unknown as RecipeDetail;

const NOT_YET: CoachResponse = {
  verdict: 'not_yet',
  answer: "Some garam masala on the left hasn't mixed in. A few more stirs.",
  focus: { x: 0.2, y: 0.4, r: 0.12 },
  quota: { remaining: 59, reset_at: '2026-11-15T00:00:00Z' },
};

function setup(options: { cameraOn?: boolean; online?: boolean } = {}) {
  const askCoach = jest.fn<Promise<CoachResponse>, [CoachRequest, unknown]>(async () => NOT_YET);
  const deps: CoachQuestionDeps = {
    askCoach,
    isOnline: () => options.online ?? true,
    profile: () => ({ diets: ['vegetarian'], allergens: ['peanut'] }),
  };
  const capture = jest.fn(async () => ({ base64: 'STILL', width: 768, height: 1024 }));
  const camera: CoachCamera = { on: options.cameraOn ?? true, capture };
  return { askCoach, capture, deps, camera };
}

async function open(options: { cameraOn?: boolean; online?: boolean } = {}) {
  const parts = setup(options);
  const hook = await renderHook(() =>
    useCoachSession({ recipe, camera: parts.camera, deps: parts.deps }),
  );
  // The first step is read out before listening begins.
  await act(async () => finishSpeaking());
  await act(async () => mockVoice.handlers.start?.(null));
  return { ...hook, ...parts };
}

/** Lets a question's photo, request and reply settle. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}

async function say(text: string) {
  await act(async () =>
    mockVoice.handlers.result?.({ isFinal: true, results: [{ transcript: text, confidence: 1 }] }),
  );
  await settle();
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 10, 14, 18, 0) });
  mockVoice.handlers = {};
  mockScreen.focused = true;
  // The step on screen is remembered between visits; every test starts at the top.
  Storage.clearSync();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useCoachSession', () => {
  it('starts listening on device and reads the first step aloud', async () => {
    const { result } = await open();
    expect(mockVoice.module.start).toHaveBeenCalledWith(
      expect.objectContaining({ requiresOnDeviceRecognition: true, continuous: false }),
    );
    expect(spoken()).toEqual(['Step 1. Fry the onion until soft']);
    expect(result.current.mic.status).toBe('listening');
    expect(result.current.status).toEqual({ kind: 'ready' });
  });

  it('sets a named timer on device and confirms it out loud, without the AI', async () => {
    const { result, askCoach } = await open();
    await say('Hey Famara, set a 2 minute timer for the peas.');

    expect(result.current.status).toEqual({
      kind: 'timer_set',
      message: 'Peas, 2 minutes. Timer set.',
    });
    expect(result.current.timers.engine.timers).toMatchObject([
      { label: 'Peas', durationMs: 120_000, status: 'running' },
    ]);
    expect(spoken().at(-1)).toBe('Peas, 2 minutes. Timer set.');
    // The coach does not listen to itself.
    expect(mockVoice.module.abort).toHaveBeenCalled();
    expect(askCoach).not.toHaveBeenCalled();

    mockVoice.module.start.mockClear();
    await act(async () => finishSpeaking());
    expect(mockVoice.module.start).toHaveBeenCalledTimes(1);
  });

  it('starts the step’s own timer for "set a timer"', async () => {
    const { result } = await open();
    await say('next');
    expect(result.current.step).toBe(1);
    await say('hey famara set a timer');
    expect(result.current.timers.engine.timers).toMatchObject([
      { id: 'step-1', label: 'Step 2', durationMs: 120_000 },
    ]);
  });

  it('rings when a timer is done until the person says stop', async () => {
    const vibrate = jest.spyOn(Vibration, 'vibrate');
    const cancel = jest.spyOn(Vibration, 'cancel');
    const { result } = await open();
    await say('Hey Famara, set a 30 second timer for the peas');
    await act(async () => jest.advanceTimersByTime(31_000));

    expect(result.current.status).toMatchObject({ kind: 'timer_done', title: 'Peas are done' });
    expect(result.current.action).toBe('stop_alarm');
    expect(vibrate).toHaveBeenCalledWith(expect.any(Array), true);

    await say('stop');
    expect(result.current.timers.ringing.size).toBe(0);
    expect(result.current.timers.engine.timers).toEqual([]);
    expect(result.current.action).toBe('next');
    expect(cancel).toHaveBeenCalled();
  });

  it('asks a question with one still, the step, diet and allergens, and shows the verdict', async () => {
    const { result, askCoach, capture } = await open();
    await say('Hey Famara, is this stirred enough?');

    expect(capture).toHaveBeenCalledTimes(1);
    expect(askCoach).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'Is this stirred enough?',
        image: 'STILL',
        diet: ['vegetarian'],
        allergens: ['peanut'],
        recipe: expect.objectContaining({ step_index: 0, step_count: 3 }),
      }),
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(result.current.status).toMatchObject({
      kind: 'answer',
      verdict: 'not_yet',
      focus: NOT_YET.focus,
      photo: { width: 768, height: 1024 },
      withoutPhoto: null,
    });
    expect(result.current.action).toBe('check_again');
    expect(spoken().at(-1)).toBe(NOT_YET.answer);

    await act(async () => result.current.checkAgain());
    expect(askCoach).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it('takes the next phrase after a bare wake phrase as a question', async () => {
    const { result, askCoach } = await open();
    await say('Hey Famara');
    expect(result.current.status).toEqual({ kind: 'listening', heard: null });
    await say('does the onion look soft');
    expect(askCoach).toHaveBeenCalledWith(
      expect.objectContaining({ question: 'Does the onion look soft' }),
      expect.anything(),
    );
  });

  it('forgets the wake phrase after a while and ignores chatter', async () => {
    const { result, askCoach } = await open();
    await say('Hey Famara');
    await act(async () => jest.advanceTimersByTime(AWAKE_WINDOW_MS + 100));
    expect(result.current.status).toEqual({ kind: 'ready' });
    await say('does the onion look soft');
    expect(askCoach).not.toHaveBeenCalled();
  });

  it('shows what it hears once the wake phrase is said', async () => {
    const { result } = await open();
    await act(async () =>
      mockVoice.handlers.result?.({
        isFinal: false,
        results: [{ transcript: 'Hey Famara, is this', confidence: 1 }],
      }),
    );
    expect(result.current.status).toEqual({ kind: 'listening', heard: 'Hey Famara, is this' });
    await act(async () =>
      mockVoice.handlers.result?.({
        isFinal: false,
        results: [{ transcript: 'so then I said', confidence: 1 }],
      }),
    );
    expect(result.current.status).toEqual({ kind: 'listening', heard: 'Hey Famara, is this' });
  });

  it('answers from words alone when the camera is off', async () => {
    const { result, askCoach, capture } = await open({ cameraOn: false });
    await say('Hey Famara, how small should I chop the onion');
    expect(capture).not.toHaveBeenCalled();
    expect(askCoach.mock.calls[0]?.[0].image).toBeUndefined();
    expect(result.current.status).toMatchObject({
      kind: 'answer',
      photo: null,
      focus: null,
      withoutPhoto: 'camera_off',
    });
  });

  it('says so when offline instead of asking', async () => {
    const { result, askCoach } = await open({ online: false });
    await say('Hey Famara, is this done');
    expect(askCoach).not.toHaveBeenCalled();
    expect(result.current.status).toEqual({ kind: 'offline' });
  });

  it('says when today’s questions are used up, and timers still work', async () => {
    const { result, askCoach } = await open();
    askCoach.mockRejectedValueOnce(
      new ApiError({
        kind: 'rate_limited',
        functionName: 'coach',
        code: 'quota_exceeded',
        retryAfterSeconds: 600,
      }),
    );
    await say('Hey Famara, is this done');
    expect(result.current.status).toMatchObject({
      kind: 'quota',
      message: expect.stringContaining('in about 10 minutes'),
    });
    await say('Hey Famara, set a 5 minute timer for the naan');
    expect(result.current.status).toMatchObject({ kind: 'timer_set' });
  });

  it('moves between steps by voice and clears an answer about the old step', async () => {
    const { result } = await open();
    await say('Hey Famara, is this stirred enough?');
    expect(result.current.status.kind).toBe('answer');
    await say('hey famara next');
    expect(result.current.step).toBe(1);
    expect(result.current.status).toEqual({ kind: 'ready' });
    expect(spoken().at(-1)).toBe('Step 2. Add the peas and simmer for 2 minutes');
    await say('go back');
    expect(result.current.step).toBe(0);
  });

  it('stays quiet when muted, except for Repeat', async () => {
    const { result } = await open();
    speak.mockClear();
    await act(async () => result.current.toggleMuted());
    await say('Hey Famara, set a 2 minute timer for the peas');
    expect(speak).not.toHaveBeenCalled();
    await act(async () => result.current.repeat());
    expect(spoken()).toEqual(['Step 1. Fry the onion until soft']);
  });

  it('stops listening and cancels a question when the session finishes', async () => {
    const { result, askCoach } = await open();
    askCoach.mockImplementationOnce(() => new Promise(() => undefined));
    await say('Hey Famara, is this stirred enough?');
    expect(result.current.status.kind).toBe('thinking');
    const signal = askCoach.mock.calls[0]?.[1] as { signal: AbortSignal };
    await act(async () => result.current.finish());
    expect(signal.signal.aborted).toBe(true);
    expect(result.current.mic.status).toBe('off');
  });

  it('stops listening and drops a question while another screen is on top', async () => {
    const { result, askCoach, rerender } = await open();
    askCoach.mockImplementationOnce(() => new Promise(() => undefined));
    await say('Hey Famara, is this stirred enough?');
    const signal = askCoach.mock.calls[0]?.[1] as { signal: AbortSignal };

    mockVoice.module.abort.mockClear();
    mockScreen.focused = false;
    await act(async () => rerender({}));
    expect(mockVoice.module.abort).toHaveBeenCalled();
    expect(signal.signal.aborted).toBe(true);
    expect(result.current.mic.status).toBe('off');

    // A phrase the recogniser had already finished does not reach the AI off screen.
    await say('Hey Famara, does the onion look soft');
    expect(askCoach).toHaveBeenCalledTimes(1);

    mockVoice.module.start.mockClear();
    mockScreen.focused = true;
    await act(async () => rerender({}));
    await settle();
    expect(mockVoice.module.start).toHaveBeenCalledTimes(1);
    // Coming back does not read the step out again.
    expect(spoken().filter((line) => line.startsWith('Step 1'))).toHaveLength(1);
  });
});
