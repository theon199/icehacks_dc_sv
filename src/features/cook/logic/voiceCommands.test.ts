import {
  classify,
  createVoiceCommandStream,
  parseDuration,
  parseVoiceCommand,
  PARTIAL_SETTLE_MS,
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

  it.each(['set a timer for five', 'timer for twenty', 'start a timer for half'])(
    'does not guess a unit for "%s"',
    (phrase) => {
      expect(parseVoiceCommand(phrase)).toBeNull();
    },
  );

  it('still reads "one timer" as a plain timer request', () => {
    expect(parseVoiceCommand('start one timer')).toEqual({ type: 'start_timer', seconds: null });
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
  const later = (at: number) => at + PARTIAL_SETTLE_MS;

  it('acts on a partial result once it stands, and not again on the final one', () => {
    const stream = createVoiceCommandStream();
    expect(stream.push('next', false, 0)).toEqual([]);
    expect(stream.settlesAt()).toBe(PARTIAL_SETTLE_MS);
    expect(stream.settle(PARTIAL_SETTLE_MS - 1)).toEqual([]);
    expect(stream.settle(later(0))).toEqual([{ type: 'next' }]);
    expect(stream.settlesAt()).toBeNull();
    expect(stream.push('next step', false, 900)).toEqual([]);
    expect(stream.settle(later(900))).toEqual([]);
    expect(stream.push('next step', true, 1200)).toEqual([]);
  });

  it('does not move on when a step that starts with a command word is read aloud', () => {
    const stream = createVoiceCommandStream();
    expect(stream.push('next', false, 0)).toEqual([]);
    expect(stream.push('next add', false, 250)).toEqual([]);
    expect(stream.settle(later(0))).toEqual([]);
    expect(stream.push('next add the garlic', false, 600)).toEqual([]);
    expect(stream.push('next add the garlic', true, 1500)).toEqual([]);
    expect(stream.settle(later(1500))).toEqual([]);
  });

  it('acts on the final result without waiting', () => {
    const stream = createVoiceCommandStream();
    expect(stream.push('back', false, 0)).toEqual([]);
    expect(stream.push('go back', true, 300)).toEqual([{ type: 'back' }]);
    expect(stream.settle(later(300))).toEqual([]);
  });

  it('restarts the wait while the command is still being said', () => {
    const stream = createVoiceCommandStream();
    stream.push('next', false, 0);
    stream.push('next step', false, 400);
    expect(stream.settle(later(0))).toEqual([]);
    expect(stream.settle(later(400))).toEqual([{ type: 'next' }]);
  });

  it('acts on the revised command when a partial is re-heard with the same word count', () => {
    const stream = createVoiceCommandStream();
    expect(stream.push('next', false, 0)).toEqual([]);
    expect(stream.push('back', false, 300)).toEqual([]);
    expect(stream.settlesAt()).toBe(later(300));
    expect(stream.settle(later(0))).toEqual([]);
    expect(stream.settle(later(300))).toEqual([{ type: 'back' }]);
  });

  it('keeps waiting from the first sighting when the same partial repeats', () => {
    const stream = createVoiceCommandStream();
    stream.push('next', false, 0);
    stream.push('next', false, 300);
    expect(stream.settle(later(0))).toEqual([{ type: 'next' }]);
  });

  it('hears a second command later in the same utterance', () => {
    const stream = createVoiceCommandStream();
    stream.push('next', false, 0);
    expect(stream.settle(later(0))).toEqual([{ type: 'next' }]);
    stream.push('next back', false, 2000);
    expect(stream.settle(later(2000))).toEqual([{ type: 'back' }]);
  });

  it('waits for the duration of a timer request', () => {
    const stream = createVoiceCommandStream();
    expect(stream.push('set a timer', false, 0)).toEqual([]);
    expect(stream.push('set a timer for', false, 200)).toEqual([]);
    expect(stream.settlesAt()).toBeNull();
    expect(stream.push('set a timer for ten minutes', false, 500)).toEqual([]);
    expect(stream.settle(later(500))).toEqual([{ type: 'start_timer', seconds: 600 }]);
    expect(stream.push('set a timer for ten minutes', true, 1500)).toEqual([]);
  });

  it('starts a plain timer when the utterance ends', () => {
    const stream = createVoiceCommandStream();
    expect(stream.push('start the timer', false, 0)).toEqual([]);
    expect(stream.push('start the timer', true, 900)).toEqual([
      { type: 'start_timer', seconds: null },
    ]);
  });

  it('does not start a timer for a number without a unit', () => {
    const stream = createVoiceCommandStream();
    expect(stream.push('set a timer for five', false, 0)).toEqual([]);
    expect(stream.push('set a timer for five', true, 900)).toEqual([]);
  });

  it('does not fire on conversation that contains a command word', () => {
    const stream = createVoiceCommandStream();
    expect(stream.push('I', false, 0)).toEqual([]);
    expect(stream.push('I went', false, 100)).toEqual([]);
    expect(stream.push('I went back', false, 200)).toEqual([]);
    expect(stream.settle(later(200))).toEqual([]);
    // A clean command after the chatter still counts.
    stream.push('I went back next', false, 300);
    expect(stream.settle(later(300))).toEqual([{ type: 'next' }]);
  });

  it('starts fresh after a final result and copes with revised partials', () => {
    const stream = createVoiceCommandStream();
    stream.push('next step please', true, 0);
    stream.push('back', false, 100);
    expect(stream.settle(later(100))).toEqual([{ type: 'back' }]);
    stream.reset();
    stream.push('repeat', false, 1000);
    expect(stream.settle(later(1000))).toEqual([{ type: 'repeat' }]);
    // The recogniser shrinks its guess; a new command after it is still heard.
    expect(stream.push('', false, 2000)).toEqual([]);
    stream.push('next', false, 2100);
    expect(stream.settle(later(2100))).toEqual([{ type: 'next' }]);
  });

  it('forgets a held command on reset', () => {
    const stream = createVoiceCommandStream();
    stream.push('next', false, 0);
    stream.reset();
    expect(stream.settle(later(0))).toEqual([]);
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
