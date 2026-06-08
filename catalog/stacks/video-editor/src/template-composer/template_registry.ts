import { STYLE_PRESETS, VIDEO_FORMATS, type VideoFormat, type VideoStyle } from "./constants.js";
import { ToolError } from "./errors.js";

export type TemplateStatus = "draft" | "beta" | "current" | "deprecated";

export interface JsonStringSchema {
  type: "string";
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  description?: string;
}

export interface JsonArraySchema {
  type: "array";
  minItems?: number;
  maxItems?: number;
  description?: string;
  items: JsonObjectSchema;
}

export type JsonValueSchema = JsonStringSchema | JsonArraySchema | JsonObjectSchema;

export interface JsonObjectSchema {
  type: "object";
  additionalProperties: boolean;
  required?: string[];
  properties: Record<string, JsonValueSchema>;
  description?: string;
}

export interface AssetSchema {
  type: "object";
  additionalProperties: boolean;
  properties: Record<string, JsonStringSchema>;
}

export interface VideoTemplate {
  template_id: string;
  label: string;
  version: string;
  composition_id: string;
  status: TemplateStatus;
  formats: VideoFormat[];
  fps: number;
  duration_seconds: number;
  allowed_duration_seconds: number[];
  default_style: VideoStyle;
  supported_styles: VideoStyle[];
  data_schema: JsonObjectSchema;
  asset_schema: AssetSchema;
  notes: string;
}

const ALL_STYLES = Object.keys(STYLE_PRESETS) as VideoStyle[];

const statCardDataSchema: JsonObjectSchema = {
  type: "object",
  additionalProperties: false,
  required: ["eyebrow", "headline", "stat", "caption"],
  properties: {
    eyebrow: {
      type: "string",
      minLength: 1,
      maxLength: 80,
      description: "Short category or context label.",
    },
    headline: {
      type: "string",
      minLength: 1,
      maxLength: 120,
      description: "Primary claim shown above the stat.",
    },
    stat: {
      type: "string",
      minLength: 1,
      maxLength: 32,
      description: "Large statistic or short key phrase.",
    },
    caption: {
      type: "string",
      minLength: 1,
      maxLength: 180,
      description: "One-sentence explanation shown below the stat.",
    },
    source: {
      type: "string",
      minLength: 1,
      maxLength: 120,
      description: "Optional source or attribution label.",
    },
    accent_color: {
      type: "string",
      pattern: "^#[0-9a-fA-F]{6}$",
      description: "Optional hex accent color.",
    },
  },
};

const playbookStoryDataSchema: JsonObjectSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "sections"],
  properties: {
    title: {
      type: "string",
      minLength: 1,
      maxLength: 110,
      description: "Opening title for the long-form story.",
    },
    subtitle: {
      type: "string",
      minLength: 1,
      maxLength: 160,
      description: "Optional opening subtitle.",
    },
    sections: {
      type: "array",
      minItems: 2,
      maxItems: 6,
      description: "Ordered story sections.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["eyebrow", "headline", "body"],
        properties: {
          eyebrow: {
            type: "string",
            minLength: 1,
            maxLength: 70,
            description: "Short section label.",
          },
          headline: {
            type: "string",
            minLength: 1,
            maxLength: 120,
            description: "Section headline.",
          },
          body: {
            type: "string",
            minLength: 1,
            maxLength: 260,
            description: "Section body copy.",
          },
          stat: {
            type: "string",
            minLength: 1,
            maxLength: 32,
            description: "Optional featured stat for this section.",
          },
        },
      },
    },
    cta: {
      type: "string",
      minLength: 1,
      maxLength: 120,
      description: "Optional closing call to action.",
    },
    accent_color: {
      type: "string",
      pattern: "^#[0-9a-fA-F]{6}$",
      description: "Optional hex accent color.",
    },
  },
};

const quoteReelDataSchema: JsonObjectSchema = {
  type: "object",
  additionalProperties: false,
  required: ["quote", "speaker"],
  properties: {
    quote: {
      type: "string",
      minLength: 1,
      maxLength: 220,
      description: "Quote or punchline to feature.",
    },
    speaker: {
      type: "string",
      minLength: 1,
      maxLength: 90,
      description: "Speaker, author, or source name.",
    },
    context: {
      type: "string",
      minLength: 1,
      maxLength: 140,
      description: "Optional context line shown with the speaker.",
    },
    kicker: {
      type: "string",
      minLength: 1,
      maxLength: 80,
      description: "Optional short label shown before the quote.",
    },
    accent_color: {
      type: "string",
      pattern: "^#[0-9a-fA-F]{6}$",
      description: "Optional hex accent color.",
    },
  },
};

const productDemoDataSchema: JsonObjectSchema = {
  type: "object",
  additionalProperties: false,
  required: ["product", "promise", "steps"],
  properties: {
    product: {
      type: "string",
      minLength: 1,
      maxLength: 70,
      description: "Product or feature name.",
    },
    promise: {
      type: "string",
      minLength: 1,
      maxLength: 150,
      description: "Main product promise.",
    },
    steps: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      description: "Demo sequence steps.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "headline"],
        properties: {
          label: {
            type: "string",
            minLength: 1,
            maxLength: 40,
            description: "Short step label.",
          },
          headline: {
            type: "string",
            minLength: 1,
            maxLength: 110,
            description: "Step headline.",
          },
          detail: {
            type: "string",
            minLength: 1,
            maxLength: 180,
            description: "Optional supporting detail.",
          },
          asset_key: {
            type: "string",
            minLength: 1,
            maxLength: 40,
            description: "Optional asset key for this step. Defaults to screenshot_1, screenshot_2, etc.",
          },
        },
      },
    },
    outro: {
      type: "string",
      minLength: 1,
      maxLength: 120,
      description: "Optional closing line.",
    },
    accent_color: {
      type: "string",
      pattern: "^#[0-9a-fA-F]{6}$",
      description: "Optional hex accent color.",
    },
  },
};

const beforeAfterDataSchema: JsonObjectSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "before_label", "after_label"],
  properties: {
    title: {
      type: "string",
      minLength: 1,
      maxLength: 120,
      description: "Main before/after claim or product transformation headline.",
    },
    subtitle: {
      type: "string",
      minLength: 1,
      maxLength: 180,
      description: "Optional supporting context.",
    },
    before_label: {
      type: "string",
      minLength: 1,
      maxLength: 60,
      description: "Label for the before image or state.",
    },
    after_label: {
      type: "string",
      minLength: 1,
      maxLength: 60,
      description: "Label for the after image or state.",
    },
    proof: {
      type: "string",
      minLength: 1,
      maxLength: 80,
      description: "Optional featured proof point or stat.",
    },
    caption: {
      type: "string",
      minLength: 1,
      maxLength: 180,
      description: "Optional caption shown near the proof point.",
    },
    cta: {
      type: "string",
      minLength: 1,
      maxLength: 100,
      description: "Optional closing line.",
    },
    accent_color: {
      type: "string",
      pattern: "^#[0-9a-fA-F]{6}$",
      description: "Optional hex accent color.",
    },
  },
};

const emptyAssetSchema: AssetSchema = {
  type: "object",
  additionalProperties: false,
  properties: {},
};

const productDemoAssetSchema: AssetSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    logo: {
      type: "string",
      description: "Optional local PNG, JPEG, or WebP logo displayed on intro/outro scenes.",
    },
    hero_image: {
      type: "string",
      description: "Optional local PNG, JPEG, or WebP image displayed on the intro scene.",
    },
    screenshot_1: {
      type: "string",
      description: "Optional local PNG, JPEG, or WebP screenshot for demo step 1.",
    },
    screenshot_2: {
      type: "string",
      description: "Optional local PNG, JPEG, or WebP screenshot for demo step 2.",
    },
    screenshot_3: {
      type: "string",
      description: "Optional local PNG, JPEG, or WebP screenshot for demo step 3.",
    },
    screenshot_4: {
      type: "string",
      description: "Optional local PNG, JPEG, or WebP screenshot for demo step 4.",
    },
    screenshot_5: {
      type: "string",
      description: "Optional local PNG, JPEG, or WebP screenshot for demo step 5.",
    },
  },
};

const beforeAfterAssetSchema: AssetSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    before_image: {
      type: "string",
      description: "Required local PNG, JPEG, or WebP image for the before state.",
    },
    after_image: {
      type: "string",
      description: "Required local PNG, JPEG, or WebP image for the after state.",
    },
    logo: {
      type: "string",
      description: "Optional local PNG, JPEG, or WebP logo.",
    },
  },
};

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  {
    template_id: "stat-card-short",
    label: "Stat Card Short",
    version: "0.1.0",
    composition_id: "StatCardShort",
    status: "beta",
    formats: ["story", "landscape", "square", "portrait"],
    fps: 30,
    duration_seconds: 6,
    allowed_duration_seconds: [6, 10, 15],
    default_style: "editorial",
    supported_styles: ALL_STYLES,
    data_schema: statCardDataSchema,
    asset_schema: emptyAssetSchema,
    notes: "Animated stat reveal for short-form social video.",
  },
  {
    template_id: "playbook-story",
    label: "Playbook Story",
    version: "0.1.0",
    composition_id: "PlaybookStory",
    status: "beta",
    formats: ["story", "landscape", "square", "portrait"],
    fps: 30,
    duration_seconds: 30,
    allowed_duration_seconds: [30, 45, 60, 90],
    default_style: "field-guide",
    supported_styles: ALL_STYLES,
    data_schema: playbookStoryDataSchema,
    asset_schema: emptyAssetSchema,
    notes: "Multi-scene explainer or playbook video assembled from structured sections.",
  },
  {
    template_id: "quote-reel",
    label: "Quote Reel",
    version: "0.1.0",
    composition_id: "QuoteReel",
    status: "beta",
    formats: ["story", "landscape", "square", "portrait"],
    fps: 30,
    duration_seconds: 15,
    allowed_duration_seconds: [10, 15, 30],
    default_style: "editorial",
    supported_styles: ALL_STYLES,
    data_schema: quoteReelDataSchema,
    asset_schema: emptyAssetSchema,
    notes: "Paced quote-forward social reel with speaker attribution.",
  },
  {
    template_id: "product-demo-sequence",
    label: "Product Demo Sequence",
    version: "0.1.0",
    composition_id: "ProductDemoSequence",
    status: "beta",
    formats: ["story", "landscape", "square", "portrait"],
    fps: 30,
    duration_seconds: 30,
    allowed_duration_seconds: [30, 45, 60],
    default_style: "launch",
    supported_styles: ALL_STYLES,
    data_schema: productDemoDataSchema,
    asset_schema: productDemoAssetSchema,
    notes: "Structured product walkthrough with steps, feature callouts, and a closing promise.",
  },
  {
    template_id: "before-after-demo",
    label: "Before After Demo",
    version: "0.1.0",
    composition_id: "BeforeAfterDemo",
    status: "beta",
    formats: ["story", "landscape", "square", "portrait"],
    fps: 30,
    duration_seconds: 15,
    allowed_duration_seconds: [10, 15, 30],
    default_style: "studio",
    supported_styles: ALL_STYLES,
    data_schema: beforeAfterDataSchema,
    asset_schema: beforeAfterAssetSchema,
    notes: "Two-state product proof video using before/after images, a proof point, and a closing claim.",
  },
];

export function listTemplates(status?: TemplateStatus): VideoTemplate[] {
  if (!status) {
    return VIDEO_TEMPLATES;
  }
  return VIDEO_TEMPLATES.filter((template) => template.status === status);
}

export function getTemplate(templateId: string): VideoTemplate {
  const template = VIDEO_TEMPLATES.find((candidate) => candidate.template_id === templateId);
  if (!template) {
    throw new ToolError("validation", `Unknown template_id: ${templateId}`, {
      field: "template_id",
      allowed: VIDEO_TEMPLATES.map((entry) => entry.template_id),
    });
  }
  return template;
}

export function templateSupportsFormat(template: VideoTemplate, format: string): format is VideoFormat {
  return (template.formats as string[]).includes(format) && format in VIDEO_FORMATS;
}
