# Video Template Library

This stack treats visual references like a design system input, not as runtime dependencies. A Figma, Canva, or campaign reference should become a deterministic Remotion composition with a documented schema.

## Template Pipeline

1. Capture the design direction: format, pacing, typography, motion, asset slots, and expected use case.
2. Implement a Remotion composition with fixed scene logic and responsive layout rules.
3. Expose only safe editable fields through `data_schema` and `asset_schema`.
4. Add sample requests for representative styles and aspect ratios.
5. Smoke-render at least one realistic sample before marking the template usable.

## Current Families

| Family | Template | Best For | Asset Support |
| --- | --- | --- | --- |
| Stat card | `stat-card-short` | social stats, report hooks, chart teasers | none |
| Explainer | `playbook-story` | playbooks, tutorials, longer social/Youtube cuts | none |
| Quote | `quote-reel` | founder quotes, testimonials, podcast clips | none |
| Product demo | `product-demo-sequence` | feature walkthroughs, launch demos, tool explainers | logo, hero image, screenshots |
| Product proof | `before-after-demo` | before/after comparisons, transformation stories | before image, after image, logo |

## Style Lanes

| Style | Direction | Use When |
| --- | --- | --- |
| `editorial` | Light report page, serif type, restrained rules | research, investor, narrative credibility |
| `dashboard` | Dark operational grid, HUD panels, monospace labels | SaaS, metrics, internal tools |
| `launch` | Campaign energy, diagonal bands, bold motion | product launches, announcements |
| `field-guide` | Notebook/checklist, calmer instructional pacing | tutorials, SOPs, education |
| `neon` | Scanline/glow, high contrast social hook | sharp quote reels, hype clips |
| `studio` | Minimal product-keynote surfaces, precise spacing, restrained motion | polished product proof and launch storytelling |

## Next Template Candidates

| Candidate | Description | Required Slots |
| --- | --- | --- |
| `youtube-package` | intro, chapter bumper, lower third, outro | logo, title, subtitle, speaker, CTA |
| `testimonial-proof` | customer quote plus product/result panels | quote, speaker, company, logo, result stat |
| `feature-launch-promo` | fast-cut feature announcement | product, features, screenshots, CTA |
| `tutorial-walkthrough` | longer instructional sequence | steps, screenshots, callouts, outro |

## Debt Guardrail

Do not add a template as a vague style variant. A new template should add a materially different scene structure, asset model, or use case.
