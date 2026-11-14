# Polar scenario package

This package covers **2026-11-14 00:00 to 2027-11-14 00:00 UTC** at a 30-minute base step and 2 m equipment height. Sites: Odysseus (-80.1276°, 1.4367° E), Athena (-84.79059°, 29.19567° E), and two additional selected DEM points: north (90° N, 25° E) and south (89.5° S, 0° E). The additional points are sample locations, not mission landing claims. Longitude fixes the local azimuth orientation at the exact pole.

`manifest.json` lists the coordinates, coverage, settings, current `centers-dem-v3` model, scientific provenance and SHA-256 for each file. Sources retain their original URLs and retrieval timestamps.

- `inputs/*.json.gz`: frozen **real** JPL Horizons responses at DEM ground elevation plus 2 m, real DEM horizon and measured surface/landscape grids. These are inputs to the reproducible build, not a disposable cache.
- `<site>/<date>.json.gz`: twelve independently loadable monthly analyses for each site. Shared endpoints allow exact selections across monthly boundaries.
- `<site>/surface.json.gz`, `landscape.json.gz`: measured grids required by the prepared surface demonstration.
- `sky/*.json.gz`: monthly Moon-fixed Sun/Earth directions, from real JPL responses in `inputs/sky.json.gz`.

Rebuild offline with `npm run presets:build`. Refresh scientific inputs with `npm run presets:download` only when intentionally updating the frozen package: existing input files are reused. To refresh a site, move its named input file to a backup first, then download and rebuild. The build never substitutes nearby coordinates or synthesizes ephemerides. `node --test test/preset-bundle.test.mjs` verifies file hashes and reproduces a saved interval from its original JPL and DEM inputs.

Sources: [JPL Horizons](https://ssd-api.jpl.nasa.gov/doc/horizons.html), [NASA GSFC southern LOLA DEM](https://pgda.gsfc.nasa.gov/products/90), [NASA GSFC northern LOLA DEM](https://pgda.gsfc.nasa.gov/products/98), [LOLA global tiled distribution](https://www.its.ohio.edu/foundations/lunar/docs.html). LunarPilot's overview textures are already included under `public/assets/`; Three.js is installed by `npm ci` before the offline demonstration.

The package describes geometric visibility of body centers above the DEM horizon. A period clipped at its end confirms only the included part of a window. Selecting another equipment height, a finer step or an out-of-coverage date produces an explicit error; online analysis remains separate.
