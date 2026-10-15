// RUDI's existing runner resolves index.js and supplies RUDI_INPUTS.
import { main } from './src/cli.js';
await main([], process.env.RUDI_INPUTS || '{}');
