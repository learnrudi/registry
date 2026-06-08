# TikTok Publishing Test - 2026-06-07

## Context

- App: RUDI Sandbox
- Account: `demo_creator`
- Stack: `social-media-publisher`
- Video: `<story-root>/1-active/example-story/videos/renders/drafts/example-draft.mp4`
- File size uploaded in successful inbox test: `253568970` bytes

## What Worked

1. OAuth worked after the redirect URI and local RUDI config matched.
   - Saved token scope: `user.info.basic,video.publish,video.upload`
   - Access token and refresh token were saved to RUDI secrets.

2. `tiktok_video_upload` worked.
   - Mode: TikTok inbox upload / `video.upload`
   - Publish ID: `v_inbox_file~v2.7648695525537253389`
   - Status immediately after upload:

```json
{
  "status": "PROCESSING_UPLOAD",
  "uploaded_bytes": 253568970
}
```

3. `tiktok_creator_info` worked.
   - Creator username: `demo_creator`
   - Max video duration: `3600` seconds
   - Privacy options returned by TikTok:

```text
PUBLIC_TO_EVERYONE
MUTUAL_FOLLOW_FRIENDS
SELF_ONLY
```

4. `tiktok_direct_post` dry-run worked.
   - Mode: `direct_file_upload`
   - Privacy: `SELF_ONLY`
   - Caption metadata validated.
   - Explicit `--confirm-post` guard works.

## Direct Post Result

Live `tiktok_direct_post` did not upload the video. TikTok rejected the direct-post initialization before file transfer:

```json
{
  "code": "tiktok_unaudited_client_can_only_post_to_private_accounts",
  "message": "Please review our integration guidelines at https://developers.tiktok.com/doc/content-sharing-guidelines/",
  "retryable": false,
  "details": {
    "status": 403,
    "code": "unaudited_client_can_only_post_to_private_accounts"
  }
}
```

Practical meaning: the API integration is wired, but TikTok is blocking Direct Post for this sandbox/unaudited app state unless the target account qualifies under TikTok's unaudited-client restrictions. The likely next experiment is to use a private sandbox target account, re-run a `SELF_ONLY` direct post, then repeat with the production creator account only after the app qualifies.

## Private Sandbox Account Direct Post

Follow-up test with private sandbox target user `sandbox_private_user` succeeded.

1. Added `sandbox_private_user` under Sandbox settings -> Target Users.
2. Reauthorized TikTok OAuth with `sandbox_private_user`.
3. Confirmed creator info:
   - Creator username: `sandbox_private_user`
   - Privacy options: `FOLLOWER_OF_CREATOR`, `MUTUAL_FOLLOW_FRIENDS`, `SELF_ONLY`
   - Duet disabled: `true`
   - Stitch disabled: `true`
4. Ran `tiktok_direct_post` with:
   - Privacy: `SELF_ONLY`
   - Caption: `Testing RUDI direct post on private sandbox account. #RUDI #CreatorTools #AI`
   - `--disable-duet`
   - `--disable-stitch`
   - `--confirm-post`

Result:

```text
Publish ID: v_pub_file~v2-1.7648716418875197453
Transfer method: FILE_UPLOAD
Privacy: SELF_ONLY
```

Status:

```json
{
  "status": "PUBLISH_COMPLETE"
}
```

This confirms the Direct Post implementation works end-to-end when TikTok's sandbox/account restrictions allow it.

## Inefficiencies Found

1. The ngrok callback URL is unstable on the free plan.
   - The old registered callback went offline.
   - A new ngrok URL had to be added to TikTok Developer Portal and local RUDI config.
   - Better fix: use a stable redirect domain or paid/static ngrok endpoint.

2. OAuth setup is still manual.
   - The browser authorization, callback capture, token exchange, and secret update worked, but they are not yet packaged as a simple command.
   - Better fix: add `tiktok_oauth_start` and `tiktok_oauth_exchange` setup helpers.

3. Direct Post errors were initially too opaque.
   - CLI output only showed the TikTok message.
   - The structured error code revealed the real blocker.
   - Better fix: make CLI errors include adapter code and status for non-secret API failures.

4. Large upload progress is not visible.
   - The inbox upload succeeded, but the 254 MB transfer looked idle for several minutes.
   - Better fix: add chunk progress logging for TikTok uploads.

5. `video.upload` and `video.publish` are different operational paths.
   - Inbox upload works now and is safer.
  - Direct Post works for a private sandbox target account, but needs additional TikTok eligibility/audit/account-state handling for public creator accounts.
   - Better fix: publish workflow should choose mode explicitly: `inbox` for draft-review, `direct` for confirmed posting.

## Current Recommendation

- Use `tiktok_video_upload` for real content while the app is sandbox/unaudited.
- Use `tiktok_direct_post --privacy SELF_ONLY --confirm-post` for private sandbox target-account tests.
- For public creator accounts, complete TikTok Direct Post review/audit requirements before relying on direct posting.
