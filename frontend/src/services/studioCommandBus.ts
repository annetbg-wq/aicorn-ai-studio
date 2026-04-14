import type { StudioCommand } from '../types/studioCommands';

type Handler = (cmd: StudioCommand) => void;

const MAX_HISTORY = 50;

class StudioCommandBus {
  private listeners = new Map<string, Set<Handler>>();
  private history: StudioCommand[] = [];

  dispatch(command: StudioCommand): void {
    this.history.push(command);
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }

    const handlers = this.listeners.get(command.type);
    if (handlers) {
      for (const handler of handlers) {
        queueMicrotask(() => handler(command));
      }
    }
    // Wildcard listeners (subscribeAll)
    const wildcard = this.listeners.get('*');
    if (wildcard) {
      for (const handler of wildcard) {
        queueMicrotask(() => handler(command));
      }
    }
  }

  subscribe(type: StudioCommand['type'], handler: Handler): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(handler);

    return () => {
      set!.delete(handler);
      if (set!.size === 0) {
        this.listeners.delete(type);
      }
    };
  }

  /** Subscribe to ALL commands regardless of type. */
  subscribeAll(handler: Handler): () => void {
    const key = '*';
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
      if (set!.size === 0) this.listeners.delete(key);
    };
  }

  getHistory(): StudioCommand[] {
    return [...this.history];
  }
}

export const commandBus = new StudioCommandBus();
