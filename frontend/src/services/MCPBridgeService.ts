/**
 * MCPBridgeService — Studio → Figma "Code to Canvas" bridge.
 *
 * Figma's MCP server exposes `generate_figma_design` which captures
 * a LIVE running web UI and converts it to editable Figma layers.
 * It runs at http://127.0.0.1:3845/mcp (Figma Desktop, Dev Mode enabled).
 *
 * Browser JS CANNOT call MCP tools directly (protocol + CORS restriction).
 * This service bridges the gap:
 *   1. Detects if the local Figma MCP server is running (port 3845 ping).
 *   2. Builds a Canvas Manifest — structured JSON of components + tokens.
 *   3. Generates a Claude Desktop prompt the user can paste to trigger
 *      `generate_figma_design` on the preview URL.
 *   4. Offers Canvas Manifest download for Figma Plugin import (fallback).
 *
 * Supported MCP tools (for documentation purposes):
 *   - generate_figma_design — capture live UI → editable Figma layers (Primary)
 *   - get_design_context    — read Figma selections as React/Tailwind code
 *   - get_variable_defs     — read Figma variables/colors/typography
 */

import type { ProjectTheme } from './FigmaService';

export type FileMap = Record<string, string>;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CanvasComponent {
  name:          string;
  codeHint:      string;         // first ~400 chars of component code
  props:         string[];       // detected prop names
  estimatedSize: { width: number; height: number };
}

export interface CanvasManifest {
  version:      '1.1';
  source:       'aic-rg-studio';
  timestamp:    string;
  figmaFileKey?: string;
  components:   CanvasComponent[];
  colorTokens:  Array<{ name: string; hex: string; cssVar: string }>;
  fontTokens:   Array<{ name: string; fontFamily: string; sizes: number[] }>;
  mcpToolHint:  'generate_figma_design';
  instructions: string;
}

export type McpStatus = 'idle' | 'checking' | 'available' | 'unavailable';

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractComponents(allCode: string): CanvasComponent[] {
  const rx     = /export\s+(?:default\s+)?function\s+([A-Z]\w*)\s*\(([^)]*)\)/g;
  const result: CanvasComponent[] = [];
  const seen   = new Set<string>();
  let m: RegExpExecArray | null;

  while ((m = rx.exec(allCode)) !== null) {
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);

    // Extract likely prop names from destructured args
    const propRx   = /\{\s*([^}]+)\}/;
    const propMatch = m[2].match(propRx);
    const props    = propMatch
      ? propMatch[1].split(',').map(s => s.trim().split(/[=:]/)[0].trim()).filter(Boolean).slice(0, 8)
      : [];

    // Best-effort code slice (grab up to closing brace block)
    const start = m.index;
    const codeHint = allCode.slice(start, start + 400).replace(/\s+/g, ' ');

    result.push({
      name,
      codeHint,
      props,
      estimatedSize: { width: 1440, height: 900 },
    });
  }
  return result;
}

// ── Service ───────────────────────────────────────────────────────────────────

export const MCPBridgeService = {

  /**
   * Try to detect the Figma Desktop MCP server (port 3845).
   * Uses no-cors + AbortController so we don't hang on a dead port.
   */
  async pingDesktopServer(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout    = setTimeout(() => controller.abort(), 1800);
      await fetch('http://127.0.0.1:3845/mcp', {
        method: 'GET',
        signal: controller.signal,
        mode:   'no-cors',    // avoid CORS error, we just want a TCP response
      });
      clearTimeout(timeout);
      return true;
    } catch {
      return false;
    }
  },

  /** Build a structured Canvas Manifest from Studio files + synced theme. */
  buildCanvasManifest(files: FileMap, theme: ProjectTheme | null): CanvasManifest {
    const allCode    = Object.values(files).join('\n');
    const components = extractComponents(allCode);

    // Fallback: if no named components, use primary file
    if (components.length === 0 && files['/App.tsx']) {
      components.push({
        name:          'App',
        codeHint:      files['/App.tsx'].slice(0, 400).replace(/\s+/g, ' '),
        props:         [],
        estimatedSize: { width: 1440, height: 900 },
      });
    }

    const colorTokens = theme?.colors.map(c => ({
      name:   c.name,
      hex:    c.hex,
      cssVar: c.cssVar,
    })) ?? [];

    // Gather unique font sizes from text styles
    const fontSizeMap = new Map<string, number[]>();
    for (const t of theme?.textStyles ?? []) {
      if (!fontSizeMap.has(t.fontFamily)) fontSizeMap.set(t.fontFamily, []);
      fontSizeMap.get(t.fontFamily)!.push(t.fontSize);
    }
    const fontTokens = [...fontSizeMap.entries()].slice(0, 10).map(([fontFamily, sizes]) => {
      const ts = theme?.textStyles.find(t => t.fontFamily === fontFamily);
      return {
        name:       ts?.name ?? fontFamily,
        fontFamily,
        sizes:      [...new Set(sizes)].sort((a, b) => a - b).slice(0, 6),
      };
    });

    return {
      version:      '1.1',
      source:       'aic-rg-studio',
      timestamp:    new Date().toISOString(),
      figmaFileKey: theme?.figmaFileKey,
      components,
      colorTokens,
      fontTokens,
      mcpToolHint:  'generate_figma_design',
      instructions: [
        'To send this build to Figma canvas using MCP:',
        '1. Enable Dev Mode in Figma Desktop → enable MCP server in right sidebar.',
        '2. Add to Claude Desktop: claude mcp add --transport http figma-desktop http://127.0.0.1:3845/mcp',
        '3. Open the AIC-RG Studio preview in a browser tab.',
        '4. In Claude Desktop, run: "Use generate_figma_design to capture the UI at [preview-url]"',
        '',
        'Alternatively: install AIC-RG Studio Plugin in Figma and import this manifest file.',
      ].join('\n'),
    };
  },

  /**
   * Build a ready-to-paste Claude Desktop prompt.
   * The user pastes this into Claude Desktop (with Figma MCP configured)
   * to trigger `generate_figma_design` on the preview URL.
   */
  buildClaudePrompt(manifest: CanvasManifest, previewUrl?: string): string {
    const lines: string[] = [
      'Please use the Figma MCP `generate_figma_design` tool to capture this Studio build to Figma.',
      '',
    ];

    if (previewUrl) {
      lines.push(`Preview URL: ${previewUrl}`);
      lines.push('');
    }

    lines.push(`Components: ${manifest.components.map(c => c.name).join(', ')}`);
    lines.push(`Design tokens: ${manifest.colorTokens.length} colors, ${manifest.fontTokens.length} font families`);

    if (manifest.figmaFileKey) {
      lines.push(`Figma file key: ${manifest.figmaFileKey}`);
    }

    lines.push('');
    lines.push(
      'After capturing, apply the existing Figma color tokens where matching hex values are found.',
      'Preserve the component hierarchy as separate Figma frames.',
    );

    return lines.join('\n');
  },

  downloadManifest(manifest: CanvasManifest): void {
    const json = JSON.stringify(manifest, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `canvas-manifest-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
