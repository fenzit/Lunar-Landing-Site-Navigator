# LunarPilot

**Will a lunar lander have enough time for its initial operations?** Choose a site and time, set the operation duration, and see how long the centers of both the Sun and Earth stay above the local horizon. LunarPilot combines JPL Horizons directions with measured terrain and displays the result on a UTC timeline, a chart, and an interactive 3D Moon.

Built for [NASA Space Apps Challenge 2026 · Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/). The interface supports English and Russian.

## Quick start

Requirements: Node.js 22+ and a WebGL2-capable browser for 3D views. Internet access is needed to install dependencies and retrieve new JPL/DEM data. Bundled polar scenarios work without a network connection or a warmed cache. No API keys are required.

```sh
npm ci
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). The server listens on the local address only. To customize the port, timeouts, or JPL contact address, copy [.env.example](.env.example) to `.env`. Defaults apply when that file is absent.

## Three-minute demo

After installing dependencies once with `npm ci`, run `npm run start:offline`. Open the app and click **Offline demo · Odysseus + Athena**. This opens both sites for **14–21 November 2026 UTC**, with **2 m** equipment height, **4 hours** of required operations, and the cursor at **15 November, 07:00 UTC**. It needs neither internet access nor `data/cache/` or saved browser history.

1. **0:00–0:40 · Open the episode.** Show the shared A/B timeline. Athena's first viable start is **15 November at 06:12 UTC**; Odysseus's is **19 November at 02:53 UTC**. The same calculation settings and model version are visible beside the results.
2. **0:40–1:55 · Compare the same moment.** In each site's card, click **Inspect at the shared UTC cursor**. The cursor stays at **15 November, 07:00 UTC**. At Odysseus, terrain blocks the Sun. At Athena, both centers are visible, with another 137 hours of shared visibility confirmed. A dated button below each card jumps to its first viable start.
3. **1:55–3:00 · Explain the result.** Open **Surface view** and show how a ridge changes the horizon toward the Sun. In the Athena calculation, the Sun was about **0.05°** above the ridge. Such a small clearance is sensitive to terrain detail.

| Site | State at the selected moment | Shared window remaining |
| --- | --- | ---: |
| Odysseus · IM-1 | Sun blocked by terrain | 0 h |
| Athena · IM-2 | Both centers above the local horizon | ≥137 h |

These are LunarPilot results from saved real JPL responses and DEM inputs under the stated conditions. **≥** means visibility is confirmed through the analysis end, **21 November at 00:00 UTC**. This period does not determine when the window closes afterward.

## Features

| Tool | What it provides |
| --- | --- |
| **Globe and UTC timeline** | Select a lunar point, explore the Sun and Earth, inspect directions at a chosen date, and toggle the SLDEM2015 slope overlay. Overview LOLA relief is exaggerated by a factor of three. |
| **Chart and windows** | Sun/Earth clearance above terrain, shared intervals, time remaining in the current window, and the next viable start. Analyze up to 30 days; the main analysis form uses a 30-minute ephemeris step. |
| **Landing-time search** | First and last viable starts in each window over a UTC range. Sort by earliest start or window duration. |
| **A/B comparison** | Any two sites entered by coordinates or picked on the globe. Shared UTC range, ephemeris step, equipment height, and operation duration; a first viable start, operation margin, and model version for each site. |
| **Presets and history** | Odysseus and Athena presets and the three latest successful calculations in browser storage. **Show on timeline** restores a saved calculation and moves the cursor to its selected window. |
| **12 months of local scenarios** | Odysseus, Athena, and two additional polar points. Real JPL/DEM inputs covering 14 November 2026–14 November 2027 UTC, loaded by site and month. One button opens the two-site defense demo without a network or cache. |
| **Surface view** | Walk over measured DEM terrain at 1:1 scale with terrain streaming. Drag to look, use **WASD** to move and **Shift** to move faster. **Face Sun** and **Face Earth** aim the camera; **Calculate here** moves the analysis point to the camera location. Camera height is 1.7 m; equipment height is separate. |
| **Local visibility map** | Nine nearby points at the selected UTC cursor time. Grid spacing is adjustable, with a 400 m default. Select a point to inspect each body's clearance above the horizon. A denser grid uses the same underlying DEM. |
| **Replay Odysseus landing** | An illustrative descent over measured terrain. The landing site and minute come from NASA's report; JPL provides light directions for **22 February 2024, 23:23 UTC**. Spacecraft motion and exhaust are illustrative. **WASD/Q/E** control the free camera. [NASA IM-1 report](https://ntrs.nasa.gov/citations/20250010290) |

### Find landing starts

Enter site coordinates and equipment height, then set UTC range boundaries to the minute and the required uninterrupted operation time in **Find suitable landing starts**. **Find starts** calculates the entire range once. Results show first/last viable starts, window duration, and the confirmed margin after operations at the first start. **First start** and **Last start** open that moment on the main chart and timeline. Sorting and changing the required duration reuse the loaded data.

For `/api/analysis` and `/api/sky`, pass either `end_utc` or `duration_hours`, never both. If the requested end falls between JPL observations, the last position is interpolated to that exact minute before windows are calculated.

### Compare two sites

In **Compare two sites**, enter A/B coordinates or use **Pick A/B on globe**. **Odysseus / Athena** fills the known sites' coordinates. **Calculate A and B** captures the common UTC range, step, equipment height, and operation duration. Supported steps are 1, 5, 10, 15, 30, and 60 minutes, with limits of 30 days and 2000 intervals. Increase the step for longer ranges.

Both bands use the same absolute UTC axis. Cards show each site's first viable start and remaining margin after operations. Clicking a start opens that calculation and places the main slider at the first viable minute of the window. A remains available while B loads or if B fails. No shared windows, windows too short for operations, and period-end clipping (`≥`) have separate states. Editing the form marks the displayed results as belonging to earlier settings. Switching EN/RU preserves loaded results.

The current terrain visibility model is `centers-dem-v3`; the flat-horizon model used by baseline tests is `centers-flat-v1`. JPL API versions appear separately in source links.

### Offline polar package

```sh
# Install dependencies once while online:
npm ci
# This launch makes no external JPL/DEM requests:
npm run start:offline
```

The [data/presets](data/presets/) package ships with the repository and occupies about 8 MB. There is no need to clear the cache: the package is separate from `data/cache/`. In **12 months · local polar scenarios**, choose a site, a UTC date inside coverage, and a period of up to 30 days. Charts, windows, and the slider use the relevant monthly files; the browser does not load the entire year. Measured surface and landscape grids are included for the prepared demo. Walking beyond included grids can require new DEM data in online mode.

| Site | Latitude / east longitude | UTC coverage | Base step / height |
| --- | --- | --- | --- |
| Odysseus | −80.1276° / 1.4367° | 14 Nov 2026–14 Nov 2027 | 30 min / 2 m |
| Athena | −84.79059° / 29.19567° | 14 Nov 2026–14 Nov 2027 | 30 min / 2 m |
| North polar sample | 90° / 25° | 14 Nov 2026–14 Nov 2027 | 30 min / 2 m |
| South polar sample | −89.5° / 0° | 14 Nov 2026–14 Nov 2027 | 30 min / 2 m |

The additional sites are selected DEM points, not claimed mission landing sites. At the exact pole, longitude defines the azimuth orientation. A 60-minute step is also available. Finer steps, different equipment heights, and out-of-coverage dates are explicitly rejected. For new conditions, restart with `npm start` and use the separate main **Calculate** action. Opening a local scenario never silently falls back to a network request.

[manifest.json](data/presets/manifest.json) records model versions, coordinates, settings, JPL/DEM URLs, retrieval times, and file SHA-256 hashes. [Original responses and DEM inputs](data/presets/README.md) are saved under `inputs/`. `npm run presets:build` rebuilds the package offline from these inputs; `npm run presets:download` retrieves missing inputs and rebuilds it. Tests reproduce a saved interval and start the application from an empty working directory with external `fetch` forbidden.

## How windows are calculated

1. **Local horizon.** From the DEM, find the maximum terrain elevation angle in **720 directions**, spaced **0.5°** apart, out to **200 km** from the site. Include lunar curvature and equipment height above the ground.
2. **Sun and Earth directions.** JPL Horizons supplies the azimuth and apparent elevation of each body's center for the same site and absolute observer altitude. [JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html)
3. **Visibility.** Subtract the horizon angle in each body's direction from its elevation. Positive clearance means visibility. Between ephemeris observations, the calculation checks crossed horizon-profile nodes to account for intervening ridges.
4. **Operation window.** Intersect both visibility intervals. At the chosen time, check whether the remaining shared window covers the required operation duration. If it does not, find the next viable whole-minute start inside the loaded period.

**Illustrative example:** the Sun's center is at +1°, and a ridge in the same direction is at +3°. Clearance is −2°, so terrain blocks the Sun. If the Sun is visible from 08:00 to 13:00 and Earth from 10:00 to 16:00 UTC, their shared window lasts three hours, from 10:00 to 13:00.

<details>
<summary>Terrain-angle formula</summary>

The formula uses lunar radius `R`, surface distance `d`, obstacle elevation `h`, and absolute observer elevation `ho`.

```text
angle = atan2((R + h) cos(d/R) - (R + ho), (R + h) sin(d/R))
```

`ho` is ground elevation plus equipment height. The maximum angle is retained for each azimuth and interpolated between neighboring directions, including the north seam. The horizon can be negative, for example from elevated ground. [Calculation code](lib/terrain-math.mjs)

</details>

### Model limits

Windows describe geometric visibility of body centers. Energy production, radio-link performance, eclipses, partial disk visibility, and ground suitability need additional models. Window boundaries depend on DEM sampling, azimuth spacing, and time interpolation. Narrow obstacles may fall between samples. Rocks, microtextures, and exaggerated overview relief are visual aids. **DEM grid spacing is not measurement accuracy.**

## Data sources

| Input | Source |
| --- | --- |
| Sun and Earth directions from a lunar site | [NASA/JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) |
| Detailed south/north polar terrain, 20 m grid | [NASA GSFC · southern LOLA DEM](https://pgda.gsfc.nasa.gov/products/90), [northern LOLA DEM](https://pgda.gsfc.nasa.gov/products/98) |
| Global terrain, approximately 118 m along meridians | [USGS · LRO LOLA Global 256 ppd](https://astrogeology.usgs.gov/search/map/moon_lro_lola_dem_118m) |
| Distant terrain outside polar DEMs, approximately 474 m along meridians | [Ohio University · tiled LOLA Global 64 ppd](https://www.its.ohio.edu/foundations/lunar/docs.html) |
| LROC surface texture, overview terrain, slope overlay, Earth texture | [NASA CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/), [SLDEM2015 slopes](https://pgda.gsfc.nasa.gov/products/67), [NASA Blue Marble](https://svs.gsfc.nasa.gov/2915/) |

Prepared overview maps ship with the repository. Preparation scripts: [scripts/prepare_maps.py](scripts/prepare_maps.py) and [scripts/prepare_polar.py](scripts/prepare_polar.py). Elevations are relative to a sphere of radius **1,737,400 m**, in the MOON_ME / DE421 frame. Nearby polar terrain uses 20 m grids south of **80.05° S** and north of **80.05° N**. Sampling becomes coarser at greater distances. At an exact pole, the specified longitude defines the local direction orientation.

### Network and saved calculations

A new online calculation requests GeoTIFF byte ranges and JPL responses and can take tens of seconds. Downloads are cached under `data/cache/`. Temporary JPL failures receive up to two automatic retries with a delay. Completed history rows survive page reloads in the same browser. Nearby walking terrain loads separately from distant landscape grids and the calculation's horizon profile.

Annual presets, the prepared defense episode, globe directions within coverage, and included surface grids come from the local package. New arbitrary sites and settings still use JPL/DEM in online mode. [data/demo](data/demo/) also contains reproducible inputs for baseline-model tests.

## Development and checks

- `npm test` runs without internet access. It covers window boundaries, JPL responses, horizon profiles, poles and longitude seams, DEM loading, and surface walking.
- `npm run presets:build` rebuilds the annual package from frozen inputs offline. The cold-start test uses a local connection to a temporary server and forbids external requests.
- With the server running, `node scripts/benchmark_surface.mjs` measures nearby-grid, distant-terrain, and horizon loading times.
- Manual check: follow the two-site demo above, then **Surface view → WASD → Calculate here**. New points require access to the data providers in online mode.

Built with Node.js, Three.js, and GeoTIFF.js. The interface is based on the [team's mockup](lunar-interface.html). Codex assisted with implementation, map preparation, and checks. Code is available under the [MIT license](LICENSE); scientific data retain their source attribution.
