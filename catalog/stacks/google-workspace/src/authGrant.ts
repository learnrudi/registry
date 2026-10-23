export function assertReadOnlyAuthGrant(granted: unknown, required: string[]): void {
  if (!Array.isArray(granted) || granted.some(scope => typeof scope !== 'string' || !required.includes(scope))
    || required.some(scope => !granted.includes(scope))) {
    throw new Error('Google did not grant exactly the requested read-only scopes; no token saved');
  }
}
