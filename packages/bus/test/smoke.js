// Smoke test: empty bus + one tick-counting agent. No I/O. Run with `npm run smoke`.

import { createBus } from '../index.js';

const bus = createBus();
let count = 0;

const counter = {
  id: 'counter',
  resolve(event) { if (event.tick) count++; },
};
counter.resolve.filter = { tick: true };

bus.register(counter);
await bus.resolve({ run: true, ticks: 5, dt: 1 });

if (count !== 5) {
  console.error(`FAIL: expected 5 ticks, got ${count}`);
  process.exit(1);
}
console.log(`OK: counter saw ${count} ticks`);
