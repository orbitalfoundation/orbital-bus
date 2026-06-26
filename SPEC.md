# @orbital/bus — Specification & Philosophy

This is the contract. The code in `packages/bus` is one implementation of it; the tests in
`packages/bus/test` are the executable form of it. When behavior and this document disagree,
that is a bug in one of them — fix them together, in the same commit.

Lineage: this descends from [orbital-sys](https://github.com/orbitalfoundation/orbital-sys),
which in turn grew out of years of using a single pub/sub channel as the backbone of whole
applications. This document is the attempt to write down, finally and precisely, what that
backbone *is* and which of its subtle behaviors are load-bearing.

---

## 1. Philosophy

### 1.1 One channel, late binding

Most software is wired by **forward imperative composition**: module A imports B, calls
`B.doThing()`, and the call graph is fixed at author time. This produces a tangle of imports
and a system whose shape you can only see by tracing calls.

The bus inverts that. There is **one entry point** — `bus.resolve(blob)` — used for
*everything*: publishing state, registering listeners, and asking questions. Components do not
import each other. They publish state changes and respond to state changes. The application
**assembles itself at runtime** from whatever listeners happen to be registered. Wiring is
late-bound, not author-bound.

The payoff, in the words of the original orbital-sys readme: *developers focus on publishing
state changes without worrying about how those changes will produce effects.*

### 1.2 The single blob

A single object shape — a "blob" — serves three roles, distinguished only by its contents:

| The blob has...        | ...so it is | and `resolve()` will |
|------------------------|-------------|----------------------|
| a `resolve` function   | a listener  | register it |
| no `resolve` function  | an event    | dispatch it to listeners |
| a value worth returning from a listener | a query answer | stop the chain and return it |

This is the core economy of the design: **publishing traffic and registering listeners are the
same operation on the same data shape.** A manifest full of listeners and a stream of events are
made of the same stuff.

### 1.3 Live, uncloned state

Events are **not** cloned. Listeners may read and mutate the event object in place, and
downstream listeners see those mutations. State flows as "objects decorated with properties"
(an entity-component feel), not as immutable messages. This is a deliberate choice for speed and
for the decorate-as-you-go pattern; the cost is that listeners must be disciplined about
mutation. See §6 footguns.

### 1.4 Manifests are executable declarations

An application is assembled by loading **manifests**: ordinary ESM (`.js`) files whose exports
are blobs to register or dispatch (§5). Manifests are declarative in *shape* but are real
JavaScript — so you get loops, computed ids, conditionals, imports, and effectively **macros**.
JSON is not powerful enough to say "twelve agents at incrementing positions" in one line; a `.js`
manifest is. The goal is declarative authoring **without** giving up the expressive power of the
host language.

### 1.5 An application substrate, not just a sim kernel

In practice this bus is used well beyond simulation: a WebSocket bridges the **same** bus across
the network so browser clients and the server share one channel; multiplayer state, API calls,
and inter-user chatter all ride it. That is why **environment neutrality (§7) is a hard
requirement**, not a nicety — the identical kernel must run in the browser and on the server.

---

## 2. Core API

```js
import { createBus } from '@orbital/bus'

const bus = createBus({ tStart = 0, description = 'orbital bus' } = {})
```

`createBus` returns a fresh, independent bus. There is **no global singleton** (a deliberate
break from orbital-sys's `globalThis.sys`). Multiple buses coexist without interference.

The returned `bus` exposes:

| Member | Description |
|---|---|
| `resolve(eventOrBlob)` | The universal entry point. Returns a Promise. See §3. |
| `register(listener)` | Register a listener directly (what `resolve` does for a blob with `resolve`). |
| `has(id)` / `get(id)` / `list()` | Query the registry. |
| `install(name, service)` | Attach a long-lived service object at `bus[name]`; refuses to overwrite. Returns boolean. |
| `time` (getter/setter) | Simulation clock, advanced by the tick driver. |
| `uuid`, `description`, `isServer` | Identity / environment metadata. |
| `schemas` | `Map` of reserved namespace keys (§4.4). |
| `resolvers`, `agents` | Internal registry; treat as read-mostly. |

---

## 3. Dispatch semantics (the load-bearing rules)

A **listener** is a blob `{ id, resolve(event, bus), ... }`. Its `resolve.filter`, `resolve.before`,
and `resolve.after` properties tune it.

### 3.1 `resolve(blob)` dispatch algorithm

1. **Array** → each element is resolved in order, awaited.
2. **Non-object** (`null`, number, string) → ignored with an error log; never throws.
3. **Blob with a `resolve` function** → registered as a listener (§3.4); returns.
4. Otherwise it is an **event**:
   a. Snapshot the current listener list (§3.3).
   b. For each listener whose **filter matches** (§3.5), in order, `await listener.resolve(event, bus)`.
   c. **First-responder:** the first listener to return a value `!== undefined` stops the
      walk; that value becomes the return of `resolve`. (§3.2)
   d. After the walk, if `event.obliterate === true && event.id`, remove that listener (§3.6).
   e. Return the first-responder value, or `undefined` if none.

### 3.2 First-responder — fan-out vs query

Returning `undefined` means "I handled/observed this, let it continue." Returning anything else
means "I am the answer; stop." This single rule provides both modes:

```js
await bus.resolve({ tick: 1, t: 3600, dt: 3600 })          // fan-out: every matcher runs
const hit = await bus.resolve({ spatial_query: { near: p } }) // query: first answer wins
```

There is **no separate abort signal**. To halt a chain deliberately, return a structured value
(`return { aborted: true, reason }`) — it both stops dispatch and carries the reason. (This
subsumes orbital-sys's `force_sys_abort`, which is therefore **not** part of this spec.)

### 3.3 Immediate nested resolution — NO queue

A `resolve()` call made *inside* a listener runs **immediately and to completion** before the
outer listener continues. There is no datagram queue and no deferral. Earlier designs queued
nested sends; that was abandoned deliberately — immediate, fully-resolved nesting is simpler to
reason about and is the guaranteed behavior here. (Conformance: *"nested resolve() fully
completes before the parent continues."*)

### 3.4 Registration & the `{ registered: true }` event

On registration a listener is appended, the order is recomputed (§3.7), and the listener is
**immediately invoked once with `{ registered: true }`**. This is its chance to install services,
claim schema, or initialize. A listener registered *during* a dispatch receives this
`{ registered: true }` event — **not** the event currently being dispatched (§3.3 snapshot).

Duplicate `id` → the existing listener is replaced. Duplicate object reference → ignored with a
warning.

### 3.5 Filters match on key PRESENCE

`resolve.filter` is an object; a listener matches an event when **every key in the filter is
present on the event** (`key in event`). It is presence, not value: `{ tick: true }` matches
`{ tick: 0 }` and `{ tick: false }`. A listener with no filter matches every event. Value-based
filtering is intentionally out of scope — do it inside `resolve()`.

### 3.6 `obliterate` runs after dispatch

`{ id, obliterate: true }` removes listener `id`, but **only after** the full dispatch completes,
so the target still sees the obliterate event (and can clean up) before removal.

### 3.7 Ordering: `before` / `after`

`resolve.before = '<id>'` / `resolve.after = '<id>'` request best-effort topological ordering
relative to another listener, independent of registration order. The sort is O(n²) and bounded;
fine for hundreds of listeners. Cycles resolve to a stable-ish order rather than hanging.

---

## 4. Built-in listeners

The kernel has **no special cases**. The three built-ins are ordinary listeners registered onto
every new bus, which is the strongest possible demonstration of the model.

### 4.1 `bus.manifest-loader` — `{ load }`  (see §5)
### 4.2 `bus.tick-driver` — `{ run }`

- `{ run: true, ticks, dt }` — batch: runs `ticks` ticks, awaiting each, advancing `bus.time` by `dt`.
- `{ run: 'realtime', hz, dt }` — starts a loop, returns `{ stop }`. Uses `requestAnimationFrame`
  in the browser and an adaptive `setTimeout` on the server. Re-entry while running is a no-op.

Each tick dispatches `{ tick: n, t: bus.time, dt }`.

### 4.3 `bus.schema` — `{ schema }`
Reserves top-level event keys for collision detection (§4.4).

### 4.4 Reserved vocabulary

Seeded into `bus.schemas` at construction; reused keys warn.

| Class | Keys |
|---|---|
| Core events | `tick, t, dt, load, run, obliterate, registered, done, schema` |
| Core entity props | `id, inherits, resolve` |

`force_sys_abort` and `parent`/`children` from orbital-sys are **intentionally not reserved** —
the first is subsumed by first-responder (§3.2); ECS hierarchy is left to application layers.

---

## 5. Manifests

`{ load: spec }` or `{ load: [spec, ...] }` imports ESM module(s). For each export:

- a `default` export is unwrapped; named exports get the export name as a default `id`;
- arrays are flattened;
- an entry resolving (after `inherits`) to a blob with `resolve` is **registered**;
- any other entry is **dispatched** as an event.

`inherits: '<spec>'` dynamic-imports a template (`mod.default ?? mod`); the entry's own
properties **shallow-override** the template. Relative `inherits` resolve against the
**manifest's own URL**.

A `spec` is resolved to an import target by §7.2. A **missing manifest is non-fatal**: it logs a
warning and returns `{ ok: false, agents: [] }`. This supports speculative loading — probing for
optional manifests/folders over HTTP that may 404.

---

## 6. Footguns (documented, not bugs)

- **Mutation discipline.** Events are live (§1.3). A listener that mutates a shared event changes
  what downstream listeners see. Usually the point; occasionally a surprise.
- **Accidental query.** Returning a value from a fan-out listener silently halts the chain
  (§3.2). If you meant to observe, return nothing.
- **Presence-not-value filters** (§3.5) can over-match; narrow inside `resolve()`.
- **Two different "event sourcing".** This bus replays *dispatch*; a persistence layer (e.g. a
  signed event log + projections) replays *stored state*. They are different concerns — do not
  conflate the bus with your database event log.

---

## 7. Environment neutrality (hard requirement)

The identical kernel runs in the browser and on the server. Rules:

### 7.1 No unconditional Node imports
No top-level `import ... from 'node:*'`. Node built-ins may be reached only via
**conditional dynamic import** on the server branch (the loader does this for `node:url` when
computing a filesystem base). Identifiers `process`, `window`, `document`, `location`,
`requestAnimationFrame` must be feature-detected, never assumed.

`isServer = typeof process !== 'undefined' && !!process.versions?.node && typeof window === 'undefined'`.

### 7.2 URL-based resolution
All path resolution goes through the `URL` API. The default base is a `file://` URL of
`process.cwd()` on the server and `document.baseURI` / `location.href` in the browser. Bare
specifiers (`@scope/pkg`) pass through to the host loader; full URLs pass through unchanged;
relative/absolute paths resolve via `new URL(spec, base)`.

### 7.3 Cross-env primitives
UUIDs via `globalThis.crypto.randomUUID()` with a non-crypto fallback. Timing via
`performance.now()`. Logging via `@orbital/utils`, which carries no Node-only imports.

---

## 8. Non-goals

- No global singleton.
- No message queue / deferred dispatch (§3.3).
- No built-in network transport — a WebSocket bridge is an application-layer listener, not kernel.
- No schema *enforcement* — reservation is advisory (§4.4).
- No value-based filter matching (§3.5).

---

## 9. Open questions (track before 1.0 of the published package)

- **Browser conformance in CI.** The suite runs under Node today. Add a jsdom/worker or
  Playwright lane so §7 is enforced, not merely intended.
- **`done` semantics.** `done` is reserved and emitted by the CLI but has no kernel meaning.
  Define it or drop it.
- **Error channel.** Listener throws are caught and logged (§3.1b). Consider an optional
  `{ error }` re-dispatch so applications can observe failures on the bus itself.
- **Replay tooling.** §1 promises event-sourced replay; ship a recorder/replayer or soften the claim.
