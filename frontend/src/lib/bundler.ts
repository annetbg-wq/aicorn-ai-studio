import * as esbuild from 'esbuild-wasm';
import { metricsService, enrichError } from '../services/MetricsService';
import { CDN_WASM_URL, resolveBundlerWasmUrl } from './bundlerConfig';

// --- Warm-up state --------------------------------------------------------
let isInitialized = false;
let pendingPromise: Promise<void> | null = null;

/**
 * Инициализирует esbuild-wasm.
 * Идемпотентна: повторные вызовы возвращают тот же Promise.
 * По умолчанию использует CDN-asset. Локальный URL можно передать через
 * VITE_ESBUILD_WASM_URL, когда бинарник действительно опубликован.
 */
export function initBundler(): Promise<void> {
  // Уже выполняется или завершена — возвращаем единственный Promise
  if (pendingPromise) return pendingPromise;

  pendingPromise = (async () => {
    const wasmURL = resolveBundlerWasmUrl();

    try {
      await esbuild.initialize({ wasmURL, worker: true });
      isInitialized = true;
    } catch (initErr) {
      // Сбрасываем Promise, чтобы следующий вызов мог попробовать снова
      pendingPromise = null;
      console.error(
        '[bundler] КРИТИЧЕСКАЯ ОШИБКА: не удалось загрузить esbuild WASM.\n' +
          `Используемый URL: ${wasmURL}\n` +
          `Рекомендация: проверьте VITE_ESBUILD_WASM_URL или сетевой доступ к CDN (${CDN_WASM_URL}).`,
        initErr,
      );
      throw initErr;
    }
  })();

  return pendingPromise;
}

/** Resolve an import path relative to its importer (handles ../ and ./) */
function resolvePath(importer: string, path: string): string {
  const dir = importer.split('/').slice(0, -1).join('/') || '/';
  const parts = (dir + '/' + path).split('/').filter(p => p !== '');
  const resolved: string[] = [];
  for (const p of parts) {
    if (p === '..') resolved.pop();
    else if (p !== '.') resolved.push(p);
  }
  return '/' + resolved.join('/');
}

export async function bundleFiles(
  files: Record<string, string>
): Promise<string> {
  // Если прогрев ещё не завершён — дождёмся его; если уже готов — не блокируемся
  if (!isInitialized) await initBundler();

  // Normalize keys to have leading slash
  const vfs: Record<string, string> = {};
  for (const [k, v] of Object.entries(files)) {
    vfs[k.startsWith('/') ? k : '/' + k] = v;
  }

  const entry =
    Object.keys(vfs).find(k => /\/(App|index|Dashboard)\.(tsx|jsx)$/.test(k)) ||
    Object.keys(vfs)[0];

  const plugin: esbuild.Plugin = {
    name: 'virtual-fs',
    setup(build) {
      // Silently stub out non-JS assets so they never reach esbuild loaders
      build.onResolve({ filter: /\.(sql|md|json|png|svg|txt)$/ }, () => {
        return { path: 'empty', namespace: 'empty' };
      });

      build.onLoad({ filter: /.*/, namespace: 'empty' }, () => {
        return { contents: '', loader: 'js' };
      });

      build.onResolve({ filter: /.*/ }, args => {
        // Entry file or absolute virtual path
        if (args.path.startsWith('/')) {
          const candidates = [args.path, args.path + '.tsx', args.path + '.ts'];
          const found = candidates.find(c => vfs[c]);
          if (found) return { path: found, namespace: 'virtual' };
        }

        // Relative imports
        if (args.importer && (args.path.startsWith('./') || args.path.startsWith('../'))) {
          const resolved = resolvePath(args.importer, args.path);
          const candidates = [resolved, resolved + '.tsx', resolved + '.ts'];
          const found = candidates.find(c => vfs[c]) ?? resolved + '.tsx';
          return { path: found, namespace: 'virtual' };
        }

        // react, react-dom, react-router-dom, lucide-react are all in node_modules.
        // Mark as external so esbuild does NOT bundle them — Vite ESM resolves them
        // natively from node_modules via the sandbox's import statements.
        // chart.js, gsap, and anything else also stay external (accessed via window globals).
        return { external: true };
      });

      build.onLoad({ filter: /.*/, namespace: 'virtual' }, args => {
        let content = vfs[args.path] ?? '';

        // Auto-export App from entry if it has a function App but no default export
        if (
          args.path === entry &&
          !content.match(/export\s+default/) &&
          (/function\s+App\s*\(/.test(content) || /const\s+App\s*=/.test(content))
        ) {
          content += '\nexport default App;';
        }

        const loader: esbuild.Loader =
          args.path.endsWith('.tsx') || args.path.endsWith('.jsx') ? 'tsx' :
          args.path.endsWith('.ts')  ? 'ts' : 'jsx';

        return { contents: content, loader };
      });

    },
  };

  // Отправляем событие начала сборки
  window.dispatchEvent(new CustomEvent('terminal-log', {
    detail: { msg: 'Начало сборки...', type: 'info' },
  }));

  const t0 = Date.now();
  try {
    const result = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      plugins: [plugin],
      format: 'iife',
      globalName: '__AppBundle__',
      target: 'es2017',
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      logLevel: 'silent',
    });

    metricsService.record({ phase: 'bundler', durationMs: Date.now() - t0, extra: { fileCount: Object.keys(files).length } });
    // Отправляем событие окончания сборки
    window.dispatchEvent(new CustomEvent('terminal-log', {
      detail: { msg: 'Сборка завершена успешно', type: 'info' },
    }));
    return result.outputFiles[0].text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    metricsService.recordError('bundler', msg, { durationMs: Date.now() - t0 });
    // Отправляем событие об ошибке сборки
    window.dispatchEvent(new CustomEvent('terminal-log', {
      detail: { msg: `Ошибка сборки: ${msg}`, type: 'error' },
    }));

    const enriched = enrichError(msg, 'bundler');
    if (enriched.suggestedFix !== 'Investigate manually') {
      window.dispatchEvent(new CustomEvent('auto-fix-triggered', {
        detail: {
          prompt:        enriched.agentPrompt,
          affectedFiles: enriched.affectedFiles,
          priority:      'high',
        },
      }));
    }
    throw err;
  }
}

/**
 * Синтаксическая предвалидация TSX/TS файлов через esbuild.transform.
 * Возвращает null если код валиден, иначе строку с описанием ошибки.
 */
export async function validateFiles(
  files: Record<string, string>
): Promise<string | null> {
  if (!isInitialized) {
    try { await initBundler(); } catch { return null; } // нет WASM — пропускаем
  }
  for (const [path, content] of Object.entries(files)) {
    if (!/\.(tsx?|jsx?)$/.test(path)) continue;
    try {
      await esbuild.transform(content, {
        loader: path.endsWith('.tsx') || path.endsWith('.jsx') ? 'tsx' : 'ts',
        jsx: 'transform',
        jsxFactory: 'React.createElement',
        jsxFragment: 'React.Fragment',
        target: 'es2017',
        logLevel: 'silent',
      });
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      // Извлечь первую ошибку esbuild: файл, строка, колонка
      const loc = err?.errors?.[0]?.location;
      const detail = loc
        ? `${path}:${loc.line}:${loc.column} — ${err.errors[0].text}`
        : `${path} — ${msg.split('\n')[0]}`;
      return `Syntax error in ${detail}`;
    }
  }
  return null;
}
