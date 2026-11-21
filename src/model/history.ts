/**
 * Undo history: keeps copies of earlier states. Redo (full version) keeps the states
 * that were undone, until something new happens.
 * The oldest states are dropped when the limit is reached.
 */
export class History<T> {
  private states: T[] = [];
  private undone: T[] = [];

  constructor(private readonly limit = 100) {}

  push(state: T): void {
    this.states.push(structuredClone(state));
    if (this.states.length > this.limit) this.states.shift();
    this.undone = [];
  }

  /** The state before; with `current`, that state can be restored with redo. */
  undo(current?: T): T | undefined {
    const state = this.states.pop();
    if (state !== undefined && current !== undefined) this.undone.push(structuredClone(current));
    return state;
  }

  redo(current: T): T | undefined {
    const state = this.undone.pop();
    if (state !== undefined) this.states.push(structuredClone(current));
    return state;
  }

  canUndo(): boolean {
    return this.states.length > 0;
  }

  canRedo(): boolean {
    return this.undone.length > 0;
  }

  clear(): void {
    this.states = [];
    this.undone = [];
  }
}
