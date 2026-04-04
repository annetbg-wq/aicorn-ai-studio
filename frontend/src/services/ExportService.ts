/**
 * ExportService — Studio → Figma reverse sync.
 *
 * Builds a machine-readable spec from the current Studio files and the
 * synced ProjectTheme.  The spec maps React components + hex colors found
 * in code back to Figma token names / CSS variables, ready for the
 * AIC-RG Studio Plugin to consume when importing into Figma.
 */

import type { ProjectTheme } from './FigmaService';

export type FileMap = Record<string, string>;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ColorMapping {
  hex:        string;
  /** CSS variable name from the linked Figma file (if matched). */
  figmaVar?:  string;
  /** Human-readable style name from Figma. */
  figmaName?: string;
  usageCount: number;
}

export interface TextMapping {
  fontFamily: string;
  /** CSS variable from Figma theme. */
  figmaVar?:  string;
  sizes:      number[];
}

export interface ComponentEntry {
  name:       string;
  propsHint?: string;   // first JSDoc param or first prop name found
}

export interface ExportSpec {
  timestamp:         string;
  figmaFileKey?:     string;
  components:        ComponentEntry[];
  colorMappings:     ColorMapping[];
  textMappings:      TextMapping[];
  unmappedColors:    string[];      // colors in code with NO Figma token match
  fileCount:         number;
  estimatedFrames:   number;
  pluginNote:        string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeHex(hex: string): string {
  hex = hex.toLowerCase().trim();
  if (hex.length === 4) {
    // expand #abc → #aabbcc
    return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex;
}

function extractComponents(allCode: string): ComponentEntry[] {
  const entries: ComponentEntry[] = [];
  const seen = new Set<string>();
  // match: export default function Foo / export function Foo
  const rx = /export\s+(?:default\s+)?function\s+([A-Z]\w*)\s*\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(allCode)) !== null) {
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);
    // extract first prop name from destructured params
    const propsMatch = m[2].match(/\{\s*(\w+)/);
    entries.push({ name, propsHint: propsMatch?.[1] });
  }
  return entries;
}

function countHexOccurrences(code: string, hex: string): number {
  const escaped = hex.replace('#', '\\#');
  return (code.match(new RegExp(escaped, 'gi')) ?? []).length;
}

// ── Service ───────────────────────────────────────────────────────────────────

export const ExportService = {

  buildFigmaSpec(files: FileMap, theme: ProjectTheme | null): ExportSpec {
    const allCode = Object.values(files).join('\n');

    // Components
    const components = extractComponents(allCode);

    // All hex colors used in code
    const rawHexes = [...new Set(
      (allCode.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? [])
        .map(normalizeHex),
    )].slice(0, 40);

    // Map each hex → Figma token
    const colorMappings: ColorMapping[] = [];
    const unmappedColors: string[] = [];

    for (const hex of rawHexes) {
      const match = theme?.colors.find(
        c => normalizeHex(c.hex) === hex,
      ) ?? theme?.rawColors?.find(
        c => normalizeHex(c.hex) === hex,
      );
      const entry: ColorMapping = {
        hex,
        figmaVar:   match?.cssVar,
        figmaName:  match?.name,
        usageCount: countHexOccurrences(allCode, hex),
      };
      colorMappings.push(entry);
      if (!match) unmappedColors.push(hex);
    }

    // Sort by usage count descending
    colorMappings.sort((a, b) => b.usageCount - a.usageCount);

    // Font families used in code
    const fontRx = /fontFamily[\s:'"]+['"]([^'"]+)['"]/g;
    const fontMap = new Map<string, number[]>();
    const sizeRx  = /fontSize[\s:'"]+(\d+)/g;
    const sizes: number[] = [];
    let sm: RegExpExecArray | null;
    while ((sm = sizeRx.exec(allCode)) !== null) sizes.push(parseInt(sm[1]));

    let fm: RegExpExecArray | null;
    while ((fm = fontRx.exec(allCode)) !== null) {
      const ff = fm[1];
      if (!fontMap.has(ff)) fontMap.set(ff, []);
    }

    const textMappings: TextMapping[] = [...fontMap.keys()].slice(0, 10).map(ff => {
      const match = theme?.textStyles.find(t => t.fontFamily === ff)
        ?? theme?.rawFonts?.find(t => t.fontFamily === ff);
      return {
        fontFamily: ff,
        figmaVar:   match
          ? `--font-${ff.toLowerCase().replace(/\s+/g, '-')}`
          : undefined,
        sizes: [...new Set(sizes)].slice(0, 8),
      };
    });

    return {
      timestamp:       new Date().toISOString(),
      figmaFileKey:    theme?.figmaFileKey,
      components,
      colorMappings,
      textMappings,
      unmappedColors,
      fileCount:       Object.keys(files).length,
      estimatedFrames: Math.max(1, components.length),
      pluginNote:
        'To apply this spec in Figma: open the AIC-RG Studio Plugin, ' +
        'choose "Import Spec", and select this JSON file. ' +
        'All color tokens will be matched to existing Figma styles.',
    };
  },

  downloadSpec(spec: ExportSpec): void {
    const json = JSON.stringify(spec, null, 2);
    const blob  = new Blob([json], { type: 'application/json' });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    a.href      = url;
    a.download  = `figma-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
