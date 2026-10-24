# Vertex User Guide

## Welcome to Vertex

Vertex is a local, offline 3D engineering copilot for CAD repair, assembly, and simulation.

**Key Principles:**
- **Works fully offline** — no internet required
- **Deterministic results** — same input always produces same output
- **Review-gated changes** — every change requires explicit confirmation

---

## Quick Start

### Step 1: Load a Sample
1. Navigate to the **Repair** tab
2. Click the **"Load Sample"** button
3. A sample broken model report will load into the workspace

### Step 2: Read Diagnosis + Plan
1. The **Diagnosis** panel shows findings grouped by severity (High, Med, Low)
2. The **Repair Plan** panel shows proposed fixes with step-by-step actions
3. Review each finding and the proposed repair strategy

### Step 3: Dry-run, then Apply
1. Click **"Dry-run"** to validate the repair plan
2. If validation passes, tick the confirmation checkbox: *"I have reviewed the plan and confirm it is correct"*
3. Click **"Apply (Simulation)"** to see what would change
4. **Note:** In simulation mode, nothing is written to CAD — this is a dry-run only

### Step 4: Build & Export
1. Switch to the **Build** tab
2. Adjust parameters (Length, Width, Thickness, Bore, Material)
3. Click **"Generate Preview"** to see the 3D model
4. Tick the confirmation checkbox
5. Click individual export buttons (**STL**, **OBJ**, **glTF**, **3MF**, **DXF**) or **"Export Files"** for all formats

---

## Workspaces

### Repair
**Diagnose broken models and plan fixes**
- Load ModelReport JSON via file upload, paste, or sample
- Automatic diagnosis identifies issues by severity
- Repair plan shows step-by-step fixes
- Review-gated application with dry-run validation

### Assembly
**Plan parts, mates, and validation checks**
- Load AssemblySpec JSON defining parts and connections
- Automatic mate planning (insert, coincide, parallel, etc.)
- Validation checks identify potential issues
- Review-gated build simulation

### Build
**Parametric part design → export to CAD formats**
- Define part parameters (dimensions, material)
- Generate 3D preview mesh
- Export to STL, OBJ, glTF, 3MF, or DXF formats
- All exports are review-gated

### Simulate
**Kinematic motion, mass properties, clearance analysis**
- Load assembly for kinematic simulation
- View mass properties (volume, mass, density)
- Clearance analysis between moving parts
- Motion scrubber for time-based visualization
- **Note:** Kinematic estimate only — not a FEA/CFD solver

### Answers
**Ask questions about your design with evidence**
- Ask natural language questions about your model
- Deterministic rule-based answers (not AI/LLM)
- Answer types: count, status, dependency, how-to, mate summary, unknown
- Evidence provided for each answer
- Example questions:
  - "What failed?"
  - "How do I fix a fillet?"
  - "Summary"
  - "How many features?"

### Reverse
**Scan point cloud → fit to parametric CAD**
- Paste scan data as JSON (array of [x,y,z] points)
- Deterministic fit algorithm:
  - Box fit for general point clouds
  - Cylinder fit when radial distances are consistent
- Result opens in Build tab for further editing
- Export to standard CAD formats

### Drawing
**2D drawing spec → 3D model generation**
- Define drawing extents (L × W × T)
- Specify holes as JSON array
- Generate 3D model from 2D spec
- Opens in Build tab for export
- Example holes: `[{"x":0,"y":0,"r":4},{"x":-30,"y":15,"r":3}]`

### Automation
**Batch export, patterns, and sheet operations**
- Define batch operations (Export, Pattern, Sheets)
- Generate ordered batch plan
- Summary shows total operations, instances, exports
- Review-gated execution
- **Note:** Simulation mode — no actual CAD writes

---

## Good to Know

### Offline First
Vertex works fully offline. No internet connection is required after initial load. All computations run locally in your browser.

### Local Bridge (Optional)
The connector status bar shows adapter availability:
- **Green indicator:** Available (e.g., Formats for STL/OBJ/glTF/3MF/DXF)
- **Gray indicator:** Unavailable (e.g., FreeCAD, Blender — no host connected)

Adapters for Fusion, SOLIDWORKS, FreeCAD, and Blender are template definitions only — Vertex does not include these CAD tools.

### Simulation Mode
Vertex operates in simulation mode by default:
- **Nothing is written to CAD** without an external host
- All "Apply" operations show what *would* happen
- Dry-run validation ensures plans are sound before application

### Universal Adapters
Vertex supports universal file formats:
- **Import:** JSON (ModelReport, AssemblySpec)
- **Export:** STL, OBJ, glTF, 3MF, DXF

Adapter templates exist for:
- FreeCAD (FCStd, STEP)
- Blender (BLEND, OBJ)
- Autodesk Fusion
- SOLIDWORKS

But these require external hosts — Vertex itself is standalone.

### Review Gate
All destructive or export operations require explicit confirmation:
1. Review the proposed changes
2. Tick the confirmation checkbox
3. Click Apply/Export

This ensures you always know what changes are being made.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Esc` | Close guide overlay |

---

## Troubleshooting

### Guide Not Appearing
If the onboarding guide doesn't appear on first visit:
- Click the **"Guide"** button (question mark icon) in the top bar
- Or click **"See how it works"** in the hero section

### localStorage Issues
Vertex safely handles localStorage errors for offline/file:// usage. If you see issues:
- The guide will still function
- "Don't show again" may not persist across sessions in file:// mode

### Browser Compatibility
Vertex works best in modern browsers:
- Microsoft Edge (Chromium)
- Google Chrome
- Firefox
- Safari

---

## Technical Details

### Schemas
Vertex uses versioned JSON schemas:
- `vertex/model-report/v1` — CAD repair reports
- `vertex/assembly-spec/v1` — Assembly definitions
- `vertex/build-spec/v1` — Parametric part specs
- `vertex/scan/v1` — Point cloud scan data
- `vertex/drawing/v1` — 2D drawing specs
- `vertex/batch/v1` — Batch operation plans
- `vertex/answer/v1` — Q&A results

### Determinism
All Vertex operations are deterministic:
- Same input → same output, every time
- No randomness, no AI inference
- Rule-based logic for Answers workspace
- Geometric fitting algorithms for Reverse workspace

---

## Getting Help

Open the live app at `https://juwpegatron.github.io/projects/vertex/app.html`,
or run it locally by opening `apps/vertex/web/app.html` in a browser
(no server required — Vertex works fully offline).
