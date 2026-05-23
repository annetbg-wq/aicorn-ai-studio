import { describe, expect, it } from 'vitest';

import { resolveBundlerWasmUrl } from '../bundlerConfig';

describe('resolveBundlerWasmUrl', () => {
  it('defaults to the CDN wasm asset when no local URL is configured', () => {
    expect(resolveBundlerWasmUrl({})).toBe('https://unpkg.com/esbuild-wasm@0.25.12/esbuild.wasm');
  });

  it('uses the configured wasm URL when VITE_ESBUILD_WASM_URL is present', () => {
    expect(resolveBundlerWasmUrl({ VITE_ESBUILD_WASM_URL: ' /assets/esbuild.wasm ' })).toBe('/assets/esbuild.wasm');
  });
});