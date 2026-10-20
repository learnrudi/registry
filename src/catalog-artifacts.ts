// Hash the full release catalog, including dotfiles and future payload types.
export const CATALOG_PAYLOAD_PATTERNS = ["catalog/**/*"];

export const CATALOG_ARTIFACT_IGNORE = [
  "**/.DS_Store",
  "**/node_modules/**",
  "**/runs/**",
  "**/downloads/**",
  "**/tmp/**",
  "**/.chrome-profiles/**",
  "**/.test-rudi/**",
  "**/composer/public/media/**",
  "**/clips/**",
  "**/output/**",
  "**/outputs/**",
];

export const CATALOG_PACKAGE_ARTIFACT_EXCLUDES = [
  "!catalog/stacks/**/node_modules/**",
  "!catalog/stacks/**/runs/**",
  "!catalog/stacks/**/downloads/**",
  "!catalog/stacks/**/tmp/**",
  "!catalog/stacks/**/.chrome-profiles/**",
  "!catalog/stacks/**/.test-rudi/**",
  "!catalog/stacks/**/clips/**",
  "!catalog/stacks/**/output/**",
  "!catalog/stacks/**/outputs/**",
  "!catalog/stacks/**/composer/public/media/**",
  "!catalog/skills/**/node_modules/**",
  "!catalog/skills/**/runs/**",
  "!catalog/skills/**/output/**",
  "!catalog/skills/**/outputs/**",
  "!catalog/**/.DS_Store",
];

const FORBIDDEN_CATALOG_ARTIFACT_PATTERNS = [
  /^catalog\/stacks\/[^/]+\/node_modules(?:\/|$)/,
  /^catalog\/stacks\/[^/]+\/runs(?:\/|$)/,
  /^catalog\/stacks\/[^/]+\/downloads(?:\/|$)/,
  /^catalog\/stacks\/[^/]+\/tmp(?:\/|$)/,
  /^catalog\/stacks\/[^/]+\/\.chrome-profiles(?:\/|$)/,
  /^catalog\/stacks\/[^/]+\/\.test-rudi(?:\/|$)/,
  /^catalog\/stacks\/[^/]+\/clips(?:\/|$)/,
  /^catalog\/stacks\/[^/]+\/output(?:\/|$)/,
  /^catalog\/stacks\/[^/]+\/outputs(?:\/|$)/,
  /^catalog\/stacks\/[^/]+\/composer\/public\/media(?:\/|$)/,
  /^catalog\/skills\/[^/]+\/node_modules(?:\/|$)/,
  /^catalog\/skills\/[^/]+\/runs(?:\/|$)/,
  /^catalog\/skills\/[^/]+\/output(?:\/|$)/,
  /^catalog\/skills\/[^/]+\/outputs(?:\/|$)/,
  /^catalog\/.*\/\.DS_Store$/,
];

export function normalizeCatalogPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

export function isForbiddenCatalogArtifact(filePath: string): boolean {
  const normalized = normalizeCatalogPath(filePath);
  return FORBIDDEN_CATALOG_ARTIFACT_PATTERNS.some((pattern) => pattern.test(normalized));
}
