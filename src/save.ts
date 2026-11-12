import type { Creature, Inventory } from './ecology';
import type { Tree } from './trees';
import type { Bear, Trap } from './bears';
import type { RareState } from './rare';

/**
 * ゲームの進捗の保存と読み込み。
 * ブラウザの localStorage に JSON で保存する（サーバー不要。同じブラウザなら続きから遊べる）。
 */

export const SAVE_KEY = 'ike-save';
export const SAVE_VERSION = 1;

/** 保存する内容 */
export interface SaveData {
  version: number;
  savedAt: number;
  mapSize: number;
  /** 地形の高さ（Float32Array を base64 にしたもの） */
  heights: string;
  /** 遊歩道のマス（Uint8Array を base64 にしたもの） */
  paths: string;
  trees: Tree[];
  creatures: Creature[];
  bears: Bear[];
  traps: Trap[];
  /** 珍しい生き物（古い保存データには無い） */
  rare?: RareState;
  state: {
    money: number;
    day: number;
    dayTimer: number;
    inventory: Inventory;
    pressure: number;
    incident: number;
  };
  camera: { position: [number, number, number]; target: [number, number, number] };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeFloats(a: Float32Array): string {
  return bytesToBase64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
}

export function decodeFloats(b64: string): Float32Array {
  const bytes = base64ToBytes(b64);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

/** 文字列から保存データを読む。形式が合わなければ null */
export function parseSave(text: string | null, mapSize: number): SaveData | null {
  if (!text) return null;
  try {
    const data = JSON.parse(text) as SaveData;
    if (data.version !== SAVE_VERSION || data.mapSize !== mapSize) return null;
    if (typeof data.heights !== 'string' || !Array.isArray(data.trees) || !data.state) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * localStorage を使う保存先。プライベートブラウズなどで使えないときは何もしない。
 */
export class SaveSlot {
  private readonly key: string;
  private disabled = false;

  constructor(key = SAVE_KEY) {
    this.key = key;
  }

  load(mapSize: number): SaveData | null {
    try {
      return parseSave(localStorage.getItem(this.key), mapSize);
    } catch {
      return null;
    }
  }

  save(data: SaveData): boolean {
    if (this.disabled) return false;
    try {
      localStorage.setItem(this.key, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  /** 保存データを消し、以後は保存しない（やり直しで再読み込みする直前に使う） */
  clear(): void {
    this.disabled = true;
    try {
      localStorage.removeItem(this.key);
    } catch {
      // 使えない環境では何もしない
    }
  }
}
