# Vendored skills

Third-party skills copied into this repo so every session (local or cloud) gets the same pinned
version without a plugin install. Each one was read and checked before it was added: no hidden
instructions, no hooks, no scripts that phone home. The one exception is Shopify's own toolkit
skill, whose telemetry is switched off (details below).

| Skill folder | Source | Commit | License | Changes made here |
| --- | --- | --- | --- | --- |
| `shopify/` | [Shopify/Shopify-AI-Toolkit](https://github.com/Shopify/shopify-ai-toolkit) `skills/shopify` | `3e8a074` (2026-09-25) | MIT (`shopify/LICENSE`) | Telemetry off: removed the `hooks:` frontmatter block and `scripts/track-telemetry.*`, removed the prompt-capture flags plus the `log_skill_use` / `log_feedback` steps from `SKILL.md`, added a project note at the top. Added `package-lock.json` so the validator's dependencies install at pinned versions. |
| `shopify-liquid-themes/` | [Shopify/liquid-skills](https://github.com/Shopify/liquid-skills) `plugins/liquid-skills/skills` | `ae3e4cc` (2026-03-18) | MIT (declared in the plugin manifest) | None |
| `liquid-theme-standards/` | same | same | MIT | None |
| `liquid-theme-a11y/` | same | same | MIT | None |
| `review-ai-shopify-liquid/` | [baslefeber/shopify-skills](https://github.com/baslefeber/shopify-skills) | `b202d90` (2026-06-24) | MIT (`LICENSE-baslefeber-shopify-skills`) | Removed the promotional footer line |
| `shopify-seo-structured-data/` | same | same | MIT | Removed the promotional footer line |
| `shopify-performance-audit/` | same | same | MIT | Removed the promotional footer line |
| `shopify-cro-audit/` | same | same | MIT | Removed the promotional footer line |
| `shopify-accessibility-audit/` | same | same | MIT | Removed the promotional footer line |
| `shopify-metafields-architect/` | same | same | MIT | Removed the promotional footer line |

Deliberately **not** vendored from `baslefeber/shopify-skills`: `shopify-section-builder`, which
scaffolds Horizon-style sections (this theme is built from scratch), and
`shopify-theme-best-practices`, which overlaps with Shopify's official `liquid-theme-standards`.
Some vendored skills still mention those two by name. Use `shopify-liquid-themes` and
`liquid-theme-standards` in their place, together with our own `sportwear-theme` skill.

Wherever a vendored skill says "Shopify Dev MCP `validate_theme`", use the bundled validator instead:
`node .claude/skills/shopify/scripts/validate.mjs --api liquid ...` (see `sportwear-theme`).

## Our own skills (written for this project, not vendored)

- `sportwear-theme/`: architecture, design tokens, RTL, i18n, performance and QA rules for the theme.
- `sportwear-catalog/`: the product data model and the links → draft-products pipeline.

## Telemetry (Shopify AI Toolkit)

Out of the box, the toolkit's scripts report search queries, validated code and the user's prompt to
`shopify.dev/mcp/usage`. For this project that is switched off in three ways:

1. `.claude/settings.json` sets `OPT_OUT_INSTRUMENTATION=true` and `DO_NOT_TRACK=1` for every tool call.
2. `.claude/hooks/session-start.sh` creates `~/.config/shopify-ai-toolkit/opt-out`.
3. The vendored `SKILL.md` never passes a prompt, session id or model name to the scripts.

## Updating

Re-clone the source at a newer commit, repeat the changes listed in the table, update the commit
column, and review the diff before committing. For `shopify/`, delete its `package-lock.json` and run
`npm install --include=dev --prefix .claude/skills/shopify` to regenerate it. Do not pull an update
without reading it first.
