# scienceinfra-home

Homepage for **ScienceInfra** — open analysis libraries that AI agents look up
and call: omicverse, matverse, socialverse, physverse and astroverse.

The site is one self-contained page, `public/index.html` (no build step, no
dependencies besides Google Fonts).

## Preview

```bash
open public/index.html
# or
npx wrangler dev
```

## Deploy

A static-asset-only Cloudflare Worker named `scienceinfra-home`, configured in
`wrangler.jsonc`, the same setup as the omicverse.org homepage.

```bash
npx wrangler deploy
```

Then attach the custom domain `scienceinfra.org` (and `www`) to the Worker in
the Cloudflare dashboard (Workers → scienceinfra-home → Settings → Domains &
Routes). With Workers Builds connected to this repo, every push to `main`
deploys automatically.

## Editing notes

- physverse and astroverse are private; their cards say "Private preview" and
  do not link to GitHub. Add links when the repos go public.
- omicverse and socialverse still link to the `omicverse/` GitHub org.

## Benchmark page

`public/benchmark/` is a full page (`src/benchmark.template.html` +
`src/benchmark.css` + `src/benchmark.js`, built by `build.py` like the rest
of the site), not a placeholder. It is plain HTML/CSS/vanilla JS — no
frameworks, no build deps — and fetches its numbers at runtime from
`public/benchmark/data/*.json`.

That data is generated (and safely re-generated) by the TBS harness, not by
this repo:

```bash
cd ../../omicos-terminal-bench-science   # sibling repo under omicos_dev/
python3 scripts/export_site_bench.py     # writes ../web/scienceinfra-home/public/benchmark/data/*.json
```

`--no-fetch` skips the live HTTP fetch of the official terminal-bench-science.ai
leaderboard and reuses a hand-transcribed snapshot (for offline runs). Re-run
`build.py` here afterwards is optional — it only touches `index.html`, never
the `data/` directory.
