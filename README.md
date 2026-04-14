# Astro Planner — Seestar-Optimized Astronomical Visibility Engine (Electron)

Astro Planner is a **desktop Electron app** for real-world astrophotography planning.  
It uses your location, precise astronomical math, live weather/smoke data, and a Deep-sky catalog to recommend the best targets each night.

---

## What's New — Electron Edition

| Feature | Details |
|---|---|
| **Native desktop app** | Runs as a standalone Electron window — no browser, no server |
| **Daily weather cache** | Weather fetched once per day and cached to disk; never re-fetches unnecessarily |
| **Auto midnight refresh** | At 12:05 AM, weather cache is automatically refreshed for the new night |
| **Manual refresh button** | Force a fresh weather pull any time with the ⟳ button |
| **Persistent location** | Your coordinates are saved across restarts |
| **Cache status badge** | Header shows when weather was last fetched |
| **External links** | Catalog links open in your system browser (not inside the app) |
| **No CORS issues** | All HTTP calls go through the main process — no browser restrictions |

---

## Files

| File | Description |
|---|---|
| `main.js` | Electron main process: weather caching, IPC handlers, auto-refresh scheduler |
| `preload.js` | Secure IPC bridge between main and renderer |
| `astro.html` | UI — the full astronomical planning interface |
| `ngc-ic-messier-catalog.json` | Deep sky catalog |
| `scripts/run-astro-planner.bat` | Windows launcher |
| `scripts/astro_server.sh` | Linux/macOS launcher |

---

## Getting Started

### Requirements

- **Node.js 18+** — https://nodejs.org  
- **npm** (included with Node.js)

---

### 🪟 Windows

1. Install Node.js from https://nodejs.org (check "Add to PATH")
2. Double-click `scripts/run-astro-planner.bat`

Or manually:
```
npm install
npm start
```

---

### 🐧 Linux / macOS

```bash
chmod +x scripts/astro_server.sh
./scripts/astro_server.sh
```

Or manually:
```bash
npm install
npm start
```

---

## How the Weather Cache Works

1. On first launch (or new location), weather is fetched live from Open-Meteo
2. Data is saved to `<userData>/weather_cache.json` with today's date, lat, and lon
3. On subsequent launches **today**, the cache is reused automatically
4. At **12:05 AM**, the main process wakes up, clears the old cache, fetches new data, and pushes it to the renderer — no user action needed
5. If your location changes by more than ~0.05°, the cache is considered stale and re-fetched
6. The ⟳ **Refresh Weather** button forces an immediate fresh fetch

---

## Building a Distributable

```bash
npm install
npm run build:win    # Windows installer (.exe)
npm run build:mac    # macOS disk image (.dmg)
npm run build:linux  # Linux AppImage
```

Output goes to `dist/`.

---

## Astronomical Features

- **Julian Date, GMST, LST, Hour Angle, Altitude** — computed in the renderer with no external libraries
- **Transit-aware ranking** — objects near transit preferred when altitudes are within 20°
- **Adaptive altitude thresholds** — 30° before midnight, 25° at 00–02, 20° after 02
- **Seestar catalog filters** — mag ≤ 12.5, size ≥ 2 arcmin
- **3-night forecast** — hourly CLEAR/POOR ratings with best target per hour

---

## Catalog Schema

```json
"NGC",
"name":"NGC628",
"m":[

    "M74"

]
,
"ngc":null,
"ic":null,
"type":"G",
"object_definition":"Galaxy",
"ra":"01:36:41.75",
"dec":"+15:47:01.2",
"const":"Psc",
"majax":9.89,
"minax":9.33,
"posang":87,
"b_mag":10,
"v_mag":9.46,
"j_mag":7.63,
"h_mag":7.04,
"k_mag":6.85,
"surfbr":23.37,
"hubble":"Sc",
"cstar_u_mag":null,
"cstar_b_mag":null,
"cstar_v_mag":null,
"cstar_names":null,
"identifiers":"2MASX J01364177+1547004,IRAS 01340+1532,MCG +03-05-011,PGC 005974,UGC 01149",
"common_names":null,
"ned_notes":null,
"openngc_notes":null,
"image":{

    "thumbnail":true,
    "filename":"M074.JPG",
    "format":"JPEG",
    "width":816,
    "mimetype":"image/jpeg",
    "id":"366e8c3e374eec05b66820745c8bfddb",
    "last_synchronized":"2020-05-01T21:28:46.449327",
    "color_summary":[
        "rgba(241, 240, 240, 1.00)",
        "rgba(253, 252, 252, 1.00)",
        "rgba(249, 249, 249, 1.00)"
    ]
    ,
    "height":1054,
    "url":"https://data.smartidf.services/api/explore/v2.1/catalog/datasets/ngc-ic-messier-catalog/files/366e8c3e374eec05b66820745c8bfddb"
```

- `ra` — Right ascension in hours  
- `dec` — Declination in degrees  
- `mag` — Integrated magnitude  
- `size` — Angular size in arcminutes  

Tune `MAG_LIMIT` and `SIZE_LIMIT_ARCMIN` in `astro.html` to adjust filtering.
