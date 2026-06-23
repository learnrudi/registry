# Appendix F: Security Engineering Standard

### Applying the Core Doctrine to Security Across All Layers

---

## Purpose

Security is not a feature. It is the enforcement of identity, authorization, and data integrity across trust boundaries, with full observability and the ability to revoke access under failure.

Unlike database engineering, frontend engineering, or API engineering, security does not belong to a single layer. It spans every layer simultaneously, and a gap at any single layer can compromise the entire system. A SQL injection at the database layer, a missing auth check at the API layer, an XSS vulnerability at the frontend layer, and a leaked secret at the configuration layer are all security failures — but they live in completely different parts of the codebase and are reviewed by different people at different times.

This standard exists because of that property. The database engineering discipline owns database security. The frontend engineering discipline owns frontend security. The API engineering standard owns API security. This document owns what falls between them: the cross-cutting security concerns that no single layer can address alone, the unified threat model, and the security posture of the system as a whole.

This standard does not duplicate what is already covered by those layer standards. It covers what they cannot.

---

## Security Primitives (Conceptual Model)

Before the standards, the vocabulary. These are the irreducible building blocks of security reasoning. They are not features to be implemented — they are invariants and control mechanisms that must hold true regardless of what the system does.

Every system, at every layer, can be audited by asking whether these primitives are present, correctly implemented, and observable.

| # | Primitive | Question It Answers | Definition |
|---|---|---|---|
| 1 | **Identity** | What is acting? | A verified claim about who or what is making a request: user, service, agent, or process |
| 2 | **Authentication** | Is the identity real? | A mechanism to verify that an identity claim is valid |
| 3 | **Authorization** | What is that identity allowed to do? | A decision function: (identity, action, resource) → allow or deny |
| 4 | **Trust Boundary** | Where does trust reset? | A boundary where all inputs become untrusted again, regardless of source |
| 5 | **Input Validation** | Can this data be trusted structurally? | Rejection of malformed or unexpected input at every boundary |
| 6 | **Integrity** | Has the data been altered? | Detection of unauthorized modification via hashing, signatures, or checksums |
| 7 | **Confidentiality** | Who can see the data? | Prevention of unauthorized disclosure via encryption and access controls |
| 8 | **Auditability** | Can we reconstruct what happened? | Every action is attributable to an identity and traceable through the system |
| 9 | **Replay Protection** | Can actions be duplicated maliciously? | Prevention of duplicate or replayed execution from corrupting state |
| 10 | **Least Privilege** | What is the minimum required access? | Reduction of blast radius by scoping access to only what is needed |
| 11 | **Isolation** | What is separated from what? | Prevention of one component from affecting another through sandboxing, process isolation, or network segmentation |
| 12 | **Security Observability** | Can we detect abnormal behavior? | Detection of violations of expected behavior through metrics, alerts, and anomaly detection |
| 13 | **Revocation** | Can we remove access quickly? | Removal of trust after it has been granted, through token invalidation, key rotation, or session termination |

These primitives are the mental checklist for designing, reviewing, and auditing any system. A missing primitive is not a minor gap — it is a structural weakness that compounds under adversarial conditions.

---

## F1. Threat Modeling Is a Design Activity

Threat modeling is not a security team exercise performed after the system is built. It is a design activity that occurs during architecture, before code is written. A system designed without a threat model is a system whose attack surface is discovered by attackers rather than by engineers.

### Standard

- Every system or significant feature must have a threat model produced during design, before implementation begins
- The threat model must identify: assets worth protecting, threat actors and their capabilities, attack surfaces (entry points where untrusted input enters the system), and the security controls that mitigate each identified threat
- Threat models must be updated when the architecture changes, when new integrations are added, or when new trust boundaries are introduced
- Threat modeling must use a structured approach (STRIDE, attack trees, or equivalent) rather than ad hoc brainstorming
- The threat model must explicitly call out accepted risks — threats that are known but not mitigated — with documented justification and an owner
- Threat models must be reviewed as part of design review, not as a separate security review after the fact

### Engineering expectation

*An engineer should be able to point to the threat model for any production system and identify what was considered, what was mitigated, and what was accepted. If the answer is "we didn't do one," the system's security posture is unknown — not absent, not present, but unknown. That is the most dangerous state, because it means the team cannot distinguish between "secure" and "not yet attacked."*

---

## F2. Identity Architecture

Identity is the foundation of all other security primitives. Without a verified answer to "what is making this request," authentication, authorization, audit, and revocation are all impossible. Identity architecture must account for every type of actor in the system, not just human users.

### Standard

- Every actor type in the system must have a defined identity model: human users, service accounts, API consumers, background jobs, agents, and automated workflows
- Each identity must be unique, verifiable, and traceable through the system
- Service-to-service identity must not rely on network location alone (IP-based trust is not identity)
- Agent and automation identities must be distinct from human user identities — an agent acting on behalf of a user must carry both its own identity and the delegated authority from the user, and both must be auditable
- Identity lifecycle must be defined: how identities are created, how they are verified, how they are suspended, and how they are permanently revoked
- Shared credentials (shared API keys, shared service accounts) must be eliminated or explicitly justified and time-bounded

### Engineering expectation

*If an action occurs in the system and the team cannot determine which specific identity performed it, the identity architecture has failed. "A service account did it" is not attribution — it is the same as "we don't know." Every action must be traceable to a specific, verified identity.*

---

## F3. Authentication Architecture

Authentication verifies that an identity claim is valid. It is the gate between "someone claims to be X" and "we trust that they are X." Authentication failures are not edge cases — they are the primary vector for unauthorized access.

### Standard

- Authentication mechanisms must be appropriate to the actor type: OAuth 2.0 or SSO for human users, API keys or mutual TLS for service-to-service, scoped tokens for agents
- Credentials must never be transmitted in plain text, stored in plain text, or logged in any form
- Session management must define: session duration, idle timeout, re-authentication requirements for sensitive operations, and concurrent session policy
- Multi-factor authentication must be supported for human users accessing sensitive systems or performing destructive operations
- Authentication failures must be rate-limited to prevent brute force attacks, with lockout or progressive delay after repeated failures
- Token validation must occur on every request — a token that was valid at issuance must be re-verified against current revocation state

### Engineering expectation

*Authentication is not a one-time check at login. It is a continuous verification that must be enforced on every request, at every boundary, for every actor type. An engineer should be able to explain, for any endpoint or operation, how the caller's identity is verified and what happens when verification fails. "We check the token at the gateway" is sufficient only if the gateway is the sole entry point and cannot be bypassed.*

---

## F4. Authorization Model

Authorization determines what an authenticated identity is permitted to do. It is the policy layer that translates identity into capability. Authorization failures are often harder to detect than authentication failures because the actor is legitimate — they are simply exceeding their permitted scope.

### Standard

- The authorization model must be explicitly defined: role-based (RBAC), attribute-based (ABAC), policy-based, or a hybrid — chosen intentionally based on the system's access patterns
- Authorization decisions must be centralized in policy, not scattered across individual handlers — a permission check embedded deep in business logic is a permission check that will be missed in the next endpoint
- The authorization decision function must be testable in isolation: given an identity, an action, and a resource, the function must return allow or deny deterministically
- Default authorization posture must be deny — access is granted only when an explicit policy permits it
- Privilege escalation paths must be identified and controlled: the mechanism by which an identity gains additional permissions must be auditable and revocable
- Authorization must be enforced at the layer closest to the data, not only at the API gateway — defense in depth requires that a bypass of one layer does not grant unrestricted access to the next

### Engineering expectation

*An engineer should be able to answer: for any given identity, what can they do, what can they not do, and where is that enforced? If the answer requires reading multiple handler implementations rather than consulting a policy definition, the authorization model is not centralized enough. Authorization that exists only in code comments or team knowledge is authorization that will be violated by the next developer who doesn't know the rules.*

---

## F5. Trust Boundaries and Boundary Discipline

A trust boundary is any point where data crosses from one trust domain to another. At a trust boundary, all inputs become untrusted regardless of their source. This is the most important — and most frequently violated — security primitive.

### Standard

- Every trust boundary in the system must be explicitly identified and documented: browser to API, API to database, service to service, agent to API, external service to internal service, CI/CD to production
- At every trust boundary, all inputs must be validated, sanitized, and normalized before processing — the doctrine's Principle 4 (boundaries are where discipline begins) applies with full force
- Trust boundaries must not be assumed based on network topology alone — a service inside the VPC is not inherently trusted; it is a service that has not yet been compromised
- Zero-trust principles must be applied: verify explicitly, use least privilege, assume breach
- Data flowing outward across trust boundaries must be reviewed for information leakage: error messages, headers, metadata, and logs must not expose internal structure
- Agent-to-system boundaries deserve special attention: LLM outputs are untrusted input, tool call parameters from agents are untrusted input, and workflow decisions made by agents are untrusted input — regardless of how sophisticated the agent is

### Engineering expectation

*Trust is not transitive. The fact that Service A trusts Service B and Service B trusts Service C does not mean Service A should trust Service C. Every boundary must independently verify its inputs. An engineer should be able to draw the trust boundary map for any system and identify, at each boundary, what validation occurs. If a boundary exists without validation, it is an unguarded entry point.*

---

## F6. Secrets Management and Key Rotation

Secrets — API keys, database credentials, encryption keys, signing keys, tokens — are the most common single point of failure in security. A leaked secret can bypass every other control in the system. Secrets management must be treated as critical infrastructure.

### Standard

- Secrets must never be stored in source code, configuration files committed to version control, environment variables baked into container images, or logs
- All secrets must be managed through a dedicated secrets management system (Vault, AWS Secrets Manager, or equivalent) with access control, audit logging, and versioning
- Every secret must have a defined rotation schedule and an automated or documented rotation procedure that does not require service downtime
- Secret access must follow least privilege: a service that needs a database password must not have access to every secret in the system
- Emergency revocation must be possible for every secret: if a key is compromised, it must be rotatable within minutes, not hours or days
- Secret sprawl must be controlled: the total number of secrets, where they are used, and who has access must be inventoried and auditable
- Encryption keys must be distinct from authentication credentials, and key management must follow established standards (key hierarchy, separation of data keys and key-encryption keys)

### Engineering expectation

*If an engineer asks "what happens if this secret leaks?" and the answer involves a multi-day remediation process, the secrets management system is insufficiently designed. Secret rotation must be a routine operation, not an emergency procedure. The difference between the two is whether rotation was designed into the system or bolted on after a breach.*

---

## F7. Supply Chain and Dependency Security

Every external dependency — library, framework, base image, build tool, CI plugin — is a trust boundary. The code you import runs with the same privileges as the code you write. Supply chain attacks exploit this by compromising dependencies rather than the target system directly.

### Standard

- All production dependencies must be pinned to exact versions with integrity verification (lock files with hashes)
- Dependency updates must be reviewed for security advisories, not just functionality — a minor version bump can introduce a vulnerability
- Container base images must be pinned, scanned, and rebuilt regularly — a base image is a dependency with an operating system inside it
- Automated vulnerability scanning must run in CI against the full dependency tree, including transitive dependencies
- Critical dependencies must have a documented contingency: if the package is compromised or abandoned, what is the fallback?
- Build artifacts must be signed and verified — the artifact that runs in production must be provably the artifact that was built in CI
- Third-party services and SaaS dependencies are supply chain dependencies: their security posture, data handling practices, and incident history must be evaluated before adoption

### Engineering expectation

*A dependency is not free just because it is open source. Every import is a commitment to trust, monitor, and potentially replace that code. The question is not whether the dependency works — it is whether you would trust the maintainer with production access to your system, because that is effectively what you are granting. If a team cannot enumerate their critical dependencies and their last audit date, the supply chain is unmanaged.*

---

## F8. CI/CD Pipeline Security

The CI/CD pipeline has production access. It builds, tests, and deploys code. A compromised pipeline can inject malicious code into every service in the organization. Pipeline security is infrastructure security.

### Standard

- Pipeline access must be restricted: only authorized personnel and systems can modify pipeline definitions, and changes must be reviewed
- Pipeline secrets must be scoped: a build job for Service A must not have access to Service B's deployment credentials
- Build environments must be ephemeral and isolated: each build runs in a fresh environment that is destroyed after completion
- Deployment authorization must require explicit approval for production environments — automated deployment to staging is appropriate; automated deployment to production requires a gate
- Artifact provenance must be verifiable: the production artifact must be traceable to a specific commit, build, and set of inputs
- Pipeline dependencies (CI plugins, build tools, action runners) are supply chain dependencies and must be pinned, audited, and monitored
- Pipeline logs must not contain secrets, and pipeline outputs must be scanned for accidental secret exposure

### Engineering expectation

*The CI/CD pipeline is the most privileged system in the organization. It can write to production. It can deploy arbitrary code. It can access production secrets. If an attacker compromises the pipeline, they have compromised everything the pipeline can touch. Pipeline security must be reviewed with the same rigor as production access control — because it is production access control.*

---

## F9. Infrastructure and Network Security

Infrastructure security defines the physical and logical boundaries within which the system operates. It is the outermost layer of defense and the layer where misconfigurations have the largest blast radius.

### Standard

- Network segmentation must isolate production from staging, staging from development, and all environments from the public internet where possible
- Ingress points must be minimized and explicitly documented: every path through which external traffic can reach internal systems must be known and monitored
- Egress must be controlled: production systems must not have unrestricted outbound network access — outbound connections must be limited to known, necessary destinations
- Infrastructure must be defined as code (Terraform, CloudFormation, or equivalent) and subject to the same review, versioning, and audit as application code
- Security groups, firewall rules, and IAM policies must follow least privilege and must be auditable
- Infrastructure drift detection must be in place: the running state of infrastructure must match the declared state, and deviations must be flagged
- TLS must be enforced for all network communication, internal and external — "internal traffic doesn't need encryption" is a bet that the internal network will never be compromised

### Engineering expectation

*An engineer should be able to describe the network path for any request from ingress to data store and identify every security control along that path. If the answer is "it goes through the load balancer and then... I'm not sure," the infrastructure security posture is not understood. Infrastructure that is not understood is infrastructure that is not defended.*

---

## F10. Security Observability

The doctrine's Principle 8 requires that systems explain themselves in production. Security observability extends this requirement to adversarial conditions: the system must not only explain what it is doing, but detect when something is being done to it.

### Standard

- Authentication events must be logged: successful logins, failed logins, token issuances, token refreshes, and session terminations
- Authorization failures must be logged with the identity, the attempted action, and the resource — these are potential indicators of compromise or misconfiguration
- Anomaly detection must be in place for access patterns: unusual login locations, unusual access times, unusual request volumes, and unusual data access patterns must generate alerts
- Security-relevant logs must be immutable, centralized, and retained for a defined period that meets both operational and compliance requirements
- Correlation must be possible across layers: a suspicious authentication event at the API layer must be traceable to the corresponding database access, network flow, and agent action
- Security dashboards must surface: failed authentication rate, authorization denial rate, rate limit trigger frequency, unusual access patterns, and secret access events
- Alert fatigue must be managed: security alerts must be tuned to minimize false positives while maintaining sensitivity to real threats — an alert that fires constantly and is always ignored is worse than no alert

### Engineering expectation

*If a breach occurs and the team cannot reconstruct what happened, when, and what data was accessed, the security observability has failed. The goal is not to prevent every breach — it is to detect breaches quickly, understand their scope, and respond before the damage compounds. Detection time is the most important security metric in a production system. A breach detected in minutes has a fundamentally different impact than a breach detected in months.*

---

## F11. Security Incident Response

Security incidents are a subset of incidents with additional legal, regulatory, and communication obligations. The general incident response framework (Doctrine Section IX) applies, but security incidents require additional procedures.

### Standard

- Security incidents must have a defined classification separate from operational severity levels: data breach (confirmed unauthorized data access), intrusion (unauthorized system access without confirmed data access), credential compromise (leaked or stolen credentials), vulnerability disclosure (newly discovered vulnerability in production systems), and supply chain compromise (compromised dependency or third-party service)
- Breach response must follow a defined procedure: containment (stop the bleeding), assessment (determine scope and impact), notification (legal, regulatory, affected users as required), remediation (fix the root cause), and postmortem (same standard as operational postmortems, with additional emphasis on detection time and response effectiveness)
- Legal and regulatory notification timelines must be documented and rehearsed — GDPR requires 72-hour notification, and other regulations have their own requirements
- Communication templates for breach notification must exist before they are needed — drafting a notification during a breach is drafting under the worst possible conditions
- Evidence preservation must be part of the incident response procedure — logs, artifacts, and system state must be preserved before remediation changes the evidence
- Security incident postmortems must evaluate not just what went wrong, but why it wasn't detected sooner and what would have caught it earlier

### Engineering expectation

*A security incident without a postmortem is a security incident that will repeat. A postmortem without follow-through is theater. But a security postmortem that only asks "how did they get in?" and not "why didn't we notice for three weeks?" is missing the most important question. Detection time, not just prevention, is what determines whether a security incident is a near-miss or a catastrophe.*

---

## F12. Security Testing

Security testing is distinct from functional testing. Functional tests verify that the system does what it should. Security tests verify that the system does not do what it should not — even when an adversary is actively trying to make it.

### Standard

- Automated vulnerability scanning must run in CI against every build: dependency vulnerabilities, known CVEs, and static analysis for common vulnerability patterns (injection, XSS, CSRF, insecure deserialization)
- Dynamic application security testing (DAST) must be performed regularly against staging or production-like environments
- Penetration testing must be conducted at least annually by qualified testers, with findings tracked to remediation
- Security-sensitive code paths (authentication, authorization, input validation, cryptographic operations) must have dedicated unit and integration tests that verify correct behavior under adversarial input
- Fuzzing must be applied to input parsing and deserialization code where feasible
- Regression tests must be added for every security vulnerability discovered — a vulnerability that is found and fixed but not tested against is a vulnerability that will be reintroduced
- Security test results must be tracked as metrics: vulnerability count by severity, time to remediation, and recurrence rate

### Engineering expectation

*A security test suite that only verifies that authentication works for valid users is testing the happy path. Security testing must verify that authentication fails for invalid users, that authorization cannot be bypassed, that input validation rejects adversarial payloads, and that error messages do not leak internal state. The test suite should assume an adversary who reads the source code, because they probably will.*

---

## F13. Agent and Automation Security

Agent systems introduce security challenges that do not exist in human-operated systems. Agents act autonomously, chain actions across trust boundaries, amplify mistakes at machine speed, and make decisions based on inputs (including LLM outputs) that are inherently untrustworthy. Security for agent systems requires every primitive in this appendix to be applied with heightened rigor.

### Standard

- Every agent must have a distinct identity with scoped permissions — an agent must never operate with a human user's full credentials
- Agent authority must be bounded: the set of operations an agent can perform, the data it can access, and the blast radius of its actions must be defined and enforced at the authorization layer, not just in the agent's prompt or configuration
- LLM outputs are untrusted input — every output that drives a tool call, database write, API request, or user-facing response must be validated at the trust boundary before execution
- Tool calls from agents must pass through the same input validation, authorization, and audit logging as any other API call — the fact that the caller is an agent does not reduce the validation requirement
- Agent workflows must be observable and auditable: every decision, tool call, and state change must be logged with the agent's identity and the context that led to the action
- Agent retry and error handling must be bounded: an agent that encounters a failure must not retry indefinitely, escalate its own permissions, or attempt alternative paths that exceed its authorized scope
- Human-in-the-loop checkpoints must be defined for high-impact operations: an agent should not be able to delete production data, transfer funds, or modify access controls without explicit human approval
- Prompt injection and indirect prompt injection must be treated as known threat vectors: agent inputs that include user-provided content, retrieved documents, or third-party data must be sanitized and isolated from control-plane instructions

### Engineering expectation

*An agent is not a trusted internal service. It is an autonomous actor operating with delegated authority under adversarial conditions. The security model for agents must assume that the agent will receive malicious input, that it will occasionally make incorrect decisions, and that its actions have real consequences. The question is not whether the agent is trustworthy — it is whether the system remains safe when the agent is wrong. If an agent can cause irreversible damage without a human checkpoint, the security architecture has not accounted for the actual risk.*

---

## Security Review Dimensions

When reviewing any component for security, the following questions must be answerable. These apply across all layers and supplement the layer-specific review dimensions in Appendices A, B, and C.

### Identity and Authentication

- What identities interact with this component?
- How is each identity verified?
- What happens when authentication fails?
- Are credentials stored, transmitted, and logged safely?

### Authorization

- What is each identity permitted to do?
- Where is authorization enforced?
- Is the default posture deny?
- Can authorization be bypassed by accessing a lower layer directly?

### Trust Boundaries

- Where are the trust boundaries?
- Is every input validated at every boundary?
- Are internal inputs treated as untrusted where appropriate?
- Do error responses leak internal information?

### Secrets and Keys

- What secrets does this component use?
- How are they stored, accessed, and rotated?
- What happens if a secret is compromised?
- Can rotation happen without downtime?

### Data Protection

- What sensitive data flows through this component?
- Is it encrypted at rest and in transit?
- Who can access it, and is that access logged?
- Can it be deleted on request?

### Observability

- Are security-relevant events logged?
- Can anomalous behavior be detected?
- Can a breach be reconstructed from logs?
- Are alerts configured and tuned?

### Resilience Under Attack

- What happens if this component is targeted with malicious input?
- What happens if a dependency is compromised?
- What is the blast radius if this component is breached?
- How quickly can access be revoked?

### Agent-Specific (where applicable)

- Does this agent have scoped, minimal permissions?
- Are LLM outputs validated before execution?
- Are high-impact actions gated by human approval?
- Is the agent's decision-making observable and auditable?

---

## Where Security Primitives Live Across the Doctrine

This table maps each security primitive to its enforcement location in the doctrine system. It exists to make the distributed nature of security visible and to identify which primitives are owned by which documents.

| Primitive | Primary Enforcement | Supporting Enforcement |
|---|---|---|
| Identity | This appendix (F2) | Appendix E (E5 — API auth) |
| Authentication | This appendix (F3) | Appendix E (E5), Appendix B (B3 — error handling for auth flows) |
| Authorization | This appendix (F4) | Appendix E (E5), Appendix A (A10 — database-level constraints) |
| Trust Boundaries | This appendix (F5) | Core Principle 4, Appendix E (E2 — schema validation), Appendix B (B3, B6) |
| Input Validation | Core Principle 4 | Appendix E (E2), Appendix A (A10), Appendix B (B3), This appendix (F5, F13) |
| Integrity | This appendix (F6, F8) | Appendix A (A10 — database constraints, checksums) |
| Confidentiality | This appendix (F6, F9) | Appendix A (A7 — replication security), Core Principle 19 |
| Auditability | This appendix (F10) | Core Principle 8, Appendix E (E8), Appendix A (A9) |
| Replay Protection | Appendix E (E7 — idempotency) | This appendix (F13 — agent replay) |
| Least Privilege | This appendix (F4, F6) | Appendix E (E5 — token scoping) |
| Isolation | This appendix (F9) | Appendix B (B3 — error boundaries), This appendix (F8 — pipeline isolation) |
| Security Observability | This appendix (F10) | Core Principle 8, Appendix E (E8), Appendix B (B4) |
| Revocation | This appendix (F3, F6) | Appendix E (E5 — token lifecycle) |

---

## Summary

Security is not a layer in the build order. It is an invariant that must hold at every layer, at all times.

The security primitives — identity, authentication, authorization, trust boundaries, input validation, integrity, confidentiality, auditability, replay protection, least privilege, isolation, observability, and revocation — are the atoms of security reasoning. They are present in every production system, whether explicitly designed or accidentally omitted. The difference between a secure system and an insecure one is whether these primitives were addressed intentionally or discovered by an attacker.

This standard provides the cross-cutting controls that no single layer-specific standard can own: threat modeling, identity architecture, secrets management, supply chain security, pipeline security, infrastructure security, security observability, security incident response, security testing, and agent security. Combined with the security requirements already embedded in the database, frontend, and API standards, it completes the doctrine's security posture.

The standard for production security is not "we haven't been breached yet." The standard is: we know our attack surface, we enforce controls at every trust boundary, we detect violations quickly, we can revoke access under pressure, and we learn from every incident permanently.
