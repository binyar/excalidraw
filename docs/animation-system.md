# Excalidraw Advanced Animation System

## 1. Purpose

The animation system targets dashboards, data walls, and presentation scenes. Its public contract is the JSON-serializable Animation DSL. Motion advances the playback clock, while `MotionAdapter` deterministically evaluates the DSL into runtime values. Neither layer is exposed to AI generators.

```text
Animation Inspector / AI generated animation.json
                    ↓
             Animation DSL
                    ↓
        Schema validation + Scene Timeline
                    ↓
              MotionAdapter
                    ↓
             Motion Runtime
                    ↓
     RuntimeStateStore (ephemeral state)
                    ↓
       Excalidraw render-only projection
                    ↓
                  Canvas
```

Animation data does not modify Excalidraw elements, Scene, AppState, history, selection, or clipboard payloads.

### 1.1 Editor authoring flow

The editor follows a property-first keyframe workflow:

1. Select one Excalidraw element. The Animation Inspector opens and an empty five-second authoring track is selected in the bottom timeline.
2. Enable a property with its diamond control. This writes the property's current value at the current playhead time.
3. Move the playhead by scrubbing the transport or clicking a timeline lane.
4. Change the property value in the Inspector. The DSL upserts a keyframe at that exact time, rebuilds the Motion runtime, seeks back to the same time, and immediately projects the evaluated value onto the canvas.
5. Add or delete keyframes in the bottom property rows. Presets are expanded to explicit DSL property keyframes so they remain visible and editable.
6. Play, pause, seek, or change the project total duration. Playback reads only the Animation DSL and writes only ephemeral runtime state.

The `显示状态` row edits `element.visibility` as a discrete `visible` or `hidden` state. Hidden elements remain in the saved scene but are absent from rendering and editor interaction. Entrance and exit presets always materialize this state track; opacity remains a separate continuous fade channel.

Appearance tracks follow one shared behavior registry. Quantitative numeric properties and colors interpolate continuously. `visual.roundness` uses `sharp` and `round` as UI endpoints but maps them to numeric radius progress `0` and `1`, so the canvas radius changes throughout playback. Fill style, border style, roughness/line style, font family, horizontal/vertical text alignment, and visibility are discrete states: their numeric-looking values are enum ids, they switch only at a keyframe, and the timeline does not render a connector or expose easing for them.

Story boundaries expose two distinct authoring modes in the timeline header:

- `+ 运镜` creates the spatial Camera track used to move through one canvas.
- `+ 翻页` creates or locates a PPT-style page transition between consecutive scenes. Its row exposes the wipe, fade, push, or iris effect and direction.

The page-transition entry remains visible after an Agent has already generated all transitions, so Agent output and user-authored configuration use the same editable tracks. Changing a PPT effect rematerializes the complete transition layer group instead of only relabeling one runtime layer.

An empty track is valid while authoring because it represents a selected target before any property is enabled. It has no visual effect and exports without engine-specific state.

## 2. Motion Path

`advanced.path` animates normalized progress from `0` to `1`. The path may be a polyline, SVG path, or explicit cubic Bezier path. Bezier is the recommended AI authoring format because every control point is structured data.

```json
{
  "property": "advanced.path",
  "motionPath": {
    "type": "bezier",
    "start": { "x": 0, "y": 0 },
    "segments": [
      {
        "control1": { "x": 80, "y": -120 },
        "control2": { "x": 220, "y": 120 },
        "to": { "x": 320, "y": 0 }
      }
    ]
  },
  "orientToPath": true,
  "keyframes": [
    {
      "atMs": 0,
      "value": 0,
      "easing": { "type": "preset", "name": "ease-in-out" }
    },
    { "atMs": 1800, "value": 1 }
  ]
}
```

Bezier paths are sampled into an arc-length lookup table, so progress represents travel distance rather than raw curve parameter time. SVG paths use the browser SVG geometry API.

## 3. Draw Animation

`advanced.drawProgress` controls the visible fraction of an `arrow`, `line`, or `freedraw` stroke.

```json
{
  "property": "advanced.drawProgress",
  "fill": "both",
  "keyframes": [
    {
      "atMs": 0,
      "value": 0,
      "easing": { "type": "preset", "name": "ease-out" }
    },
    { "atMs": 1200, "value": 1 }
  ]
}
```

The renderer creates a temporary partial point list. Original points, bindings, arrowheads, history, and persisted scene data remain unchanged. Non-stroke elements ignore draw progress.

## 4. Color Animation

Stroke and fill colors use `visual.strokeColor` and `visual.backgroundColor`. Canonical colors are `#RRGGBB` or `#RRGGBBAA`.

```json
{
  "property": "visual.backgroundColor",
  "keyframes": [
    { "atMs": 0, "value": "#1971C200" },
    { "atMs": 600, "value": "#1971C2FF" },
    { "atMs": 1200, "value": "#40C057FF" }
  ]
}
```

The adapter parses canonical RGBA values and interpolates them continuously while keeping runtime-specific types out of the DSL.

## 5. Group Animation and Stagger

Groups are semantic animation groups and do not modify Excalidraw `groupIds`. A group can contain elements or nested groups.

```json
{
  "groups": [
    {
      "id": "metric-cards",
      "members": [
        { "type": "element", "elementId": "card-1", "role": "primary" },
        { "type": "element", "elementId": "card-2", "role": "secondary" },
        { "type": "element", "elementId": "card-3", "role": "secondary" }
      ]
    }
  ],
  "tracks": [
    {
      "id": "cards-enter",
      "target": { "type": "group", "groupId": "metric-cards" },
      "group": { "mode": "stagger", "eachMs": 120, "order": "forward" },
      "presets": [
        {
          "category": "entrance",
          "name": "fade-in",
          "atMs": 0,
          "durationMs": 500
        }
      ]
    }
  ]
}
```

Supported ordering is `forward`, `reverse`, deterministic `random` with a seed, and `by-role` with `roleOrder`.

## 6. Scene Timeline

Scenes are named intervals on the master project timeline. A track with `sceneId` uses scene-relative `startMs`; a track without it uses project-relative `startMs`.

```json
{
  "durationMs": 12000,
  "scenes": [
    { "id": "intro", "name": "Intro", "startMs": 0, "durationMs": 3000 },
    {
      "id": "overview",
      "name": "Overview",
      "startMs": 3000,
      "durationMs": 5000
    },
    { "id": "details", "name": "Details", "startMs": 8000, "durationMs": 4000 }
  ],
  "tracks": [
    {
      "id": "map-enter",
      "sceneId": "overview",
      "startMs": 200,
      "durationMs": 1000,
      "target": { "type": "element", "elementId": "map" },
      "presets": [
        {
          "category": "entrance",
          "name": "fade-in",
          "atMs": 0,
          "durationMs": 1000
        }
      ]
    }
  ]
}
```

Here `map-enter` begins at absolute time `3200ms`. `SceneTimeline.schedule()` returns absolute track intervals, while `moveScene()` and `placeTrack()` return new validated projects.

## 7. animation.json Export and Import

The exported file is the complete `AnimationProject` and contains no runtime-private state.

```ts
import {
  downloadAnimationProject,
  parseAnimationProjectJson,
  serializeAnimationProject,
} from "src/animation/export";

const json = serializeAnimationProject(project);
const imported = parseAnimationProjectJson(json);
downloadAnimationProject(imported); // animation.json
```

`AnimationWorkspace.loadJson(json, true)` validates an AI-generated file, rebuilds Motion Runtime, binds runtime state, and optionally starts preview. `exportJson()` returns the current DSL.

## 8. AI Generation Contract

AI-generated files must:

1. Emit `schemaVersion: "1.0"`, a unique project id, positive duration, frame rate, and tracks.
2. Reference only existing Excalidraw element ids, group ids, and scene ids.
3. Keep property keyframes sorted by `atMs`, with no duplicate times.
4. Keep progress and opacity values in `0..1`.
5. Keep scene and track content inside their declared duration and the project duration.
6. Use explicit Bezier control points instead of embedding arbitrary executable logic.
7. Use a seed for random group staggering.

All imports pass through `animationProjectSchema`; unknown fields, invalid references, cyclic groups, duplicate ids, and out-of-range timing are rejected before Runtime creation.

## 9. Runtime Boundaries

- Motion owns the playback clock; `MotionAdapter` owns deterministic keyframe interpolation and sampling.
- AnimationProject remains the source of truth for editing and export.
- RuntimeStateStore is process-local and ephemeral.
- Canvas receives projected element copies only.
- Draw animation currently applies to line, arrow, and free-draw geometry. Shape-outline drawing requires a future path-flattening renderer.
- SVG motion path sampling requires a browser DOM; structured Bezier and polyline paths work without SVG parsing.
