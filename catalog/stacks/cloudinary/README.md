# Cloudinary Stack

Guarded RUDI MCP stack for uploading local media to Cloudinary and returning public HTTPS delivery URLs.

## Secrets

The stack loads credentials from RUDI-managed environment variables or a local
`.env` file in this stack directory. Do not commit credential values.

Supported keys:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_URL`

`CLOUDINARY_URL` can be used by itself, or the three explicit keys can be used together.

## Tools

- `cloudinary_config_status`: checks whether required config is present without revealing secret values.
- `cloudinary_upload_video`: validates and uploads a local video path. Calls are dry-run unless `confirm_upload` is true.
- `cloudinary_get_resource`: reads a Cloudinary resource by public ID and returns a filtered result.

## Folder Convention

Use a stable folder shaped like:

```text
<workspace>/<media-type>/<year>/<asset-slug>
```

For example:

```text
brand/shortform/2026/launch-announcement
```

The returned `secure_url` can be passed to publishing workflows that need a
public HTTPS media URL.
