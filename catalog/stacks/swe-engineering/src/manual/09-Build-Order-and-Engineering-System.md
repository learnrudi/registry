# Build Order and Engineering System

### How the Build Order, Doctrine, Testing, Debugging, and Reference Material Fit Together

---

## I. The Two Axes

Every engineering effort operates along two axes simultaneously.

**The horizontal axis is the build order.** It answers: what do I construct, and in what sequence? This axis is sequential. You move through it roughly left to right, with controlled iteration between adjacent steps.

**The vertical axis is the quality system.** It answers: how good must this be, how do I prove it, and how do I fix it when it breaks? This axis is ongoing. It applies at every point along the horizontal, from the first schema migration to the last production hotfix.

The build order without the quality system produces software that works once. The quality system without the build order produces standards with nothing to apply them to. You need both, running together, at all times.

---

## II. The Horizontal Axis: Build Order

### The Sequence

```
Schema → Operations → APIs → Frontend → Agents / Automation
```

This is the order in which layers are introduced. Each layer depends on the one before it. Each layer stabilizes as the one above it solidifies. None of them are ever permanently finished.

---

### Phase 1 — Schema (The Foundation)

**What you are doing:** Defining what exists in the system. Entities, relationships, constraints, data types, and the physical storage contract.

**What this produces:**

- Tables, columns, types, constraints
- Foreign key relationships and referential integrity rules
- Indexes aligned to expected access patterns
- Documented cardinality assumptions and growth expectations

**Why this comes first:** Every other layer — operations, APIs, frontend, agents — reads from or writes to this layer. If the schema is wrong, everything built on top of it inherits that error. The schema is the source of truth for what the system knows about the world.

**What "done" means at this phase:** The schema satisfies the Engineering Doctrine's Appendix A (Database Engineering Discipline). Specifically:

- Schema reflects access patterns, not just entity relationships
- Indexing decisions are justified by query plans, not guesses
- Constraints are enforced at the database level, not only in application code
- Migration safety is addressed: every schema change is backward-compatible or uses expand-contract
- Nullable columns are intentional and documented
- Growth projections and retention policies exist

**What iterates:** Schema is revisited when operations reveal access patterns that weren't anticipated, when performance testing reveals missing indexes, or when new features introduce new entities or relationships. Schema changes after initial deployment must follow migration discipline — they are not casual edits.

---

### Phase 2 — Operations (The Verbs)

**What you are doing:** Defining what actions the system performs on the data. These are the business operations — the things that change state, compute results, or produce outputs.

**What this produces:**

- A list of named operations with defined inputs, outputs, and side effects
- Classification of each operation as synchronous (request-response) or asynchronous (job, workflow, pipeline)
- State transition definitions: what states exist, which transitions are legal, and which are rejected
- Identification of operations that must be idempotent
- Identification of operations that involve external dependencies

**Why this comes second:** You cannot define meaningful operations without knowing what data exists. But you also cannot finalize the schema without understanding the operations — some access patterns only become clear when you think about what the system actually does. This is the phase where schema and operations iterate together until both stabilize.

**What "done" means at this phase:** Each operation satisfies the core doctrine's principles:

- State transitions are explicit and enforced (Principle 3)
- Failure behavior is defined for every operation: what happens on invalid input, dependency failure, timeout, partial completion, duplicate execution (Principle 6)
- Concurrency behavior is explicit: what runs in parallel, what state is shared, how shared state is protected (Principle 5)
- Async operations define their lifecycle: how they are triggered, how progress is tracked, how completion or failure is signaled, how they are retried
- Operations that must be idempotent are identified and the idempotency mechanism is defined

**What iterates:** Operations are revisited when the API layer reveals that consumers need a capability that doesn't exist, when agents require workflows that combine multiple operations, or when production incidents reveal missing failure handling.

---

### Phase 3 — APIs (The Boundary)

**What you are doing:** Exposing the operations as structured, contracted interfaces that external consumers — frontends, agents, other services — can call over a network.

**What this produces:**

- Endpoint definitions: resource paths, HTTP methods, request schemas, response schemas
- Authentication and authorization requirements per endpoint
- Error response model: structured, stable, machine-readable
- Rate limiting and backpressure policies
- Versioning strategy and backward compatibility commitments
- Pagination, filtering, and sorting for collection endpoints
- Machine-readable documentation (OpenAPI or equivalent)

**Why this comes third:** APIs are derived from operations and data, not the other way around. If you design APIs before you understand the schema and operations, you end up with endpoints that don't match the data model, operations that don't map cleanly to HTTP semantics, and contracts that need to be broken and rebuilt when the real requirements surface.

**What "done" means at this phase:** The API satisfies Appendix E (API Engineering Standard). Specifically:

- Schemas are validated at ingress (E2)
- Error responses are structured, actionable, and stable (E3)
- Versioning and backward compatibility are addressed (E4)
- Authentication, authorization, and audit are in place (E5)
- Rate limiting and backpressure are configured (E6)
- Idempotency is enforced for mutating operations (E7)
- Observability is instrumented: latency percentiles, error rates, tracing (E8)
- Testing covers success, error, edge, and negative paths (E9)
- Documentation matches the implementation and is sufficient for independent integration (E10)
- Pagination is cursor-based and enforced server-side for collections (E11)

**What iterates:** APIs are revisited when the frontend needs a response shape that doesn't exist, when agents need discovery or status-polling capabilities, when performance testing reveals endpoints that are too coarse or too fine-grained, or when consumers report that the error model doesn't give them enough information to act.

---

### Phase 4 — Frontend (The Human Interface)

**What you are doing:** Building the user-facing application that consumes the APIs and presents the system's capabilities as interactive experiences.

**What this produces:**

- UI components, pages, and flows
- Client-side state management architecture
- Error handling and degraded-state behavior
- Accessibility and internationalization support
- Client-side observability (error tracking, real user monitoring)

**Why this comes fourth:** The frontend depends on the API contract. It cannot be built reliably against an API that doesn't exist or that is still changing shape daily. That said, frontend development often begins in parallel with API development using mocked responses — but the frontend is not "done" until it is integrated against the real API and tested under realistic conditions.

**What "done" means at this phase:** The frontend satisfies the Engineering Doctrine's Appendix B (Frontend Engineering Discipline). Specifically:

- Rendering performance is tracked with Core Web Vitals (B1)
- Client-side state has an unambiguous source of truth for each piece of data (B2)
- Error boundaries isolate component failures (B3)
- Client-side observability captures errors, performance, and critical flow instrumentation (B4)
- Accessibility meets WCAG AA and is enforced in CI (B5)
- Frontend dependencies justify their bundle size cost (B6)
- Components have single responsibilities, minimal APIs, and are testable in isolation (B7)
- Offline and degraded network behavior is designed, not discovered (B8)
- Browser and device compatibility is tested against a defined support matrix (B9)
- Tests cover rendering, interaction, error states, and integration with APIs (B10)

**What iterates:** Frontend is revisited when new features require new pages or flows, when usability testing reveals interaction problems, when performance monitoring shows degradation, when accessibility audits find gaps, or when the API contract changes.

---

### Phase 5 — Agents and Automation (The Orchestration Layer)

**What you are doing:** Building autonomous or semi-autonomous systems that consume the APIs, chain operations into workflows, and execute multi-step processes without human intervention for each step.

**What this produces:**

- Agent definitions: what each agent does, what APIs it calls, what decisions it makes
- Workflow definitions: the sequence of operations, branching logic, error handling, and completion criteria
- Orchestration configuration: n8n flows, prompt pipelines, scheduled jobs
- Observability for agent behavior: what was attempted, what succeeded, what failed, what was retried

**Why this comes fifth:** Agents orchestrate the layers below them. They call APIs, which invoke operations, which mutate the schema. If any of those layers is unstable, the agent inherits that instability and amplifies it — because agents run without a human watching each step. The layers below must be solid before agents are trusted to act autonomously.

**What "done" means at this phase:** Agent workflows satisfy the core doctrine:

- Each agent's scope and authority is bounded (Principle 7 — backpressure applies to agents too)
- Failure modes are explicit: what happens when an API call fails mid-workflow, when a dependency times out, when an agent produces unexpected output (Principle 6)
- Agent actions are observable: logs, metrics, and traces capture what the agent did, why, and what the outcome was (Principle 8)
- Idempotency is preserved: if a workflow is retried after partial completion, it does not corrupt state (Principle 5)
- Agent outputs are validated at boundaries — an agent producing a result that feeds into another system is an external input to that system, and all external inputs are untrusted until validated (Principle 4)

**What iterates:** Agents are revisited when new workflows are needed, when production monitoring reveals failure patterns, when the APIs they depend on change, or when the system's operational requirements evolve.

---

## III. The Vertical Axis: What Runs Continuously

The vertical axis consists of four ongoing disciplines that apply at every phase of the build order, at all times, without end.

---

### A. The Engineering Doctrine (Quality Standard)

**What it is:** The set of principles, standards, and engineering expectations that define what "good enough for production" means.

**When it applies:** At every phase, during every decision. The doctrine is not a phase you complete — it is the standard you hold every phase to.

**How it connects to the build order:**

| Build Phase | Doctrine Application |
|---|---|
| Schema | Appendix A: Database Engineering Discipline |
| Operations | Appendix G: Backend Application Engineering Standard plus Core Principles 1–8 |
| APIs | Appendix E: API Engineering Standard |
| Frontend | Appendix B: Frontend Engineering Discipline |
| Agents | Core Principles 4–8 applied to orchestration, plus Appendix F for security controls where relevant |

**The doctrine also includes cross-cutting concerns that apply everywhere:**

- Principle 9: Performance must be modeled realistically
- Principle 10: Separation of concerns is a reliability tool
- Principle 11: Tests must verify reality, not optimism
- Principle 12: Simplicity is an operational strategy
- Principle 13: Dependencies must be managed deliberately
- Principle 14: Configuration must be explicit and safe
- Principle 15: Backward compatibility is a deployment constraint
- Principle 16: Distributed system behavior must be addressed explicitly
- Principle 17: Data has a lifecycle
- Principle 18: Cost is an engineering constraint
- Principle 19: Privacy and data protection are engineering responsibilities
- Principle 20: Incidents must feed back into engineering
- Principle 21: Developer experience is a productivity multiplier
- Principle 22: Accessibility and internationalization are design constraints

These are not bound to any single build phase. They apply across all of them, continuously.

---

### B. The Testing Doctrine (Verification)

**What it is:** The discipline of proving that the system does what it claims to do, at every layer, under realistic conditions.

**When it applies:** At every phase, in parallel with construction. Testing is not a step after building — it is a concurrent activity that accumulates as the system grows.

**How it connects to the build order:**

| Build Phase | Testing Application |
|---|---|
| Schema | Constraint tests, migration rollback tests, data integrity validation jobs |
| Operations | Unit tests for state transitions, invariant preservation, edge cases, failure paths |
| APIs | Contract tests, schema validation tests, error response tests, idempotency tests, rate limit tests, integration tests against realistic data volumes |
| Frontend | Component tests, interaction tests, visual regression tests, accessibility tests, integration tests against real API responses including error cases |
| Agents | Workflow tests, failure and retry tests, observability verification, output validation tests |

**Ongoing testing activities that never stop:**

- Regression tests are added for every production incident
- Tests are reviewed for signal: low-value, flaky, or redundant tests are removed
- Test coverage is treated as a diagnostic, not a target — meaningful risk reduction matters, arbitrary percentage does not
- Every pull request answers: what new behavior or risk is being protected by these tests?

---

### C. The Debugging Doctrine (Diagnosis)

**What it is:** The systematic method for locating and correcting deviations between expected and observed behavior.

**When it applies:** Reactively, at any time, at any layer. Debugging does not have a place in the build order. It activates when something goes wrong — during development, during testing, during production.

**How it connects to the build order:**

The debugging doctrine's 6-phase loop (Reproduce → Define the Delta → Localize the Failure Boundary → Inspect State → Form and Test Hypothesis → Apply Minimal Correction) is the same regardless of which layer the bug lives in. What changes is the tools and the state you inspect:

| Build Phase | Debugging Context |
|---|---|
| Schema | Query plans, constraint violations, migration failures, replication lag, data corruption |
| Operations | State transition violations, concurrency bugs, failed invariants, incorrect business logic |
| APIs | Contract violations, unexpected error responses, authentication failures, rate limit misbehavior, schema drift |
| Frontend | Rendering bugs, state management errors, failed API integrations, accessibility regressions, performance degradation |
| Agents | Workflow failures, unexpected agent decisions, retry corruption, observability gaps, dependency timeouts |

**The debugging doctrine's key principles apply universally:**

- Every action is tied to a testable hypothesis — no random edits
- Start from the failure, not from the beginning of the system
- Move backward from effect to cause
- Find the first point where reality diverges from expectation
- Apply the smallest possible correction to the root cause
- Verify the fix doesn't break adjacent behavior

---

### D. Reference Material (Vocabulary)

**What it is:** Conceptual models, mental frameworks, and terminology definitions that help engineers think clearly about each layer. The API primitives document is an example of reference material.

**When it applies:** As context, whenever an engineer is working on the relevant layer. Reference material is not a standard and not a process — it is a thinking aid.

**How it connects to the build order:**

Reference material supports each phase by providing shared vocabulary and mental models. It helps engineers talk about the same things using the same words. But it does not define quality standards (that's the doctrine), it does not define verification (that's testing), and it does not define diagnostic method (that's debugging).

Reference material is useful when onboarding new engineers, when discussing design decisions, and when writing documentation. It is not a substitute for the other three vertical disciplines.

---

## IV. The Complete Picture

```
                        ┌──────────────────────────────────────────────┐
                        │          VERTICAL AXIS (Ongoing)             │
                        │                                              │
                        │  Doctrine ──── quality standard at all times │
                        │  Testing ───── verification at all times     │
                        │  Debugging ─── diagnosis when needed         │
                        │  Reference ─── vocabulary as context         │
                        │                                              │
                        └──────────────────────────────────────────────┘
                                           │
                applies at every point along ▼

┌──────────────────────────────────────────────────────────────────────────────┐
│                     HORIZONTAL AXIS (Sequential)                             │
│                                                                              │
│   Schema ───→ Operations ───→ APIs ───→ Frontend ───→ Agents/Automation      │
│     │              │            │           │               │                │
│  Appendix A    Appendix G    Appendix E   Appendix B    Principles           │
│  (Database)    (Backend)     (API)        (Frontend)     4–8                 │
│                (Core)                                   (Applied to          │
│                                                         orchestration)       │
│                                                                              │
│   ◄──── Controlled iteration between adjacent phases ────►                   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## V. What Is Sequential vs. What Is Ongoing

### Sequential (the build order)

These have a natural progression. You introduce them in order. You revisit them as needed, but each layer depends on the one before it and cannot be completed in isolation from it.

1. **Schema** — first, because everything reads from or writes to it
2. **Operations** — second, because they define what the system does with the data
3. **APIs** — third, because they expose operations as contracted boundaries
4. **Frontend** — fourth, because it consumes the API contract
5. **Agents / Automation** — fifth, because they orchestrate across all layers below

### Ongoing (the quality system)

These never start and never finish. They run in parallel with every phase of the build order.

- **Engineering Doctrine** — the quality standard applied at every decision point
- **Testing Doctrine** — the verification practice that accumulates alongside the system
- **Debugging Doctrine** — the diagnostic discipline activated whenever behavior deviates from expectation
- **Reference Material** — the shared vocabulary consulted whenever clarity is needed

### The relationship

The build order tells you **what to construct next**.
The doctrine tells you **how good it must be**.
The testing doctrine tells you **how to prove it**.
The debugging doctrine tells you **how to fix it when it isn't**.
Reference material tells you **how to think and talk about it**.

No single document replaces the others. They are complementary components of a complete engineering system.

---

## VI. Phase Gates

A phase gate is the checkpoint between build phases. It is where the doctrine's standards are enforced before moving forward. Moving to the next phase without passing the gate means building on an unstable foundation.

### Schema → Operations Gate

Before defining operations, the schema must satisfy:

- Entities and relationships are documented
- Access patterns are identified and indexed
- Constraints are enforced at the database level
- Migration strategy exists and is tested
- Growth projections and retention policies are documented
- Appendix A review dimensions are addressed

### Operations → APIs Gate

Before exposing operations as APIs, the operations must satisfy:

- Each operation has defined inputs, outputs, and side effects
- State transitions are explicit and enforced
- Failure behavior is defined for each operation
- Concurrency behavior is explicit
- Sync vs. async classification is decided
- Idempotency requirements are identified
- Core doctrine principles 1–8 are addressed

### APIs → Frontend Gate

Before building the frontend against the APIs, the APIs must satisfy:

- Schemas are validated at ingress
- Error model is structured and stable
- Authentication and authorization are enforced
- Rate limiting is configured
- Documentation is accurate and sufficient for independent integration
- Contract tests exist
- Appendix E review dimensions are addressed

### APIs → Agents Gate

Before agents consume the APIs, the APIs must additionally satisfy:

- Error responses are specific enough for programmatic decision-making
- Idempotency is enforced for all mutating endpoints
- Status and completion signals exist for async operations
- Rate limit headers are machine-parseable
- The API is self-describing enough for an agent to use correctly from the schema alone
- Appendix E section E12 is addressed

### Frontend → Production Gate

Before the frontend ships to users, it must satisfy:

- Performance budgets are met
- Error boundaries are in place
- Accessibility is enforced in CI
- Client-side observability is instrumented
- Offline and degraded network behavior is designed
- Browser and device compatibility is tested
- Appendix B review dimensions are addressed

### Agents → Production Gate

Before agents operate autonomously in production, they must satisfy:

- Scope and authority are bounded
- Failure modes are explicit and tested
- Actions are observable via logs, metrics, and traces
- Retry behavior preserves state integrity
- Agent outputs are validated at downstream boundaries
- Monitoring and alerting are configured for agent-specific failure patterns

---

## VII. Iteration Rules

The build order is sequential, but it is not one-pass. Iteration happens. The following rules govern when and how iteration occurs.

### 1. Iterate between adjacent layers

Schema and operations iterate together until both stabilize. APIs and frontend iterate together during integration. This is normal and expected.

### 2. Do not skip layers

If a frontend requirement reveals a missing operation, define the operation first, then expose it through the API, then consume it in the frontend. Do not create a frontend hack that bypasses the API to hit the database directly.

### 3. Stabilize downward before building upward

If the schema is changing frequently, the operations layer will be unstable. If operations are unstable, the API contract is unreliable. If the API contract is unreliable, the frontend is building against a moving target. Stabilize lower layers before investing heavily in upper layers.

### 4. Treat backward iteration as a change, not a fix

If the frontend reveals that the API needs a new endpoint, that is a change to the API layer. It must go through the same review, testing, and documentation process as any other API change. It is not an exception because the request came from the frontend team.

### 5. Every iteration must pass the phase gate again

If the schema changes after operations are defined, the operations must be re-reviewed against the new schema. If the API changes after the frontend is integrated, the frontend integration must be re-tested. Phase gates are not one-time events — they re-apply whenever the layer they guard changes.

---

## VIII. Document Inventory

The complete engineering system consists of the following documents. Each serves a distinct purpose. None replaces any other.

| Document | Type | Purpose | When Used |
|---|---|---|---|
| **Engineering Doctrine** (Core Principles + Review Dimensions + Checklist + Rubric) | Quality standard | Defines what production-grade engineering looks like across all dimensions | At every decision, every review, every incident |
| **Appendix A: Database Engineering Discipline** | Quality standard (layer-specific) | Applies doctrine to schema, queries, migrations, transactions, replication, backup, observability, and data integrity | During schema design, database review, migration planning |
| **Appendix B: Frontend Engineering Discipline** | Quality standard (layer-specific) | Applies doctrine to rendering performance, state management, error boundaries, accessibility, dependencies, components, offline behavior, compatibility, and testing | During frontend development and review |
| **Appendix E: API Engineering Standard** | Quality standard (layer-specific) | Applies doctrine to resource design, schemas, errors, versioning, auth, rate limiting, idempotency, observability, testing, documentation, pagination, and agent interfaces | During API design and review |
| **Appendix F: Security Engineering Standard** | Cross-cutting standard | Applies doctrine to threat modeling, identity, authentication, authorization, trust boundaries, secrets, supply chain, CI/CD security, infrastructure security, observability, incident response, testing, and agent security | During any security-sensitive design or review |
| **Appendix G: Backend Application Engineering Standard** | Quality standard (layer-specific) | Applies doctrine to service architecture, business logic, state management, side effects, transactions, caching, jobs, events, lifecycle, middleware, resource management, configuration, and observability | During backend application development and review |
| **Appendix H: Infrastructure and Deployment Engineering Standard** | Runtime standard | Applies doctrine to packaging, infrastructure as code, environments, deployment strategy, rollback, runtime lifecycle, scaling, networking, observability, and operational safety | During deployment, infrastructure design, and runtime operations |
| **Testing Doctrine** | Verification standard | Defines what, how, and why to test; prioritization rules; quality bar; coverage philosophy | During all development and review |
| **Debugging Doctrine** | Diagnostic method | Systematic approach to locating and correcting behavioral deviations | During any debugging activity at any layer |
| **Build Order** (this document) | Process guide | Defines the sequence of construction, phase gates, iteration rules, and how all documents connect | During project planning, onboarding, and architectural review |
| **API Primitives** (reference) | Reference material | Conceptual model of API building blocks and mental frameworks | During API design for vocabulary and framing |
| **Incident Response and Postmortem Framework** (Doctrine Section IX) | Operational standard | Defines severity levels, incident lifecycle, postmortem requirements, and feedback loop | During and after production incidents |
| **PR Review Template** (Doctrine Section VIII) | Review tool | Practical checklist for pull request review | During every code review |

---

## IX. For New Engineers

If you are new to this system, here is the reading order:

1. **Read the core Engineering Doctrine** (Sections I through III). This gives you the principles and the review framework. Everything else builds on this.

2. **Read the Build Order** (this document, Sections II and IV). This gives you the big picture of how the system is constructed and how the documents relate.

3. **Read the appendix for the layer you are working on.** If you are working on the database, read Appendix A. If you are working on APIs, read Appendix E. If you are working on the frontend, read Appendix B. If you are working on backend application logic, read Appendix G. If you are working on infrastructure or deployment, read Appendix H.

4. **Read Appendix F: Security Engineering Standard** if your work touches trust boundaries, auth, secrets, CI/CD, infrastructure, or agents. In practice, most production work will.

5. **Read the Testing Doctrine.** This tells you how to verify your work at whatever layer you are building.

6. **Read the Debugging Doctrine** when you need it. You will know when.

7. **Use the PR Review Template** for every pull request, both as an author and as a reviewer.

8. **Read the Incident Response Framework** before your first on-call rotation.

You do not need to memorize all of this. You need to know where to find it, and you need to internalize the core principles well enough that they inform your instincts before you consult the checklist.

---

## X. The One-Page Version

**Build order (sequential):**
Schema → Operations → APIs → Frontend → Agents

**Quality system (ongoing):**
Doctrine (how good) + Testing (how to prove it) + Debugging (how to fix it)

**Phase gates:**
Each layer must satisfy the doctrine's standards for that layer before the next layer builds on it.

**Iteration:**
Adjacent layers iterate together. Lower layers stabilize before upper layers invest heavily. Every change re-triggers the relevant phase gate.

**The standard:**
We do not measure engineering quality by whether code appears to work once. We measure it by whether the system remains coherent when timing shifts, dependencies fail, inputs degrade, and scale increases.
