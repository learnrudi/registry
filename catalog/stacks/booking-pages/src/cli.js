#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { DateTime } from 'luxon';
import { parseCli } from './cli-options.js';
import { getAvailability, safeError } from './core.js';

export function formatText(result) {
  return [ `${result.duration_minutes}-minute meetings | ${result.timezone} | ${result.coverage.from} through ${result.coverage.through}`,
    ...result.days.map(day => `${day.date}: ${day.slots.length ? day.slots.map(slot =>
      DateTime.fromISO(slot.start, { setZone: true }).toFormat('h:mm a')).join(', ') : 'No bookable slots'}`),
    `Checked ${result.checked_at} in ${result.elapsed_seconds}s`, `Book: ${result.booking_url}` ].join('\n');
}

export async function main(argv = process.argv.slice(2), runnerInput) {
  if (argv.length === 1 && argv[0] === '--help') {
    console.log('Usage: node src/cli.js --url URL --duration MINUTES --from YYYY-MM-DD --through YYYY-MM-DD --timezone IANA [--event-title TITLE] [--expected-owner NAME] [--timeout SECONDS] [--json]');
    return;
  }
  try {
    const options = runnerInput === undefined ? parseCli(argv) : { input: JSON.parse(runnerInput), json: true };
    const result = await getAvailability(options.input);
    console.log(options.json ? JSON.stringify(result, null, 2) : formatText(result));
  } catch (error) {
    const detail = error instanceof SyntaxError ? { code: 'INVALID_INPUT', message: 'Runner input must be valid JSON.' } : safeError(error);
    console.error(JSON.stringify({ error: detail }));
    process.exitCode = detail.code.startsWith('INVALID') ? 2 : 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
