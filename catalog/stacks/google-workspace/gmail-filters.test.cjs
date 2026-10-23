const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runGmailFilterTool } = require('./src/gmail-filters.ts');

const account = 'owner@example.com';
const rule = { id: 'f1', criteria: { from: 'sender@example.com' }, action: { removeLabelIds: ['INBOX'] } };
const body = result => JSON.parse(result.content[0].text);
function fixture(overrides = {}) {
  const calls = [];
  const capture = (name, result) => async (args, options) => {
    calls.push({ name, args, options });
    return { data: structuredClone(result) };
  };
  const filters = { list: capture('list', { filter: [rule] }), get: capture('get', rule), ...overrides };
  return { calls, gmail: { users: {
    getProfile: capture('profile', { emailAddress: account }), settings: { filters },
    messages: { list: capture('messages.list', { messages: [{ id: 'm1', threadId: 't1' }], resultSizeEstimate: 7, nextPageToken: 'page2' }) },
    labels: { list: capture('labels.list', { labels: [{ id: 'INBOX', type: 'system' }, { id: 'UNREAD', type: 'system' }, { id: 'TRASH', type: 'system' }, { id: 'Label_1', type: 'user' }, { id: 'Label_2', type: 'user' }] }) },
  } } };
}

test('get verifies identity and reads the exact filter with bounded non-retrying requests', async () => {
  const { gmail, calls } = fixture();
  const result = body(await runGmailFilterTool('gmail_filter_get', gmail, { account, filter_id: 'f1' }));
  assert.deepEqual(result, { account, filter: rule });
  assert.deepEqual(calls.map(x => x.name), ['profile', 'get']);
  assert.deepEqual(calls[1].args, { userId: 'me', id: 'f1' });
  assert.ok(calls.every(x => x.options.timeout === 30000 && x.options.retry === false));
});

test('preview samples one bounded search page without reading bodies or changing messages', async () => {
  const { gmail, calls } = fixture();
  const result = body(await runGmailFilterTool('gmail_filter_preview', gmail, {
    account, query: 'from:sender@example.com -subject:urgent', max_results: 3, next_page_token: 'page1',
  }));
  assert.deepEqual(calls.map(x => x.name), ['profile', 'messages.list']);
  assert.deepEqual(calls[1].args, {
    userId: 'me', q: 'from:sender@example.com -subject:urgent', maxResults: 3,
    pageToken: 'page1', includeSpamTrash: false,
  });
  assert.equal(result.approximate, true);
  assert.equal(result.resultSizeEstimate, 7);
  assert.equal(result.nextPageToken, 'page2');
  assert.deepEqual(result.messages, [{ id: 'm1', threadId: 't1' }]);
});

test('create validates label references and verifies the saved rule without modifying old messages', async () => {
  let request;
  const saved = { id: 'new-filter', criteria: { query: 'from:sender@example.com' }, action: { addLabelIds: ['Label_1'], removeLabelIds: ['INBOX'] } };
  const { gmail, calls } = fixture({
    create: async (args, options) => { request = { args, options }; return { data: saved }; },
    get: async ({ id }) => { assert.equal(id, 'new-filter'); return { data: saved }; },
  });
  const result = body(await runGmailFilterTool('gmail_filter_create', gmail, { account, criteria: saved.criteria, action: saved.action }));
  assert.equal(result.status, 'created');
  assert.equal(result.verified, true);
  assert.deepEqual(result.filter, saved);
  assert.deepEqual(request.args, { userId: 'me', requestBody: { criteria: saved.criteria, action: saved.action } });
  assert.equal(request.options.retry, false);
  assert.deepEqual(calls.map(x => x.name), ['profile', 'labels.list']);
});

test('delete inspects the exact rule, deletes once and verifies a 404 read-back', async () => {
  let deleted = false;
  let deleteCalls = 0;
  const { gmail } = fixture({
    get: async ({ id }) => { assert.equal(id, 'f1'); if (deleted) throw { response: { status: 404 } }; return { data: rule }; },
    delete: async (args, options) => { assert.deepEqual(args, { userId: 'me', id: 'f1' }); assert.equal(options.retry, false); deleted = true; deleteCalls++; return { data: '' }; },
  });
  const result = body(await runGmailFilterTool('gmail_filter_delete', gmail, { account, filter_id: 'f1' }));
  assert.deepEqual(result, { account, filterId: 'f1', status: 'deleted', verified: true });
  assert.equal(deleteCalls, 1);
});

test('malformed tool inputs are rejected before any provider request', async () => {
  const cases = [
    ['gmail_filter_list', {}, /account/],
    ['gmail_filter_list', { account, ignored: true }, /Unsupported field/],
    ['gmail_filter_get', { account, filter_id: '\n' }, /filter_id/],
    ['gmail_filter_preview', { account, query: 'from:x', max_results: null }, /max_results/],
    ['gmail_filter_preview', { account, query: 'from:x', max_results: 101 }, /max_results/],
    ['gmail_filter_create', { account, criteria: {}, action: { removeLabelIds: ['INBOX'] } }, /matching condition/],
    ['gmail_filter_create', { account, criteria: { excludeChats: false }, action: { removeLabelIds: ['INBOX'] } }, /matching condition/],
    ['gmail_filter_create', { account, criteria: { from: 'x', typo: 'x' }, action: { removeLabelIds: ['INBOX'] } }, /Unsupported criteria/],
    ['gmail_filter_create', { account, criteria: { size: 2 }, action: { removeLabelIds: ['INBOX'] } }, /sizeComparison/],
    ['gmail_filter_create', { account, criteria: { query: 'x' }, action: {} }, /action/],
    ['gmail_filter_create', { account, criteria: { query: 'x' }, action: { addLabelIds: ['INBOX'], removeLabelIds: ['INBOX'] } }, /both/],
    ['gmail_filter_create', { account, criteria: { query: 'x' }, action: { forward: 'a@example.com\r\nBcc:bad@example.com' } }, /forward/],
  ];
  for (const [name, args, expected] of cases) {
    const { gmail, calls } = fixture();
    await assert.rejects(runGmailFilterTool(name, gmail, args), expected);
    assert.equal(calls.length, 0);
  }
});

test('provider denial returns scope guidance without exposing provider request secrets', async () => {
  const { gmail } = fixture({ list: async () => { throw Object.assign(new Error('secret-token-in-provider-error'), { response: { status: 403 } }); } });
  const result = await runGmailFilterTool('gmail_filter_list', gmail, { account });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /gmail.settings.basic/);
  assert.doesNotMatch(result.content[0].text, /secret-token/);
});

test('wrong authenticated mailbox blocks every filter operation before reading or writing rules', async () => {
  for (const name of ['list', 'get', 'preview', 'create', 'delete']) {
    const { gmail, calls } = fixture();
    gmail.users.getProfile = async () => ({ data: { emailAddress: 'other@example.com' } });
    const args = { account, ...(['get', 'delete'].includes(name) ? { filter_id: 'f1' } : {}),
      ...(name === 'preview' ? { query: 'from:x' } : {}),
      ...(name === 'create' ? { criteria: rule.criteria, action: rule.action } : {}),
    };
    await assert.rejects(runGmailFilterTool(`gmail_filter_${name}`, gmail, args), /does not match/);
    assert.equal(calls.length, 0);
  }
});

test('unknown labels and multiple user labels prevent creation', async () => {
  for (const labels of [['Unknown_Name'], ['Label_1', 'Label_2']]) {
    let writes = 0;
    const { gmail } = fixture({ create: async () => { writes++; } });
    await assert.rejects(runGmailFilterTool('gmail_filter_create', gmail, { account, criteria: rule.criteria, action: { addLabelIds: labels } }), /label/);
    assert.equal(writes, 0);
  }
});

test('all structured criteria and a verified forwarding target round-trip without translation', async () => {
  const criteria = { from: 'Sender <sender@example.com>', to: 'team@example.com', subject: 'Monthly report', query: 'has:attachment',
    negatedQuery: 'subject:urgent', hasAttachment: true, excludeChats: true, size: 1024, sizeComparison: 'larger' };
  const action = { forward: 'approved@example.com' };
  let saved;
  const { gmail } = fixture({
    create: async ({ requestBody }) => { saved = { id: 'f2', ...structuredClone(requestBody) }; return { data: saved }; },
    get: async () => ({ data: saved }),
  });
  const result = body(await runGmailFilterTool('gmail_filter_create', gmail, { account, criteria, action }));
  assert.equal(result.verified, true);
  assert.deepEqual(result.filter, { id: 'f2', criteria, action });
});

test('uncertain creation is attempted once and requires reconciliation', async () => {
  let attempts = 0;
  const { gmail } = fixture({ create: async () => { attempts++; throw new Error('provider-secret'); } });
  const result = await runGmailFilterTool('gmail_filter_create', gmail, { account, criteria: rule.criteria, action: rule.action });
  assert.equal(result.isError, true);
  assert.equal(body(result).status, 'create_not_verified');
  assert.match(body(result).message, /gmail_filter_list before retrying/);
  assert.doesNotMatch(result.content[0].text, /provider-secret/);
  assert.equal(attempts, 1);
});

test('accepted creations with missing or mismatched read-back stay explicitly unverified', async () => {
  for (const read of [async () => { throw new Error('offline'); }, async () => ({ data: { ...rule, criteria: { from: 'different@example.com' } } })]) {
    const { gmail } = fixture({ create: async () => ({ data: rule }), get: read });
    const result = await runGmailFilterTool('gmail_filter_create', gmail, { account, criteria: rule.criteria, action: rule.action });
    assert.equal(result.isError, true);
    assert.equal(body(result).status, 'created_unverified');
    assert.equal(body(result).filterId, 'f1');
  }
});

test('delete failures and failed absence checks never report verified success', async () => {
  for (const mode of ['timeout', 'still-present', 'forbidden']) {
    let attempts = 0;
    let reads = 0;
    const { gmail } = fixture({
      delete: async () => { attempts++; if (mode === 'timeout') throw new Error('timeout'); return { data: '' }; },
      get: async () => { reads++; if (reads > 1 && mode === 'forbidden') throw { response: { status: 403 } }; return { data: rule }; },
    });
    const result = await runGmailFilterTool('gmail_filter_delete', gmail, { account, filter_id: 'f1' });
    assert.equal(result.isError, true);
    assert.equal(body(result).verified, false);
    assert.equal(body(result).status, mode === 'timeout' ? 'delete_not_verified' : 'deleted_unverified');
    assert.equal(attempts, 1);
  }
});

test('get refuses a mismatched provider filter ID', async () => {
  const { gmail } = fixture({ get: async () => ({ data: { ...rule, id: 'different' } }) });
  await assert.rejects(runGmailFilterTool('gmail_filter_get', gmail, { account, filter_id: 'f1' }), /mismatched filter ID/);
});
