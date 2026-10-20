# Public media download boundary

Twitter, LinkedIn and YouTube adapter downloads use `downloadPublicMedia` for
stored media source URLs. Only public HTTP(S) destinations without URL credentials
are permitted (adapters additionally require HTTPS). DNS answers must all be
public; one is pinned for the connection while retaining the original Host/SNI
and TLS certificate checks. Every redirect is independently vetted, with a maximum
of five redirects. The total DNS/request/body timeout is 60 seconds (120 seconds
for YouTube). Private destinations fail before an HTTP connection is created.

Bodies are counted while streaming. Missing or inaccurate Content-Length does
not bypass limits. Compressed responses are rejected after requesting identity
encoding. This fetch boundary accepts no Authorization, Cookie or proxy-credential
headers; fixed provider authentication/upload requests remain separate.

`SOCIAL_MEDIA_MAX_DOWNLOAD_BYTES` is trusted process configuration, default 64 MiB,
integer range 1 through 512 MiB. The effective limit is the smaller of this cap and
the adapter's existing platform limit. This is a compatibility change for large
video files: a provider's advertised multi-gigabyte upload allowance does not mean
this buffered local adapter supports that size. Raising the process cap increases
bounded memory use; larger files need a future streaming provider upload path.

The public HTTP implementation is copied byte-for-byte into independently
installable stacks. The registry parity test and shared transport regression
suite are the synchronization contract; do not make stack-specific edits to a
copy. Provider-owned upload URLs and authenticated API responses are outside this
generic media-download policy.
