# Appendix H: Infrastructure and Deployment Engineering Standard

### Applying the Core Doctrine to Packaging, Promoting, Executing, and Operating Software Changes Safely Across Environments

---

## Purpose

Infrastructure and deployment engineering is the discipline of packaging, promoting, executing, and operating software changes safely across environments under real runtime conditions.

Unlike the other layer standards, this one does not map to a single phase in the build order. It is a runtime overlay across the entire horizontal axis. Every layer — schema, operations, APIs, frontend, agents — must eventually be built, configured, deployed, observed, and rolled back. This standard defines how that happens.

The doctrine already addresses what the code must do. This standard addresses how the code gets from a developer's machine to production, how it stays running, how changes are promoted safely, and how the infrastructure itself is engineered with the same rigor the doctrine demands for application code.

Infrastructure is not a primitive. It is composed from the same atomic system primitives as everything else: resource, configuration, boundary, operation, effect, time, signal, and rule. But composed does not mean optional. A system with excellent application code deployed on unmanaged infrastructure is a system where the next outage is caused not by a bug but by a misconfigured load balancer, a forgotten environment variable, or a deploy that cannot be rolled back.

---

## H1. Packaging and Artifact Discipline

A build artifact is the unit of deployment. It is what actually runs in production. If the artifact is not reproducible, not verifiable, and not controlled, then nothing downstream — deployment, rollback, debugging — can be trusted.

### Standard

- Builds must be reproducible: the same source commit must produce the same artifact regardless of when or where the build runs
- Artifacts must be versioned and traceable to a specific commit, build pipeline run, and set of inputs — artifact provenance must be verifiable, not assumed
- Container images must be built from minimal base images with only the dependencies the application requires — every unnecessary package is attack surface and image bloat
- Base images must be pinned to specific digests, not floating tags — a base image tagged "latest" is a base image that changes without your knowledge or consent
- Image scanning for known vulnerabilities must run in CI before any artifact is promoted beyond development
- Artifact registries must have access control, retention policies, and audit logging — old artifacts must be prunable, and the registry must not grow without bound
- Build-time secrets must never be baked into the artifact — secrets are injected at runtime, not at build time

### Engineering expectation

*An engineer should be able to answer, for any running instance: what exact artifact is deployed, what commit produced it, when it was built, and whether it passed all checks before promotion. If the answer requires inspecting the running container or querying the build system manually, the artifact pipeline lacks sufficient traceability. The artifact is the foundation of deployment trust — if it cannot be verified, nothing built on top of it can be trusted either.*

---

## H2. Infrastructure as Code

Infrastructure that exists only as manual configuration in a cloud console is infrastructure that cannot be reviewed, versioned, tested, or reliably reproduced. Infrastructure as code is not a tooling preference — it is the minimum standard for infrastructure that can be operated safely.

### Standard

- All production infrastructure must be defined in code (Terraform, CloudFormation, Pulumi, or equivalent) and stored in version control
- Infrastructure changes must go through the same review process as application code: pull request, peer review, approval, and merge
- Plan-before-apply discipline must be enforced: every infrastructure change must produce a preview of what will change before it is executed, and the preview must be reviewed by a human before application
- Manual changes to production infrastructure must be prohibited under normal operations — emergency manual changes must be documented, reviewed after the fact, and reconciled back into the code definition
- Infrastructure code must be modular: reusable components for common patterns (service deployment, database provisioning, networking) must be extracted and maintained as shared modules
- Infrastructure state must be stored remotely with locking to prevent concurrent modifications
- Destructive operations (resource deletion, security group changes, network reconfiguration) must require explicit confirmation and must be flagged in plan output

### Engineering expectation

*If an engineer asks "what infrastructure exists in production?" the answer must be readable from the infrastructure code repository, not from the cloud console. If the code and the console disagree, the infrastructure has drifted, and the drift must be detected and reconciled. Infrastructure that lives only in the cloud console is infrastructure that will be forgotten, misconfigured, or accidentally deleted by someone who didn't know it existed.*

---

## H3. Environment Management

Environments are where the same code runs under different conditions. The discipline of environment management determines whether a bug caught in staging would also have been caught in staging, or whether staging and production have diverged so far that staging results are meaningless.

### Standard

- Environment tiers must be explicitly defined with documented purposes: development (individual experimentation), staging (pre-production validation), and production (user-facing) at minimum
- Environment parity must be maintained as a measurable property: staging must match production in architecture, configuration shape, and infrastructure topology — differences must be documented and justified
- Configuration must be isolated per environment: a staging deployment must never read production secrets, connect to production databases, or send notifications to real users
- Secret injection must follow the same pattern across all environments: the mechanism for providing secrets to a running application must not change between staging and production
- Environment promotion must follow a defined path: code moves from development to staging to production, never skipping tiers for production-bound changes
- Drift detection must be automated: differences between environment configurations, infrastructure definitions, and deployed versions must be surfaced continuously, not discovered during an incident
- Ephemeral environments for feature testing or pull request validation should be supported where the team's deployment complexity justifies them

### Engineering expectation

*"It worked in staging" must actually mean something. If staging uses a different database engine, a different instance size, a different network topology, or a different configuration shape than production, then staging is not a pre-production environment — it is a different system that happens to run the same code. An engineer should be able to enumerate every known difference between staging and production and explain why each difference is acceptable. Differences that exist without justification are differences that will cause a production-only failure.*

---

## H4. Deployment Strategy

Deployment is the moment where new code meets real users. It is the highest-risk routine operation in most systems. Deployment strategy determines whether that risk is managed or whether each deploy is an implicit bet that nothing will go wrong.

### Standard

- The deployment strategy must be chosen intentionally based on the system's risk tolerance and architecture: rolling deployment, blue-green deployment, canary deployment, or feature-flag-gated rollout — each has different failure characteristics and rollback properties
- Rolling deployments must ensure that old and new versions coexist safely during the rollout window — the doctrine's Principle 15 (backward compatibility) applies directly
- Canary deployments must define: what percentage of traffic the canary receives, what metrics determine success or failure, how long the canary bakes before full promotion, and what triggers automatic rollback
- Deployment must be automated end-to-end: from artifact selection through promotion through health verification — manual steps in the deployment pipeline are manual steps that will be forgotten under pressure
- Startup ordering must be defined for services with dependencies: if Service B depends on Service A, deploying them simultaneously must not create a window where B starts before A is ready
- Database migrations must be coordinated with application deployments: the migration must be compatible with both the old and new application version for the duration of the rollout (expand-contract pattern)
- Deploy frequency should be high enough that each deploy is small and reversible — large, infrequent deploys accumulate risk

### Engineering expectation

*An engineer should be able to describe exactly what happens during a deployment: what order things happen in, what checks run at each stage, what determines success, and how long the entire process takes. If the answer is "we push to main and it deploys," the follow-up question is: what happens when the new version is broken? A deployment strategy that does not account for failure is not a strategy — it is optimism with automation.*

---

## H5. Rollback and Recovery

Rollback is the escape hatch. When a deployment introduces a defect, rollback is how the system returns to a known-good state. A rollback capability that has never been tested is a rollback capability that does not exist.

### Standard

- Rollback must be possible for every deployment, and the rollback procedure must be faster than the forward deployment — a rollback that takes an hour to execute is a rollback that will not be used when it is needed
- Rollback must be tested regularly: at minimum, the team must have executed a rollback in a production-like environment within the last quarter
- The rollback unit must be clear: are we rolling back the application only, the application and its configuration, or the application, configuration, and infrastructure?
- Database migrations must be rollback-compatible: the expand-contract pattern must ensure that rolling back the application does not require rolling back the schema, because schema rollbacks risk data loss
- Forward-only changes (migrations that cannot be reversed without data loss) must be explicitly identified, reviewed with extra scrutiny, and deployed with a contingency plan that does not depend on rollback
- Rollback triggers must be defined: what conditions (error rate, latency, health check failures) automatically trigger or recommend rollback, and who has authority to execute it
- Rollback must preserve data integrity: a rollback that reverts the application but leaves the database in a state that the old application version cannot handle is not a safe rollback

### Engineering expectation

*The question is not "can we roll back?" The question is "can we roll back in five minutes, with confidence, without data loss, at 2 AM, when the person on call has never done it before?" If the answer to any part of that is no, the rollback capability is insufficient. Rollback must be as routine and well-understood as deployment — because it will be needed exactly when conditions are worst.*

---

## H6. Runtime Lifecycle

A running application is a process that starts, becomes ready, serves traffic, and eventually stops. The runtime lifecycle governs what happens at each of those transitions. Most deployment-related incidents are lifecycle problems: traffic routed before readiness, processes killed before draining, or dependencies unavailable at startup.

### Standard

- Readiness probes must verify that the application can actually serve requests: dependencies are reachable, configuration is loaded, and internal initialization is complete — a readiness probe that always returns true is not a readiness probe
- Liveness probes must verify that the process is not hung — they must be lightweight and must not depend on downstream services (a liveness check that calls the database can mark a healthy application as dead when the database is slow)
- Readiness and liveness must be distinct: readiness answers "can this instance handle traffic?" while liveness answers "is this process alive?" Conflating them causes either premature traffic routing or unnecessary process kills
- Graceful shutdown must be implemented: on receiving a termination signal, the application must stop accepting new work, drain in-flight requests within a configured timeout, close connections cleanly, flush pending metrics and logs, and exit
- The shutdown timeout must be configured and aligned with the orchestrator's termination grace period — if the application needs 30 seconds to drain but the orchestrator kills it after 10, in-flight requests are dropped
- Worker processes must handle termination signals for in-progress jobs: release locks, checkpoint progress where possible, and ensure the job can be safely retried by another worker
- Startup probes (distinct from readiness) must be configured for applications with slow initialization: a startup probe prevents the orchestrator from killing a process that is still initializing

### Engineering expectation

*A deployment that causes dropped requests, failed health checks, or temporary error spikes is a deployment with a lifecycle problem. An engineer should be able to describe exactly what happens in the window between "new instance starts" and "new instance receives traffic," and between "old instance is told to stop" and "old instance is gone." If either window is not explicitly managed, users will experience errors during every deployment.*

---

## H7. Scaling and Capacity

Scaling is the system's response to changing load. Capacity is the system's limit under any configuration. Both must be understood, planned for, and observable.

### Standard

- Autoscaling rules must be based on meaningful signals: request latency, queue depth, or resource utilization that correlates with user experience — CPU alone is often the wrong signal for I/O-bound services
- Scaling must have defined minimums and maximums: the minimum ensures the service survives instance failures, the maximum prevents runaway scaling from consuming unbounded resources and cost
- Scale-up speed must be understood: how long does it take from the scaling signal firing to the new instance serving traffic? If the answer is minutes and traffic spikes happen in seconds, the scaling strategy needs a different approach (pre-warming, over-provisioning, or traffic shedding)
- Scale-down behavior must be graceful: removing instances must drain traffic and in-flight work before termination — aggressive scale-down causes the same lifecycle problems as ungraceful shutdown
- Saturation behavior must be defined: what happens when the system is at maximum scale and still receiving more load than it can handle? The answer must be explicit: shed traffic, degrade functionality, queue with bounds, or reject with a clear signal — not "fall over"
- Queue-based workers must scale independently from request-serving instances and must have their own scaling signals based on queue depth and job age
- Capacity limits must be tested: load testing must verify that the system behaves acceptably at expected peak, at 2x expected peak, and at the point of saturation

### Engineering expectation

*Autoscaling is not a substitute for capacity planning. It is a mechanism that operates within planned boundaries. An engineer should be able to answer: what is our expected peak load, what is our maximum capacity at current configuration, how quickly can we scale to meet a surge, and what happens when we exceed maximum capacity? If any of those answers are unknown, the system's behavior under load is a surprise waiting to happen.*

---

## H8. Network and Edge Configuration

Network configuration determines how traffic reaches the system, how services communicate internally, and where security boundaries are enforced at the network layer. Misconfigured networking is one of the most common causes of production outages that are hard to diagnose because the application code is correct — it's the path to the application that's broken.

### Standard

- DNS configuration must be treated as infrastructure code: versioned, reviewed, and tested — a DNS change is a production change that affects every user
- DNS TTLs must be intentional: low TTLs enable fast failover but increase DNS query load; high TTLs reduce query load but slow failover — the choice must match the system's availability requirements
- TLS must be enforced on all external traffic with no exceptions, and TLS certificates must be managed with automated renewal — an expired certificate is a preventable outage
- Internal service-to-service communication must use TLS or mutual TLS where the threat model requires it — "internal traffic is safe" is an assumption that fails when the internal network is compromised
- CDN configuration must be explicit about what is cached, for how long, and how cache is invalidated — a CDN that caches an error page for an hour has turned a momentary failure into an hour-long outage
- Ingress rules must be minimal: only the ports and paths that need to be externally accessible should be — every additional ingress path is additional attack surface
- Egress rules must be defined: production services should not have unrestricted outbound access — limiting egress to known, necessary destinations reduces the blast radius of a compromised service
- Load balancer health checks must match application readiness probes — a load balancer that sends traffic to an instance the application considers unready is a load balancer misconfigured

### Engineering expectation

*Network configuration is invisible when it works and catastrophic when it doesn't. An engineer should be able to trace the network path for any request from the user's browser to the database and back, identifying every hop: DNS resolution, CDN, load balancer, ingress controller, service mesh, internal routing, and database connection. If any hop in that path is "I think it goes through..." rather than "it goes through...," the network configuration is not understood well enough to debug under pressure.*

---

## H9. Deployment and Runtime Observability

The doctrine's Principle 8 requires that systems explain themselves in production. For infrastructure and deployment, this means that deploys themselves must be observable events, and runtime behavior must be attributable to specific versions, configurations, and infrastructure states.

### Standard

- Every deployment must be recorded as a timestamped event in the observability system: what was deployed, to which environment, by whom, at what time, and whether it succeeded
- Deployment markers must be visible in dashboards: error rate, latency, and throughput graphs must show deploy events as annotations so that behavioral changes can be correlated with code changes
- Per-release error tracking must be in place: errors introduced by a new release must be distinguishable from pre-existing errors — the team must be able to answer "did this deploy make things worse?" within minutes
- SLOs (Service Level Objectives) must be defined for critical user journeys, and SLO burn rate must be tracked — a deployment that burns through the error budget must be automatically flagged
- Infrastructure metrics must be tracked alongside application metrics: instance count, scaling events, resource utilization, network throughput, and storage consumption must be visible and alertable
- Alert thresholds must be tied to user-impacting signals, not just resource-level signals — high CPU is not necessarily an alert if latency is unaffected; elevated error rate is always an alert even if CPU is low
- Post-deploy validation must be automated where possible: a deployment pipeline that deploys but does not verify is a pipeline that trusts but does not verify

### Engineering expectation

*The first question after every deployment should be answerable from dashboards within five minutes: is the new version healthy? If that question requires manual testing, log inspection, or user reports to answer, the deployment observability is insufficient. The system must tell you whether the deploy is good — you should not have to go looking.*

---

## H10. Operational Safety and Governance

Deployment is a production operation. It changes what users experience. It must be governed with appropriate controls that balance velocity with safety.

### Standard

- Production deployments must require explicit authorization: who can deploy, under what conditions, and with what approvals must be defined — not everyone with repository access should have production deploy access
- Deploy freezes during high-risk periods (major customer events, holidays, end-of-quarter) must be policy, not informal agreements
- Maintenance windows must be defined for changes that require downtime or carry elevated risk, with user communication where appropriate
- Runbooks must exist for deployment procedures, rollback procedures, and common failure scenarios — the runbook must be executable by any on-call engineer, not just the person who wrote the code
- On-call ownership after deployment must be explicit: whoever deploys is responsible for monitoring the deploy's impact for a defined bake period — "deploy and leave for the day" is not acceptable for production changes
- Manual production interventions (database fixes, configuration overrides, emergency patches) must be documented, reviewed after the fact, and tracked as operational events
- Deployment metrics must be tracked: deploy frequency, deploy failure rate, time from commit to production, and mean time to rollback — these are organizational health signals

### Engineering expectation

*Operational safety is not bureaucracy. It is the set of controls that prevents a single mistake from becoming a system-wide outage. The controls must be proportional to the risk: a low-risk configuration change needs less ceremony than a database migration. But the risk classification itself must be explicit and reviewable, not left to the deployer's judgment alone. An engineer should be able to explain, for any deployment: who approved it, what checks it passed, how long it baked, and who was watching. If the answer to any of those is "nobody," the operational safety model has a gap.*

---

## Infrastructure Review Dimensions

When reviewing infrastructure or deployment changes, the following questions must be answerable. These supplement the core doctrine's review dimensions with infrastructure-specific concerns.

### Artifact Integrity

- Is the artifact traceable to a specific commit and build?
- Has it passed all required scans and checks?
- Is it reproducible from the same inputs?

### Infrastructure Definition

- Is the change defined in code and version-controlled?
- Has the plan been reviewed before application?
- Does the change introduce drift from the declared state?

### Environment Safety

- Does this change affect the correct environment?
- Are secrets and configuration isolated per environment?
- Does staging still match production after this change?

### Deployment Safety

- Can old and new versions coexist during rollout?
- Is the deployment strategy appropriate for the risk level?
- Are database migrations compatible with both old and new application versions?

### Rollback

- Can this change be rolled back?
- How long does rollback take?
- Has rollback been tested for this type of change?
- If rollback is not possible, what is the forward-fix plan?

### Runtime Health

- Are readiness and liveness probes correct for this change?
- Is graceful shutdown implemented and tested?
- What happens to in-flight work during the transition?

### Scaling

- Does this change affect scaling behavior?
- Are autoscaling rules still appropriate?
- What happens at maximum capacity?

### Network

- Does this change modify network paths, DNS, TLS, or ingress/egress rules?
- Has the network path been verified end-to-end?
- Are CDN caching rules correct for the new behavior?

### Observability

- Will this deploy be visible as an event in dashboards?
- Can errors be attributed to this specific release?
- Are alerts configured for the new or changed behavior?

### Operational Governance

- Who approved this deployment?
- Who is monitoring during and after the rollout?
- Is there a runbook for the failure modes this change introduces?
- Is on-call ownership clear for the bake period?

---

## Where Infrastructure Sits in the Operating System

Infrastructure and deployment engineering is not a phase in the build order. It is a vertical discipline — like security — that applies across every phase. Every layer must eventually be packaged, deployed, observed, and recovered.

The relationship to the build order:

| Build Phase | Infrastructure Concern |
|---|---|
| Schema | Migration deployment strategy, rollback compatibility, environment-specific connection management |
| Operations / Backend | Application lifecycle (startup, readiness, shutdown), resource configuration, runtime health signals |
| APIs | Ingress configuration, TLS termination, load balancer health checks, CDN caching rules |
| Frontend | CDN deployment, asset versioning, cache invalidation, edge configuration |
| Agents | Worker deployment, scaling signals for job queues, agent process lifecycle and termination |

The relationship to other standards:

| Standard | Infrastructure Intersection |
|---|---|
| A (Database) | Migration deployment, connection pool alignment, replication-aware routing, backup verification |
| B (Frontend) | CDN configuration, asset delivery, edge caching, deployment of static assets |
| E (API) | Ingress routing, TLS, load balancer configuration, rate limiting at the infrastructure layer |
| F (Security) | Network segmentation, secret injection, pipeline security, TLS enforcement, egress control |
| G (Backend) | Application lifecycle, resource management, configuration injection, health probes |

Infrastructure is the bridge between "the code is correct" and "the code is running correctly in production." This standard ensures that bridge is engineered, not improvised.

---

## Summary

Infrastructure and deployment engineering is the discipline that carries code from development to production and keeps it running safely under real conditions. It is composed from the same atomic primitives as every other discipline — resource, configuration, boundary, operation, effect, time, signal, and rule — but its concerns are distinct: packaging, environment management, promotion, rollout, rollback, runtime lifecycle, scaling, networking, observability, and operational governance.

The standard for production infrastructure is not "we can deploy." The standard is: we can deploy safely, verify quickly, roll back confidently, scale appropriately, and diagnose any infrastructure-related failure from signals alone. Every deployment is a controlled experiment in which the hypothesis is "this change improves the system without degrading reliability." The infrastructure discipline ensures that experiment is conducted safely, observed carefully, and reversible when the hypothesis is wrong.

A system with excellent code deployed on unmanaged infrastructure is a system where the next outage is not a bug — it is a deploy that could not be rolled back, a configuration that drifted between environments, a secret that expired without rotation, or a scaling limit that nobody knew existed until traffic exceeded it. This standard ensures that those failures are designed against, not discovered in production.
