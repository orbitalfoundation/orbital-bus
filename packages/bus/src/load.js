// load — the manifest loader. Built-in listener, registered automatically by createBus.
//
// Responds to:  { load: 'path/to/manifest.js' }
//          or:  { load: ['a.js', 'b.js'] }
//
// A manifest is an ordinary ESM module. Each named export is an "entry":
//   - entries that resolve to something with a resolve() function are registered as agents
//   - every other entry is dispatched as a bus event
// `inherits: '<spec>'` dynamic-imports a template; the entry's own props shallow-override it.
//
// Why .js manifests instead of .json: a manifest is declarative, but it is REAL JavaScript.
// You get loops, computed ids, imports and effectively macros — declarative shape with full
// expressive power. JSON could not express "12 goats at incrementing positions" in one line.
//
// Environment-neutral by design. Resolution is URL-based so the same loader runs in Node
// (filesystem, file:// URLs) and the browser (network, http(s):// URLs). Relative `inherits`
// resolve against the *manifest's own URL*, exactly like ES module resolution.

import logger from '@orbital/utils';

const isServer =
  typeof process !== 'undefined' && !!process.versions?.node && typeof window === 'undefined';

function hasScheme(s) {
  return /^[a-z][a-z0-9+.-]*:/i.test(s); // file:, http:, https:, node:, data:, ...
}

// npm-style bare specifier ('@scope/name', 'name', 'name/sub') — hand to the host loader as-is.
function isBareSpecifier(s) {
  return !s.startsWith('./') && !s.startsWith('../') && !s.startsWith('/') && !hasScheme(s);
}

// The base URL that relative/absolute paths resolve against when none is given.
async function defaultBaseURL() {
  if (isServer) {
    const { pathToFileURL } = await import('node:url');
    return pathToFileURL(process.cwd() + '/').href; // trailing slash => directory base
  }
  if (typeof document !== 'undefined' && document.baseURI) return document.baseURI;
  if (typeof location !== 'undefined') return location.href;
  return 'file:///';
}

// Turn a user-supplied spec into something import() accepts, relative to `base`.
function toImportTarget(spec, base) {
  if (isBareSpecifier(spec)) return spec;   // let the host resolve packages
  if (hasScheme(spec)) return spec;         // already a full URL
  return new URL(spec, base).href;          // relative or absolute path -> URL
}

async function resolveInherits(entry, base) {
  if (!entry.inherits) return entry;
  const target = toImportTarget(entry.inherits, base);
  let mod;
  try {
    mod = await import(target);
  } catch (err) {
    logger.error(`[bus] failed to import inherits '${entry.inherits}':`, err.message);
    return null;
  }
  const template = mod.default ?? mod;
  return { ...template, ...entry };
}

function pushFlat(out, value, defaultId) {
  if (value == null) return;
  if (Array.isArray(value)) { for (const v of value) pushFlat(out, v); return; }
  if (typeof value !== 'object') return;
  if (defaultId && !value.id && !value.name) value = { ...value, id: defaultId };
  out.push(value);
}

async function doLoad(manifestSpec, bus, base) {
  const target = toImportTarget(manifestSpec, base);

  let mod;
  try {
    mod = await import(target);
  } catch (err) {
    // Best-effort: a missing manifest is non-fatal. This supports the speculative-load
    // pattern (probing for an optional manifest / folder over HTTP that may 404).
    logger.warn(`[bus] could not load manifest '${manifestSpec}':`, err.message);
    return { agents: [], manifestPath: target, ok: false };
  }

  // the manifest's own URL is the base for resolving its entries' relative `inherits`
  const manifestBase = target;

  const entries = [];
  for (const [name, value] of Object.entries(mod)) {
    if (name === 'default') pushFlat(entries, value);
    else pushFlat(entries, value, name);
  }

  const registered = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const resolved = await resolveInherits(entry, manifestBase);
    if (!resolved) continue;

    if (typeof resolved.resolve === 'function') {
      bus.register(resolved);
      registered.push(resolved);
    } else {
      await bus.resolve(resolved);
    }
  }

  return { agents: registered, manifestPath: target, ok: true };
}

export const manifestLoader = {
  id: 'bus.manifest-loader',

  resolve: async function(event, bus) {
    if (typeof event.load !== 'string' && !Array.isArray(event.load)) return;

    const base = await defaultBaseURL();
    const specs = Array.isArray(event.load) ? event.load : [event.load];
    let result;
    for (const spec of specs) {
      result = await doLoad(spec, bus, base);
    }
    return result;
  },
};
