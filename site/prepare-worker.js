import { prepareSync, transferBuffers } from './prepare-data.js?v=7';
// The owner terminates this worker on supersession. No hidden worker-side cache.
self.onmessage = ({data: {input, options}}) => {
  try {
    const prepared = prepareSync(input, options);
    self.postMessage({prepared}, transferBuffers(prepared));
  } catch (error) {
    self.postMessage({error: error.message});
  }
};
