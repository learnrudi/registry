#!/usr/bin/env node
import { Accounts } from './auth.js';
import { SafeError, accountAlias, publicError } from './contracts.js';

try {
  if (process.argv.length !== 3) throw new SafeError('USAGE', 'Usage: node src/auth-cli.js <configured-account-alias>');
  const alias = accountAlias(process.argv[2]);
  const result = await new Accounts().authenticate(alias, code => {
    // Only user-facing device fields, never device_code, tokens or provider message/error text.
    process.stdout.write(`${JSON.stringify({ account: alias, ...code })}\n`);
  });
  process.stdout.write(`${JSON.stringify({ account: result.account, authenticated: true })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: publicError(error) })}\n`);
  process.exitCode = 1;
}
