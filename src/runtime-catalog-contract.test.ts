import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

type RuntimeManifest = {
  id: string;
  version: string;
  install: {
    platforms: Record<string, {
      url?: string;
      checksum?: {
        algo?: string;
        value?: string;
      };
      extract?: {
        type?: string;
        strip?: number;
      };
    }>;
  };
  bins?: Record<string, { path?: string }>;
};

async function loadRuntime(name: string): Promise<RuntimeManifest> {
  const manifestPath = path.resolve(
    import.meta.dirname,
    `../catalog/runtimes/${name}.json`
  );
  return JSON.parse(await fs.readFile(manifestPath, "utf8"));
}

describe("Python runtime catalog contract", () => {
  it("strips the single archive root for every supported Darwin platform", async () => {
    const manifest = await loadRuntime("python");

    for (const platform of ["darwin-arm64", "darwin-x64"]) {
      expect(manifest.install.platforms[platform]?.extract).toEqual({
        type: "tar.gz",
        strip: 1,
      });
    }
  });
});

describe("Node runtime catalog contract", () => {
  it("binds pinned Wrangler to a separate supported Node runtime", async () => {
    const wrangler = JSON.parse(await fs.readFile(path.resolve(
      import.meta.dirname, "../catalog/binaries/wrangler.json"
    ), "utf8"));
    expect(wrangler).toMatchObject({
      version: "4.131.1",
      install: { package: "wrangler", nodeRuntime: "runtime:node-22-23-2" },
    });
    const runtime = await loadRuntime("node-22-23-2");
    expect(runtime.id).toBe(wrangler.install.nodeRuntime);
    expect(runtime.version).toBe("22.23.2");
    expect(runtime.bins).toEqual({
      node: { path: "bin/node" }, npm: { path: "bin/npm" }, npx: { path: "bin/npx" },
    });
    const hashes: Record<string, string> = {
      "darwin-arm64": "61130f394c1630d211dd50aecc4353d379480f36d3ac913cd85dbba1aed585c6",
      "darwin-x64": "58e99022c2ff89395576cc7fd4d98cea24bb68081475d5f88b801ee8729fb026",
      "linux-arm64": "013b59cfd2819703a6f4a14ab891fc46fc2a4e3f5bcd92de3fb4929b43e35b30",
      "linux-x64": "b294a556e639d64338823920e5866c21c02741742d2e1529ee1a225c1ec9252a",
    };
    expect(Object.keys(runtime.install.platforms).sort()).toEqual(Object.keys(hashes).sort());
    for (const [platform, checksum] of Object.entries(hashes)) {
      expect(runtime.install.platforms[platform]).toEqual({
        url: `https://nodejs.org/dist/v22.23.2/node-v22.23.2-${platform}.tar.gz`,
        checksum: { algo: "sha256", value: checksum },
        extract: { type: "tar.gz", strip: 1 },
      });
    }
  });

  it("keeps versioned Node 20 separate from the verified Node 24 shared default", async () => {
    const [shared, versioned] = await Promise.all([
      loadRuntime("node"),
      loadRuntime("node-20-20-2"),
    ]);

    expect(shared).toMatchObject({
      id: "runtime:node",
      version: "24.21.0",
    });
    const sharedHashes: Record<string, string> = {
      "darwin-arm64": "bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057",
      "darwin-x64": "1462cb3b3046b815cf8ea436d3da450ec1a9f11dac7e5a46b0ada5305d7e8097",
      "linux-arm64": "724282c3b43aec998aa9527380465b45d229e021b58035f5f4f63095eabfe5d5",
      "linux-x64": "6e1db87ef58b8819e5d5402eff1536491b18edd8eb7bee5ef7897876e88dc5ff",
    };
    expect(Object.keys(shared.install.platforms).sort()).toEqual(Object.keys(sharedHashes).sort());
    for (const [platform, checksum] of Object.entries(sharedHashes)) {
      expect(shared.install.platforms[platform]).toEqual({
        url: `https://nodejs.org/dist/v24.21.0/node-v24.21.0-${platform}.tar.gz`,
        checksum: { algo: "sha256", value: checksum },
        extract: { type: "tar.gz", strip: 1 },
      });
    }
    expect(versioned).toMatchObject({
      id: "runtime:node-20-20-2",
      version: "20.20.2",
      bins: {
        node: { path: "bin/node" },
        npm: { path: "bin/npm" },
        npx: { path: "bin/npx" },
      },
    });

    const expectedPlatforms = {
      "darwin-arm64": {
        checksum: "466e05f3477c20dfb723054dfebffe55bc74660ee77f612166fca121dacb65b6",
      },
      "darwin-x64": {
        checksum: "8be6f5e4bb128c82774f8a0b8d7a1cc1365a7977d9657cece0ca647b3fe04e61",
      },
      "linux-arm64": {
        checksum: "47ef73d543ecf6eb19435f6c03a0ac4809b3bf0dd6b26c7c571efc2a6572a74d",
      },
      "linux-x64": {
        checksum: "19e56f0825510207dd904f087fe52faa0a4eb6b2aab5f0ea7a33830d04888b8b",
      },
    } as const;

    expect(Object.keys(versioned.install.platforms).sort()).toEqual(
      Object.keys(expectedPlatforms).sort()
    );

    for (const [platform, expected] of Object.entries(expectedPlatforms)) {
      expect(versioned.install.platforms[platform]).toEqual({
        url: `https://nodejs.org/dist/v20.20.2/node-v20.20.2-${platform}.tar.gz`,
        checksum: {
          algo: "sha256",
          value: expected.checksum,
        },
        extract: {
          type: "tar.gz",
          strip: 1,
        },
      });
    }
  });
});
