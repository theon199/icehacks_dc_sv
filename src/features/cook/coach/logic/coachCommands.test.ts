import {
  displayLabel,
  editDistance,
  findWakePhrase,
  parseCoachUtterance,
  saysWakePhrase,
  type CoachIntent,
} from './coachCommands';
import { tokenize } from '../../logic/voiceCommands';

const said = (text: string, awake = false) => parseCoachUtterance(text, { awake });
const intent = (text: string, awake = false): CoachIntent | null => said(text, awake).intent;

describe('the wake phrase', () => {
  it.each([
    'Hey Famara',
    'hey famara,',
    'Hey, Famara!',
    'Hi Famara',
    'Okay Famara',
    'um, hey Famara',
    'Famara',
    'Hey Tamara',
    'hey Famarra',
    'Hey Fa Mara',
    'hey for Mara',
    'Hey Famara’s',
    'a Famara',
  ])('wakes the coach on %p', (text) => {
    expect(saysWakePhrase(text)).toBe(true);
    expect(intent(text)).toEqual({ type: 'wake' });
    expect(said(text).addressed).toBe(true);
  });

  it.each(['hey', 'camera', 'a camera', 'hey can you', 'Tamara said hi', 'hey mom', 'farmer'])(
    'does not wake on %p',
    (text) => {
      expect(saysWakePhrase(text)).toBe(false);
    },
  );

  it('allows two letters off only after a clear greeting', () => {
    expect(saysWakePhrase('hey camera')).toBe(true);
    expect(saysWakePhrase('camera next')).toBe(false);
  });

  it('points at the first word after the name', () => {
    expect(findWakePhrase(tokenize('hey famara set a timer'))).toBe(2);
    expect(findWakePhrase(tokenize('hey fa mara next'))).toBe(3);
    expect(findWakePhrase(tokenize('next'))).toBe(-1);
  });

  it('measures edit distance', () => {
    expect(editDistance('famara', 'famara')).toBe(0);
    expect(editDistance('tamara', 'famara')).toBe(1);
    expect(editDistance('camera', 'famara')).toBe(2);
    expect(editDistance('', 'abc')).toBe(3);
  });

  it('ignores thanks and other chatter said to the coach', () => {
    expect(said('Hey Famara, thanks')).toEqual({ addressed: true, intent: null });
    expect(intent('hey famara never mind')).toBeNull();
  });
});

describe('step commands', () => {
  it.each<[string, CoachIntent['type']]>([
    ['Hey Famara, next', 'next'],
    ['hey famara next step please', 'next'],
    ['Hey Famara, go back', 'back'],
    ['hey famara previous step', 'back'],
    ['Hey Famara, repeat that', 'repeat'],
    ['hey famara say that again', 'repeat'],
    ['hey famara can you repeat', 'repeat'],
  ])('reads %p', (text, type) => {
    expect(intent(text)).toEqual({ type });
  });

  it('accepts bare step commands without the wake phrase', () => {
    expect(said('next')).toEqual({ addressed: false, intent: { type: 'next' } });
    expect(intent('okay next step')).toEqual({ type: 'next' });
    expect(intent('go back')).toEqual({ type: 'back' });
    expect(intent('repeat')).toEqual({ type: 'repeat' });
  });

  it('ignores chatter that only contains a command word', () => {
    expect(intent('I put it back in the fridge')).toBeNull();
    expect(intent('what comes next')).toBeNull();
    expect(intent('is this stirred enough')).toBeNull();
  });
});

describe('timers', () => {
  it.each<[string, number | null, string | null]>([
    ['Hey Famara, set a 2 minute timer for the peas.', 120, 'peas'],
    ['hey famara set a two minute timer for the peas', 120, 'peas'],
    ['Hey Famara, set a timer for the peas for two minutes', 120, 'peas'],
    ['hey famara set a peas timer for 2 minutes', 120, 'peas'],
    ['Hey Famara, and one for the naan, 5 minutes', 300, 'naan'],
    ['hey famara and one for the naan five minutes', 300, 'naan'],
    ['Hey Famara, another one for the rice, ten minutes', 600, 'rice'],
    ['hey famara one more for the garlic bread, 8 minutes', 480, 'garlic bread'],
    ['Hey Famara, a second timer for the naan, five minutes', 300, 'naan'],
    ['hey famara set a 30 second timer for the peas', 30, 'peas'],
    ['hey famara set a thirty second timer', 30, null],
    ['hey famara start the rice timer for twenty five minutes', 1500, 'rice'],
    ['Hey Famara, set the rice for 10 minutes', 600, 'rice'],
    ['hey famara set a timer for an hour and a half', 5400, null],
    ['Hey Famara, set a timer for half a minute', 30, null],
    ['hey famara timer for 90 seconds', 90, null],
    ['Hey Famara, set a 1.5 hour timer for the stock', 5400, 'stock'],
    ['hey famara set a 3 minute timer', 180, null],
    ['Hey Famara, could you set a timer for 4 minutes please', 240, null],
    ['hey famara remind me in 5 minutes', 300, null],
    ['Hey Famara, set a timer called pasta for 9 minutes', 540, 'pasta'],
  ])('reads %p', (text, seconds, label) => {
    expect(intent(text)).toEqual({ type: 'set_timer', seconds, label });
  });

  it('uses the step’s own timer when no length is said', () => {
    expect(intent('Hey Famara, set a timer')).toEqual({
      type: 'set_timer',
      seconds: null,
      label: null,
    });
    expect(intent('hey famara start the timer')).toEqual({
      type: 'set_timer',
      seconds: null,
      label: null,
    });
    expect(intent('hey famara set a timer for the peas')).toEqual({
      type: 'set_timer',
      seconds: null,
      label: 'peas',
    });
    expect(intent('hey famara set a timer for this step')).toEqual({
      type: 'set_timer',
      seconds: null,
      label: null,
    });
  });

  it('asks again when a number has no unit', () => {
    expect(intent('Hey Famara, set a timer for five')).toEqual({
      type: 'timer_unclear',
      label: null,
    });
    expect(intent('hey famara set a timer for the peas for 2')).toEqual({
      type: 'timer_unclear',
      label: 'peas',
    });
  });

  it('accepts the strict timer phrase without the wake phrase, but no names', () => {
    expect(intent('set a timer for five minutes')).toEqual({
      type: 'set_timer',
      seconds: 300,
      label: null,
    });
    expect(intent('set a 2 minute timer for the peas')).toBeNull();
  });

  it('does not set a timer from a question about one', () => {
    expect(intent('hey famara how long should I set the timer for')).toEqual({
      type: 'question',
      text: 'How long should I set the timer for',
    });
    expect(intent('hey famara don’t set a timer')).toEqual({
      type: 'question',
      text: 'Don’t set a timer',
    });
  });

  it.each<[string, string | null, boolean]>([
    ['Hey Famara, stop', null, false],
    ['hey famara cancel the peas timer', 'peas', false],
    ['Hey Famara, stop the naan timer', 'naan', false],
    ['hey famara turn off the alarm', null, false],
    ['Hey Famara, cancel all the timers', null, true],
    ['hey famara stop both timers', null, true],
    ['Hey Famara, silence the garlic bread', 'garlic bread', false],
  ])('stops with %p', (text, label, all) => {
    expect(intent(text)).toEqual({ type: 'stop_timer', label, all });
  });

  it('silences a ringing timer with a bare "stop"', () => {
    expect(said('stop')).toEqual({
      addressed: false,
      intent: { type: 'stop_timer', label: null, all: false },
    });
    expect(intent('stop the alarm')).toEqual({ type: 'stop_timer', label: null, all: false });
    expect(intent('okay stop it')).toEqual({ type: 'stop_timer', label: null, all: false });
    expect(intent('stop stirring')).toBeNull();
  });

  it.each<[string, string | null]>([
    ['Hey Famara, how long is left on the naan', 'naan'],
    ['hey famara how much time is left on the peas timer', 'peas'],
    ['Hey Famara, how long is left', null],
    ['hey famara how much longer for the rice', 'rice'],
    ['Hey Famara, what’s left on the naan', 'naan'],
    ['hey famara how’s the naan timer', 'naan'],
    ['Hey Famara, how long to go on the garlic bread please', 'garlic bread'],
  ])('reads time left from %p', (text, label) => {
    expect(intent(text)).toEqual({ type: 'time_left', label });
  });
});

describe('questions', () => {
  it('sends anything else after the wake phrase as a question, as said', () => {
    expect(intent('Hey Famara, is this stirred enough?')).toEqual({
      type: 'question',
      text: 'Is this stirred enough?',
    });
    expect(intent('hey famara does the onion look golden')).toEqual({
      type: 'question',
      text: 'Does the onion look golden',
    });
    expect(intent('Hey Famara, what’s next?')).toEqual({ type: 'question', text: 'What’s next?' });
    expect(intent('Hey Fa Mara can I use butter instead of ghee')).toEqual({
      type: 'question',
      text: 'Can I use butter instead of ghee',
    });
  });

  it('treats a follow-up after a bare wake phrase as addressed', () => {
    expect(said('is the chicken done', true)).toEqual({
      addressed: true,
      intent: { type: 'question', text: 'Is the chicken done' },
    });
    expect(intent('set a 2 minute timer for the peas', true)).toEqual({
      type: 'set_timer',
      seconds: 120,
      label: 'peas',
    });
  });

  it('keeps questions within the coach’s limit', () => {
    const result = intent(`hey famara ${'why '.repeat(120)}`);
    expect(result?.type).toBe('question');
    expect(result?.type === 'question' && result.text.length).toBeLessThanOrEqual(300);
  });
});

describe('displayLabel', () => {
  it('capitalises the first letter', () => {
    expect(displayLabel('peas')).toBe('Peas');
    expect(displayLabel('garlic bread')).toBe('Garlic bread');
  });
});
