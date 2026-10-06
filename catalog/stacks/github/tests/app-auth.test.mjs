import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, verify } from "node:crypto";
import { listRepos } from "../dist/core.js";
import { createReviewerTokenProvider, REVIEWER_PERMISSIONS } from "../dist/reviewer-auth.js";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const timestamp = Date.parse("2026-10-03T12:00:00Z");
const config = { appId: 123, installationId: 456, accountId: 789, repositoryIds: [101] };

test("App exchanges a signed bounded JWT for an exactly scoped installation token", async () => {
  const requests = [];
  const provider = createReviewerTokenProvider(config, {
    privateKey: async () => keys.privateKey, now: () => timestamp,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      const jwt = init.headers.Authorization.slice(7);
      const [header, payload, signature] = jwt.split(".");
      assert.deepEqual(JSON.parse(Buffer.from(header, "base64url")), { alg: "RS256", typ: "JWT" });
      assert.equal(verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), keys.publicKey, Buffer.from(signature, "base64url")), true);
      const claims = JSON.parse(Buffer.from(payload, "base64url"));
      assert.equal(claims.iss, "123");
      assert.equal(claims.iat, timestamp / 1000 - 60);
      assert.equal(claims.exp, timestamp / 1000 + 540);
      assert.equal(init.redirect, "error");
      if (init.method === "GET") return Response.json({ id: 456, app_id: 123, account: { id: 789 }, suspended_at: null, permissions: REVIEWER_PERMISSIONS });
      assert.deepEqual(JSON.parse(init.body), { repository_ids: [101], permissions: REVIEWER_PERMISSIONS });
      return Response.json({ token: "ghs_synthetic.token.value", expires_at: "2026-10-03T13:00:00Z", permissions: REVIEWER_PERMISSIONS, repositories: [{ id: 101 }] }, { status: 201 });
    },
  });
  assert.equal(await provider(), "ghs_synthetic.token.value");
  assert.deepEqual(requests.map(r => r.url), [
    "https://api.github.com/app/installations/456",
    "https://api.github.com/app/installations/456/access_tokens",
  ]);
});

test("trusted token provider authenticates without the author's environment token", async () => {
  let header;
  const result = await listRepos({}, {
    env: {},
    tokenProvider: async () => "synthetic-installation-token",
    fetchImpl: async (_url, init) => {
      header = init.headers.Authorization;
      return { ok: true, status: 200, text: async () => "[]" };
    },
  });
  assert.equal(header, "Bearer synthetic-installation-token");
  assert.deepEqual(result.repositories, []);
  assert.equal(JSON.stringify(result).includes("synthetic-installation-token"), false);
});

test("provider failure is sanitized and never falls back to the author's token", async () => {
  let requests = 0;
  await assert.rejects(listRepos({}, {
    env: { GITHUB_TOKEN: "synthetic-author-token" },
    tokenProvider: async () => { throw new Error("private-key-synthetic-value"); },
    fetchImpl: async () => { requests += 1; throw new Error("unexpected request"); },
  }), { message: "GitHub authentication provider unavailable" });
  assert.equal(requests, 0);
});

test("provider supports GitHub's stateless JWT-shaped installation tokens", async () => {
  const token = "ghs_123_synthetic-header.synthetic-payload.synthetic-signature";
  await listRepos({}, {
    env: {}, tokenProvider: async () => token,
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.Authorization, `Bearer ${token}`);
      return { ok: true, status: 200, text: async () => "[]" };
    },
  });
});

test("concurrent requests share an installation token and refresh before expiry", async () => {
  let now = timestamp;
  let exchanges = 0;
  const provider = createReviewerTokenProvider(config, {
    now: () => now, privateKey: async () => keys.privateKey,
    fetchImpl: async (_url, init) => {
      if (init.method === "GET") return Response.json({ id: 456, app_id: 123, account: { id: 789 }, suspended_at: null, permissions: REVIEWER_PERMISSIONS });
      exchanges += 1;
      return Response.json({ token: `synthetic-${exchanges}`, expires_at: new Date(now + 3_600_000).toISOString(), permissions: REVIEWER_PERMISSIONS, repositories: [{ id: 101 }] }, { status: 201 });
    },
  });
  assert.deepEqual(await Promise.all([provider(), provider()]), ["synthetic-1", "synthetic-1"]);
  assert.equal(exchanges, 1);
  now += 3_541_000;
  assert.equal(await provider(), "synthetic-2");
  assert.equal(exchanges, 2);
});

test("wrong identities, suspended installations and broadened token grants fail closed", async () => {
  const installation = { id: 456, app_id: 123, account: { id: 789 }, suspended_at: null, permissions: REVIEWER_PERMISSIONS };
  const token = { token: "synthetic-secret", expires_at: "2026-10-03T13:00:00Z", permissions: REVIEWER_PERMISSIONS, repositories: [{ id: 101 }] };
  const cases = [
    [{ ...installation, app_id: 999 }, token],
    [{ ...installation, account: { id: 999 } }, token],
    [{ ...installation, suspended_at: "2026-10-03T11:00:00Z" }, token],
    [installation, { ...token, permissions: { ...REVIEWER_PERMISSIONS, contents: "write" } }],
    [installation, { ...token, repositories: [{ id: 999 }] }],
    [installation, { ...token, repositories: [{ id: 101 }, { id: 999 }] }],
    [installation, { ...token, expires_at: "2026-10-03T11:00:00Z" }],
    [installation, { ...token, token: "synthetic\r\nInjected: header" }],
  ];
  for (const [installed, minted] of cases) {
    const provider = createReviewerTokenProvider(config, {
      now: () => timestamp, privateKey: async () => keys.privateKey,
      fetchImpl: async (_url, init) => Response.json(init.method === "GET" ? installed : minted, { status: init.method === "GET" ? 200 : 201 }),
    });
    await assert.rejects(provider(), { message: "Reviewer App authentication failed" });
  }
});

test("invalid App configuration fails before reading keys or making network requests", () => {
  const deps = { privateKey: async () => { throw new Error("must not read"); } };
  for (const patch of [{ repositoryIds: [] }, { repositoryIds: [101, 101] }, { appId: -1 }, { accountId: "789" }]) {
    assert.throws(() => createReviewerTokenProvider({ ...config, ...patch }, deps), /Invalid reviewer App configuration/);
  }
});

test("upstream errors and oversized bodies never expose credential material", async () => {
  for (const response of [new Response("synthetic-private-key", { status: 401 }), new Response("x".repeat(262145))]) {
    const provider = createReviewerTokenProvider(config, {
      now: () => timestamp, privateKey: async () => keys.privateKey,
      fetchImpl: async () => response,
    });
    await assert.rejects(provider(), { message: "Reviewer App authentication failed" });
  }
});

test("a stalled key loader times out and cannot poison the next token attempt", async () => {
  let release;
  let requests = 0;
  let loads = 0;
  const provider = createReviewerTokenProvider(config, {
    keyTimeoutMs: 20, now: () => timestamp,
    privateKey: () => { loads += 1; return loads === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve(keys.privateKey); },
    fetchImpl: async () => { requests += 1; throw new Error("unexpected call"); },
  });
  const outcome = await Promise.race([
    provider().then(() => "unexpected success", () => "rejected"),
    new Promise(resolve => setTimeout(() => resolve("hung"), 50)),
  ]);
  assert.equal(outcome, "rejected");
  release(keys.privateKey);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(requests, 0);
  await assert.rejects(provider(), /Reviewer App authentication failed/);
  assert.equal(loads, 2);
  assert.equal(requests, 1);
});

test("the core client also bounds an injected token provider", async () => {
  let requests = 0;
  const outcome = await Promise.race([
    listRepos({}, { env: { GITHUB_API_TIMEOUT_MS: "1000" },
      tokenProvider: () => new Promise(() => {}),
      fetchImpl: async () => { requests += 1; throw new Error("unexpected network"); },
    }).then(() => "unexpected success", error => error.message),
    new Promise(resolve => setTimeout(() => resolve("hung"), 1500)),
  ]);
  assert.equal(outcome, "GitHub authentication provider unavailable");
  assert.equal(requests, 0);
});
