# Vendored libraries (optional)

`index.html` loads three.js from `web/vendor/` when the files are there and
falls back to the jsDelivr CDN when they are not. A kiosk with no internet —
or on a network that blocks CDNs — needs the local copies; a laptop on wifi
does not. The files themselves are gitignored, so populate them per machine:

```bash
# from the repo root, needs npm (the registry, not a CDN)
npm pack three@0.128.0
tar xzf three-0.128.0.tgz \
  package/build/three.min.js \
  package/examples/js/controls/OrbitControls.js \
  package/LICENSE
mv package/build/three.min.js package/examples/js/controls/OrbitControls.js \
   package/LICENSE web/vendor/
rm -rf package three-0.128.0.tgz
```

Or straight from the CDN if it is reachable:

```bash
curl -o web/vendor/three.min.js \
  https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js
curl -o web/vendor/OrbitControls.js \
  https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js
```

Expected files:

| File | What it is |
|------|------------|
| `three.min.js` | three.js r128, minified UMD build (MIT) |
| `OrbitControls.js` | the r128 `examples/js` OrbitControls, which expects the `THREE` global (MIT) |
| `LICENSE` | three.js MIT license text |

Pin r128: `OrbitControls.js` from `examples/js` was dropped in later releases
in favour of the ES-module build, and the page loads it as a classic script.

The Inter webfont comes from Google Fonts through `styles/nocturne.css`. With
no internet the page falls back to `system-ui`, which is a small typographic
change and nothing more — the layout is unaffected.
