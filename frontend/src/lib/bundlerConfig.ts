const ESBUILD_VERSION = '0.25.12';

export const CDN_WASM_URL = `https://unpkg.com/esbuild-wasm@${ESBUILD_VERSION}/esbuild.wasm`;

export function resolveBundlerWasmUrl(
  env: { VITE_ESBUILD_WASM_URL?: string } = import.meta.env as unknown as { VITE_ESBUILD_WASM_URL?: string },
): string {
  const configuredUrl = env.VITE_ESBUILD_WASM_URL?.trim();
  return configuredUrl ? configuredUrl : CDN_WASM_URL;
}