# orbital-bus

A late-binding, declarative pub/sub event bus for client **and** server — plus the tiny
utilities it leans on. Descended from [orbital-sys](https://github.com/orbitalfoundation/orbital-sys).

This monorepo publishes two packages:

| Package | What it is |
|---|---|
| [`@orbital/bus`](packages/bus) | The bus kernel: one `resolve()` for publishing, registering, and querying. |
| [`@orbital/utils`](packages/utils) | Zero-dependency, environment-neutral logger + seeded PRNG. |

The design — and every load-bearing semantic — is written down in **[SPEC.md](SPEC.md)**. Read
that to understand *why* the bus behaves the way it does; the conformance tests
([packages/bus/test](packages/bus/test)) are the executable form of the same contract.

## Quick start

```sh
npm install
npm test          # runs both packages' suites
npm run smoke     # one-tick end-to-end check
```

```js
import { createBus } from '@orbital/bus'

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
  bus/     @orbital/bus    kernel + manifest loader + tick driver + schema reservation
  utils/   @orbital/utils  logger + random
SPEC.md    the contract and philosophy
```

## Status

Pre-publish. Code is environment-neutral by design (§7 of the SPEC); the conformance suite
currently runs under Node — a browser lane is a tracked open question (SPEC §9).

### Before publishing to npm

1. Confirm the **`@orbital` npm scope** is owned by your account/org (`npm org ls orbital`). If
   it is taken, fall back to a scope you own (e.g. `@orbitalfoundation`) and update the two
   `package.json` names + the `@orbital/utils` dependency in `packages/bus`.
2. `npm publish --workspace @orbital/utils` first (bus depends on it), then
   `npm publish --workspace @orbital/bus`.
3. Point consumers (e.g. `social/jam`, `orbital-sim`) at the published versions and delete their
   vendored copies.

## License

MIT — see [LICENSE](LICENSE).
