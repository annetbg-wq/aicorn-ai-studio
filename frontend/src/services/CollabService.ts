/**
 * CollabService.ts
 *
 * Realtime коллаборация через Yjs (CRDT) + WebSocket.
 * Не требует своего сервера — использует публичный y-websocket demo сервер.
 * Для продакшна замени WS_SERVER на свой: https://github.com/yjs/y-websocket
 *
 * Архитектура:
 *   Yjs Doc → YText per file → WebSocket sync → Awareness (курсоры)
 */

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Awareness } from 'y-protocols/awareness';
import type { FileMap } from '../hooks/useStudio';

// ── Config ────────────────────────────────────────────────────────────────────

const WS_SERVER = 'wss://demos.yjs.dev';

// Цвета для аватаров участников
const COLLAB_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f97316',
  '#10b981', '#06b6d4', '#f59e0b', '#ef4444',
];

const randomColor = () => COLLAB_COLORS[Math.floor(Math.random() * COLLAB_COLORS.length)];
const randomId    = () => Math.random().toString(36).slice(2, 8).toUpperCase();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Participant {
  clientId: number;
  name:     string;
  color:    string;
  cursor?:  { file: string; line: number; col: number };
  activeFile?: string;
}

export interface CollabState {
  roomId:       string;
  connected:    boolean;
  participants: Participant[];
  synced:       boolean;
}

type FileChangeCallback  = (files: FileMap) => void;
type StateChangeCallback = (state: CollabState) => void;
type AwarenessUserState = {
  user?: {
    name?: string;
    color?: string;
  };
  cursor?: { file: string; line: number; col: number };
  activeFile?: string;
};

// ── Service ───────────────────────────────────────────────────────────────────

class CollabServiceClass {
  private doc:      Y.Doc | null = null;
  private provider: WebsocketProvider | null = null;
  private awareness: Awareness | null = null;

  private roomId:    string = '';
  private localName: string = '';
  private localColor: string = '';

  private onFileChange:  FileChangeCallback  | null = null;
  private onStateChange: StateChangeCallback | null = null;

  // ── Join / Leave ────────────────────────────────────────────────────────────

  join(
    roomId: string,
    userName: string,
    initialFiles: FileMap,
    onFileChange: FileChangeCallback,
    onStateChange: StateChangeCallback
  ): void {
    // Если уже подключены — выходим сначала
    if (this.provider) this.leave();

    this.roomId       = roomId;
    this.localName    = userName || `User-${randomId()}`;
    this.localColor   = randomColor();
    this.onFileChange  = onFileChange;
    this.onStateChange = onStateChange;

    // Yjs doc
    this.doc = new Y.Doc();

    // WebSocket провайдер
    this.provider = new WebsocketProvider(WS_SERVER, `aicstudio-${roomId}`, this.doc, {
      connect: true,
    });

    this.awareness = this.provider.awareness;

    // Устанавливаем локальный стейт awareness (наш курсор/имя/цвет)
    this.awareness.setLocalStateField('user', {
      name:  this.localName,
      color: this.localColor,
    });

    // ── Инициализируем YText для каждого файла ──────────────────────────────
    // Только если мы первые (doc пустой) — иначе Yjs сам синхронизирует
    const yFiles = this.doc.getMap<Y.Text>('files');

    // Даём 800ms на синхронизацию с сервером, потом заливаем свои файлы
    setTimeout(() => {
      this.doc!.transact(() => {
        Object.entries(initialFiles).forEach(([name, content]) => {
          if (!yFiles.has(name)) {
            const yText = new Y.Text();
            yText.insert(0, content);
            yFiles.set(name, yText);
          }
        });
      });
    }, 800);

    // ── Observe изменения файлов ────────────────────────────────────────────
    yFiles.observe(() => {
      const updatedFiles: FileMap = {};
      yFiles.forEach((yText: Y.Text, name: string) => {
        updatedFiles[name] = yText.toString();
      });
      this.onFileChange?.(updatedFiles);
    });

    // ── Observe awareness (присутствие/курсоры) ─────────────────────────────
    this.awareness.on('change', () => this.emitState());

    // ── Connection status ───────────────────────────────────────────────────
    this.provider.on('status', ({ status }: { status: string }) => {
      this.emitState();
    });

    this.provider.on('sync', (synced: boolean) => {
      if (synced) {
        // После синхронизации — читаем актуальные файлы
        const syncedFiles: FileMap = {};
        yFiles.forEach((yText: Y.Text, name: string) => {
          syncedFiles[name] = yText.toString();
        });
        if (Object.keys(syncedFiles).length > 0) {
          this.onFileChange?.(syncedFiles);
        }
      }
      this.emitState();
    });

    this.emitState();
  }

  leave(): void {
    this.awareness?.setLocalState(null);
    this.provider?.disconnect();
    this.provider?.destroy();
    this.doc?.destroy();

    this.doc      = null;
    this.provider = null;
    this.awareness = null;
    this.roomId   = '';

    this.onStateChange?.({
      roomId: '', connected: false, participants: [], synced: false,
    });
  }

  // ── File sync ────────────────────────────────────────────────────────────

  /**
   * Вызывать при каждом изменении файла в редакторе.
   * Делает точечный diff — не перезаписывает весь YText.
   */
  updateFile(fileName: string, newContent: string): void {
    if (!this.doc) return;
    const yFiles = this.doc.getMap<Y.Text>('files');

    let yText = yFiles.get(fileName);
    if (!yText) {
      yText = new Y.Text();
      this.doc.transact(() => {
        yText!.insert(0, newContent);
        yFiles.set(fileName, yText!);
      });
      return;
    }

    const current = yText.toString();
    if (current === newContent) return;

    // Умный diff: ищем общий префикс и суффикс, меняем только середину
    this.doc.transact(() => {
      let start = 0;
      while (start < current.length && start < newContent.length && current[start] === newContent[start]) {
        start++;
      }

      let endOld = current.length;
      let endNew = newContent.length;
      while (endOld > start && endNew > start && current[endOld - 1] === newContent[endNew - 1]) {
        endOld--;
        endNew--;
      }

      if (endOld > start) yText!.delete(start, endOld - start);
      if (endNew > start) yText!.insert(start, newContent.slice(start, endNew));
    });
  }

  addFile(fileName: string, content: string = ''): void {
    if (!this.doc) return;
    const yFiles = this.doc.getMap<Y.Text>('files');
    if (yFiles.has(fileName)) return;
    const yText = new Y.Text();
    this.doc.transact(() => {
      yText.insert(0, content);
      yFiles.set(fileName, yText);
    });
  }

  deleteFile(fileName: string): void {
    if (!this.doc) return;
    const yFiles = this.doc.getMap<Y.Text>('files');
    this.doc.transact(() => { yFiles.delete(fileName); });
  }

  // ── Cursor / awareness ───────────────────────────────────────────────────

  updateCursor(file: string, line: number, col: number): void {
    this.awareness?.setLocalStateField('cursor', { file, line, col });
  }

  updateActiveFile(file: string): void {
    this.awareness?.setLocalStateField('activeFile', file);
  }

  // ── State emit ───────────────────────────────────────────────────────────

  private emitState(): void {
    if (!this.provider || !this.awareness) return;

    const participants: Participant[] = [];
    this.awareness.getStates().forEach((state: AwarenessUserState, clientId: number) => {
      if (!state?.user) return;
      participants.push({
        clientId,
        name:       state.user.name  ?? `User-${clientId}`,
        color:      state.user.color ?? '#888',
        cursor:     state.cursor,
        activeFile: state.activeFile,
      });
    });

    this.onStateChange?.({
      roomId:    this.roomId,
      connected: this.provider.wsconnected,
      synced:    this.provider.synced,
      participants,
    });
  }

  // ── Getters ───────────────────────────────────────────────────────────────

  get isConnected(): boolean {
    return this.provider?.wsconnected ?? false;
  }

  get currentRoomId(): string {
    return this.roomId;
  }

  get localUser(): { name: string; color: string } {
    return { name: this.localName, color: this.localColor };
  }
}

export const CollabService = new CollabServiceClass();
