# orbital-bus

A late-binding, declarative pub/sub event bus for client **and** server — plus the tiny
utilities it leans on. Descended from [orbital-sys](https://github.com/orbitalfoundation/orbital-sys).

This monorepo publishes two packages:

| Package | What it is |
|---|---|
| [`@orbitalfoundation/bus`](packages/bus) | The bus kernel: one `resolve()` for publishing, registering, and querying. |
| [`@orbitalfoundation/utils`](packages/utils) | Zero-dependency, environment-neutral logger + seeded PRNG. |

Three documents, three altitudes:

- **[PRIMER.md](PRIMER.md)** — the *why*: where these ideas come from (late binding, message
  passing, the history of JavaScript's event model), the formal patterns they instantiate, and a
  critical reading of the design's tradeoffs. Start here to decide whether the bus is a good idea.
- **[SPEC.md](SPEC.md)** — the *law*: every load-bearing semantic, precisely stated. Read this to
  implement against or extend the bus.
- The conformance tests ([packages/bus/test](packages/bus/test)) are the executable form of the
  SPEC.

## Quick start

```sh
npm install
npm test          # runs both packages' suites
npm run smoke     # one-tick end-to-end check
```

```js
import { createBus } from '@orbitalfoundation/bus'

const bus = createBus()

// register a listener
bus.register({
  id: 'counter',
  resolve(event) { if (event.tick) this.n = (this.n ?? 0) + 1 },
})

// publish (fan-out) and query (first-responder) through the same call
await bus.resolve({ run: true, ticks: 5, dt: 1 })
const answer = await bus.resolve({ ping: true })   // first non-undefined return wins
```

## Layout

```
packages/
  bus/     @orbitalfoundation/bus    kernel + manifest loader + tick driver + schema reservation
  utils/   @orbitalfoundation/utils  logger + random
SPEC.md    the contract and philosophy
```

## Status

Pre-publish. Code is environment-neutral by design (§7 of the SPEC); the conformance suite
currently runs under Node — a browser lane is a tracked open question (SPEC §9).

### Publishing to npm

Both packages live under the **`@orbitalfoundation`** scope (an npm org owned by `anselm`).
Publish `utils` first — `bus` depends on it:

1. Authenticate with a token that has **write access to the `@orbitalfoundation` org**. An
   **Automation** token is simplest (it bypasses 2FA/OTP, which interactive publishing does not).
2. `npm publish --workspace @orbitalfoundation/utils` then
   `npm publish --workspace @orbitalfoundation/bus`.
   (Scoped packages publish public via each package's `publishConfig.access: public`.)
3. Point consumers (e.g. `social/jam`, `orbital-sim`) at the published versions and delete their
   vendored copies.

## License

MIT — see [LICENSE](LICENSE).
