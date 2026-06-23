# Appendix E: API Engineering Standard

Applying the core doctrine to the design, implementation, and operation of APIs

This standard applies the core doctrine principles to API engineering. It covers resource design, contract discipline, error handling, versioning, authentication, rate limiting, idempotency, observability, testing, and documentation at the level of rigor the doctrine demands for any critical component.



E1. API Design Must Reflect Consumer Access Patterns

An API is not a database exposed over HTTP. It is a contracted interface between systems, and its shape must be driven by how consumers actually use it, not by how the underlying data is stored.

Standard

• Every endpoint must have a documented purpose and primary consumer use case
• Resource modeling must reflect domain concepts as consumers understand them, not internal table structures
• Read-heavy and write-heavy paths should be designed differently where access patterns diverge significantly
• Endpoint granularity must balance consumer convenience against server-side complexity — overly fine-grained APIs force N+1 call patterns; overly coarse APIs return data nobody asked for
• Collection endpoints must support filtering, sorting, and pagination from the start, not as afterthoughts
• Nested resource paths must reflect real ownership relationships, not arbitrary grouping
Engineering expectation

An API designed by mirroring the database schema is an API that will be redesigned when consumer needs diverge from storage structure. API shape is a product decision, not an ORM output. An engineer should be able to explain who calls each endpoint, why, and what they do with the response.



E2. Schemas Are Contracts, Not Suggestions

The request and response schemas of an API are its most important artifact. They define what the API promises, what consumers can rely on, and what changes will break whom.

Standard

• Every endpoint must have a formally defined request and response schema
• Schemas must be validated at ingress — malformed, missing, or out-of-range fields must be rejected before reaching business logic
• Schemas must be the single source of truth for both server-side validation and client SDK generation
• Nullable fields must be intentional and documented — a field that is sometimes present and sometimes absent without explanation is an implicit contract violation
• Enum values must be constrained and documented; unknown enum values from clients must be handled explicitly (reject or ignore, not silently process)
• Schema changes must go through the same review rigor as code changes, because they are code changes — they just happen to affect every consumer at once
Engineering expectation

A schema that is not enforced is a schema that will drift. And a drifted schema means consumers are parsing responses with assumptions that are no longer true. If an engineer cannot point to the canonical schema definition for an endpoint and explain how it is enforced, the contract is not sufficiently engineered.



E3. Error Responses Must Be Structured, Actionable, and Stable

Status codes alone are not an error model. A 400 that returns a bare string tells the consumer that something is wrong but not what, where, or how to fix it. The error model is part of the API contract and must be designed with the same care as the success path.

Standard

• Every error response must use a consistent, documented structure across all endpoints
• Error responses must include: a machine-readable error code (stable across versions), a human-readable message, and sufficient context for the caller to understand what failed and why
• Validation errors must identify which fields failed and what the constraint was
• Error codes must be stable identifiers that consumers can programmatically switch on — they must not change between releases without a versioning event
• Internal implementation details (stack traces, internal service names, database errors) must never leak into error responses
• Rate limit, authentication, and authorization errors must be distinguishable from input validation errors
• Error behavior must be defined for every failure mode: invalid input, dependency failure, timeout, partial completion, overload, and stale or conflicting state
Engineering expectation

A consumer should never need to parse a human-readable error message string to decide what to do. If the only way to handle an error programmatically is to regex-match the message body, the error model has failed. Error responses are an interface, and they deserve interface-quality design.



E4. Versioning and Backward Compatibility

APIs do not exist in isolation. They have consumers who deployed against a specific contract and cannot upgrade atomically. Every API change exists in a world where old and new clients coexist.

Standard

• The versioning strategy must be explicit and documented: URL path, header, content negotiation, or another approach — chosen intentionally, not by default
• Additive changes (new optional fields, new endpoints) should not require a version bump
• Breaking changes (removed fields, changed types, altered semantics) must trigger a version increment and a migration path
• A deprecation policy must define: how consumers are notified, how long the old version is supported, and when it will be removed
• During rolling deployments, old and new API versions must coexist safely — a consumer that sends a request during a deploy must not receive an error because the server version changed mid-rollout
• Wire format compatibility must be tested across versions — a response serialized by v2 must be parseable by a v1 consumer for the duration of the coexistence window
Engineering expectation

A breaking change without a migration path is not a release — it is an incident scheduled for the next deploy. Every interface change must answer: what happens to the caller who has not upgraded yet? If the answer is "they break," the change is not ready to ship.



E5. Authentication, Authorization, and Audit

An API without authentication is an open door. An API with authentication but without authorization is a door that opens for everyone who knocks. Both must be present, scoped correctly, and observable.

Standard

• Every production API must require authentication — no anonymous access to mutable state or sensitive data
• Authentication mechanism must be documented: API keys, OAuth 2.0, JWT, mutual TLS, or another approach
• Authorization must be scoped: tokens must carry or reference the minimum permissions required for the requested action
• Token lifecycle must be defined: expiration, refresh, revocation, and rotation without service interruption
• Failed authentication and authorization attempts must be logged with enough context for security review without leaking secrets
• Sensitive operations (deletion, privilege escalation, bulk export) must produce audit trail entries
• API keys and secrets must never appear in URLs, logs, or error responses
Engineering expectation

An engineer should be able to answer, for any endpoint: who is allowed to call this, how is that enforced, what happens when an unauthorized caller tries, and where is the evidence of that attempt recorded. If any of those answers are unclear, the endpoint is not production-ready.



E6. Rate Limiting and Backpressure

An API without rate limiting is an API that converts popularity into outage. The doctrine’s Principle 7 requires backpressure for any load-bearing system. APIs are the most common load-bearing boundary.

Standard

• Every API must define rate limits per client, per endpoint, or per resource — the scope must match the system’s actual bottleneck
• Rate limit policies must be communicated to consumers via response headers (limit, remaining, reset)
• Rate-limited requests must receive a 429 response with a Retry-After header — silent throttling (slowing responses without signaling) is an anti-pattern
• Rate limits must be realistic for legitimate use cases — limits so low that normal consumers routinely hit them are not protection, they are obstruction
• Burst handling policy must be defined: token bucket, sliding window, or fixed window, chosen based on the traffic shape
• Degradation strategy for system overload must go beyond per-client rate limits: shedding low-priority traffic, returning cached responses, or rejecting with a clear signal are all valid approaches
Engineering expectation

Rate limiting is not optional and it is not a single number. It is a policy that must match the system’s capacity model, the consumer’s legitimate usage pattern, and the failure behavior the system can tolerate. If an engineer cannot explain what happens when a single client sends 10x its expected volume, the rate limiting design is incomplete.



E7. Idempotency for Mutating Operations

Networks are unreliable. Clients retry. Proxies replay. Any mutating API endpoint that is not idempotent is an endpoint that can corrupt state on a retry.

Standard

• All mutating endpoints (POST, PUT, PATCH, DELETE) must define their idempotency behavior explicitly
• POST endpoints that create resources must support client-provided idempotency keys
• Idempotency keys must have a defined TTL — the system must document how long a key is honored and what happens on replay after expiry
• PUT and DELETE must be naturally idempotent — repeating the operation must produce the same result as executing it once
• The idempotency store itself must be treated as a critical dependency — its failure mode must be defined (reject, allow with risk, degrade)
• Responses to replayed idempotent requests must return the same status and body as the original, not a conflict or duplicate error
Engineering expectation

"Clients should not retry" is not an idempotency strategy. Retries will happen regardless of documentation. The question is whether the system handles them correctly or whether each retry is a coin flip between success and data corruption.



E8. API Observability

An API that cannot explain its own behavior in production is an API that will be debugged by reading source code during an incident. The doctrine’s Principle 8 requires that critical workflows be self-explanatory through signals alone.

Standard

• Every API must emit structured logs for each request with: method, path, status, latency, client identity, and correlation ID
• Latency must be tracked at p50, p95, and p99 — average latency hides the tail that users actually experience
• Error rates must be tracked per endpoint, per status code family, and per client where feasible
• Dependency latency must be tracked separately from total request latency — an engineer must be able to distinguish API processing time from downstream wait time
• Rate limit hits, authentication failures, and schema validation rejections must each have distinct metrics
• Distributed tracing must propagate correlation IDs across all downstream service calls so that a single user request can be followed from ingress to completion
• Alerting must be configured on error rate spikes, latency degradation, and capacity exhaustion — not just on total failure
Engineering expectation

An engineer responding to a production issue should be able to answer: what happened, where it happened, how often it is happening, which clients are affected, and whether the problem is transient, systemic, or load-related — all from dashboards and logs, without touching the codebase. If the first step in incident response is reading code, the API is under-instrumented.



E9. API Testing Depth

API tests verify the contract the system promises to its consumers. The testing doctrine applies here with specific emphasis: the consumer does not care about your internal implementation. They care about what the endpoint returns when they call it.

Standard

• Every endpoint must have tests for the success path, including correct status codes, response schema conformance, and expected data
• Every endpoint must have tests for negative paths: invalid input, missing required fields, unauthorized access, not-found resources
• Schema validation must be tested: requests that violate the schema must be rejected, not silently accepted or partially processed
• Error responses must be tested for structure and stability: correct error codes, correct status codes, and presence of required fields
• Idempotency behavior must be tested: repeated identical requests must produce the documented result
• Rate limiting must be tested: exceeding the limit must produce the correct 429 response and headers
• Contract tests between API provider and consumer must exist for critical integrations — if the provider changes the response shape, the test should break before the consumer does
• Integration tests must exercise the full request lifecycle against realistic data volumes, not empty databases
Engineering expectation

An API test suite that only verifies happy-path 200 responses is testing the demo, not the contract. The test suite must verify that the API behaves correctly when inputs are malformed, when authentication is missing, when the client retries, and when the system is under load. If a breaking change can reach production without a test catching it, the suite is incomplete.



E10. Documentation Is the Human Interface

An undocumented API is an API that can only be used by people who can read its source code. Documentation is not a courtesy — it is the interface through which humans understand and use the system.

Standard

• Every API must have machine-readable documentation (OpenAPI/Swagger or equivalent) that is generated from or validated against the actual implementation
• Documentation must include: endpoint descriptions, request and response schemas with field-level descriptions, authentication requirements, error codes and their meanings, rate limit policies, and versioning information
• Every endpoint must include at least one complete request/response example for the success path and one for a common error path
• Documentation must be versioned alongside the API — a consumer reading the docs must see the contract for the version they are using, not the latest unreleased version
• Documentation drift must be prevented by automation: generated docs, contract tests, or CI checks that fail when the implementation and documentation disagree
• Changelog and migration guides must accompany every version bump, explaining what changed, what consumers need to do, and when the old version will be removed
Engineering expectation

An engineer integrating against the API should be able to make a successful call using only the documentation, without asking the API team a question. If onboarding a new consumer requires a Slack conversation and a walkthrough, the documentation has failed. The docs are the product. If they are wrong, the API is wrong.



E11. Pagination and Large Dataset Handling

Any endpoint that returns a collection will eventually return a large collection. An API that does not handle this from the start is an API that will either time out, exhaust memory, or return a response so large that the consumer cannot process it.

Standard

• Every collection endpoint must support pagination from the initial release — adding pagination later is a breaking change
• Cursor-based pagination must be used for large or frequently-changing datasets — offset-based pagination becomes expensive and inconsistent at scale
• Maximum page size must be enforced server-side — a consumer requesting all records in a single call must receive a bounded response, not a multi-gigabyte payload
• Total count, if provided, must be documented as exact or approximate — exact counts on large tables can be prohibitively expensive
• Filtering and sorting must be supported at the API level, not left to the consumer to perform on unbounded result sets
Engineering expectation

"It works fine with our current data size" is the pagination equivalent of "it works on my machine." Collection endpoints must be designed for the data volume they will reach in a year, not the data volume they have today.



E12. API as Agent Interface

APIs are increasingly consumed not just by human-authored clients but by autonomous agents, orchestration layers, and LLM-driven workflows. An API that is usable by a human developer but opaque to an agent is an API with an implicit scope limitation.

Standard

• Endpoint names, parameters, and descriptions must be semantically clear enough that an agent can infer correct usage from the schema and documentation alone
• Error responses must be specific enough for an agent to decide whether to retry, modify the request, or escalate — generic errors force agents into blind retry loops
• Operations that are safe to retry must be distinguishable from those that are not — idempotency information must be part of the contract, not tribal knowledge
• APIs that support multi-step workflows should expose operation status and completion signals so that agents can poll or subscribe rather than guess
• Rate limit headers and backpressure signals must be machine-parseable so that agents can self-regulate without hard-coded delays
• Discovery endpoints or machine-readable capability descriptions should be available where the API supports a broad surface area that agents need to navigate
Engineering expectation

An API designed only for human developers reading documentation is an API that will require wrapper code, translation layers, and custom tooling for every agent integration. If the API’s own schema and error model are sufficient for a well-prompted agent to use it correctly, the API is well-designed. If an agent needs a human to explain how to call the API, the interface is not self-describing enough.



API Review Dimensions

When reviewing any API endpoint, handler, or service boundary, the following questions should be answerable. These map directly to the doctrine’s Required Review Dimensions with API-specific framing.

Correctness

• Does the endpoint do what its documentation says it does?
• Are invariants preserved across all input combinations?
• Is the response schema accurate for all code paths, including error paths?
Contract and Boundary Discipline

• Is the request schema validated at ingress before business logic executes?
• Are all fields typed, constrained, and documented?
• Are unknown fields rejected or silently ignored, and is that behavior intentional?
Failure Handling

• What does this endpoint return when a downstream dependency times out?
• What does this endpoint return on partial completion?
• Is the error response structured, stable, and actionable?
Concurrency and Idempotency

• If a client sends the same request twice, what happens?
• If two clients mutate the same resource simultaneously, is the outcome correct?
• Are idempotency keys supported where mutation occurs?
Performance and Capacity

• What is the cost of this endpoint per request?
• What happens when one consumer sends 100x expected volume?
• Are response sizes bounded? Are queries bounded?
Observability

• Can an engineer trace a failed request from the consumer’s report to the root cause using logs and metrics alone?
• Are latency percentiles, error rates, and rate limit hits visible per endpoint?
Compatibility

• Does this change break any existing consumer?
• Can old and new versions coexist during rollout?
• Is the deprecation timeline communicated?
Testing

• Are success, error, edge, and negative paths all tested?
• Are contract tests in place for critical consumers?
• Is idempotent replay tested?
Documentation

• Does the documentation match the implementation?
• Could a new consumer integrate using only the docs?
• Is there a changelog for this version?


Summary

An API is a formalized boundary between systems that enforces structure, intent, and trust. The quality of that boundary determines whether the systems on either side can evolve independently, fail gracefully, and compose reliably.

The standard for a production API is not that it returns the right data when called correctly. The standard is that it remains correct, observable, and recoverable when inputs are malformed, when clients retry, when load spikes, when dependencies fail, and when the team that built it is not the team that operates it.

Every principle in this standard traces back to the core doctrine. If the API preserves invariants, validates boundaries, handles failure explicitly, applies backpressure, emits meaningful signals, and maintains backward compatibility, it is not just a working API. It is a reliable system boundary.
