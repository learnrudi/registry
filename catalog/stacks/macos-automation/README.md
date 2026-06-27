# macOS Automation Stack

Guarded local macOS automation tools for RUDI agents.

This stack uses macOS system tools such as `osascript`, `open`, and `shortcuts`
behind typed MCP tools. It does not expose arbitrary AppleScript execution.

## Permissions

Some tools require macOS permissions for the terminal or agent host running
RUDI:

- Accessibility: System Events tools such as frontmost app and window listing.
- Automation: controlling Finder, Reminders, or target applications.
- Shortcuts: each Shortcut may request its own app, file, or network permissions.

Use `macos_status` first, then `macos_check_accessibility` to verify System
Events access.

## Tools

- `macos_status`
- `macos_check_accessibility`
- `macos_get_frontmost_app`
- `macos_list_windows`
- `macos_open_url`
- `macos_open_app`
- `macos_focus_app`
- `macos_show_notification`
- `macos_list_shortcuts`
- `macos_run_shortcut`
- `macos_create_reminder`
- `macos_get_selected_finder_items`
- `macos_reveal_in_finder`

`macos_run_shortcut` and `macos_create_reminder` default to dry-run mode.
Pass `confirm_run: true` or `confirm_create: true` only after reviewing the
planned action.

## Development

```bash
npm install
npm test
```
