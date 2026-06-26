# @orbitalfoundation/utils

Tiny, zero-dependency, environment-neutral utilities used by [`@orbitalfoundation/bus`](../bus). Runs in
Node and the browser unchanged.

## Logger

A terse standalone logger. Single-line output with `HH:MM:SS.mmm` timestamps and colored level
prefixes. For `warn`/`error` (and when an `Error` is passed) it appends the caller's `file:line`
where the host exposes a V8 structured stack, and degrades gracefully where it does not. Multiline
values are flattened to keep logs scannable.

```js
import Logger from '@orbitalfoundation/utils'      // default export
// or: import { Logger } from '@orbitalfoundation/utils'

Logger.info('server up', { port: 8080 })
Logger.warn('retrying', { attempt: 2 })   // includes caller file:line
Logger.error(new Error('boom'))           // message on one line
```

## Seeded PRNG

`mulberry32(seed)` returns a function producing floats in `[0, 1)`. Same seed → same sequence —
useful for reproducible simulations.

```js
import { mulberry32 } from '@orbitalfoundation/utils'

const rand = mulberry32(42)
rand(); rand(); rand()   // deterministic
```

## Test

```sh
npm test
```

## License

MIT
