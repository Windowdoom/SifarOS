#!/usr/bin/env python3
"""Assemble the game.

  python3 build.py            dist/index.html (web / artifact build)
  python3 build.py --offline  also dist/the-long-tomorrow-offline.html, one file
                              with every model, texture and sky embedded

The web build inlines the engine (three.js r170 + cannon-es, bundled by
esbuild from src/vendor.js) and loads models, textures and skies from
assets/ next to the page. dist/assets is a link to ../assets so the dist
folder can be served as-is:  python3 -m http.server -d dist
Run `npm install` once first so esbuild and the libraries are available.
"""
import base64, json, mimetypes, os, pathlib, subprocess, sys

root = pathlib.Path(__file__).parent
src = root / 'src'
dist = root / 'dist'
assets = root / 'assets'
order = ['core.js', 'render.js', 'assets.js', 'data.js', 'polity_data.js', 'cosmos.js', 'story.js', 'gen.js', 'chars.js',
         'physics.js', 'weather.js', 'polity.js', 'ui.js', 'surface.js', 'space.js', 'online.js', 'main.js']
order = [f for f in order if (src / f).exists()]

dist.mkdir(exist_ok=True)
vendor = dist / '.vendor.js'
subprocess.run(['npx', 'esbuild', str(src / 'vendor.js'), '--bundle', '--minify', '--format=iife',
                '--legal-comments=none', '--log-level=warning', f'--outfile={vendor}'], check=True, cwd=root)
engine = vendor.read_text().replace('</script', '<\\/script')
vendor.unlink()

js = '\n'.join((src / f).read_text() for f in order).replace('</script', '<\\/script')
css = (src / 'style.css').read_text()
shell = (src / 'shell.html').read_text().replace('/*@@CSS@@*/', css).replace('/*@@JS@@*/', js)
header = ('/* The Long Tomorrow engine bundle: three.js r170 (MIT, three.js authors) and '
          'cannon-es 0.20 (MIT, pmndrs). Full credits are in the game. */\n')
web = shell.replace('<!--@@THREE@@-->', '<script>' + header + engine + '</script>')
(dist / 'index.html').write_text(web)

link = dist / 'assets'
if not link.exists():
    os.symlink('../assets', link)

if '--offline' in sys.argv:
    embedded = {}
    for f in sorted(assets.rglob('*')):
        if f.is_file() and f.name != 'CREDITS.json':
            mime = mimetypes.guess_type(f.name)[0] or {'.glb': 'model/gltf-binary', '.hdr': 'image/vnd.radiance'}.get(f.suffix, 'application/octet-stream')
            embedded[f.relative_to(assets).as_posix()] = f'data:{mime};base64,' + base64.b64encode(f.read_bytes()).decode()
    credits = json.loads((assets / 'CREDITS.json').read_text())
    pre = ('<script>window.__ASSETS__=' + json.dumps(embedded) + ';window.__CREDITS__=' + json.dumps(credits) + ';</script>')
    doc = ('<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body>'
           + pre + web + '</body></html>')
    (dist / 'the-long-tomorrow-offline.html').write_text(doc)
    print('offline build', round(len(doc) / 1e6, 1), 'MB')

lines = sum(len((src / f).read_text().splitlines()) for f in order)
print('built', lines, 'lines of game JS;', 'engine', round(len(engine) / 1e3), 'KB;', 'page', round(len(web) / 1e6, 2), 'MB')
