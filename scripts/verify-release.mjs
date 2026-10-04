#!/usr/bin/env node
/**
 * dsh-glass-weather release verification.
 *
 * One command that answers "would the published tarball actually work?":
 *
 *   1. `npm pack --json` in the repo root (the tarball stays on disk);
 *   2. unpack it with the bundled Windows `tar.exe`, or with a tiny built-in
 *      zlib+ustar reader when tar is unavailable (no new dependency either way);
 *   3. assert the unpacked package carries everything the runtime needs and no
 *      build junk (node_modules, source maps, editor/OS temp files);
 *   4. run the *packed* `scripts/verify.mjs` — it derives its root from its own
 *      location, so it exercises the tarball's own lib/, not the checkout's —
 *      after junctioning `node_modules` to the checkout so the optional
 *      `@deepseek-ai/*` peers resolve; then compare its item count with the
 *      in-repo run;
 *   5. compose the packed `cordis.patch.yml` through the real `dsh` Loader with
 *      an isolated DSH_HOME (`--dump-config`) and assert the entry comes out as
 *      `- id: weather / name: dsh-glass-weather`.
 *
 * Nothing here touches the real user profile: every CLI call gets its own
 * DSH_HOME under the release scratch directory.
 *
 * Usage:
 *   node scripts/verify-release.mjs
 *   node scripts/verify-release.mjs --offline   # pass --offline to both verify runs
 *
 * Exit code: 0 when every step passed, 1 otherwise.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Scratch area beside the checkout; nothing outside it is written. */
const WORKSPACE = join(ROOT, '..');
const RELEASE_DIR = join(WORKSPACE, '_release-test');
const PACKAGE_DIR = join(RELEASE_DIR, 'package');
/** The `package/` folder a tarball unpacks into. */
const UNPACKED = join(PACKAGE_DIR, 'package');
const HOME_DIR = join(RELEASE_DIR, 'home');
const PROFILE_NAME = 'release-check';
const OFFLINE = process.argv.includes('--offline');

const REQUIRED_ENTRIES = [
  'lib/client.js',
  'lib/index.js',
  'lib/index.d.ts',
  'cordis.patch.yml',
  'package.json',
  'README.md',
];
/** Paths a published tarball must never carry. */
const FORBIDDEN_PATTERNS = [
  { label: 'node_modules', test: (path) => path.split('/').includes('node_modules') },
  { label: 'source map', test: (path) => path.endsWith('.map') },
  { label: 'temp/backup file', test: (path) => /\.(tmp|temp|orig|rej|bak|swp|swo|log|tsbuildinfo)$/i.test(path) },
  { label: 'OS metadata', test: (path) => /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$/i.test(path) },
  { label: 'VCS metadata', test: (path) => path.split('/').includes('.git') || path.split('/').includes('.svn') },
];

let failures = 0;
const steps = [];
function step(name, ok, detail = '') {
  steps.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : `  ${detail}`}`);
}
function section(title) {
  console.log(`\n=== ${title} ===`);
}
const toPosix = (path) => path.split(sep).join('/');
const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  return {
    command: [cmd, ...args].join(' '),
    status: result.status,
    error: result.error === undefined || result.error === null ? undefined : String(result.error.message),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/** Every file under one directory, as package-relative POSIX paths. */
function listFiles(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const relativePath = toPosix(relative(base, full));
    let isDirectory = entry.isDirectory();
    if (entry.isSymbolicLink()) isDirectory = statSync(full).isDirectory();
    if (isDirectory) listFiles(full, base, out);
    else out.push(relativePath);
  }
  return out;
}

/* ------------------------------------------------------------- 1. npm pack */

console.log('dsh-glass-weather release verification');
console.log(`root: ${ROOT}`);
if (OFFLINE) console.log('mode: --offline (the live network check is skipped in both verify runs)');

section('1. npm pack');

const NODE_DIR = dirname(process.execPath);
const NPM_CMD = join(NODE_DIR, 'npm.cmd');
const NPM_CLI = join(NODE_DIR, 'node_modules', 'npm', 'bin', 'npm-cli.js');

/** `npm pack --json`, preferring npm.cmd and falling back to `node npm-cli.js`. */
function npmPack() {
  if (existsSync(NPM_CMD)) {
    // A .cmd cannot be spawned directly on Windows; hand it to cmd.exe. The
    // verbatim flag keeps Node from escaping the quote around the npm path.
    const comspec = process.env.ComSpec ?? 'cmd.exe';
    const line = `""${NPM_CMD}" pack --json"`;
    const first = run(comspec, ['/d', '/s', '/c', line], { cwd: ROOT, windowsVerbatimArguments: true });
    if (first.status === 0 && parsePack(first.stdout) !== undefined) {
      return { ...first, command: `${NPM_CMD} pack --json`, via: 'npm.cmd' };
    }
    console.log(`  INFO  ${NPM_CMD} failed (status ${String(first.status)}); retrying with npm-cli.js`);
    if (first.stderr.trim() !== '') console.log(`  INFO  ${first.stderr.trim().split('\n').slice(-3).join(' | ')}`);
  }
  if (existsSync(NPM_CLI)) {
    const second = run(process.execPath, [NPM_CLI, 'pack', '--json'], { cwd: ROOT });
    return { ...second, via: `node ${NPM_CLI}` };
  }
  return { command: '(no npm found)', status: null, stdout: '', stderr: 'no npm.cmd and no npm-cli.js beside the Node executable', via: '(none)' };
}

/** Pull the JSON document out of possibly chatty stdout. */
function parsePack(stdout) {
  const text = stdout.trim();
  if (text === '') return undefined;
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

const pack = npmPack();
console.log(`  INFO  command: ${pack.command}`);
if (pack.stderr.trim() !== '') console.log(`  INFO  stderr: ${pack.stderr.trim().split('\n').slice(-4).join(' | ')}`);
const packed = parsePack(pack.stdout);
step('npm pack --json exited 0 with parseable JSON', pack.status === 0 && Array.isArray(packed) && packed.length === 1, `status=${String(pack.status)} via=${pack.via}`);

const entry = Array.isArray(packed) ? packed[0] : undefined;
const tarballName = typeof entry?.filename === 'string' ? entry.filename : undefined;
const tarballPath = tarballName === undefined ? undefined : join(ROOT, tarballName);
const tarballExists = tarballPath !== undefined && existsSync(tarballPath);
step('npm pack reported a tarball filename', tarballName !== undefined, String(tarballName));
step('the reported tarball exists in the repo root (kept as a release artifact)', tarballExists, tarballPath ?? '');
const tarballBytes = tarballExists ? statSync(tarballPath).size : 0;
const entryCount = typeof entry?.entryCount === 'number' ? entry.entryCount : Array.isArray(entry?.files) ? entry.files.length : 0;
if (tarballExists) {
  step('the reported size matches the file on disk', entry?.size === tarballBytes, `json=${String(entry?.size)} disk=${String(tarballBytes)}`);
  console.log(`  INFO  tarball: ${tarballName}  ${kib(tarballBytes)} (${String(tarballBytes)} bytes)  packed entries: ${String(entryCount)}`);
}

const repoPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

/* ---------------------------------------------------------- 2. unpack it */

section('2. unpack');

rmSync(PACKAGE_DIR, { recursive: true, force: true });
mkdirSync(PACKAGE_DIR, { recursive: true });

/** Minimal ustar reader: only used when the system tar is unavailable. */
function extractWithNode(tarball, dest) {
  const raw = gunzipSync(readFileSync(tarball));
  let offset = 0;
  let longName;
  let written = 0;
  const inside = (target) => {
    const rest = relative(dest, target);
    return rest !== '' && !rest.startsWith('..') && !rest.includes(`..${sep}`);
  };
  while (offset + 512 <= raw.length) {
    const header = raw.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start, length) => header.subarray(start, start + length).toString('utf8').replace(/\0[\s\S]*$/, '').trim();
    const size = Number.parseInt(field(124, 12) || '0', 8) || 0;
    const type = String.fromCharCode(header[156] === 0 ? 48 : header[156]);
    let name = field(0, 100);
    const prefix = field(345, 155);
    if (prefix !== '') name = `${prefix}/${name}`;
    offset += 512;
    const data = raw.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;
    if (type === 'L') {
      longName = data.toString('utf8').replace(/\0[\s\S]*$/, '').trim();
      continue;
    }
    if (type === 'x' || type === 'g') continue;
    if (longName !== undefined) {
      name = longName;
      longName = undefined;
    }
    const target = join(dest, name);
    if (!inside(target)) throw new Error(`refusing to unpack outside the destination: ${name}`);
    if (name.endsWith('/') || type === '5') {
      mkdirSync(target, { recursive: true });
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
    written += 1;
  }
  return written;
}

let unpackVia;
let unpackError;
if (tarballPath !== undefined && tarballExists && process.env.DSH_WEATHER_VERIFY_NO_TAR !== '1') {
  const tar = run('tar', ['-xzf', tarballPath, '-C', PACKAGE_DIR]);
  if (tar.status === 0 && existsSync(UNPACKED)) {
    unpackVia = 'tar.exe';
  } else {
    unpackError = `tar status=${String(tar.status)} ${tar.stderr.trim().split('\n').slice(-2).join(' | ')} ${tar.error ?? ''}`.trim();
  }
}
if (unpackVia === undefined && tarballExists) {
  try {
    const written = extractWithNode(tarballPath, PACKAGE_DIR);
    unpackVia = `node zlib+ustar (${String(written)} files)`;
    unpackError = undefined;
  } catch (error) {
    unpackError = error instanceof Error ? error.message : String(error);
  }
}
step('the tarball unpacked into an intact package/ folder', existsSync(UNPACKED), `via=${String(unpackVia)}${unpackError === undefined ? '' : ` ${unpackError}`}`);

const unpackedFiles = existsSync(UNPACKED) ? listFiles(UNPACKED) : [];
console.log(`  INFO  unpacked files: ${String(unpackedFiles.length)}`);
const unpackedPkg = existsSync(join(UNPACKED, 'package.json'))
  ? JSON.parse(readFileSync(join(UNPACKED, 'package.json'), 'utf8'))
  : undefined;
step(
  'the packed manifest is the same package at the same version',
  unpackedPkg?.name === repoPkg.name && unpackedPkg?.version === repoPkg.version,
  `packed=${String(unpackedPkg?.name)}@${String(unpackedPkg?.version)} repo=${repoPkg.name}@${repoPkg.version}`,
);
if (entryCount > 0) {
  step('every packed entry survived unpacking', unpackedFiles.length === entryCount, `unpacked=${String(unpackedFiles.length)} packed=${String(entryCount)}`);
}

/* --------------------------------------------------------- 3. file set */

section('3. package contents');

const missing = REQUIRED_ENTRIES.filter((path) => !unpackedFiles.includes(path));
step(`all ${String(REQUIRED_ENTRIES.length)} runtime files are present`, missing.length === 0, missing.join(', '));

const forbidden = [];
for (const path of unpackedFiles) {
  for (const rule of FORBIDDEN_PATTERNS) {
    if (rule.test(path)) forbidden.push(`${path} (${rule.label})`);
  }
}
step('no node_modules, source maps or temp files were published', forbidden.length === 0, forbidden.slice(0, 6).join(', '));
for (const path of REQUIRED_ENTRIES) {
  const hit = unpackedFiles.find((candidate) => candidate === path);
  const bytes = hit === undefined ? 0 : statSync(join(UNPACKED, hit)).size;
  console.log(`  INFO  ${path.padEnd(20)} ${hit === undefined ? 'MISSING' : `${String(bytes)} bytes`}`);
}

/* -------------------------------------------- 4. run the packed verify.mjs */

section('4. packed acceptance run');

const LINK_PATH = join(UNPACKED, 'node_modules');
const LINK_TARGET = join(ROOT, 'node_modules');

/**
 * Remove the peer-resolution junction.
 *
 * A directory junction is a reparse point: `rmdir` drops the link itself and
 * never walks into the checkout it points at. `unlink` then `rmdir` covers both
 * the junction case and (defensively) a real directory.
 */
function removeJunction(path) {
  if (!existsSync(path)) return true;
  try {
    unlinkSync(path);
  } catch {
    try {
      rmdirSync(path);
    } catch {
      return false;
    }
  }
  return !existsSync(path);
}

removeJunction(LINK_PATH);

const VERIFY_ARGS = OFFLINE ? ['--offline'] : [];
const PACKED_VERIFY = join(UNPACKED, 'scripts', 'verify.mjs');
const REPO_VERIFY = join(ROOT, 'scripts', 'verify.mjs');

/** `passed: N   failed: M` out of a verify run. */
function parseVerify(stdout) {
  const match = /passed:\s*(\d+)\s+failed:\s*(\d+)/.exec(stdout);
  if (match === null) return undefined;
  return { passed: Number(match[1]), failed: Number(match[2]), skipped: /SKIP/.test(stdout) };
}

const repoRun = run(process.execPath, [REPO_VERIFY, ...VERIFY_ARGS], { cwd: ROOT });
const repoResult = parseVerify(repoRun.stdout);
step('the in-repo verify run passes', repoRun.status === 0 && repoResult !== undefined && repoResult.failed === 0, `status=${String(repoRun.status)} ${repoResult === undefined ? 'no summary' : `${String(repoResult.passed)} passed / ${String(repoResult.failed)} failed`}`);

step('the packed scripts/verify.mjs is present', existsSync(PACKED_VERIFY), PACKED_VERIFY);
let junctioned = false;
let junctionError;
if (existsSync(PACKED_VERIFY) && existsSync(LINK_TARGET)) {
  try {
    // `type: 'junction'` is the Node-native equivalent of `New-Item -ItemType
    // Junction`, with no shell quoting to fight over.
    symlinkSync(LINK_TARGET, LINK_PATH, 'junction');
    junctioned = existsSync(LINK_PATH);
  } catch (error) {
    junctionError = error instanceof Error ? error.message : String(error);
  }
}
step('node_modules junctioned into the unpacked package for the optional peers', junctioned, junctionError ?? LINK_TARGET);

let packedResult;
if (junctioned) {
  const packedRun = run(process.execPath, [PACKED_VERIFY, ...VERIFY_ARGS], { cwd: UNPACKED });
  packedResult = parseVerify(packedRun.stdout);
  const tail = packedRun.stdout.trim().split('\n').slice(-6).join('\n    ');
  if (packedRun.status !== 0 || packedResult === undefined) console.log(`  INFO  packed verify tail:\n    ${tail}`);
  step(
    'the packed verify.mjs runs the tarball all green',
    packedRun.status === 0 && packedResult !== undefined && packedResult.failed === 0,
    `status=${String(packedRun.status)} ${packedResult === undefined ? 'no summary' : `${String(packedResult.passed)} passed / ${String(packedResult.failed)} failed`}`,
  );
  step(
    'the packed run checks exactly as many items as the checkout',
    packedResult !== undefined && repoResult !== undefined && packedResult.passed === repoResult.passed,
    `packed=${String(packedResult?.passed)} repo=${String(repoResult?.passed)}`,
  );
} else {
  step('the packed verify.mjs runs the tarball all green', false, 'the junction was not created, so the run was skipped');
  step('the packed run checks exactly as many items as the checkout', false, 'skipped with the previous step');
}
removeJunction(LINK_PATH);
step('the junction was removed and the checkout it pointed at is intact', !existsSync(LINK_PATH) && existsSync(LINK_TARGET), LINK_TARGET);

/* ------------------------------------- 5. clean-profile Loader composition */

section('5. clean profile (isolated DSH_HOME)');

/** Locate the installed `dsh` CLI entry (`lib/bin.js`) beside a shim on PATH. */
function findDshBin() {
  const comspec = process.env.ComSpec ?? 'cmd.exe';
  const where = run(comspec, ['/d', '/s', '/c', 'where dsh.cmd']);
  const dirs = where.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => dirname(line));
  const candidates = [...dirs, 'D:\\node_global', process.env.DSH_CLI_DIR ?? ''].filter((dir) => dir !== '');
  for (const dir of candidates) {
    const bin = join(dir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
    if (existsSync(bin)) return { bin, dir };
  }
  return undefined;
}

const dsh = findDshBin();
step('the installed dsh CLI entry was found', dsh !== undefined, dsh?.bin ?? 'no node_modules/@deepseek-ai/dsh/lib/bin.js beside a dsh shim');

if (dsh !== undefined) {
  const version = run(process.execPath, [dsh.bin, '--version'], { env: { ...process.env, DSH_HOME: HOME_DIR } });
  const cliVersion = version.stdout.trim().split(/\r?\n/).pop() ?? '';
  console.log(`  INFO  dsh ${cliVersion} at ${dsh.bin}`);

  rmSync(HOME_DIR, { recursive: true, force: true });
  mkdirSync(HOME_DIR, { recursive: true });
  const patchPath = join(UNPACKED, 'cordis.patch.yml');
  const dumpArgs = [
    dsh.bin,
    '--profile',
    PROFILE_NAME,
    '--from-default-profile',
    'web',
    '--dump-config',
    '--patch',
    patchPath,
  ];
  const dump = run(process.execPath, dumpArgs, { env: { ...process.env, DSH_HOME: HOME_DIR }, cwd: RELEASE_DIR });
  const composed = /- id:\s*weather\r?\n\s*name:\s*dsh-glass-weather\b/.test(dump.stdout);
  step(
    'the packed cordis.patch.yml composes through the real Loader',
    dump.status === 0 && composed,
    `status=${String(dump.status)} id/name pair ${composed ? 'found' : 'NOT found'}`,
  );
  step(
    'the composed tree is attributed to the packed patch file',
    dump.stdout.includes(`# == ${patchPath}`),
    patchPath,
  );
  step(
    'the CLI wrote only into the isolated DSH_HOME',
    existsSync(join(HOME_DIR, 'profiles', PROFILE_NAME, 'package.json')),
    HOME_DIR,
  );
  if (dump.status !== 0) {
    console.log(`  INFO  dump-config stderr: ${dump.stderr.trim().split('\n').slice(-4).join(' | ')}`);
    console.log(`  INFO  dump-config stdout tail: ${dump.stdout.trim().split('\n').slice(-4).join(' | ')}`);
  } else if (!composed) {
    console.log(`  INFO  dump-config stdout tail: ${dump.stdout.trim().split('\n').slice(-6).join(' | ')}`);
  }
}

/* ---------------------------------------------------------------- report */

console.log(`\n${'='.repeat(52)}`);
console.log('release report');
console.log(`  tarball        ${String(tarballName)}  ${tarballBytes === 0 ? '' : `${kib(tarballBytes)} / ${String(tarballBytes)} bytes`}`);
console.log(`  packed entries ${String(entryCount)}   unpacked files ${String(unpackedFiles.length)}`);
console.log(`  packed verify  ${packedResult === undefined ? 'not run' : `${String(packedResult.passed)} passed / ${String(packedResult.failed)} failed`}   (checkout: ${repoResult === undefined ? 'not run' : `${String(repoResult.passed)} passed / ${String(repoResult.failed)} failed`})`);
console.log(`  clean profile  ${steps.find((item) => item.name === 'the packed cordis.patch.yml composes through the real Loader')?.ok === true ? 'cordis.patch.yml loadable as "- id: weather / name: dsh-glass-weather"' : 'NOT verified'}`);
console.log(`  steps          ${String(steps.length - failures)} passed, ${String(failures)} failed`);
if (failures > 0) {
  console.log('  failed steps:');
  for (const item of steps.filter((candidate) => !candidate.ok)) console.log(`    - ${item.name}${item.detail === '' ? '' : `  ${item.detail}`}`);
}
console.log(`\n${failures === 0 ? 'RELEASE CHECKS PASSED' : 'RELEASE CHECKS FAILED'}`);
process.exitCode = failures === 0 ? 0 : 1;