# Astro Planner — Seestar Optimized Astronomical Visibility Engine

Astro Planner is a client‑side astronomical planning tool built for real‑world astrophotography.  
It uses your device location, precise astronomical math, weather and smoke data, and a Seestar‑optimized deep‑sky catalog to recommend the best targets each night.

---

## Features

### Real Astronomical Calculations
- **Julian Date**, **GMST**, **LST**, **Hour Angle**, and **Altitude** computed directly in the browser  
- **Transit scoring** favors objects near transit (hour angle ≈ 0)  
- No external astronomy libraries required  

### Seestar Optimized Catalog
- Catalog filtered for the **ZWO Seestar S50**  
- Default limits: **integrated magnitude ≤ 12.5**, **angular size ≥ 2 arcmin**  
- Includes galaxies, nebulae, clusters, and supernova remnants with **RA**, **Dec**, **mag**, **size**, and **type**  

### Adaptive Altitude Thresholds
- Before midnight: **≥ 30°**  
- 00:00–02:00: **≥ 25°**  
- After 02:00: **≥ 20°**  

### Transit‑Aware Selection
When multiple objects qualify:
1. Highest altitude wins  
2. If within **20°**, the object closest to transit is chosen  

### Weather and Smoke Integration
- Hourly cloud cover, humidity, and PM2.5  
- Hours labeled **CLEAR** or **POOR**  

### UI Behavior
- Hour columns show local time + sky conditions  
- No object lists inside hour columns  
- Bottom summary shows dark window + each object’s **Max Altitude** and **Time of Max Altitude** (24‑hour format)

---

## Files

| File | Description |
|------|-------------|
| `astro.html` | Main application with astronomical engine and UI |
| `seestar_catalog.json` | Seestar‑optimized deep sky catalog |
| `scripts/run-astro-planner.bat` | Windows launcher |
| `scripts/astro_server.sh` | Linux/macOS launcher |

---

## How It Works

1. Browser requests device location  
2. Loads weather + air quality data  
3. Loads Seestar catalog  
4. Computes altitude for each object hourly  
5. Applies adaptive altitude thresholds  
6. Applies transit‑aware ranking  
7. Marks each hour CLEAR or POOR  
8. Builds nightly summaries  

Example summary: `M51 Galaxy — Max Alt: 78° at 01:00`

---

# Getting Started

Astro Planner runs entirely locally using a lightweight Python web server.  
Choose the instructions for your operating system below.

---

# 🪟 Windows Setup

### 1. Install Python 3
Download from:  
https://www.python.org/downloads/windows/  
Check **“Add Python to PATH”** during installation.

---

### 2. Download or clone the repository
Your folder should contain:
`src/`
`scripts/`
`README.md`
`LICENSE`

---

### 3. Run the Windows launcher
Double‑click: `scripts/run-astro-planner.bat`

This will:
- Start a local Python server  
- Open your browser to the dashboard  
- Load `astro.html` automatically  

---

### 4. Manual method (optional)

`cd src`
`python -m http.server 8000`

Then open: `http://localhost:8000/astro.html`

---

# 🐧 Linux / macOS Setup

### 1. Verify Python 3
Check with: `python3 --version`

---

### 2. Download or clone the repository

---

### 3. Use the included helper script

Make it executable:

`chmod +x scripts/astro_server.sh`

Run it:

`./scripts/astro_server.sh`

This will:
- Start a Python server  
- Open your default browser  

---

### 4. Manual method (optional)

`cd src`
`python3 -m http.server 8000`

Then open:

`http://localhost:8000/astro.html`


---

# 🍏 macOS Notes

If your system uses `python` instead of `python3`:

`python -m http.server 8000`


To open the browser manually:

`open http://localhost:8000/astro.html`

---

# Catalog Schema

The `seestar_catalog.json` file must follow this schema:

```json
[
  {
    "name": "Object Name",
    "id": "NGC 1234",
    "type": "Galaxy",
    "ra": 12.345,
    "dec": 45.678,
    "mag": 10.5,
    "size": 12.0
  }
]
```
  `ra` is in hours

   `dec` is in degrees

   `mag` is integrated magnitude

   `size` is angular size in arcminutes

Adjust `MAG_LIMIT` and `SIZE_LIMIT_ARCMIN` in the script to tune recommendations.





