# @orbital/bus

A late-binding, declarative event bus for client and server. Descended from
[orbital-sys](https://github.com/orbitalfoundation/orbital-sys).

`bus.resolve()` is the single entry point for everything: registering listeners, dispatching
events, and querying services. Almost nothing is declared ahead of time — the application
assembles itself at runtime from manifests, each publishing agents that register themselves,
claim a namespace, and install services onto `bus`.

> The full contract and the reasoning behind every behavior live in
> **[SPEC.md](../../SPEC.md)**. This README is the tour; the SPEC is the law.

```js
// fire-and-forget — all matching listeners run
await bus.resolve({ tick: 1, t: 3600, dt: 3600 })

// query — first listener with an answer wins, chain stops
const nearby = await bus.resolve({ spatial_query: { near: [-61.5, 10.2], radius: 500 } })
```

## Install

```sh
npm install @orbital/bus
```

Runs unchanged in Node (≥18) and the browser — no build step, no Node-only imports in the kernel.

## Usage

```js
import { createBus } from '@orbital/bus'

const bus = createBus()
await bus.resolve({ load: '/abs/or/url/to/manifest.js' })
await bus.resolve({ run: true, ticks: 4, dt: 21600 })
```

CLI (Node only):

```sh
npx orbital-bus ./manifest.js --ticks 4 --dt 21600
```

## Model (in one screen)

- **Listeners** are blobs with `resolve(event, bus)`. **Events** are blobs without one. Passing a
  listener blob to `resolve()` registers it; passing an event dispatches it.
- **First-responder:** the first listener to return a non-`undefined` value stops the chain and
  that value is returned — this is how queries work. Return nothing to fan out.
- **Immediate nesting:** a `resolve()` inside a listener fully completes before the caller
  continues. No queue.
- **Filters** match on key *presence*: `resolve.filter = { tick: true }` runs on any event with a
  `tick` key.
- **Ordering:** `resolve.before` / `resolve.after` (id references, best-effort topological).
- **Lifecycle:** a new listener is invoked once with `{ registered: true }`. `{ id, obliterate: true }`
  removes it after it has seen the event. `bus.install(name, service)` attaches a service at `bus[name]`.

## Manifests

A manifest is an ESM file; named exports are entries (arrays flattened). An entry with a
`resolve` (after `inherits`) is registered; otherwise it is dispatched as an event.
`inherits: './tmpl.js'` imports a template and the entry shallow-overrides it. Manifests are
declarative but are *real JavaScript* — loops, computed ids, macros.

```js
export const world = {
  inherits: '@orbital/world',
  lats: [-60, -30, 0, 30, 60],
  t0: '2026-06-21T12:00:00Z',
}

export const goats = Array.from({ length: 12 }, (_, i) => ({
  inherits: './agents/goat.js',
  id: `goat-${i}`,
  position: { lat: -8.5 + i * 0.01, lon: 179.2 },
}))
```

## Reserved vocabulary

| | keys |
|---|---|
| Registered objects | `id, inherits, resolve` |
| Events | `tick, t, dt, load, run, obliterate, registered, done, schema` |

## License

MIT
