// Manifest fixture exercising `inherits` with a RELATIVE path. The loader must resolve
// './base-agent.js' against THIS manifest's own URL, on both filesystem and network.

export const derived = {
  inherits: './base-agent.js',
  id: 'derived-agent',
  extra: 'from-manifest',
};
