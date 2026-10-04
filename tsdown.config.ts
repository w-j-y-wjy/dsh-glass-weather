/**
 * Build configuration.
 *
 * Two artifacts, both required by the dsh client-module system:
 *
 *   lib/index.js   — Host half, plain ESM for the Node/Cordis side. The
 *                    `@deepseek-ai/*` peers are provided by the profile's pnpm
 *                    closure at mount time, so they stay external.
 *   lib/client.js  — browser half. The client module system does not run a
 *                    module system of its own: it serves this file and expects
 *                    it to call `window.__ModuleLoader__.load({ id, factory })`.
 *                    A CommonJS build plus a banner/footer produces exactly that
 *                    wrapper, with `require("react")` resolving against the
 *                    shell's frozen platform module table.
 */
import { defineConfig } from 'tsdown';

/** Package name doubles as the browser module id. */
const PACKAGE_ID = 'dsh-glass-weather';

/** Host half: ESM for Cordis. */
const host = {
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'] as const,
  platform: 'node' as const,
  target: 'node22',
  dts: true,
  clean: false,
  outExtensions: () => ({ js: '.js' }),
  deps: { neverBundle: [/^@deepseek-ai\//, /^node:/] },
};

/** Browser half: wrapped CommonJS bundle. */
const client = {
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  format: ['cjs'] as const,
  platform: 'browser' as const,
  target: 'es2022',
  // The package's `exports["./client"].types` promises lib/client.d.ts, so the
  // browser half emits declarations too — otherwise a TypeScript consumer that
  // resolves `dsh-glass-weather/client` finds no types at all.
  dts: true,
  clean: false,
  outExtensions: () => ({ js: '.js' }),
  // React and the shell's static UI libraries are answered by the platform
  // module table, never bundled.
  deps: { neverBundle: ['react', 'react/jsx-runtime', 'react-dom', /^@deepseek-ai\//] },
  outputOptions: { exports: 'named' as const },
  banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
  footer: 'return module.exports; } });',
};

export default defineConfig([host, client]);
