# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | Yes                |
| < 1.0   | No                 |

## Security Model

### No Secrets in Registry

The registry must never contain API keys, tokens, or credentials. All secrets are:

- Declared in stack manifests under `requires.secrets`
- Stored locally by users in `~/.rudi/secrets.json`
- Injected at runtime by the RUDI CLI

### Package Verification

Packages in the official registry are reviewed before inclusion. Third-party packages should be reviewed by users before installation.

Changed official stacks must pass their repository-owned verification contract.
The runner uses macOS `sandbox-exec` or Linux `bubblewrap`, and fails closed on
unsupported platforms or missing sandbox tools. Verification and package-owned
preparation hooks cannot reach the network. The repository and runtime files
are readable; only the selected stack and temporary session home are writable.
Other user files are not exposed. Canonical stack/layout directories cannot be
symlinks, and macOS process-information access is restricted to the same sandbox.
The same restrictions apply to descendants.
The runner also strips tokens/provider secrets, invokes fixed argv, and refuses
unlocked Node dependency preparation.

Dependency installation is a separate network-enabled phase (`npm ci
--ignore-scripts`, locked Playwright Chromium provisioning, or Python requirements
installation), with the same filesystem
limits and fresh home. Treat dependency preparation as executing untrusted code;
Python build backends can execute during installation. Do not place secrets in
the checkout or runtime installation. The sandbox is a host-file and network
boundary, not a VM or a defense against kernel vulnerabilities. Linux runners
must support unprivileged user namespaces and have `bubblewrap` installed.
Standalone package scripts run directly outside this runner are not sandboxed.

Generated release metadata binds every index and the catalog hash tree to an
exact SHA-256 value plus source revision context. `npm run release:verify`
fails closed on missing, extra, traversing, or mismatched artifact paths.

### Binary Sources

Binaries are sourced from:
- Official upstream releases (GitHub, vendor sites)
- Verified checksums where available
- Platform-specific builds (darwin-arm64, darwin-x64, linux-x64)

## Reporting a Vulnerability

If you discover a security vulnerability in the RUDI Registry, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email security concerns to the maintainers
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We aim to respond to security reports within 48 hours and will work with you to understand and address the issue.

## Review Checklist

When reviewing packages for inclusion:

1. **No embedded secrets** - Check for hardcoded API keys or tokens
2. **Trusted sources** - Verify upstream binary URLs are official
3. **Minimal permissions** - Stack should only request necessary secrets
4. **Safe commands** - No arbitrary code execution in manifests
5. **Clear documentation** - Users understand what they're installing

## Best Practices for Contributors

When creating stacks:

1. **Declare all secrets** - List every required credential in the manifest
2. **Use environment variables** - Read secrets from `process.env` or `os.environ`
3. **Validate inputs** - Sanitize all user-provided data
4. **Handle errors** - Don't leak sensitive information in error messages
5. **Minimal scope** - Request only the permissions your stack needs

## Scope

This security policy covers:
- The RUDI Registry (`learnrudi/registry`)
- Official stacks, binaries, and prompts
- The index.json package manifest

Third-party stacks linked from external sources have their own security policies.

Native Chromium verification currently fails closed under the macOS runner:
Chromium attempts to apply an inner sandbox that macOS disallows inside the
outer sandbox. Browser provisioning can succeed, but it does not establish
rendering compatibility. Run those verification contracts in a separately
validated Linux sandbox or VM; do not disable Chromium's sandbox or bypass the
registry runner. Linux browser compatibility still requires an integration run.
