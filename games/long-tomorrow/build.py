#!/usr/bin/env python3
"""Assemble the game into single-file HTML builds.

dist/index.html                     artifact / web build, loads three.js r128 from cdnjs
dist/the-long-tomorrow-offline.html fully self-contained, three.js inlined (needs three.min.js path as argv[1])
"""
import pathlib, sys
root = pathlib.Path(__file__).parent
src = root / 'src'
order = ['core.js', 'render.js', 'data.js', 'cosmos.js', 'story.js', 'gen.js', 'ui.js', 'surface.js', 'space.js', 'online.js', 'main.js']
js = '\n'.join((src / f).read_text() for f in order).replace('</script', '<\\/script')
css = (src / 'style.css').read_text()
shell = (src / 'shell.html').read_text().replace('/*@@CSS@@*/', css).replace('/*@@JS@@*/', js)
cdn = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>'
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist' / 'index.html').write_text(shell.replace('<!--@@THREE@@-->', cdn))
if len(sys.argv) > 1:
    three = pathlib.Path(sys.argv[1]).read_text().replace('</script', '<\\/script')
    doc = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' \
          + shell.replace('<!--@@THREE@@-->', '<script>' + three + '</script>') + '</body></html>'
    (root / 'dist' / 'the-long-tomorrow-offline.html').write_text(doc)
print('built', sum(len((src / f).read_text().splitlines()) for f in order), 'lines of JS')
