
### Request origin safety

REST requests must resolve to the configured GitHub API origin. Automatic HTTP
redirects are rejected; supply the canonical API path. Enterprise API base paths
remain supported. Neither URL normalization nor a redirect may send a bearer
token to another origin.
