// A small manifest fixture: one agent that logs ticks, plus a plain (event) entry.

export const log_activity_agent = {
  id: 'log_activity_agent',
  resolve(event) {
    if (event.tick) console.log(`tick ${event.tick}  t=${event.t}  dt=${event.dt}`);
  },
};
