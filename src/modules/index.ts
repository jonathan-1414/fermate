import { modul1 } from './modul1';
import { voll } from './voll';
import type { ModuleConfig } from './types';

const MODULES: Record<string, ModuleConfig> = { '1': modul1, voll };

/**
 * Picks the module from the link (…/?modul=1, …/?modul=voll). Unknown or missing → Modul 1.
 * The teacher can switch on setting rests with an extra part of the link
 * (…/?modul=1&pausen=ja); students cannot change this in the app.
 */
export function moduleFromSearch(search: string): ModuleConfig {
  const params = new URLSearchParams(search);
  const id = params.get('modul');
  const module = (id !== null && MODULES[id]) || modul1;
  if (params.get('pausen') === 'ja' && !module.manualRests) return { ...module, manualRests: true };
  return module;
}

/** The module a score belongs to (by its moduleId). Unknown → Modul 1. */
export function moduleById(id: string): ModuleConfig {
  return MODULES[id] ?? modul1;
}
