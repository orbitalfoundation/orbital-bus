// Terse, environment-neutral logger.
// - Single-line output with colored prefixes and HH:MM:SS.mmm timestamps
// - Includes caller `file:line` for warn/error (and when an Error is passed) where the
//   host exposes a V8 structured stack; degrades gracefully elsewhere (e.g. non-V8 browsers).
// - No Node-only imports: runs in the browser and on the server unchanged.

const COLORS = {
  LOG: '\x1b[36m',    // cyan
  INFO: '\x1b[36m',   // cyan
  DEBUG: '\x1b[35m',  // magenta
  WARN: '\x1b[33m',   // yellow
  ERROR: '\x1b[31m',  // red
  RESET: '\x1b[0m',
};

// frames inside this module are skipped when reporting caller location
const SELF_HINT = 'utils/src/logger.js';

function nowStamp() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function safeStringify(v) {
  if (typeof v === 'string') return v.replace(/\s+/g, ' ');
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// Shorten an absolute path relative to cwd when running on Node; otherwise return as-is.
function shorten(file) {
  if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
    const cwd = process.cwd();
    if (file.startsWith(cwd + '/')) return file.slice(cwd.length + 1);
    const fileUrlPrefix = 'file://' + cwd + '/';
    if (file.startsWith(fileUrlPrefix)) return file.slice(fileUrlPrefix.length);
  }
  return file;
}

function firstCallerLocation() {
  const orig = Error.prepareStackTrace;
  try {
    Error.prepareStackTrace = (_, stack) => stack;
    const err = new Error();
    const stack = err.stack;
    if (!stack || !Array.isArray(stack)) return undefined; // non-V8 host: best-effort skip
    for (const site of stack) {
      const file = site.getFileName && site.getFileName();
      if (!file) continue;
      if (file.includes(SELF_HINT) || file.includes('/node_modules/')) continue;
      const line = site.getLineNumber ? site.getLineNumber() : null;
      const short = shorten(file);
      return line ? `${short}:${line}` : short;
    }
  } catch {
    // ignore — caller location is a convenience, never required
  } finally {
    Error.prepareStackTrace = orig;
  }
  return undefined;
}

const _console = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

function singleLine(...parts) {
  return parts
    .map(p => (p === undefined ? '' : safeStringify(p)))
    .join(' ')
    .replace(/\n+/g, ' ')
    .trim();
}

function make(kind, consoleFn, includeSource) {
  return (...args) => {
    const src = includeSource ? firstCallerLocation() : undefined;
    const parts = args.map(a => {
      if (a instanceof Error) {
        const firstStackLine = (a.stack || '').split('\n')[1] || '';
        return `${a.message}${firstStackLine ? ' | ' + firstStackLine.trim() : ''}`;
      }
      return a;
    });
    const body = singleLine(...parts);
    const kindUpper = kind.toUpperCase();
    const color = COLORS[kindUpper] || COLORS.RESET;
    const prefix = `${color}[${nowStamp()}] ${kindUpper}${src ? ' ' + src : ''}${COLORS.RESET}`;
    consoleFn(prefix + ' ' + body);
  };
}

export const Logger = {
  log: make('log', _console.log, false),
  info: make('info', _console.info, false),
  debug: make('debug', _console.debug, false),
  warn: make('warn', _console.warn, true),
  error: make('error', _console.error, true),
};

export default Logger;
