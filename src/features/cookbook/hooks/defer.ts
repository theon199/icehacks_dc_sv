/**
 * Runs work once the JS thread is idle (after taps, transitions and the current frame), falling
 * back to a macrotask where idle callbacks are unavailable. Returns a cancel function.
 */
export function whenIdle(work: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(() => work());
    return () => cancelIdleCallback(handle);
  }
  const timeout = setTimeout(work, 0);
  return () => clearTimeout(timeout);
}
