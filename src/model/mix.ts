/**
 * What sounds (CLAUDE.md, section 5, "Was klingt"): if any instrument is solo, only the
 * solo instruments sound; a muted instrument never sounds. Mute and solo exclude each other.
 */

interface MixState {
  mute: boolean;
  solo: boolean;
}

/** For each instrument: does it sound right now? */
export function soundingParts(parts: MixState[]): boolean[] {
  const anySolo = parts.some((part) => part.solo);
  return parts.map((part) => !part.mute && (!anySolo || part.solo));
}

/** "Stumm" tapped: switching mute on switches solo off. */
export function toggleMute<T extends MixState>(part: T): T {
  const mute = !part.mute;
  return { ...part, mute, solo: mute ? false : part.solo };
}

/** "Solo" tapped: switching solo on switches mute off. */
export function toggleSolo<T extends MixState>(part: T): T {
  const solo = !part.solo;
  return { ...part, solo, mute: solo ? false : part.mute };
}
