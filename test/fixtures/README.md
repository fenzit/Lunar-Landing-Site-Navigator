# Saved scientific inputs for site comparison

`odysseus-terrain.json` and `athena-terrain.json` contain real DEM horizons produced by LunarPilot's terrain-v3 calculation at 2 m equipment height. Source URLs, retrieval timestamps, site elevation and sampling quality are retained in each file. Walking grids and per-ray distances are omitted because the comparison uses the horizon profile. Tests combine these horizons with the real saved JPL responses in `data/demo/`, then calculate windows using the current model.

`arbitrary-analysis.json` is the real saved analysis at 53.849543° N, 69.769571° W, 2026-11-14 00:00 to 2026-12-02 01:53 UTC, step 30 min and equipment height 2 m. It retains JPL and DEM provenance. Tests recompute its windows from the saved directions and horizon, rather than trusting saved window boundaries.
