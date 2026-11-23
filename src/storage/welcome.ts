/**
 * Remembers on this device that the welcome page (full version) was shown, so that it
 * comes only at the very first start. Without localStorage it simply comes every time.
 */
const KEY = 'fermate:welcome-seen';

export function welcomeSeen(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markWelcomeSeen(): void {
  try {
    globalThis.localStorage?.setItem(KEY, '1');
  } catch {
    // not saved: the page comes again next time
  }
}
