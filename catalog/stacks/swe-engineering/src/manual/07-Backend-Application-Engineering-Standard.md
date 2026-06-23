# Appendix G: Backend Application Engineering Standard

### Applying the Core Doctrine to the Application Layer Between Database and API

---

## Purpose

The backend application layer is where the system thinks, decides, coordinates, and executes. It sits between the database (what the system knows) and the API (how the system is accessed), and it is responsible for interpreting intent, enforcing business truth, coordinating dependencies, and protecting invariants under failure.

The doctrine already addresses the layers on either side: the database engineering discipline and the API engineering standard. The core principles address concurrency, failure handling, state transitions, observability, and boundaries. But the application layer itself — where operations are defined, where business logic executes, where services coordinate, and where side effects are managed — does not have its own consolidated standard.

This standard fills that gap. It defines the primitives, the standards, and the engineering expectations for backend application code at the level of rigor the doctrine demands for any critical component.

---

## Backend Primitives (Conceptual Model)

Backend architecture is built from a small number of atomic system primitives. Most familiar backend concepts — transactions, caching, workflows, middleware — are derived control structures composed from them. Understanding the hierarchy prevents engineers from treating composites as fundamental and missing the deeper design concern underneath.

### Level 1 — Atomic System Primitives

These are near-irreducible. Everything else in the backend is composed from them.

| Primitive | Definition |
|---|---|
| **State** | What the system knows right now: persisted, in-memory, derived, or transient |
| **Actor** | What is performing the action: user, service, agent, process, job |
| **Input** | Data entering the system from any source |
| **Boundary** | A point where data or control crosses contexts and trust resets |
| **Rule** | A constraint that governs what is permitted |
| **Operation** | A named unit of business behavior that transforms state |
| **Effect** | Anything that changes the world beyond returning a value |
| **Time** | The dimension across which state changes, events order, and concurrency emerges |
| **Resource** | A finite dependency that must be acquired, used, and released |
| **Signal** | A record of what happened, emitted for observation |

### Level 2 — Backend Control Primitives

These are composed from Level 1 primitives but are treated as direct design building blocks at the application layer.

| Primitive | Composed From | Definition |
|---|---|---|
| **Validation** | Rule + Input + Boundary | Proving input is structurally and semantically acceptable |
| **Authorization** | Rule + Actor + Operation + State | Determining what an actor is permitted to do |
| **Invariant** | Rule + State | A condition that must always remain true |
| **State Transition** | State + Rule + Operation | A legal movement from one state to another |
| **Transaction** | State + Effect + Rule (atomicity) | Grouped state changes that succeed or fail as a whole |
| **Idempotency** | Rule + Operation + Time | The property that repeated execution does not corrupt state |
| **Concurrency Control** | Rule + Actor + State + Time | Mechanism that protects invariants during simultaneous execution |
| **Retry** | Operation + Time + Rule | Repeated attempt after failure under defined constraints |
| **Configuration** | Rule + State (runtime) | Behavior controlled at runtime without code changes |

### Level 3 — Backend Architectural Composites

These are higher-order constructs built from Level 1 and Level 2 primitives. They are not atomic, but they are the standard vocabulary of backend design.

| Composite | Composed From | Definition |
|---|---|---|
| **Job / Task** | Operation + Time (deferred) | A unit of work detached from the request-response cycle |
| **Event / Message** | Signal + Effect | A record that something happened, to be processed now or later |
| **Queue** | Resource + Time + Ordering | A bounded buffer that decouples production from consumption |
| **Cache** | State + Rule (TTL, invalidation) + Resource | A secondary, faster representation of state with controlled staleness |
| **Middleware** | Boundary + Rule + Signal (ordered chain) | A reusable processing stage through which requests or jobs pass |
| **Workflow** | Operation + State Transition + Effect + Time (composition) | A multi-step sequence of operations, decisions, and side effects |
| **Observability Stack** | Signal (structured) + Resource | The system of logs, metrics, traces, and audit events |
| **Health Check** | Signal + State + Resource | A runtime-readable expression of system condition |

### The Backend Lifecycle in Primitive Form

Every backend request follows this path, whether the system makes it explicit or not:

1. Input crosses a boundary
2. It is validated (structural, then semantic)
3. Actor identity and authorization are checked (policy)
4. A named operation executes
5. The operation enforces invariants
6. It applies a legal state transition
7. It performs side effects within a transactional boundary
8. It manages idempotency and concurrency
9. It may emit events, enqueue jobs, or trigger workflows
10. It leaves behind observability signals
11. Runtime behavior is governed by configuration, resource limits, and health signals

A backend that makes this lifecycle explicit is a backend that can be reasoned about, tested, and debugged. A backend where these steps are implicit and tangled is a backend that works until it doesn't, and then nobody knows why.

---

## G1. Service Architecture and Decomposition

The decision of how to structure backend services — monolith, modular monolith, microservices, or something in between — is an architectural decision with long-term consequences for deployment, testing, observability, and team autonomy. It must be made intentionally, not by drift.

### Standard

- Service boundaries must align with domain boundaries, not technical layers — a "database service" or "validation service" is almost never the right decomposition
- A monolith is a valid architecture. Decomposition into separate services must be justified by a concrete need: independent deployment cadence, independent scaling, team ownership boundaries, or fundamentally different runtime requirements
- If services are separated, the communication contract between them must be as rigorously defined as any external API — internal services are not exempt from the API engineering standard
- Shared databases between services must be avoided or explicitly justified — a shared database is a hidden coupling that defeats the purpose of service separation
- Service boundaries must be drawn where failures can be isolated — if Service A's failure always brings down Service B, they are not meaningfully separate
- Every service must own its data, its operations, its invariants, and its deployment lifecycle

### Engineering expectation

*A microservice that cannot be deployed, tested, and understood independently is not a microservice — it is a distributed monolith with network calls where function calls used to be. The question is not "should we use microservices?" The question is: "where are the real boundaries in this system, and does separating them into distinct deployable units provide concrete value that exceeds the coordination cost?" If the answer is unclear, keep it together.*

---

## G2. Business Logic Organization

Business logic is the code that implements what the system actually does — the rules, calculations, decisions, and transformations that define the product. It is the most valuable and most frequently changed code in the system. Its organization determines whether changes are safe or risky, fast or slow.

### Standard

- Business logic must be separated from infrastructure concerns: HTTP handling, serialization, database access, queue mechanics, and framework boilerplate must not be interleaved with domain rules
- Operations must be named, explicit, and callable units — not anonymous blocks buried inside request handlers
- Each operation must have clearly defined inputs, outputs, side effects, and failure modes
- Domain rules must be testable without starting a server, connecting to a database, or invoking an external service — if testing a business rule requires the full application stack, the logic is not sufficiently separated
- Shared business logic must be extracted into domain modules, not duplicated across handlers or services
- The distinction between policy and mechanism must be maintained: policy (what is allowed, under what constraints) must be separable from mechanism (how it is executed)

### Engineering expectation

*An engineer should be able to read a business operation and understand what it does without reading the HTTP handler, the database migration, or the queue consumer that invokes it. If understanding a business rule requires tracing through three layers of framework plumbing, the business logic is not organized — it is embedded. Embedded business logic is business logic that will be duplicated, misunderstood, or broken by the next engineer who needs to change it.*

---

## G3. State Management and State Machines

Backend systems are state machines, whether they acknowledge it or not. Every entity that moves through stages — orders, jobs, users, documents, workflows — has states, transitions, and rules that govern movement between them. Making these explicit is one of the highest-leverage engineering decisions in backend design.

### Standard

- Every entity with a lifecycle must have its states explicitly defined and documented
- Valid transitions must be enumerated — the system must enforce which state changes are legal and reject all others
- Illegal transitions must produce clear errors, not silent corruption — transitioning from "completed" to "running" is not just unexpected, it is a bug that must be caught at the enforcement layer
- State transitions must be atomic where correctness requires it — if a transition involves multiple writes, they must succeed or fail together
- Duplicate or out-of-order transitions must be handled explicitly: what happens if the system receives a "complete" event for a job that is already completed, or a "start" event for a job that is already running?
- State machine definitions should be declarative where possible — a table or configuration of (current_state, event, next_state, guard_conditions) is easier to review, test, and audit than transition logic scattered across multiple handlers

### Engineering expectation

*If an engineer cannot draw the state diagram for a stateful entity by reading the code, the state management is implicit. Implicit state management is where bugs hide — not in the happy path, where states flow as expected, but in the edge cases where events arrive out of order, where retries replay transitions, and where concurrent actors attempt conflicting state changes simultaneously. The state machine is the invariant enforcement mechanism. If it is implicit, the invariants are unenforceable.*

---

## G4. Side Effect Management

A side effect is anything that changes the world beyond returning a value: writing to a database, sending an email, publishing an event, calling a third-party API, invalidating a cache, triggering an agent workflow. Side effects are where correctness gets expensive, because they are the operations that cannot be trivially undone.

### Standard

- Side effects must be identified and isolated — an engineer reading an operation should be able to see at a glance what external state it modifies
- Side effects must not be buried inside pure computation: a function that appears to calculate a value but also writes to the database is a function that will surprise everyone who calls it
- The ordering of side effects must be intentional: if the database write must succeed before the event is published, that ordering must be explicit and enforced, not incidental
- Failed side effects must have defined recovery behavior: if the database write succeeds but the email fails, what is the system state and what happens next?
- Irreversible side effects (sending money, sending notifications, deleting data) must have additional safeguards: confirmation steps, idempotency enforcement, or human-in-the-loop checkpoints where appropriate
- Side effects that cross service boundaries must be treated with the full rigor of distributed system design: they can fail, they can time out, they can succeed without the caller knowing, and they can be duplicated by retries

### Engineering expectation

*The single most common source of subtle backend bugs is unmanaged side effects: an email sent before the transaction commits, a cache invalidated before the write is confirmed, an event published that cannot be recalled when the operation is rolled back. If an operation has multiple side effects, the engineer must be able to explain the intended ordering, the failure behavior of each, and what consistency guarantees hold when one succeeds and another fails. "It usually works" is not a side effect management strategy.*

---

## G5. Transaction Discipline

A transaction is a grouped set of state changes and side effects that must succeed or fail as a whole. Transaction discipline determines whether the system maintains consistency under normal operation and recovers correctly under failure.

### Standard

- Transaction boundaries must be explicitly defined — the scope of what is included in a transaction must be a conscious decision, not an accident of framework defaults
- Transaction scope must be as small as possible — long-running transactions hold locks, consume connections, and increase the blast radius of failure
- The isolation level must be chosen intentionally per use case — the default isolation level is rarely correct for all operations, and using it everywhere is an implicit bet that it is
- Distributed transactions across services must be avoided unless absolutely necessary — prefer saga patterns with compensating actions, where each step is independently atomic and failures trigger explicit rollback operations
- The failure mode of every transaction must be defined: what happens on deadlock, on timeout, on constraint violation, on connection loss mid-transaction?
- Compensating actions for saga patterns must be tested — a compensating action that has never been executed is a compensating action that does not work

### Engineering expectation

*"We wrap everything in a transaction" is not transaction discipline. It is a blanket policy that trades thought for false safety. The questions that matter are: what is inside this transaction and why? What happens if it takes longer than expected? What happens if two transactions contend for the same rows? What is the isolation level and is it correct for this specific access pattern? If the answer to any of these is "I don't know, we use the default," the transaction design is not sufficiently engineered.*

---

## G6. Caching Discipline

A cache is not an optimization. It is a secondary representation of state with its own correctness obligations. A cache that serves stale data is not broken — it is behaving according to its staleness policy. A cache without a defined staleness policy is broken, because its behavior is undefined.

### Standard

- Every cache must have a documented owner, a defined TTL or invalidation strategy, and a stated staleness tolerance per use case
- Cache invalidation strategy must be chosen intentionally: time-based expiry, event-driven invalidation, write-through, or write-behind — each has different consistency and performance characteristics
- Cache failure must be designed, not discovered: if the cache is unavailable, does the system fall back to the source of truth with degraded performance, or does it fail entirely? Both are valid — the choice must be explicit
- Cache warming strategy must be defined for cold start scenarios: after a deploy, a cache flush, or a failover, what is the expected performance degradation and how quickly does it recover?
- Cache key design must prevent collisions and must include sufficient context to avoid serving one user's data to another (tenant isolation in cache is a security requirement, not just a correctness requirement)
- Cached data must never be treated as the source of truth for write operations — reads may tolerate staleness, but writes must go to the authoritative store
- Cache size must be bounded, and eviction policy must be defined

### Engineering expectation

*The two hardest problems in computer science are cache invalidation, naming things, and off-by-one errors. The joke persists because cache invalidation genuinely is hard. But hard is not an excuse for undefined. An engineer should be able to answer, for any cache in the system: what is cached, for how long, how is it invalidated, what happens when the cache is cold, what happens when the cache is down, and what is the worst-case staleness a user can experience. If any of those answers are "I'm not sure," the cache is a latent incident.*

---

## G7. Background Processing and Job Queues

A job is an operation detached from the request-response cycle. Background processing is where backends handle work that is too slow, too resource-intensive, or too failure-prone to execute synchronously. It is also where the most common backend reliability problems live, because jobs run without a user waiting for the response — which means failures are silent until someone notices.

### Standard

- Every job type must have a defined contract: what input it expects, what it produces, what side effects it has, and what its failure modes are
- Job execution must be idempotent — jobs will be retried, and retries must not corrupt state
- Poison job behavior must be defined: a job that fails repeatedly must be moved to a dead letter queue or equivalent, not retried indefinitely
- Job concurrency must be bounded: the number of jobs executing simultaneously must have a defined maximum, enforced by the infrastructure
- Job duration must be bounded: a job that runs forever is a resource leak, and a timeout must be configured
- Job priority must be explicit where multiple job types share the same queue or worker pool — one expensive job type must not starve others
- Job observability must include: queue depth, job age (time from enqueue to start), execution duration, failure rate, retry count, and dead letter queue size
- Duplicate job detection must be in place where enqueue-at-least-once semantics are possible

### Engineering expectation

*A job queue without observability is a black hole. Jobs go in. Sometimes results come out. When they don't, nobody knows why, how many are affected, or how long the problem has been occurring. An engineer should be able to answer at any moment: how deep is the queue, how old is the oldest job, what is the failure rate, and are there stuck jobs? If those answers require querying the database manually, the job system is under-instrumented.*

---

## G8. Event-Driven Patterns

Events are records that something happened, published for other parts of the system to react to. Event-driven architectures decouple producers from consumers and enable asynchronous coordination. They also introduce complexity in ordering, delivery guarantees, and debugging that must be managed explicitly.

### Standard

- The distinction between commands (do this) and events (this happened) must be maintained — conflating them creates confusion about responsibility and coupling
- Event schemas must be versioned and treated as contracts — a change to an event schema affects every consumer, and consumers that have not been updated must not break
- Delivery semantics must be chosen intentionally: at-most-once, at-least-once, or exactly-once (which is effectively at-least-once with idempotent consumers) — the choice must match the correctness requirements of the consumer
- Event ordering guarantees must be documented: is ordering preserved per entity, per partition, or not at all? Consumers must be designed for the actual guarantee, not the hoped-for one
- Consumer idempotency must be enforced — at-least-once delivery means consumers will see duplicates, and duplicates must not corrupt state
- Dead letter handling must be defined for events that cannot be processed after repeated attempts
- Event tracing must propagate correlation IDs from the original operation through all downstream consumers so that the full chain of effects is traceable
- Event retention and replay capability must be defined: can the system replay events from a point in time for recovery or reprocessing?

### Engineering expectation

*Event-driven architecture is not "fire and forget." It is "fire and someone else is now responsible, and you need to know who, and what happens when they fail, and what happens when the event is delivered twice, and what happens when events arrive out of order." If an engineer publishes an event and cannot answer those questions, the event-driven design is not complete — it is hopeful.*

---

## G9. Application Lifecycle

A backend application is not just code that handles requests. It is a process that starts, becomes ready, serves traffic, and eventually stops. Each of those phases has correctness requirements that are invisible during development and critical during deployment.

### Standard

- Startup must be deterministic and observable: the application must validate its configuration, verify connectivity to dependencies (database, cache, message broker), and signal readiness only when it is truly ready to handle requests
- Readiness and liveness probes must be distinct: readiness indicates the application can serve traffic, liveness indicates the process is not hung — conflating them causes orchestrators to route traffic to unready instances or kill healthy ones that are temporarily busy
- Graceful shutdown must be implemented: on receiving a termination signal, the application must stop accepting new requests, drain in-flight requests to completion (within a timeout), close connections cleanly, and then exit
- In-flight work during shutdown must be handled: what happens to a request that is mid-processing when the shutdown signal arrives? What happens to a job that is mid-execution?
- Startup dependencies must be explicit: if the application cannot function without the database, it must not report readiness until the database connection is verified — silent startup with a failed dependency leads to a wave of errors that looks like an application bug
- Configuration must be validated at startup, not at first use — a misconfigured application that starts successfully and fails on its tenth request is harder to diagnose than one that fails immediately

### Engineering expectation

*Most backend reliability problems during deployments are lifecycle problems: the new instance started accepting traffic before it was ready, the old instance was killed before it finished draining, or a configuration error was not caught until the first request hit the broken code path. An engineer should be able to describe exactly what happens during startup, what happens during shutdown, and what happens to in-flight work during a rolling deploy. If the answer is "the framework handles it," the follow-up question is: "have you verified what the framework actually does?"*

---

## G10. Middleware and Request Pipeline

The request pipeline is the ordered chain of processing stages that every request passes through before reaching business logic and after business logic completes. It is where cross-cutting concerns — authentication, authorization, validation, logging, tracing, rate limiting, error handling — are applied consistently.

### Standard

- The request pipeline must have a defined, documented order — the sequence in which middleware executes determines correctness (authentication must precede authorization, which must precede business logic)
- Each middleware stage must have a single responsibility and must be testable in isolation
- Middleware must not silently swallow errors — an authentication middleware that catches an exception and returns a 200 is a security vulnerability masquerading as error handling
- The failure behavior of each middleware stage must be defined: if the tracing middleware fails, does the request proceed without tracing or does it fail entirely?
- Response pipeline (post-processing) must be as explicit as the request pipeline — logging, metric emission, response transformation, and header injection must have defined ordering
- Middleware must not modify request state in ways that are invisible to downstream handlers — if middleware enriches the request context (adding user identity, tenant information, correlation IDs), the enrichment must be explicit and typed, not hidden in untyped context bags
- The total overhead of the middleware chain must be understood and monitored — a pipeline with fifteen stages adds latency to every request, and that cost must be justified

### Engineering expectation

*A middleware chain that "just works" is a middleware chain whose behavior has not been examined under failure. What happens when the rate limiter's backing store is unavailable? What happens when the authentication service is slow? What happens when a middleware stage throws an unexpected exception? Each of these scenarios has a current behavior — the question is whether that behavior is intentional or accidental. If the answer is "let me check," the pipeline needs review.*

---

## G11. Resource Management

A backend application is partly a business system and partly a resource allocation system. Database connections, memory, file handles, thread pools, HTTP client connections, and worker slots are all finite resources that must be acquired, used, and released correctly. Resource mismanagement is one of the most common causes of production incidents that are hard to reproduce in development.

### Standard

- Every pooled resource (database connections, HTTP client connections, thread pools) must have explicitly configured minimum, maximum, and idle timeout settings — defaults are almost never correct for production workloads
- Resource exhaustion behavior must be defined: when the connection pool is empty, when the thread pool is saturated, when memory is under pressure — does the system queue, reject, or degrade?
- Resource leaks must be detectable through monitoring: connection pool utilization, active vs. idle counts, wait times, and timeout events must be observable
- Resources must be released in all code paths, including error paths — a connection acquired before a try block and released only in the success path is a connection that leaks on every failure
- Resource limits must align with downstream capacity: a connection pool of 100 against a database that supports 50 connections is not headroom — it is a cascading failure waiting for load
- Cleanup on application shutdown must release all held resources explicitly — relying on process termination to clean up is acceptable only when graceful shutdown has been implemented and verified

### Engineering expectation

*Resource exhaustion in production manifests as cascading, mysterious failures: requests start timing out, error rates spike across unrelated endpoints, and the system appears to be broken everywhere simultaneously. The root cause is almost always a single exhausted resource — usually database connections. An engineer should be able to answer, for any pooled resource: what is the maximum, what is the current utilization, what happens at exhaustion, and how would we know it's happening? If the monitoring doesn't exist, the next resource exhaustion incident will be diagnosed by reading code during an outage.*

---

## G12. Configuration and Feature Flags

Configuration is code that changes without a deployment. It deserves the same rigor as code, because it has the same impact — a misconfigured timeout, a malformed connection string, or an untested feature flag can cause an outage as effectively as a bug.

### Standard

- Configuration must be separated into categories with appropriate rigor for each: deploy-time configuration (environment, region, instance size), runtime configuration (timeouts, retry counts, batch sizes), secrets (credentials, API keys, encryption keys), and feature flags (behavioral toggles)
- All configuration values must be validated against a schema at startup — the application must fail fast on invalid configuration, not fail unpredictably at runtime
- Defaults must be safe: a missing configuration value must result in conservative behavior (shorter timeouts, lower concurrency, features disabled), not permissive behavior
- Feature flags must have owners, creation dates, intended lifespan, and a cleanup plan — a feature flag without an expiration is a permanent fork in the codebase
- Configuration changes must be auditable: who changed what, when, and what was the previous value
- Configuration drift between environments must be detectable — the effective configuration of any running instance must be inspectable without reading source code
- Secret configuration must follow the security engineering standard's secrets management requirements

### Engineering expectation

*The most dangerous configuration changes are the ones that seem safe: increasing a timeout, raising a concurrency limit, enabling a feature flag for a small percentage of users. These changes bypass code review, bypass testing, and bypass deployment procedures — they take effect immediately. An engineer should be able to answer: what is the effective configuration of this instance right now, and how would I know if a configuration change caused the problem I'm investigating? If the answer requires SSH-ing into a production machine, the configuration system is under-engineered.*

---

## G13. Backend Observability Patterns

The doctrine's Principle 8 requires that systems explain themselves in production. For the backend application layer, this means that every operation, every state transition, every side effect, and every failure must leave a trace that an engineer can follow during an incident.

### Standard

- Every operation must emit a structured log entry with: operation name, actor identity, correlation ID, input summary (without sensitive data), outcome (success or failure), duration, and any downstream calls made
- Logs must be structured (JSON or equivalent), not unstructured text — structured logs are searchable, aggregatable, and machine-parseable; unstructured logs are readable only by the person who wrote them
- Metrics must be emitted for: operation count and rate, operation duration (p50, p95, p99), error rate by type, queue depth and age, resource utilization (connection pools, memory, workers), and dependency latency
- Distributed tracing must propagate correlation IDs across all boundaries: HTTP calls, queue messages, event publications, and job dispatches — a single user action must be traceable from API ingress through every backend operation to database and back
- Error context must be rich enough for diagnosis without reproduction: the error message, the operation that failed, the input that triggered it (sanitized), the state of relevant entities at the time of failure, and the stack trace
- Audit events must be emitted for security-sensitive and business-critical operations: data access, permission changes, state transitions on sensitive entities, and configuration changes
- Alert thresholds must be based on user-impacting signals, not just system-level metrics — a CPU spike that doesn't affect latency is not an alert; a latency increase that does affect users is

### Engineering expectation

*If an engineer is woken at 2 AM by an alert, the first five minutes should be spent reading dashboards and logs, not reading code. The observability system must answer: what is happening, since when, how bad is it, what triggered it, and who is affected — all from signals the system emits in production. If the investigation requires deploying additional logging, the observability was insufficient before the incident started. Observability is not what you add during the incident. It is what you built before it.*

---

## Backend Review Dimensions

When reviewing any backend component — service, module, worker, handler, or coordinator — the following questions must be answerable. These supplement the core doctrine's review dimensions with application-layer specificity.

### Business Logic

- Is the business logic separated from infrastructure?
- Can operations be tested without the full application stack?
- Are domain rules explicit and named?
- Is policy separated from mechanism?

### State Management

- Are entity states explicitly defined?
- Are transitions enforced, not just documented?
- What happens on duplicate or out-of-order state changes?
- Where is the source of truth?

### Side Effects

- What external state does this operation modify?
- Are side effects isolated and visible?
- What is the intended ordering of side effects?
- What happens when one side effect succeeds and another fails?

### Transactions

- What is inside the transaction boundary?
- Is the scope as small as possible?
- Is the isolation level intentional?
- What happens on deadlock, timeout, or constraint violation?

### Caching

- What is cached, for how long, and why?
- How is the cache invalidated?
- What happens when the cache is unavailable?
- What is the worst-case staleness?

### Background Processing

- Are jobs idempotent?
- Is there a dead letter strategy?
- Is concurrency bounded?
- Are stuck jobs detectable?

### Events

- What delivery guarantee applies?
- Are consumers idempotent?
- Is ordering required and guaranteed?
- Can events be replayed for recovery?

### Lifecycle

- Is startup deterministic and verified?
- Is shutdown graceful?
- What happens to in-flight work during deploy?
- Are readiness and liveness probes correct?

### Resources

- Are pool sizes configured and justified?
- Is exhaustion behavior defined?
- Are leaks detectable?
- Do limits align with downstream capacity?

### Configuration

- Are values validated at startup?
- Are defaults safe?
- Is drift detectable?
- Do feature flags have owners and expiration?

### Observability

- Does every operation emit structured signals?
- Can a request be traced end-to-end?
- Are alerts based on user-impacting signals?
- Could an engineer diagnose this at 2 AM from dashboards alone?

---

## Summary

The backend application layer is where data becomes behavior. It is the layer that interprets intent, enforces business truth, coordinates dependencies, and protects invariants under failure, concurrency, and scale.

Backend primitives — state, operations, invariants, transitions, boundaries, validation, policy, side effects, transactions, idempotency, concurrency control, resources, caching, events, jobs, workflows, middleware, configuration, and observability — are the building blocks from which application logic is constructed. Some are atomic. Most are derived. All must be addressed explicitly.

The standard for production backend code is not that it handles the happy path correctly. The standard is that it handles the happy path correctly, rejects invalid transitions, survives retries, manages side effects under partial failure, releases resources in all code paths, and emits enough signal for an engineer to diagnose any problem from production telemetry alone.

A backend that makes its primitives explicit — its states, its transitions, its effects, its boundaries, its failure modes — is a backend that can be reasoned about, tested, extended, and operated. A backend that leaves them implicit is a backend that works until load rises, timing shifts, or a dependency fails, and then nobody knows what went wrong or where to look.
