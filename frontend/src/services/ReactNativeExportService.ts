import type { FileMap } from '../hooks/useStudio';
import { ConfigService } from './ConfigService';
import type { AgentSlot } from './ConfigService';
import { Orchestrator } from './Orchestrator';
import { llmFetchStream } from './LLMProxy';

// ─── Tailwind CSS → React Native StyleSheet ────────────────────────
const TAILWIND_TO_RN: Record<string, Record<string, string | number>> = {
  'flex':            { display: 'flex' },
  'flex-col':        { flexDirection: 'column' },
  'flex-row':        { flexDirection: 'row' },
  'items-center':    { alignItems: 'center' },
  'justify-center':  { justifyContent: 'center' },
  'justify-between': { justifyContent: 'space-between' },
  'w-full':          { width: '100%' },
  'h-full':          { height: '100%' },
  'p-4':             { padding: 16 },
  'p-6':             { padding: 24 },
  'px-4':            { paddingHorizontal: 16 },
  'py-2':            { paddingVertical: 8 },
  'py-4':            { paddingVertical: 16 },
  'm-4':             { margin: 16 },
  'mt-4':            { marginTop: 16 },
  'mb-4':            { marginBottom: 16 },
  'gap-2':           { gap: 8 },
  'gap-4':           { gap: 16 },
  'rounded':         { borderRadius: 4 },
  'rounded-lg':      { borderRadius: 8 },
  'rounded-full':    { borderRadius: 9999 },
  'text-sm':         { fontSize: 14 },
  'text-base':       { fontSize: 16 },
  'text-lg':         { fontSize: 18 },
  'text-xl':         { fontSize: 20 },
  'text-2xl':        { fontSize: 24 },
  'font-medium':     { fontWeight: '500' },
  'font-bold':       { fontWeight: '700' },
  'text-center':     { textAlign: 'center' },
  'opacity-50':      { opacity: 0.5 },
};

// ─── shadcn → React Native Paper ───────────────────────────────────
const SHADCN_TO_RN_PAPER: Record<string, string> = {
  'Button':      'Button (react-native-paper)',
  'Card':        'Card (react-native-paper)',
  'CardContent': 'Card.Content',
  'CardHeader':  'Card.Title',
  'Input':       'TextInput (react-native-paper)',
  'Badge':       'Badge (react-native-paper)',
  'Dialog':      'Dialog (react-native-paper)',
  'Progress':    'ProgressBar (react-native-paper)',
  'Switch':      'Switch (react-native-paper)',
  'Tabs':        'Tab.Navigator (react-navigation)',
  'Select':      'Menu (react-native-paper)',
};

// ─── Types ──────────────────────────────────────────────────────────
export interface ReactNativeAnalysis {
  pages:                string[];
  shadcnUsed:           string[];
  shadcnMapping:        Record<string, string>;
  tailwindClasses:      string[];
  tailwindMapping:      Record<string, Record<string, string | number>>;
  hasNavigation:        boolean;
  navigationPattern:    'tabs' | 'stack' | 'none';
  estimatedComplexity:  'simple' | 'medium' | 'complex';
}

// ─── Service ────────────────────────────────────────────────────────
export class ReactNativeExportService {

  /** Analyse generated web files and produce a React Native conversion map */
  static analyze(files: FileMap): ReactNativeAnalysis {
    const allCode = Object.values(files).join('\n');

    // ── Pages ─────────────────────────────────────────────────────
    const pages = Object.keys(files)
      .filter(p => /pages?\//i.test(p))
      .map(p => p.replace(/.*pages?\//i, '').replace(/\.(tsx?|jsx?)$/, ''));

    // ── shadcn usage ──────────────────────────────────────────────
    const shadcnUsed = Object.keys(SHADCN_TO_RN_PAPER)
      .filter(comp =>
        allCode.includes(`from '@/components/ui/${comp.toLowerCase()}'`)
        || allCode.includes(`from "@/components/ui/${comp.toLowerCase()}"`)
        || new RegExp(`<${comp}[\\s/>]`).test(allCode),
      );

    const shadcnMapping: Record<string, string> = {};
    for (const comp of shadcnUsed) {
      shadcnMapping[comp] = SHADCN_TO_RN_PAPER[comp];
    }

    // ── Tailwind classes actually present ─────────────────────────
    const tailwindClasses = Object.keys(TAILWIND_TO_RN)
      .filter(cls => {
        const escaped = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(?:^|\\s|"|')${escaped}(?:\\s|"|'|$)`).test(allCode);
      });

    const tailwindMapping: Record<string, Record<string, string | number>> = {};
    for (const cls of tailwindClasses) {
      tailwindMapping[cls] = TAILWIND_TO_RN[cls];
    }

    // ── Navigation ────────────────────────────────────────────────
    const hasNavigation =
      allCode.includes('react-router-dom')
      || allCode.includes('BrowserRouter')
      || allCode.includes('useNavigate')
      || allCode.includes('<Route');

    const navigationPattern: ReactNativeAnalysis['navigationPattern'] =
      allCode.includes('bottom-tabs') || allCode.includes('TabBar') || allCode.includes('BottomTab')
        ? 'tabs'
        : hasNavigation ? 'stack' : 'none';

    // ── Complexity ────────────────────────────────────────────────
    const fileCount = Object.keys(files).length;
    const complexity: ReactNativeAnalysis['estimatedComplexity'] =
      pages.length > 5 || fileCount > 15 ? 'complex'
        : pages.length > 2 || fileCount > 6 ? 'medium'
          : 'simple';

    return {
      pages,
      shadcnUsed,
      shadcnMapping,
      tailwindClasses,
      tailwindMapping,
      hasNavigation,
      navigationPattern,
      estimatedComplexity: complexity,
    };
  }

  /** Mapping dictionaries exposed for prompt building */
  static get tailwindMap() { return TAILWIND_TO_RN; }
  static get shadcnMap()   { return SHADCN_TO_RN_PAPER; }

  // ─── LLM Generation ──────────────────────────────────────────────

  static async generateExpoProject(config: {
    files:        FileMap;
    projectName:  string;
    apiKey:       string;
    onLog?:       (msg: string) => void;
    onStream?:    (chunk: string) => void;
  }): Promise<Record<string, string>> {
    const log = config.onLog ?? (() => {});
    const analysis = this.analyze(config.files);

    log(`[RNExport] Analysis: ${analysis.pages.length} pages, ${analysis.shadcnUsed.length} shadcn components`);
    log(`[RNExport] Navigation: ${analysis.navigationPattern}, Complexity: ${analysis.estimatedComplexity}`);

    // ── Build web-code context (cap 30K chars) ───────────────────
    const webCode = Object.entries(config.files)
      .map(([path, content]) => `// FILE: ${path}\n${content}`)
      .join('\n\n')
      .slice(0, 30_000);

    const rnPrompt = `You are converting a React web application to React Native (Expo).

WEB APPLICATION CODE:
${webCode}

ANALYSIS:
- Pages: ${analysis.pages.join(', ') || '(single page)'}
- shadcn components used: ${analysis.shadcnUsed.join(', ') || 'none'}
- Navigation: ${analysis.navigationPattern}

OUTPUT: Create a complete Expo project. Use <!--FILE:path--> markers.

REQUIRED FILES:
1. app.json — Expo config with name "${config.projectName}"
2. App.tsx — root with NavigationContainer
3. screens/*.tsx — one file per page (converted from pages/)
4. components/*.tsx — shared components
5. package.json — with expo, react-native, react-native-paper, @react-navigation/native

CONVERSION RULES:
- div → View, p/span → Text, img → Image
- className → style prop with StyleSheet.create()
- onClick → onPress
- input → TextInput (react-native-paper)
- Button (shadcn) → Button (react-native-paper)
- Card (shadcn) → Card (react-native-paper)
- tabs navigation → createBottomTabNavigator (@react-navigation/bottom-tabs)
- stack navigation → createNativeStackNavigator (@react-navigation/native-stack)
- localStorage → AsyncStorage (@react-native-async-storage/async-storage)
- useState/useEffect — keep as-is (same API)
- TypeScript interfaces — keep as-is
- All business logic — keep as-is, only change UI primitives

Do NOT include:
- react-router-dom (use react-navigation instead)
- Any web-only APIs (window, document, fetch is OK)
- HTML elements (div, span, button, input, etc.)

Output ONLY the file contents with <!--FILE:path--> markers.`;

    // ── Resolve model / key / endpoint via 5-agent system (build slot) ─
    const slot: AgentSlot = 'build';
    const modelId = ConfigService.resolveModel(slot);
    const apiKey  = ConfigService.getKeyForAgent(slot) || config.apiKey;
    const agentCfg = ConfigService.getAgentConfig('agent_build');
    const provider = agentCfg.provider || 'openrouter';
    const endpoint = Orchestrator.getEndpoint(provider);

    log(`[RNExport] Using model ${modelId || '(default)'} via ${provider}`);

    // ── Streaming LLM call with 3-minute timeout ────────────────
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      'HTTP-Referer':  window.location.origin,
    };

    const body = JSON.stringify({
      model:       modelId,
      messages:    [{ role: 'user', content: rnPrompt }],
      max_tokens:  16_000,
      temperature: 0.3,
      stream:      true,
    });

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 3 * 60_000);

    let raw = '';
    try {
      const resp = await llmFetchStream(endpoint, headers, body, controller.signal);
      if (!resp.ok) throw new Error(`[RNExport] LLM error: ${resp.status} ${resp.statusText}`);

      const reader  = resp.body!.getReader();
      const decoder = new TextDecoder();

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break outer;
          try {
            const chunk = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
            const delta = chunk.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              raw += delta;
              config.onStream?.(delta);
            }
          } catch { /* skip malformed SSE lines */ }
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }

    // ── Parse <!--FILE:path--> markers ───────────────────────────
    const rnFiles: Record<string, string> = {};
    const regex = /<!--FILE:(.*?)-->([\s\S]*?)(?=<!--FILE:|$)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(raw)) !== null) {
      const filePath = match[1]?.trim();
      const fileContent = match[2]?.trim();
      if (filePath && fileContent) rnFiles[filePath] = fileContent;
    }

    log(`[RNExport] Generated ${Object.keys(rnFiles).length} files`);
    return rnFiles;
  }

  // ─── ZIP Download (no external deps) ─────────────────────────────

  static downloadAsZip(
    files: Record<string, string>,
    projectName: string,
  ): void {
    const zipBytes = this._buildZip(files);
    const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${projectName}-expo.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Minimal ZIP STORE encoder (mirrors ExportAdapter) ───────────

  private static _buildZip(files: Record<string, string>): Uint8Array {
    const enc = new TextEncoder();
    const localHeaders: Uint8Array[] = [];
    const centralDir:   Uint8Array[] = [];
    let offset = 0;

    for (const [path, content] of Object.entries(files)) {
      const name = enc.encode(path);
      const data = enc.encode(content);
      const crc  = this._crc32(data);
      const size = data.length;
      const now  = this._dosDateTime();

      // Local file header (30 + name + data)
      const local = new Uint8Array(30 + name.length + size);
      const lv = new DataView(local.buffer);
      lv.setUint32(0,  0x04034b50, true);
      lv.setUint16(4,  20,         true);
      lv.setUint16(6,  0,          true);
      lv.setUint16(8,  0,          true);
      lv.setUint16(10, now.time,   true);
      lv.setUint16(12, now.date,   true);
      lv.setUint32(14, crc,        true);
      lv.setUint32(18, size,       true);
      lv.setUint32(22, size,       true);
      lv.setUint16(26, name.length, true);
      lv.setUint16(28, 0,           true);
      local.set(name, 30);
      local.set(data, 30 + name.length);
      localHeaders.push(local);

      // Central directory header (46 + name)
      const central = new Uint8Array(46 + name.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0,  0x02014b50, true);
      cv.setUint16(4,  20,         true);
      cv.setUint16(6,  20,         true);
      cv.setUint16(8,  0,          true);
      cv.setUint16(10, 0,          true);
      cv.setUint16(12, now.time,   true);
      cv.setUint16(14, now.date,   true);
      cv.setUint32(16, crc,        true);
      cv.setUint32(20, size,       true);
      cv.setUint32(24, size,       true);
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

    const eocd  = new Uint8Array(22);
    const ev    = new DataView(eocd.buffer);
    const count = centralDir.length;
    ev.setUint32(0,  0x06054b50,    true);
    ev.setUint16(4,  0,             true);
    ev.setUint16(6,  0,             true);
    ev.setUint16(8,  count,         true);
    ev.setUint16(10, count,         true);
    ev.setUint32(12, centralSize,   true);
    ev.setUint32(16, centralOffset, true);
    ev.setUint16(20, 0,             true);

    const totalSize = offset + centralSize + eocd.length;
    const zip = new Uint8Array(totalSize);
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
    const table = this._crcTable;
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  private static _dosDateTime(): { time: number; date: number } {
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time, date };
  }
}
