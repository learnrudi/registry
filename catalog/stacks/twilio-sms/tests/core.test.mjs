import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_BODY_LENGTH,
  getConfigStatus,
  getMessage,
  listMessages,
  maskPhone,
  parseGetArgs,
  parseListArgs,
  parseSendArgs,
  sendSms,
} from "../dist/core.js";

const MESSAGE_SID = `SM${"a".repeat(32)}`;
const MESSAGING_SERVICE_SID = `MG${"b".repeat(32)}`;

function makeClient(options = {}) {
  const calls = {
    create: [],
    list: [],
    fetch: [],
  };

  const messages = (sid) => ({
    fetch: async () => {
      calls.fetch.push(sid);
      return options.fetchResult ?? {
        sid,
        status: "delivered",
        direction: "outbound-api",
        to: "+15551234567",
        from: "+15557654321",
        body: "private body",
      };
    },
  });

  messages.create = async (params) => {
    calls.create.push(params);
    return options.createResult ?? {
      sid: MESSAGE_SID,
      status: "queued",
      direction: "outbound-api",
      to: params.to,
      from: params.from,
      messagingServiceSid: params.messagingServiceSid,
    };
  };

  messages.list = async (params) => {
    calls.list.push(params);
    return options.listResult ?? [
      {
        sid: MESSAGE_SID,
        status: "delivered",
        direction: "outbound-api",
        to: "+15551234567",
        from: "+15557654321",
        body: "private body",
      },
    ];
  };

  return {
    client: { messages },
    calls,
  };
}

test("config status reports auth and sender readiness without values", () => {
  const status = getConfigStatus({
    TWILIO_ACCOUNT_SID: `AC${"1".repeat(32)}`,
    TWILIO_API_KEY_SID: `SK${"2".repeat(32)}`,
    TWILIO_API_KEY_SECRET: "secret-value",
    TWILIO_FROM_NUMBER: "+15557654321",
  });

  assert.equal(status.account_sid_configured, true);
  assert.equal(status.auth_token_configured, false);
  assert.equal(status.api_key_pair_configured, true);
  assert.equal(status.from_number_configured, true);
  assert.equal(status.can_authenticate, true);
  assert.equal(status.can_send, true);
  assert.equal(status.send_blocker, undefined);
});

test("send args reject malformed phone numbers and overlong bodies", () => {
  assert.throws(
    () => parseSendArgs({ to: "5551234567", body: "hello" }),
    /E\.164/
  );

  assert.throws(
    () => parseSendArgs({ to: "+15551234567", body: "x".repeat(MAX_BODY_LENGTH + 1) }),
    /1600/
  );
});

test("send args reject simultaneous from and messaging service", () => {
  assert.throws(
    () => parseSendArgs({
      to: "+15551234567",
      body: "hello",
      from: "+15557654321",
      messaging_service_sid: MESSAGING_SERVICE_SID,
    }),
    /either from or messaging_service_sid/
  );
});

test("sendSms dry-runs without calling Twilio", async () => {
  const { client, calls } = makeClient();
  const input = parseSendArgs({
    to: "+15551234567",
    body: "RUDI dry run",
    from: "+15557654321",
  });

  const result = await sendSms(input, { client });

  assert.equal(result.sent, false);
  assert.equal(result.dry_run, true);
  assert.equal(result.sender_configured, true);
  assert.equal(calls.create.length, 0);
});

test("sendSms confirmed send uses configured from number", async () => {
  const { client, calls } = makeClient();
  const input = parseSendArgs({
    to: "+15551234567",
    body: "confirmed",
    confirm_send: true,
  });

  const result = await sendSms(input, {
    client,
    env: { TWILIO_FROM_NUMBER: "+15557654321" },
  });

  assert.equal(result.sent, true);
  assert.equal(result.sid, MESSAGE_SID);
  assert.equal(calls.create.length, 1);
  assert.deepEqual(calls.create[0], {
    to: "+15551234567",
    body: "confirmed",
    from: "+15557654321",
  });
});

test("sendSms confirmed send can use a messaging service", async () => {
  const { client, calls } = makeClient();
  const input = parseSendArgs({
    to: "+15551234567",
    body: "confirmed",
    messaging_service_sid: MESSAGING_SERVICE_SID,
    confirm_send: true,
  });

  await sendSms(input, { client });

  assert.deepEqual(calls.create[0], {
    to: "+15551234567",
    body: "confirmed",
    messagingServiceSid: MESSAGING_SERVICE_SID,
  });
});

test("listMessages omits body by default and passes filters", async () => {
  const { client, calls } = makeClient();
  const input = parseListArgs({
    limit: 5,
    to: "+15551234567",
    date_sent_after: "2026-05-01T00:00:00Z",
  });

  const result = await listMessages(input, { client });

  assert.equal(calls.list.length, 1);
  assert.equal(calls.list[0].limit, 5);
  assert.equal(calls.list[0].to, "+15551234567");
  assert.ok(calls.list[0].dateSentAfter instanceof Date);
  assert.equal(result[0].body, undefined);
  assert.equal(result[0].body_length, "private body".length);
  assert.equal(result[0].to, "+1***4567");
});

test("getMessage includes body only when requested", async () => {
  const { client, calls } = makeClient();
  const hidden = await getMessage(parseGetArgs({ sid: MESSAGE_SID }), { client });
  const visible = await getMessage(parseGetArgs({ sid: MESSAGE_SID, include_body: true }), { client });

  assert.equal(calls.fetch.length, 2);
  assert.equal(hidden.body, undefined);
  assert.equal(visible.body, "private body");
});

test("maskPhone keeps only a minimal phone hint", () => {
  assert.equal(maskPhone("+15551234567"), "+1***4567");
});
