import { evaluatePrefix } from '../utils/liveDetection.js';

self.onmessage = event => {
  const { requestId, transactions } = event.data ?? {};
  try {
    self.postMessage({ requestId, clusters: evaluatePrefix(Array.isArray(transactions) ? transactions : []) });
  } catch (error) {
    self.postMessage({ requestId, error: error instanceof Error ? error.message : 'Prefix analysis failed.' });
  }
};
