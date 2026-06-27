#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  MacosAutomationError,
  ToolArgs,
  checkAccessibility,
  createReminder,
  focusApp,
  getFrontmostApp,
  getSelectedFinderItems,
  getStatus,
  installLaunchAgent,
  listLaunchAgents,
  listShortcuts,
  listWindows,
  openApp,
  openUrl,
  parseAppArgs,
  parseInstallLaunchAgentArgs,
  parseLaunchAgentLabelArgs,
  parseListWindowsArgs,
  parseNotificationArgs,
  parseOpenUrlArgs,
  parsePathArgs,
  parseReminderArgs,
  parseShortcutArgs,
  revealInFinder,
  removeLaunchAgent,
  runLaunchAgentNow,
  runShortcut,
  showNotification,
} from "./core.js";

function asText(data: unknown, isError = false) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
    isError,
  };
}

function asError(error: unknown) {
  if (error instanceof MacosAutomationError) {
    return asText(error.details, true);
  }
  return asText(
    {
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    },
    true
  );
}

const server = new Server(
  { name: "macos-automation", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "macos_status",
      description:
        "Report macOS stack support, required system binaries, and permission categories without requesting permissions.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "macos_check_accessibility",
      description:
        "Check whether System Events UI scripting is enabled. This may require macOS Accessibility permission for the terminal or agent host.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "macos_get_frontmost_app",
      description:
        "Return the frontmost app name using System Events. Requires macOS Accessibility permission.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "macos_list_windows",
      description:
        "List window names for the frontmost app or a named running app. Requires macOS Accessibility permission.",
      inputSchema: {
        type: "object",
        properties: {
          app_name: {
            type: "string",
            description: "Optional running app/process name. Defaults to the frontmost app.",
          },
          limit: {
            type: "number",
            description: "Maximum windows to return, 1-50. Defaults to 20.",
          },
        },
      },
    },
    {
      name: "macos_open_url",
      description: "Open an http or https URL with the default macOS handler.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "HTTP or HTTPS URL to open.",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "macos_open_app",
      description: "Open a macOS application by display name using the system open command.",
      inputSchema: {
        type: "object",
        properties: {
          app_name: {
            type: "string",
            description: "Application display name, e.g. Notes, Reminders, Safari.",
          },
        },
        required: ["app_name"],
      },
    },
    {
      name: "macos_focus_app",
      description:
        "Activate a macOS application by display name using AppleScript. May require Automation permission.",
      inputSchema: {
        type: "object",
        properties: {
          app_name: {
            type: "string",
            description: "Application display name, e.g. Notes, Reminders, Safari.",
          },
        },
        required: ["app_name"],
      },
    },
    {
      name: "macos_show_notification",
      description: "Show a local macOS notification.",
      inputSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Notification title.",
          },
          message: {
            type: "string",
            description: "Notification message.",
          },
          subtitle: {
            type: "string",
            description: "Optional notification subtitle.",
          },
          sound_name: {
            type: "string",
            description: "Optional macOS sound name.",
          },
        },
        required: ["title", "message"],
      },
    },
    {
      name: "macos_list_shortcuts",
      description: "List available macOS Shortcuts using the shortcuts CLI.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "macos_run_shortcut",
      description:
        "Run a named macOS Shortcut. This is a dry-run unless confirm_run is true because Shortcuts can perform broad local actions.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Shortcut name or identifier.",
          },
          input_path: {
            type: "string",
            description: "Optional absolute path passed to shortcuts --input-path.",
          },
          output_path: {
            type: "string",
            description: "Optional absolute path passed to shortcuts --output-path.",
          },
          output_type: {
            type: "string",
            description: "Optional Universal Type Identifier passed to shortcuts --output-type.",
          },
          confirm_run: {
            type: "boolean",
            description: "Must be true to execute. Omit or false for dry-run.",
          },
        },
        required: ["name"],
      },
    },
    {
      name: "macos_create_reminder",
      description:
        "Create a Reminders item. This is a dry-run unless confirm_create is true because it writes to local app state.",
      inputSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Reminder title.",
          },
          notes: {
            type: "string",
            description: "Optional reminder notes.",
          },
          list_name: {
            type: "string",
            description: "Optional Reminders list name. Defaults to the default list.",
          },
          due_at: {
            type: "string",
            description: "Optional ISO date or datetime for the remind-me date.",
          },
          confirm_create: {
            type: "boolean",
            description: "Must be true to create. Omit or false for dry-run.",
          },
        },
        required: ["title"],
      },
    },
    {
      name: "macos_get_selected_finder_items",
      description:
        "Return POSIX paths for the current Finder selection. May require Automation permission for Finder.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "macos_reveal_in_finder",
      description: "Reveal an existing absolute path in Finder.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Existing absolute file or directory path.",
          },
        },
        required: ["path"],
      },
    },
    {
      name: "macos_install_launch_agent",
      description:
        "Install a scoped user LaunchAgent for timers or folder triggers. Dry-run unless confirm_install is true. Labels must start with dev.rudi.",
      inputSchema: {
        type: "object",
        properties: {
          label: {
            type: "string",
            description: "LaunchAgent label under the dev.rudi namespace, e.g. dev.rudi.daily-brief.",
          },
          command: {
            type: "array",
            items: { type: "string" },
            description: "ProgramArguments array. command[0] must be an absolute executable path. No shell is used.",
          },
          schedule: {
            type: "object",
            description:
              "Schedule object: {type:'daily',hour,minute}, {type:'interval',seconds}, or {type:'watch_paths',paths:[absolute paths]}.",
          },
          run_at_load: {
            type: "boolean",
            description: "Set LaunchAgent RunAtLoad.",
          },
          working_directory: {
            type: "string",
            description: "Optional absolute working directory.",
          },
          environment: {
            type: "object",
            description: "Optional uppercase environment variables for the job.",
          },
          stdout_path: {
            type: "string",
            description: "Optional absolute StandardOutPath. Defaults under ~/.rudi/state.",
          },
          stderr_path: {
            type: "string",
            description: "Optional absolute StandardErrorPath. Defaults under ~/.rudi/state.",
          },
          load_now: {
            type: "boolean",
            description: "After writing, run launchctl bootstrap immediately.",
          },
          confirm_install: {
            type: "boolean",
            description: "Must be true to write a plist. Omit or false for dry-run.",
          },
        },
        required: ["label", "command", "schedule"],
      },
    },
    {
      name: "macos_list_launch_agents",
      description: "List scoped user LaunchAgents managed by this stack under ~/Library/LaunchAgents/dev.rudi.*.plist.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "macos_remove_launch_agent",
      description:
        "Unload and remove a scoped dev.rudi LaunchAgent. Dry-run unless confirm_remove is true.",
      inputSchema: {
        type: "object",
        properties: {
          label: {
            type: "string",
            description: "LaunchAgent label under the dev.rudi namespace.",
          },
          confirm_remove: {
            type: "boolean",
            description: "Must be true to unload and delete the plist.",
          },
        },
        required: ["label"],
      },
    },
    {
      name: "macos_run_launch_agent_now",
      description:
        "Kickstart a scoped dev.rudi LaunchAgent immediately. Dry-run unless confirm_run is true.",
      inputSchema: {
        type: "object",
        properties: {
          label: {
            type: "string",
            description: "LaunchAgent label under the dev.rudi namespace.",
          },
          confirm_run: {
            type: "boolean",
            description: "Must be true to run the LaunchAgent now.",
          },
        },
        required: ["label"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const toolArgs = args as ToolArgs;

  try {
    if (name === "macos_status") return asText(await getStatus());
    if (name === "macos_check_accessibility") return asText(await checkAccessibility());
    if (name === "macos_get_frontmost_app") return asText(await getFrontmostApp());
    if (name === "macos_list_windows") {
      return asText(await listWindows(parseListWindowsArgs(toolArgs)));
    }
    if (name === "macos_open_url") return asText(await openUrl(parseOpenUrlArgs(toolArgs)));
    if (name === "macos_open_app") return asText(await openApp(parseAppArgs(toolArgs)));
    if (name === "macos_focus_app") return asText(await focusApp(parseAppArgs(toolArgs)));
    if (name === "macos_show_notification") {
      return asText(await showNotification(parseNotificationArgs(toolArgs)));
    }
    if (name === "macos_list_shortcuts") return asText(await listShortcuts());
    if (name === "macos_run_shortcut") {
      return asText(await runShortcut(parseShortcutArgs(toolArgs)));
    }
    if (name === "macos_create_reminder") {
      return asText(await createReminder(parseReminderArgs(toolArgs)));
    }
    if (name === "macos_get_selected_finder_items") {
      return asText(await getSelectedFinderItems());
    }
    if (name === "macos_reveal_in_finder") {
      return asText(await revealInFinder(parsePathArgs(toolArgs)));
    }
    if (name === "macos_install_launch_agent") {
      return asText(await installLaunchAgent(parseInstallLaunchAgentArgs(toolArgs)));
    }
    if (name === "macos_list_launch_agents") {
      return asText(await listLaunchAgents());
    }
    if (name === "macos_remove_launch_agent") {
      return asText(await removeLaunchAgent(parseLaunchAgentLabelArgs(toolArgs)));
    }
    if (name === "macos_run_launch_agent_now") {
      return asText(await runLaunchAgentNow(parseLaunchAgentLabelArgs(toolArgs)));
    }

    return asText({ kind: "unknown_tool", message: `Unknown tool: ${name}` }, true);
  } catch (error: unknown) {
    return asError(error);
  }
});

const transport = new StdioServerTransport();
server.connect(transport).catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
