# scienceinfra-home

Homepage for **ScienceInfra** — open analysis libraries that AI agents look up
and call: omicverse, matverse, socialverse, physverse and astroverse.

## Layout

| Path | What |
|---|---|
| `src/index.template.html` | Page markup and styles |
| `src/visuals.js` | Black hole background (WebGL) and the live card simulations |
| `src/embryo_points.b64` | 2,600 sampled cell positions for the "One substrate" morph |
| `brand/logo/wordmark.svg` | PrimorDecode wordmark, inlined by the build |
| `render/` | Scripts that render the card videos (numpy frames, then ffmpeg) |
| `public/` | Build output plus `media/` (the rendered videos); this is what gets served |

## Build and preview

```bash
python3 build.py                                   # writes public/index.html, /benchmark/, /news/
python3 -m http.server 8791 --directory public     # then open http://localhost:8791
```

Open it through a local server rather than `file://`, or the videos will not load.

## Deploy

A static-asset-only Cloudflare Worker named `scienceinfra-home` (`wrangler.jsonc`), serving
`scienceinfra.org` and `www.scienceinfra.org`. The Worker is connected to this repository:
every push to `main` runs `python3 build.py` and then `npx wrangler deploy`.

To deploy by hand:

```bash
python3 build.py && npx wrangler deploy
```

## Editing notes

- physverse and astroverse are private; their cards say "Private preview" and
  do not link to GitHub. Add links when the repos go public.
- omicverse and socialverse still link to the `omicverse/` GitHub org.
