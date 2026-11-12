import {
  classify,
  createVoiceCommandStream,
  parseDuration,
  parseVoiceCommand,
  tokenize,
} from './voiceCommands';

describe('parseVoiceCommand', () => {
  it.each([
    ['next', 'next'],
    ['Next step.', 'next'],
    ['okay, next step please', 'next'],
    ['go on', 'next'],
    ['move on', 'next'],
    ['continue', 'next'],
    ['back', 'back'],
    ['Go back!', 'back'],
    ['previous step', 'back'],
    ['repeat', 'repeat'],
    ['repeat that', 'repeat'],
    ['say that again', 'repeat'],
    ['Famara, read it again please', 'repeat'],
  ])('understands "%s"', (phrase, type) => {
    expect(parseVoiceCommand(phrase)).toEqual({ type });
  });

  it.each([
    ['start timer', null],
    ['start the timer', null],
    ['timer', null],
    ['set a timer for 5 minutes', 300],
    ['start a five-minute timer', 300],
    ['timer for twenty five seconds', 25],
    ['set a timer for an hour and a half', 5400],
    ['timer for half a minute', 30],
    ['set a timer for one and a half minutes', 90],
    ['start a timer for 1.5 hours', 5400],
    ['timer 2 minutes 30 seconds', 150],
  ])('understands the timer request "%s"', (phrase, seconds) => {
    expect(parseVoiceCommand(phrase)).toEqual({ type: 'start_timer', seconds });
  });

  it.each([
    'I put it back in the oven',
    'what comes next',
    'stop the timer',
    'cancel timer',
    "don't go back",
    'go back two',
    'okay',
    '',
    'um',
  ])('ignores "%s"', (phrase) => {
    expect(parseVoiceCommand(phrase)).toBeNull();
  });

  it('prefers the timer when step words appear in a timer request', () => {
    expect(parseVoiceCommand('start the timer for the next step')).toEqual({
      type: 'start_timer',
      seconds: null,
    });
  });
});

describe('parseDuration', () => {
  it('needs a unit', () => {
    expect(parseDuration(tokenize('timer for five'))).toBeNull();
    expect(parseDuration(tokenize('a minute'))).toBe(60);
    expect(parseDuration(tokenize('minute'))).toBeNull();
  });

  it('reads the tens up to ninety and hundreds', () => {
    expect(parseDuration(tokenize('seventy five seconds'))).toBe(75);
    expect(parseDuration(tokenize('eighty seconds'))).toBe(80);
    expect(parseDuration(tokenize('a hundred seconds'))).toBe(100);
    expect(parseDuration(tokenize('one hundred twenty seconds'))).toBe(120);
    expect(parseDuration(tokenize('two hundred and fifty seconds'))).toBe(250);
  });

  it('caps absurd durations at twelve hours', () => {
    expect(parseDuration(tokenize('ninety hours'))).toBe(12 * 3600);
  });
});

describe('classify', () => {
  it('holds back a timer phrase that may still get a duration', () => {
    expect(classify(tokenize('start a timer for'), { final: false })).toEqual({
      status: 'pending',
    });
    expect(classify(tokenize('start a timer for five minutes'), { final: false })).toEqual({
      status: 'command',
      command: { type: 'start_timer', seconds: 300 },
    });
    expect(classify(tokenize('start a timer'), { final: true })).toEqual({
      status: 'command',
      command: { type: 'start_timer', seconds: null },
    });
  });
});

describe('createVoiceCommandStream', () => {
  it('acts on a partial result once and not again on the final one', () => {
    const stream = createVoiceCommandStream();
    expect(stream.push('next', false)).toEqual([{ type: 'next' }]);
    expect(stream.push('next step', false)).toEqual([]);
    expect(stream.push('next step', true)).toEqual([]);
  });

  it('hears a second command later in the same utterance', () => {
    const stream = createVoiceCommandStream();
    expect(stream.push('next', false)).toEqual([{ type: 'next' }]);
    expect(stream.push('next back', false)).toEqual([{ type: 'back' }]);
  });

  it('waits for the duration of a timer request', () => {
    const stream = createVoiceCommandStream();
    expect(stream.push('set a timer', false)).toEqual([]);
    expect(stream.push('set a timer for', false)).toEqual([]);
    expect(stream.push('set a timer for ten minutes', false)).toEqual([
      { type: 'start_timer', seconds: 600 },
    ]);
    expect(stream.push('set a timer for ten minutes', true)).toEqual([]);
  });

  it('starts a plain timer when the utterance ends', () => {
    const stream = createVoiceCommandStream();
    expect(stream.push('start the timer', false)).toEqual([]);
    expect(stream.push('start the timer', true)).toEqual([{ type: 'start_timer', seconds: null }]);
  });

  it('does not fire on conversation that contains a command word', () => {
    const stream = createVoiceCommandStream();
    expect(stream.push('I', false)).toEqual([]);
    expect(stream.push('I went', false)).toEqual([]);
    expect(stream.push('I went back', false)).toEqual([]);
    // A clean command after the chatter still counts.
    expect(stream.push('I went back next', false)).toEqual([{ type: 'next' }]);
  });

  it('starts fresh after a final result and copes with revised partials', () => {
    const stream = createVoiceCommandStream();
    stream.push('next step please', true);
    expect(stream.push('back', false)).toEqual([{ type: 'back' }]);
    stream.reset();
    expect(stream.push('repeat', false)).toEqual([{ type: 'repeat' }]);
    // The recogniser shrinks its guess; a new command after it is still heard.
    expect(stream.push('', false)).toEqual([]);
    expect(stream.push('next', false)).toEqual([{ type: 'next' }]);
  });
});

describe('parseVoiceCommand with larger numbers', () => {
  it('starts a timer for seventy five seconds', () => {
    expect(parseVoiceCommand('set a timer for seventy five seconds')).toEqual({
      type: 'start_timer',
      seconds: 75,
    });
  });
});
