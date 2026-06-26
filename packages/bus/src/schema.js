// schema — namespace reservation. Built-in listener, registered automatically by createBus.
//
// An entry can claim top-level event keys so collisions surface early:
//   { id: 'physics', schema: { gravity: {...}, collide: {...} } }
// reserves 'gravity' and 'collide'. A second claimant on the same key gets a warning.
// This is advisory, not enforced — it is a debugging aid for large manifests.

import logger from '@orbitalfoundation/utils';

export const schemaHandler = {
  id: 'bus.schema',
  resolve(event, bus) {
    if (!event.schema || typeof event.schema !== 'object') return;
    for (const key of Object.keys(event.schema)) {
      const existing = bus.schemas.get(key);
      if (existing && existing !== event) {
        logger.warn(`bus: schema collision on '${key}' — already claimed by '${existing._claimant}'`);
      } else {
        bus.schemas.set(key, { ...event.schema[key], _claimant: event.id || '(anonymous)' });
      }
    }
  },
};
