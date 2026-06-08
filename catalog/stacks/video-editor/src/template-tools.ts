import { STYLE_PRESETS, VIDEO_FORMATS } from "./template-composer/constants.js";
import { errorResult, safeExceptionDetail, ToolError, type ToolResult } from "./template-composer/errors.js";
import { getVideoRenderJob, listVideoTemplates, renderVideoTemplate } from "./template-composer/tools.js";
import { VIDEO_TEMPLATES } from "./template-composer/template_registry.js";

type ToolArgs = Record<string, unknown>;
type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

function jsonText(result: ToolResult): string {
  return JSON.stringify(result, null, 2);
}

function renderRequestSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      template_id: {
        type: "string",
        enum: VIDEO_TEMPLATES.map((template) => template.template_id),
        description: "Template id returned by video_list_templates.",
      },
      format: {
        type: "string",
        enum: Object.keys(VIDEO_FORMATS),
        description: "Output format. Defaults to story.",
      },
      style: {
        type: "string",
        enum: Object.keys(STYLE_PRESETS),
        description: "Visual style preset. Defaults from the selected template.",
      },
      duration_seconds: {
        type: "integer",
        description: "Optional duration override. Must be one of the selected template's allowed durations.",
      },
      data: {
        type: "object",
        additionalProperties: false,
        description: "Template data object. Must match the selected template data schema.",
      },
      assets: {
        type: "object",
        additionalProperties: { type: "string" },
        description: "Local image file paths keyed by logical asset name.",
      },
      audio_path: {
        type: "string",
        description: "Optional local WAV, MP3, AAC, or M4A audio bed.",
      },
      out_path: {
        type: "string",
        description: "Optional output path under ~/.rudi/outputs ending in .mp4. Existing files are rejected.",
      },
    },
    required: ["template_id", "data"],
  };
}

export const templateVideoTools: ToolDefinition[] = [
  {
    name: "video_list_templates",
    description: "Return static Remotion video template metadata. Performs no rendering.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: {
          type: "string",
          enum: ["draft", "beta", "current", "deprecated"],
          description: "Optional template status filter.",
        },
      },
    },
  },
  {
    name: "video_render_template",
    description: "Validate a Remotion template render request, create a local render job, and render an MP4 under ~/.rudi/outputs.",
    inputSchema: renderRequestSchema(),
  },
  {
    name: "video_get_render_job",
    description: "Inspect a local template render job and return queued, rendering, completed, or failed state.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        job_id: {
          type: "string",
          minLength: 1,
          description: "Render job id returned by video_render_template.",
        },
      },
      required: ["job_id"],
    },
  },
];

export function isTemplateVideoTool(name: string): boolean {
  return templateVideoTools.some((tool) => tool.name === name);
}

export async function runTemplateVideoTool(name: string, args: ToolArgs = {}): Promise<string> {
  try {
    if (name === "video_list_templates") {
      return jsonText(listVideoTemplates(args));
    }
    if (name === "video_render_template") {
      const result = await renderVideoTemplate(args);
      return jsonText(result);
    }
    if (name === "video_get_render_job") {
      return jsonText(getVideoRenderJob(args));
    }
    return jsonText(errorResult("unknown_tool", `Unknown template video tool: ${name}`));
  } catch (error) {
    if (error instanceof ToolError) {
      return jsonText(error.toResult());
    }
    return jsonText(
      errorResult("internal_error", "Video template tool failed unexpectedly.", {
        detail: safeExceptionDetail(error),
      })
    );
  }
}
