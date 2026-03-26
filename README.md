# Astro Planner — Seestar Optimized Astronomical Visibility Engine

Astro Planner is a client‑side astronomical planning tool built for real‑world astrophotography.  
It uses your device location, precise astronomical math, weather and smoke data, and a Seestar‑optimized deep‑sky catalog to recommend the best targets each night.

---

## Features

### Real Astronomical Calculations
- **Julian Date**, **GMST**, **LST**, **Hour Angle**, and **Altitude** computed in the browser.  
- **Transit scoring** favors objects near transit (hour angle ≈ 0).  
- No external astronomy libraries required.

### Seestar Optimized Catalog
- Catalog filtered for the **ZWO Seestar S50** capture profile.  
- Default limits: **integrated magnitude ≤ 12.5** and **angular size ≥ 2 arcmin**.  
- Includes galaxies, nebulae, clusters, and supernova remnants with **RA**, **Dec**, **mag**, **size**, and **type** fields.

### Adaptive Altitude Thresholds
- **Before midnight**: altitude ≥ **30°**  
- **00:00–02:00**: altitude ≥ **25°**  
- **After 02:00**: altitude ≥ **20°**

### Transit Aware Selection
- When multiple objects meet thresholds:
  1. Highest altitude wins.  
  2. If top altitudes are within **20°**, the object closest to transit is chosen.

### Weather and Smoke Integration
- Hourly evaluation for **cloud cover**, **relative humidity**, and **PM2.5**.  
- Hours labeled **CLEAR** or **POOR** based on sky and smoke conditions.

### UI Behavior
- **Hour columns** show local time, cloud/humidity/smoke, and CLEAR/POOR rating.  
- **No object lists inside hour columns**.  
- **Bottom summary grouped by night** shows dark window and each object that reaches meaningful altitude with **Max Altitude** and **Time of Max Altitude** in 24‑hour format.

---

## Files

| File | Description |
|------|-------------|
| `astro.html` | Main application with full astronomical engine and UI |
| `seestar_catalog.json` | Seestar optimized deep sky catalog (mag ≤ 12.5, size ≥ 2 arcmin) |
| `astro_server.sh` | Helper script to run a local static server and open the dashboard |

---

## How It Works

1. Browser requests device location.  
2. Loads weather and air quality data for the location.  
3. Loads the Seestar optimized catalog.  
4. Computes altitude for every catalog object for each hour of the night.  
5. Applies adaptive altitude thresholds per hour.  
6. Applies transit aware ranking when multiple objects qualify.  
7. Marks each hour CLEAR or POOR.  
8. Builds nightly summaries with max altitude and time of max altitude.

Example nightly summary line:
```M51 Galaxy — Max Alt: 78° at 01:00```

---

## Getting Started

1. Clone the repository.  
2. Place `astro.html` and `seestar_catalog.json` in the project root.  
3. Create the helper script `astro_server.sh` as shown below.  
4. Make the script executable and run it.  
5. Open the dashboard in your browser.
```bash
### Create the helper script

Create a file named `serve.sh` in the project root with the following content:

# Create the script file
cat > serve.sh <<'EOF'
#!/bin/bash
# Navigate to the folder containing your HTML file
cd /home/$USER/Documents
[astro_server.sh](https://github.com/user-attachments/files/26259658/astro_server.sh)

# Start python server in background on port 8000
python -m http.server 8000 &

# Wait a second for it to initialize
sleep 3
[astro_server.sh](https://github.com/user-attachments/files/26259662/astro_server.sh)

# Open your default browser to the dashboard
xdg-open http://localhost:8000/astro.html
EOF

# Make it executable
chmod +x serve.sh

# Run the script
./astro_server.sh

```
#Notes

   Replace /home/$USER/Documents with the actual path where astro.html or lives if different.

   On macOS use open instead of xdg-open.

   If Python 3 is invoked with python3 on your system, replace python -m http.server 8000 with python3 -m http.server 8000.

#Catalog Schema

The seestar_catalog.json file must follow this schema:
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
   ra is in hours.

   dec is in degrees.

   mag is integrated magnitude.

   size is angular size in arcminutes.

Adjust ```MAG_LIMIT``` and ```SIZE_LIMIT_ARCMIN``` in the script to tune recommendations for different gear or exposure strategies.

[astro_server.sh](https://github.com/user-attachments/files/26259681/astro_server.sh)
[astro.html](https://github.com/user-attachments/files/26259664/astro.html)
[seestar_catalog.json](https://github.com/user-attachments/files/26259685/seestar_catalog.json)
