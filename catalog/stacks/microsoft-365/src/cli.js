#!/usr/bin/env node
import { createToolkit } from './tools.js';
import { SafeError, publicError } from './contracts.js';

try {
  const toolkit = createToolkit();
  const [command, name, argument] = process.argv.slice(2);
  if (command === 'call' && name && argument && process.argv.length === 5 && argument.length <= 64000) {
    let input;
    try { input = JSON.parse(argument); } catch { throw new SafeError('INPUT', 'Tool arguments must be valid JSON.'); }
    process.stdout.write(`${JSON.stringify(await toolkit.call(name, input))}\n`);
  } else if (command === 'smoke' && name && process.argv.length === 4) {
    await toolkit.call('outlook_profile', { account: name });
    const page = await toolkit.call('outlook_mail_list', { account: name, limit: 2 });
    const search = await toolkit.call('outlook_mail_search', { account: name, query: 'example', limit: 2 });
    let read = false;
    let attachments = null;
    if (page.items[0]) {
      await toolkit.call('outlook_mail_read', { account: name, message_id: page.items[0].id, max_body_chars: 1 });
      read = true;
      attachments = (await toolkit.call('outlook_attachment_list', { account: name, message_id: page.items[0].id, limit: 2 })).items.length;
    }
    // A smoke report contains no subjects, IDs, message bodies, attachments or credentials.
    process.stdout.write(`${JSON.stringify({ account: name, profile_verified: true, messages_returned: page.items.length,
      message_read_verified: read, attachments_returned: attachments, search_returned: search.items.length,
      download_tested: false, note: 'Empty mailbox skips message/attachment reads. Search is provider-limited.' })}\n`);
  } else throw new SafeError('USAGE', 'Usage: node src/cli.js call <tool-name> <JSON-arguments> | smoke <account-alias>');
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: publicError(error) })}\n`);
  process.exitCode = 1;
}
