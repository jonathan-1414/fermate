import * as Tone from 'tone';
import type { Position } from '../model/types';
import { MODUL1_PIANO, SAMPLES, type SampleSet } from './samples';
import type { Schedule } from './schedule';

/**
 * Plays a schedule: every part (instrument) with its own sampler and its own channel
 * (volume, mute, solo). Knows nothing about the score itself.
 * The audio is unlocked on the first touch (iOS only allows sound after a touch);
 * the samples of the instruments in use are loaded then, and only those.
 */
export interface Player {
  /** Call on every touch/click; does something only until the audio is running. */
  unlock(): void;
  /** The instruments of the parts (in order); their samples are loaded on the next touch. */
  prepare(instruments: string[]): void;
  play(schedule: Schedule, mix: PartMix[]): Promise<void>;
  /** Volume, mute and solo, also while playing. */
  setMix(mix: PartMix[]): void;
  stop(): void;
  isPlaying(): boolean;
}

/** How a part sounds in the mixer. */
export interface PartMix {
  instrument: string;
  volume: number; // 0..1
  mute: boolean;
  solo: boolean;
}

export interface PlayerEvents {
  /** The notes and set rests that sound right now (empty = silence). Called in time with the sound. */
  onSounding(at: Position[]): void;
  /** Playback has ended (by itself or by stop()). */
  onEnd(): void;
  /** The samples were still loading when play() was called and are there now. */
  onLoaded?(): void;
}

export interface PlayerOptions {
  /** Modul 1 has only its own small set of piano samples (c' to f''). */
  modul1?: boolean;
}

/**
 * Safari on the iPhone treats web audio as background sound and mutes it in silent mode.
 * Declaring it as music playback makes it sound like a music app (Safari 17+; other
 * browsers have no audioSession and ignore this).
 */
function declareMusicPlayback(): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (!session) return;
  try {
    session.type = 'playback';
  } catch {
    // not allowed in this browser: keep the default
  }
}

export function createPlayer(events: PlayerEvents, options: PlayerOptions = {}): Player {
  declareMusicPlayback();
  /** One sampler and one channel per part (two violins need two channels). */
  const voices: Array<{ instrument: string; sampler: Tone.Sampler; channel: Tone.Channel }> = [];
  let instruments: string[] = ['piano'];
  let playing = false;
  let request = 0; // a newer play() or a stop() makes a waiting play() give up
  let sounding = new Map<string, { at: Position; count: number }>();

  function samplesOf(instrument: string): SampleSet {
    if (options.modul1) return MODUL1_PIANO;
    return SAMPLES[instrument] ?? SAMPLES.piano;
  }

  /** Samplers for the current parts; an existing one is kept while its instrument stays. */
  function ensureVoices(): void {
    instruments.forEach((instrument, i) => {
      if (voices[i]?.instrument === instrument) return;
      voices[i]?.sampler.dispose();
      voices[i]?.channel.dispose();
      const samples = samplesOf(instrument);
      const channel = new Tone.Channel().toDestination();
      const sampler = new Tone.Sampler({
        urls: samples.urls,
        baseUrl: `${import.meta.env.BASE_URL}samples/`,
        release: samples.release,
      }).connect(channel);
      voices[i] = { instrument, sampler, channel };
    });
    for (const extra of voices.splice(instruments.length)) {
      extra.sampler.dispose();
      extra.channel.dispose();
    }
  }

  function setMix(mix: PartMix[]): void {
    mix.forEach((part, i) => {
      const voice = voices[i];
      if (!voice) return;
      voice.channel.volume.value = part.volume <= 0 ? -Infinity : 20 * Math.log10(part.volume);
      voice.channel.mute = part.mute;
      voice.channel.solo = part.solo;
    });
  }

  function report(): void {
    events.onSounding([...sounding.values()].map((s) => s.at));
  }

  function stop(): void {
    request++;
    if (!playing) return;
    playing = false;
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    // Markings already waiting to be drawn must not light up a note after the stop.
    Tone.getDraw().cancel();
    for (const voice of voices) voice.sampler.releaseAll();
    sounding = new Map();
    report();
    events.onEnd();
  }

  return {
    unlock() {
      if (Tone.getContext().state !== 'running') void Tone.start();
      ensureVoices();
    },

    prepare(list) {
      instruments = list.length > 0 ? list : ['piano'];
      if (Tone.getContext().state === 'running') ensureVoices();
    },

    async play(schedule, mix) {
      stop();
      const mine = ++request;
      await Tone.start();
      ensureVoices();
      setMix(mix);
      await Tone.loaded(); // the samples may still be loading
      events.onLoaded?.();
      if (mine !== request || schedule.notes.length === 0) return;

      const transport = Tone.getTransport();
      const draw = Tone.getDraw();
      transport.cancel();
      transport.position = 0;
      const key = (at: Position) => `${at.staff}/${at.measure}/${at.tick}`;
      for (const n of schedule.notes) {
        transport.schedule((time) => {
          // A set rest or a tied note stays silent; the marking runs over it anyway.
          if (n.note) voices[n.part]?.sampler.triggerAttackRelease(n.note, n.duration, time);
          draw.schedule(() => {
            const entry = sounding.get(key(n.at));
            sounding.set(key(n.at), { at: n.at, count: (entry?.count ?? 0) + 1 });
            report();
          }, time);
        }, n.time);
        transport.schedule((time) => {
          draw.schedule(() => {
            const entry = sounding.get(key(n.at));
            if (!entry) return;
            if (entry.count > 1) entry.count--;
            else sounding.delete(key(n.at));
            report();
          }, time);
        }, n.time + n.duration - 0.001);
      }
      // Stop after the last note has sounded a little. Not via Tone.Draw: that only runs
      // while the page is drawn, and the end must also come when the app is in the background.
      transport.schedule((time) => {
        setTimeout(stop, Math.max(0, (time - Tone.now()) * 1000));
      }, schedule.end + 0.3);
      playing = true;
      transport.start('+0.05');
    },

    setMix,
    stop,
    isPlaying: () => playing,
  };
}
