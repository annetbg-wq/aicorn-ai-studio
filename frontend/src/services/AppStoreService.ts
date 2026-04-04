/**
 * AppStoreService.ts
 *
 * Generates iOS / Android app icons from Canvas API (no external deps).
 * Packages them into a ZIP using a self-contained binary ZIP encoder.
 * Also generates App Store / Google Play listing texts via LLM.
 */

import { ConfigService } from './ConfigService';
import { Orchestrator } from './Orchestrator';
import { llmFetch } from './LLMProxy';

// ─── App Store texts ──────────────────────────────────────────────────────────

export interface AppStoreTexts {
  name:             string;   // ≤30 chars
  subtitle:         string;   // ≤30 chars
  shortDescription: string;   // ≤80 chars (Google Play)
  description:      string;   // ≤4000 chars
  keywords:         string;   // ≤100 chars, comma-separated
  privacyPolicyUrl: string;   // placeholder
  privacyPolicyText: string;  // ready-to-host markdown
}

export interface AppIcons {
  ios:     Record<string, Blob>;   // "Icon-60@2x.png"                → Blob
  android: Record<string, Blob>;   // "mipmap-hdpi/ic_launcher.png"   → Blob
}

// ─── Size tables ──────────────────────────────────────────────────────────────

const IOS_SIZES: { name: string; size: number }[] = [
  { name: 'Icon-20.png',      size: 20   },
  { name: 'Icon-20@2x.png',   size: 40   },
  { name: 'Icon-20@3x.png',   size: 60   },
  { name: 'Icon-29.png',      size: 29   },
  { name: 'Icon-29@2x.png',   size: 58   },
  { name: 'Icon-29@3x.png',   size: 87   },
  { name: 'Icon-40.png',      size: 40   },
  { name: 'Icon-40@2x.png',   size: 80   },
  { name: 'Icon-40@3x.png',   size: 120  },
  { name: 'Icon-60@2x.png',   size: 120  },
  { name: 'Icon-60@3x.png',   size: 180  },
  { name: 'Icon-76.png',      size: 76   },
  { name: 'Icon-76@2x.png',   size: 152  },
  { name: 'Icon-83.5@2x.png', size: 167  },
  { name: 'Icon-1024.png',    size: 1024 },
];

const ANDROID_SIZES: { folder: string; size: number }[] = [
  { folder: 'mipmap-mdpi',    size: 48  },
  { folder: 'mipmap-hdpi',    size: 72  },
  { folder: 'mipmap-xhdpi',   size: 96  },
  { folder: 'mipmap-xxhdpi',  size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 },
];

// ─── Theme palette ────────────────────────────────────────────────────────────

const THEME_COLORS: Record<string, { bg: string; accent: string }> = {
  'dark-slate': { bg: '#0f172a', accent: '#e2e8f0' },
  'trust':      { bg: '#1d4ed8', accent: '#ffffff' },
  'warm':       { bg: '#f97316', accent: '#ffffff' },
  'neon':       { bg: '#10b981', accent: '#030712' },
  'bloom':      { bg: '#f43f5e', accent: '#ffffff' },
};

// ─── Service ──────────────────────────────────────────────────────────────────

export class AppStoreService {

  // ── Canvas icon renderer ─────────────────────────────────────────────────

  static generateIconBlob(
    size: number,
    options: {
      backgroundColor: string;
      accentColor:     string;
      letter:          string;
      shape?:          'rounded' | 'square';
    },
  ): Promise<Blob> {
    return new Promise(resolve => {
      const canvas = document.createElement('canvas');
      canvas.width  = size;
      canvas.height = size;
      const ctx     = canvas.getContext('2d')!;
      const radius  = options.shape === 'square' ? 0 : size * 0.22;

      // Background with rounded corners
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(0, 0, size, size, radius);
      } else {
        // Fallback for older browsers
        const r = radius;
        ctx.moveTo(r, 0);
        ctx.lineTo(size - r, 0);
        ctx.quadraticCurveTo(size, 0, size, r);
        ctx.lineTo(size, size - r);
        ctx.quadraticCurveTo(size, size, size - r, size);
        ctx.lineTo(r, size);
        ctx.quadraticCurveTo(0, size, 0, size - r);
        ctx.lineTo(0, r);
        ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.closePath();
      }
      ctx.fillStyle = options.backgroundColor;
      ctx.fill();

      // Gradient overlay (save/restore to apply to same path)
      ctx.save();
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(0, 0, size, size, radius);
      } else {
        ctx.rect(0, 0, size, size);
      }
      const grad = ctx.createLinearGradient(0, 0, size, size);
      grad.addColorStop(0, 'rgba(255,255,255,0.15)');
      grad.addColorStop(1, 'rgba(0,0,0,0.1)');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();

      // Letter
      ctx.fillStyle    = options.accentColor;
      ctx.font         = `bold ${Math.round(size * 0.42)}px -apple-system, system-ui, sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(options.letter.toUpperCase(), size / 2, size / 2 + size * 0.02);

      canvas.toBlob(blob => resolve(blob!), 'image/png');
    });
  }

  // ── Batch generation ─────────────────────────────────────────────────────

  static async generateAllIcons(appName: string, theme: string): Promise<AppIcons> {
    const colors = THEME_COLORS[theme] ?? { bg: '#6366f1', accent: '#ffffff' };
    const letter = appName.charAt(0) || 'A';

    const ios: Record<string, Blob> = {};
    for (const { name, size } of IOS_SIZES) {
      ios[name] = await this.generateIconBlob(size, {
        backgroundColor: colors.bg,
        accentColor:     colors.accent,
        letter,
        shape:           'rounded',
      });
    }

    const android: Record<string, Blob> = {};
    for (const { folder, size } of ANDROID_SIZES) {
      android[`${folder}/ic_launcher.png`] = await this.generateIconBlob(size, {
        backgroundColor: colors.bg,
        accentColor:     colors.accent,
        letter,
        shape:           'square',
      });
    }

    return { ios, android };
  }

  // ── ZIP download (no external deps) ─────────────────────────────────────

  static async downloadIconsAsZip(icons: AppIcons, projectName: string): Promise<void> {
    const entries: [string, Uint8Array][] = [];

    for (const [name, blob] of Object.entries(icons.ios)) {
      entries.push([`ios-icons/${name}`, new Uint8Array(await blob.arrayBuffer())]);
    }
    for (const [path, blob] of Object.entries(icons.android)) {
      entries.push([`android-icons/${path}`, new Uint8Array(await blob.arrayBuffer())]);
    }

    const zipBytes = this._buildZip(entries);
    const zipBlob  = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
    const url      = URL.createObjectURL(zipBlob);
    const a        = document.createElement('a');
    a.href         = url;
    a.download     = `${projectName}-icons.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Minimal ZIP STORE encoder (binary-safe) ───────────────────────────────

  private static _buildZip(entries: [string, Uint8Array][]): Uint8Array {
    const enc = new TextEncoder();
    const localHeaders: Uint8Array[] = [];
    const centralDir:   Uint8Array[] = [];
    let offset = 0;

    for (const [path, data] of entries) {
      const name = enc.encode(path);
      const crc  = this._crc32(data);
      const size = data.length;
      const now  = this._dosDateTime();

      // Local file header (30 + name.length + data.length)
      const local = new Uint8Array(30 + name.length + size);
      const lv    = new DataView(local.buffer);
      lv.setUint32(0,  0x04034b50,  true);
      lv.setUint16(4,  20,          true);
      lv.setUint16(6,  0,           true);
      lv.setUint16(8,  0,           true);
      lv.setUint16(10, now.time,    true);
      lv.setUint16(12, now.date,    true);
      lv.setUint32(14, crc,         true);
      lv.setUint32(18, size,        true);
      lv.setUint32(22, size,        true);
      lv.setUint16(26, name.length, true);
      lv.setUint16(28, 0,           true);
      local.set(name, 30);
      local.set(data, 30 + name.length);
      localHeaders.push(local);

      // Central directory header (46 + name.length)
      const central = new Uint8Array(46 + name.length);
      const cv      = new DataView(central.buffer);
      cv.setUint32(0,  0x02014b50,  true);
      cv.setUint16(4,  20,          true);
      cv.setUint16(6,  20,          true);
      cv.setUint16(8,  0,           true);
      cv.setUint16(10, 0,           true);
      cv.setUint16(12, now.time,    true);
      cv.setUint16(14, now.date,    true);
      cv.setUint32(16, crc,         true);
      cv.setUint32(20, size,        true);
      cv.setUint32(24, size,        true);
      cv.setUint16(28, name.length, true);
      cv.setUint16(30, 0,           true);
      cv.setUint16(32, 0,           true);
      cv.setUint16(34, 0,           true);
      cv.setUint16(36, 0,           true);
      cv.setUint32(38, 0,           true);
      cv.setUint32(42, offset,      true);
      central.set(name, 46);
      centralDir.push(central);

      offset += local.length;
    }

    const centralOffset = offset;
    const centralSize   = centralDir.reduce((n, c) => n + c.length, 0);
    const count         = centralDir.length;

    const eocd = new Uint8Array(22);
    const ev   = new DataView(eocd.buffer);
    ev.setUint32(0,  0x06054b50,    true);
    ev.setUint16(4,  0,             true);
    ev.setUint16(6,  0,             true);
    ev.setUint16(8,  count,         true);
    ev.setUint16(10, count,         true);
    ev.setUint32(12, centralSize,   true);
    ev.setUint32(16, centralOffset, true);
    ev.setUint16(20, 0,             true);

    const totalSize = offset + centralSize + eocd.length;
    const zip       = new Uint8Array(totalSize);
    let pos = 0;
    for (const b of [...localHeaders, ...centralDir]) {
      zip.set(b, pos);
      pos += b.length;
    }
    zip.set(eocd, pos);
    return zip;
  }

  private static _crcTable: Uint32Array | null = null;
  private static _crc32(data: Uint8Array): number {
    if (!this._crcTable) {
      const t = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        t[i] = c;
      }
      this._crcTable = t;
    }
    const table = this._crcTable!;
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  private static _dosDateTime(): { time: number; date: number } {
    const d    = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time, date };
  }

  // ── App Store texts (LLM) ─────────────────────────────────────────────────

  static async generateAppStoreTexts(config: {
    appName:     string;
    description: string;
    targetUser:  string;
    pages:       string[];
    apiKey:      string;
    onLog?:      (msg: string) => void;
  }): Promise<AppStoreTexts> {
    const log = config.onLog ?? (() => {});
    log('[AppStore] Generating App Store texts…');

    const prompt = `You are an App Store Optimisation (ASO) expert.
Generate App Store listing texts for this app.

App Name: ${config.appName}
Description: ${config.description}
Target User: ${config.targetUser || 'general audience'}
Features (pages): ${config.pages.join(', ') || 'main screen'}

Output ONLY valid JSON — no markdown fences, no explanation:
{
  "name": "app name, max 30 characters",
  "subtitle": "catchy subtitle, max 30 characters",
  "shortDescription": "one sentence, max 80 characters, for Google Play",
  "description": "full App Store description 400-800 words; open with a strong hook; list key features with • bullets; close with a call to action; professional tone",
  "keywords": "comma-separated keywords, max 100 characters total, most searchable terms first"
}`;

    const modelId  = ConfigService.resolveModel('fix');
    const apiKey   = ConfigService.getKeyForAgent('fix') || config.apiKey || ConfigService.getApiKey();
    const provider = ConfigService.getAgentConfig('agent_fix').provider || 'openrouter';
    const endpoint = Orchestrator.getEndpoint(provider);

    log(`[AppStore] Using model ${modelId || '(default)'} via ${provider}`);

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      'HTTP-Referer':  window.location.origin,
    };

    const body = JSON.stringify({
      model:       modelId,
      messages:    [{ role: 'user', content: prompt }],
      max_tokens:  2000,
      temperature: 0.4,
    });

    let texts: Partial<AppStoreTexts> = {};
    try {
      const resp = await llmFetch(endpoint, headers, body);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      const data = await resp.json();
      const raw: string = data.choices?.[0]?.message?.content ?? '{}';
      log('[AppStore] LLM response received, parsing…');
      texts = JSON.parse(raw.replace(/```json\n?|```/g, '').trim());
    } catch (err) {
      log(`[AppStore] LLM error: ${err} — using defaults`);
    }

    const privacyDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    const privacyPolicyText = `# Privacy Policy for ${config.appName}

**Last updated:** ${privacyDate}

## Information We Collect

${config.appName} does not collect any personal information. All data you enter is stored locally on your device and is never transmitted to our servers.

## Data Storage

All your data is stored locally on your device using the device's secure storage. We do not have access to this data.

## Third-Party Services

This app does not use any third-party analytics, advertising, or tracking services.

## Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.

## Contact Us

If you have any questions about this Privacy Policy, please contact us.`;

    return {
      name:             (texts.name             ?? config.appName).slice(0, 30),
      subtitle:         (texts.subtitle         ?? config.description.slice(0, 30)).slice(0, 30),
      shortDescription: (texts.shortDescription ?? config.description.slice(0, 80)).slice(0, 80),
      description:      texts.description       ?? config.description,
      keywords:         (texts.keywords         ?? '').slice(0, 100),
      privacyPolicyUrl: '#',
      privacyPolicyText,
    };
  }

  // ── Exported constants (for UI) ──────────────────────────────────────────

  static get themeNames(): string[] { return Object.keys(THEME_COLORS); }
  static get iosSizeCount():     number { return IOS_SIZES.length; }
  static get androidSizeCount(): number { return ANDROID_SIZES.length; }
}
