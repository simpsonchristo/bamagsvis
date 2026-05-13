# Work Log

Chronological record of work sessions and significant changes.

---

## 2019-04-01

**Initial commit — FreeFlyer mission plans and Blender DSN 34 model**

- Added three FreeFlyer `.MissionPlan` files establishing the project skeleton
- Committed Blender project (`34M_17.blend`) for the DSN 34-meter dish along with `.3ds` and `.stl` exports and ambient occlusion texture maps
- Established repo structure: mission plans at root, 3D assets under `Models/DSN 34/`

---

## 2019-04-03

**Formation updater, output layout template, README**

- `Formation Updater Complete`: FreeFlyer script that propagates a formation of satellites simultaneously and updates their positions each epoch — foundational piece for the multi-satellite overhead display
- `Template of OutputLayout`: initial ground track view layout defining the display regions (globe, satellite list, station panel) that the TV output will be built on
- `Create README.md`: project description, motivation, and three-phase plan of attack documented

---

## 2019-04-05

**DSN animation example**

- `Example of DSN animation`: working reference implementation showing a DSN 34-meter dish animated in FreeFlyer — dish azimuth/elevation drive demonstrated, used as the pattern for the live tracking scene

---

## 2019-04-07

**Correct ground station animation — PR #5 merged**

- `Correct animation of ground station`: fixed timing and orientation errors in the dish animation; dish now correctly slews to satellite azimuth/elevation at each propagation epoch
- `Merge pull request #5 from simpsonchristo/3dmodelmovement`: branch `3dmodelmovement` integrated into master after review

---

## 2019-04-15

**TX/RX vectors added to GSView; bug fixes**

- `Added Vectors to GSView`: uplink (TX) and downlink (RX) vector objects added to the FreeFlyer ground station view scene — first representation of the active link between ground station and satellite; vectors update with satellite position
- `Fixing Drew's Mistakes`: corrected errors introduced in a prior commit (exact changes recorded in git diff `4a7e7db`)

---

## 2026-05-13

**Documentation pass**

- Reformatted `README.md`: clearer project goal statement, tech stack table, repo layout, and development roadmap
- Created `ARCHITECTURE.md`: full system design — data flow diagram, component breakdown, TX/RX link visualization spec, ground network support table, deployment target
- Created `TODO.md`: phase-by-phase task list with completed items marked
- Created `WORKLOG.md`: this file, backfilled from git history
