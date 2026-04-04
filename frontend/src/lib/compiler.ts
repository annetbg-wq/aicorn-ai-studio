import * as esbuild from 'esbuild-wasm';

let initialized = false;

export const initCompiler = async () => {
  if (initialized) return;
  await esbuild.initialize({
    wasmURL: 'https://unpkg.com/esbuild-wasm@0.20.0/esbuild.wasm',
    worker: true,
  });
  initialized = true;
};

export const compileJSX = async (code: string): Promise<string> => {
  await initCompiler();
  const result = await esbuild.transform(code, {
    loader: 'jsx',
    jsx: 'automatic',
    jsxImportSource: 'react',
    target: 'es2017',
    format: 'iife',
    globalName: '__app__',
  });
  return result.code;
};