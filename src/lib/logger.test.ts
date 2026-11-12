import { createLogger, describeError } from './logger';

describe('createLogger', () => {
  it('records entries above the minimum level', () => {
    const logger = createLogger({ console: false, minLevel: 'info', now: () => 42 });
    logger.debug('ignored');
    logger.info('kept', { id: 1 });
    expect(logger.recent()).toEqual([
      { level: 'info', message: 'kept', context: { id: 1 }, at: 42 },
    ]);
  });

  it('keeps only the most recent 100 entries', () => {
    const logger = createLogger({ console: false, minLevel: 'debug' });
    for (let i = 0; i < 120; i += 1) logger.info(`m${i}`);
    const recent = logger.recent();
    expect(recent).toHaveLength(100);
    expect(recent[0]?.message).toBe('m20');
  });

  it('forwards to sinks and survives a failing sink', () => {
    const logger = createLogger({ console: false, minLevel: 'debug' });
    const seen: string[] = [];
    logger.addSink(() => {
      throw new Error('sink down');
    });
    const remove = logger.addSink((entry) => seen.push(entry.message));
    logger.warn('first');
    remove();
    logger.warn('second');
    expect(seen).toEqual(['first']);
  });

  it('never prints when console output is off', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    createLogger({ console: false, minLevel: 'debug' }).error('quiet');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('prints in development mode', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    createLogger({ console: true, minLevel: 'debug' }).warn('loud');
    expect(spy).toHaveBeenCalledWith('[famara] loud');
    spy.mockRestore();
  });
});

describe('describeError', () => {
  it('handles errors and arbitrary values', () => {
    expect(describeError(new TypeError('bad'))).toMatchObject({
      name: 'TypeError',
      message: 'bad',
    });
    expect(describeError('oops')).toEqual({ value: 'oops' });
  });
});
