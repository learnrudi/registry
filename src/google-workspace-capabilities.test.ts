import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Google Workspace capability catalog', () => {
  it('maps only declared tools and keeps account administration outside client activation', () => {
    const base = new URL('../catalog/stacks/google-workspace/', import.meta.url);
    const catalog = JSON.parse(readFileSync(new URL('connection-capabilities.json', base), 'utf8'));
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', base), 'utf8'));
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.bindingProtocol).toBe('rudi.workspace-binding/v1');
    expect(catalog.stackId).toBe(manifest.id);
    expect(catalog.capabilities.map((item: { id: string }) => item.id)).toEqual(['email.read', 'email.send', 'calendar.read', 'calendar.write']);
    for (const capability of catalog.capabilities) {
      for (const tool of capability.tools) {
        expect(manifest.provides.tools).toContain(tool);
        expect(tool.startsWith('account_')).toBe(false);
      }
    }
    expect(catalog.capabilities[0].tools).not.toContain('gmail_send');
    expect(catalog.capabilities[2].tools).not.toContain('calendar_create');
  });
});
