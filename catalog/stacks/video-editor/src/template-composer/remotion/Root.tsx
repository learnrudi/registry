import { Composition } from "remotion";
import type { ComponentType } from "react";

import { StatCardShort, type StatCardShortProps } from "./compositions/StatCardShort.js";
import { PlaybookStory, type PlaybookStoryProps } from "./compositions/PlaybookStory.js";
import { QuoteReel, type QuoteReelProps } from "./compositions/QuoteReel.js";
import {
  ProductDemoSequence,
  type ProductDemoSequenceProps,
} from "./compositions/ProductDemoSequence.js";
import { BeforeAfterDemo, type BeforeAfterDemoProps } from "./compositions/BeforeAfterDemo.js";
import { normalizeDurationSeconds, normalizeVideoFormat, VIDEO_FORMATS } from "./videoFormats.js";

const defaultProps: StatCardShortProps = {
  format: "story",
  style: "editorial",
  durationSeconds: 6,
  audioSrc: null,
  data: {
    eyebrow: "Labor market",
    headline: "Teams are rewriting workflows",
    stat: "77%",
    caption: "AI adoption is changing how operating models are built.",
    source: "RUDI sample",
    accent_color: "#f5b84b",
  },
};

const playbookDefaultProps: PlaybookStoryProps = {
  format: "story",
  style: "field-guide",
  durationSeconds: 30,
  audioSrc: null,
  data: {
    title: "Three moves for a better AI operating model",
    subtitle: "A compact playbook for teams moving from experiments to durable workflows.",
    sections: [
      {
        eyebrow: "Move 1",
        headline: "Map the workflow before choosing tools",
        body: "The system gets easier to improve when handoffs, decisions, and failure points are visible.",
        stat: "1",
      },
      {
        eyebrow: "Move 2",
        headline: "Keep human review where judgment matters",
        body: "Automation should reduce repetitive work without hiding consequential decisions from accountable people.",
        stat: "2",
      },
      {
        eyebrow: "Move 3",
        headline: "Measure the operating outcome",
        body: "Track cycle time, quality, rework, and customer impact instead of model usage alone.",
        stat: "3",
      },
    ],
    cta: "Build the workflow, then automate it.",
    accent_color: "#4cc9f0",
  },
};

const quoteDefaultProps: QuoteReelProps = {
  format: "story",
  style: "editorial",
  durationSeconds: 15,
  audioSrc: null,
  data: {
    quote: "The workflow is the product.",
    speaker: "RUDI",
    context: "Operating systems for AI teams",
    kicker: "Quote Reel",
    accent_color: "#f5b84b",
  },
};

const productDemoDefaultProps: ProductDemoSequenceProps = {
  format: "landscape",
  style: "launch",
  durationSeconds: 30,
  audioSrc: null,
  assetSrcs: {},
  data: {
    product: "RUDI",
    promise: "Turn stack setup into one repeatable workflow.",
    steps: [
      {
        label: "Install",
        headline: "Choose the stack",
        detail: "Pick the capability and let RUDI resolve runtime, binaries, and setup.",
      },
      {
        label: "Configure",
        headline: "Validate the boundary",
        detail: "Secrets, tools, schemas, and failure states stay explicit.",
      },
      {
        label: "Run",
        headline: "Use it from your agent",
        detail: "The MCP tool becomes available without hand-wiring every client.",
      },
    ],
    outro: "Reliable tools beat fragile demos.",
    accent_color: "#ff7a90",
  },
};

const beforeAfterDefaultProps: BeforeAfterDemoProps = {
  format: "landscape",
  style: "studio",
  durationSeconds: 15,
  audioSrc: null,
  assetSrcs: {},
  data: {
    title: "From scattered setup to a repeatable render workflow.",
    subtitle: "A clean product proof format for showing what changed.",
    before_label: "Before",
    after_label: "After",
    proof: "3x faster",
    caption: "Validated assets, schema, render job, and metadata in one flow.",
    cta: "Show the change clearly.",
    accent_color: "#0071e3",
  },
};

function compositionMetadata(props: Record<string, unknown>, fallbackDurationSeconds: number) {
  const format = normalizeVideoFormat(props.format);
  const durationSeconds = normalizeDurationSeconds(props.durationSeconds, fallbackDurationSeconds);
  const dimensions = VIDEO_FORMATS[format];
  return {
    width: dimensions.width,
    height: dimensions.height,
    fps: 30,
    durationInFrames: Math.round(durationSeconds * 30),
    props: {
      ...props,
      format,
      durationSeconds,
    },
  };
}

export const RemotionRoot = () => {
  const StatCardShortComposition = StatCardShort as unknown as ComponentType<Record<string, unknown>>;
  const PlaybookStoryComposition = PlaybookStory as unknown as ComponentType<Record<string, unknown>>;
  const QuoteReelComposition = QuoteReel as unknown as ComponentType<Record<string, unknown>>;
  const ProductDemoComposition = ProductDemoSequence as unknown as ComponentType<Record<string, unknown>>;
  const BeforeAfterComposition = BeforeAfterDemo as unknown as ComponentType<Record<string, unknown>>;

  return (
    <>
      <Composition
        id="StatCardShort"
        component={StatCardShortComposition}
        calculateMetadata={({ props }) => compositionMetadata(props, 6)}
        defaultProps={defaultProps}
      />
      <Composition
        id="PlaybookStory"
        component={PlaybookStoryComposition}
        calculateMetadata={({ props }) => compositionMetadata(props, 30)}
        defaultProps={playbookDefaultProps}
      />
      <Composition
        id="QuoteReel"
        component={QuoteReelComposition}
        calculateMetadata={({ props }) => compositionMetadata(props, 15)}
        defaultProps={quoteDefaultProps}
      />
      <Composition
        id="ProductDemoSequence"
        component={ProductDemoComposition}
        calculateMetadata={({ props }) => compositionMetadata(props, 30)}
        defaultProps={productDemoDefaultProps}
      />
      <Composition
        id="BeforeAfterDemo"
        component={BeforeAfterComposition}
        calculateMetadata={({ props }) => compositionMetadata(props, 15)}
        defaultProps={beforeAfterDefaultProps}
      />
    </>
  );
};
