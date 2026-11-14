#!/usr/bin/env python3
"""Render public/ from src/index.template.html.

- Inlines the PrimorDecode wordmark (brand/logo/wordmark.svg) into the header
  and footer, giving each copy unique ids (two inline SVGs on one page must not
  share mask ids).
- Writes /benchmark/ and /news/ placeholder pages that share the homepage's
  header, styles and footer.

Usage: python3 build.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SVG = (ROOT / "brand/logo/wordmark.svg").read_text()
TPL = (ROOT / "src/index.template.html").read_text()


def logo(suffix: str) -> str:
    s = re.sub(r"<title>.*?</title>", "", SVG)
    for old in sorted(set(re.findall(r'id="([^"]+)"', s))):
        s = s.replace(f'id="{old}"', f'id="{old}-{suffix}"').replace(f"url(#{old})", f"url(#{old}-{suffix})")
    return s.replace("<svg ", '<svg aria-hidden="true" focusable="false" ', 1)


VIS = (ROOT / "src/visuals.js").read_text().replace("{{EMBRYO_B64}}", (ROOT / "src/embryo_points.b64").read_text().strip())
home = TPL.replace("{{LOGO_HEADER}}", logo("h")).replace("{{LOGO_FOOTER}}", logo("f")).replace("{{VISUALS_JS}}", VIS)
out = ROOT / "public"
out.mkdir(exist_ok=True)
(out / "index.html").write_text(home)

STUB_MAIN = """<main>
  <section class="hero" style="padding-bottom:160px">
    <div class="wrap">
      <span class="pill"><span class="tag">Soon</span><span class="muted">{kicker}</span></span>
      <h1>{title}</h1>
      <p class="lede">{lede}</p>
      <div class="cta"><a class="btn btn-light btn-hero" href="/">Back to home</a></div>
    </div>
  </section>
</main>"""

pages = {
    "benchmark": dict(
        title="Benchmark",
        kicker="Held-out research tasks",
        lede="Held-out research tasks across five sciences, used to test whether an agent with the verse libraries can do real analysis. Results will be published here.",
    ),
    "news": dict(
        title="News",
        kicker="Updates from ScienceInfra",
        lede="Releases and research updates from the verse family will be posted here.",
    ),
}
for slug, p in pages.items():
    html = re.sub(r"<main>.*?</main>", STUB_MAIN.format(**p), home, flags=re.S)
    html = html.replace("<title>ScienceInfra</title>", f"<title>{p['title']} · ScienceInfra</title>")
    html = html.replace('href="#verses"', 'href="/#verses"')
    # The stub has no #field/#orb canvases or card loops; drop the page script.
    html = re.sub(r"<script>.*</script>", lambda m: "<script>(()=>{const h=document.getElementById('hdr');const f=()=>h.classList.toggle('scrolled',scrollY>8);addEventListener('scroll',f,{passive:true});f()})()</script>", html, flags=re.S)
    d = out / slug
    d.mkdir(exist_ok=True)
    (d / "index.html").write_text(html)

print("built:", ", ".join(str(p.relative_to(ROOT)) for p in sorted(out.rglob("*.html"))))
