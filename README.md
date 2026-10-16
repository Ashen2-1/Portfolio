# Tom Li Portfolio v4

Live site: GitHub Pages (`Ashen2-1/Portfolio`). Static HTML/CSS/JS with no build step and no frameworks.

## What's new in v4
- **New featured section: Field Test 01 at Greig's Caves (Sep 4, 2026)**, built from real field data:
  - photo mosaic from the field day
  - **interactive WebGL point-cloud viewer** (4 registered sessions, height/intensity coloring, ceiling cut-away, trajectory overlay)
  - IMU motion analysis per session, walking-path small multiples, plan-view and cross-section renders
  - data-integrity summary for all 12 sessions (33.9 min, 406M points, 406k IMU samples, 0 kernel drops)
- Redesigned UI: new typography (Inter + JetBrains Mono), hero photo, stat band, consistent card system, mobile layout
- Merged the latest content from `Tom_Li_Portfolio_Update` (NRC metrics, STEAM Project, FPV photos)
- FPV photos converted to JPG (≈5× smaller)

## Structure
```
index.html, styles.css, main.js
data/field.json          session stats, trajectories, viewer metadata
data/pc_*.bin            point clouds: int16 xyz (cm) ×N, then uint8 reflectivity ×N
assets/                  NEXO, FPV, earlier LiDAR figures
assets/field/            field photos + renders
analysis/                scripts that produced the data
```

## Reproducing the field analysis
1. `analysis/decode_pcap.py`: decode raw `livox_pointcloud_imu_udp.pcap` (keeps every 5th point packet, all IMU).
2. `analysis/lio_odometry.py in.npz out_prefix`: gyro-integrated deskew + IMU rotation prior + robust point-to-point ICP against a 25 cm voxel local map (KISS-ICP style). Offline, NumPy/SciPy only.
3. `analysis/export_web.py`, `analysis/render_figures.py`: web point clouds, JSON, figures.

Notes: odometry is frame-to-map without loop closure; drift has not been measured against ground truth.
Path lengths are smoothed over 1 s to remove handheld jitter.

## Publish
Replace the repo contents with this folder, commit, and push. GitHub Pages redeploys automatically.
Open via a web server, not file://, since the viewer fetches `data/*` (`python -m http.server` works locally).
