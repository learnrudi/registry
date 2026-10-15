import { BookingError } from './contract.js';

const flags = { '--url': 'url', '--duration': 'duration_minutes', '--from': 'from',
  '--through': 'through', '--timezone': 'timezone', '--event-title': 'event_title',
  '--expected-owner': 'expected_owner', '--timeout': 'timeout_seconds' };

export function parseCli(argv) {
  const input = {};
  let json = false;
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--json' && !json) { json = true; continue; }
    const field = flags[flag];
    const value = argv[++index];
    if (!field || field in input || value === undefined || value.startsWith('--')) {
      throw new BookingError('INVALID_INPUT', 'Unknown, repeated or incomplete CLI option. Use --help.');
    }
    input[field] = ['duration_minutes', 'timeout_seconds'].includes(field) ? Number(value) : value;
  }
  return { input, json };
}
