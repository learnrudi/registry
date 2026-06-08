# Twilio SMS RUDI Stack

RUDI MCP stack for sending and inspecting SMS messages through a user's own Twilio account.

This is a text-service stack only. It does not provide a dashboard, task database, reminder engine, or habit tracker. Other systems can call this stack when they need SMS.

## Tools

- `twilio_config_status` - Check whether credentials and sender config are present without revealing secret values.
- `twilio_send_sms` - Send an SMS. Defaults to dry-run unless `confirm_send: true`.
- `twilio_list_messages` - List recent messages. Full bodies are omitted unless `include_body: true`.
- `twilio_get_message` - Fetch one message by SID. Full body is omitted unless `include_body: true`.

## Requirements

- Node.js 20+
- RUDI installed and integrated with your agent
- Twilio account
- Either:
  - an SMS-capable Twilio phone number, or
  - a Twilio Messaging Service SID

## Secrets

Required:

- `TWILIO_ACCOUNT_SID`

Credential method, choose one:

- `TWILIO_AUTH_TOKEN`
- `TWILIO_API_KEY_SID` and `TWILIO_API_KEY_SECRET`

Sender method, choose one:

- `TWILIO_FROM_NUMBER`
- `TWILIO_MESSAGING_SERVICE_SID`

`TWILIO_PHONE_NUMBER` is also accepted as a legacy fallback for `TWILIO_FROM_NUMBER`.

## Local Setup

From this stack directory:

```bash
npm install
npm run build
npm test
npm run smoke
```

## RUDI Setup

After installing the stack through RUDI:

```bash
rudi secrets set TWILIO_ACCOUNT_SID
rudi secrets set TWILIO_AUTH_TOKEN
rudi secrets set TWILIO_FROM_NUMBER
rudi index stack:twilio-sms --json
rudi integrate claude
```

Restart or reload your agent after integration.

If you prefer API keys:

```bash
rudi secrets set TWILIO_ACCOUNT_SID
rudi secrets set TWILIO_API_KEY_SID
rudi secrets set TWILIO_API_KEY_SECRET
rudi secrets set TWILIO_FROM_NUMBER
```

## Example Agent Calls

Check setup:

```json
{
  "name": "stack:twilio-sms.twilio_config_status",
  "arguments": {}
}
```

Dry-run a send:

```json
{
  "name": "stack:twilio-sms.twilio_send_sms",
  "arguments": {
    "to": "+15551234567",
    "body": "This is a dry run."
  }
}
```

Send a real SMS:

```json
{
  "name": "stack:twilio-sms.twilio_send_sms",
  "arguments": {
    "to": "+15551234567",
    "body": "This message will be sent.",
    "confirm_send": true
  }
}
```

List recent messages without full bodies:

```json
{
  "name": "stack:twilio-sms.twilio_list_messages",
  "arguments": {
    "limit": 10
  }
}
```

Fetch one message with full body:

```json
{
  "name": "stack:twilio-sms.twilio_get_message",
  "arguments": {
    "sid": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "include_body": true
  }
}
```

## Safety Defaults

- Sends are dry-run unless `confirm_send: true`.
- Phone numbers are masked in responses.
- Message bodies are omitted from read tools unless `include_body: true`.
- Secret values are never returned by `twilio_config_status`.
- Invalid phone numbers and Twilio SIDs are rejected before Twilio SDK calls.

SMS can incur cost. Users are responsible for their Twilio billing, account rules, and SMS compliance obligations.

## Troubleshooting

### `can_send` is false

Call `twilio_config_status`. You need:

- `TWILIO_ACCOUNT_SID`
- one credential method
- one sender method

### Trial account cannot send

Twilio trial accounts can require recipient numbers to be verified before sending.

### No sender number

Buy or provision an SMS-capable phone number in Twilio Console, then run:

```bash
rudi secrets set TWILIO_FROM_NUMBER "+1..."
```

### Prefer Messaging Services

Set:

```bash
rudi secrets set TWILIO_MESSAGING_SERVICE_SID "MG..."
```

If both `TWILIO_MESSAGING_SERVICE_SID` and `TWILIO_FROM_NUMBER` are configured, the Messaging Service is used by default unless the tool call passes an explicit `from`.

## Release Checklist

See [Twilio SMS RUDI Stack Productization Checklist](../../../docs/TWILIO-SMS-RUDI-STACK-CHECKLIST.md).
