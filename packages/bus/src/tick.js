// tick — built-in time driver. Registered automatically by createBus.
//
// Batch mode:    { run: true,        ticks, dt }  — runs N ticks, awaiting each fully
// Realtime mode: { run: 'realtime',  hz, dt }     — starts a loop; returns { stop }
//
// The realtime loop is environment-neutral: it uses requestAnimationFrame in the browser
// and an adaptive setTimeout on the server (measures actual tick duration, sleeps the
// remainder, minimum 10 ms). Sending { run: 'realtime' } while already running is a no-op.

import logger from '@orbital/utils';

const MIN_SLEEP_MS = 10;

async function realtimeLoop(bus, hz, dt) {
  let i = 0;

  const step = async () => {
    if (!bus._tickRunning) return;

    const nowMs = performance.now();
    bus.time += dt;

    try {
      await bus.resolve({ tick: ++i, t: bus.time, dt });
    } catch (err) {
      logger.error('[bus] tick error', err);
    }

    if (!bus._tickRunning) return;

    // client: hand control back to the browser's frame scheduler
    if (!bus.isServer && typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(step);
      return;
    }

    // server: sleep the remainder of the target interval
    const tickMs = 1000 / hz;
    const elapsed = performance.now() - nowMs;
    setTimeout(step, Math.max(MIN_SLEEP_MS, tickMs - elapsed));
  };

  if (!bus.isServer && typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(step);
  } else {
    setTimeout(step, 0);
  }
}

export const tickDriver = {
  id: 'bus.tick-driver',

  resolve: async function(event, bus) {
    if (!event.run) return;

    if (bus._tickRunning) {
      logger.warn('bus: ticker already running');
      return;
    }
    bus._tickRunning = true;

    if (event.run === 'realtime') {
      const { hz = 30, dt = 1 / 30 } = event;
      realtimeLoop(bus, hz, dt);
      return {
        stop() { bus._tickRunning = false; },
      };
    }

    // batch mode — runs to completion, awaiting each tick
    const { ticks = 1, dt = 1 } = event;
    for (let i = 0; i < ticks; i++) {
      bus.time += dt;
      await bus.resolve({ tick: i + 1, t: bus.time, dt });
    }
    bus._tickRunning = false;
  },
};
