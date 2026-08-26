import { Type } from "@earendil-works/pi-ai";

const colorSchema = Type.String({ minLength: 1, maxLength: 32 });
export const styleSchema = Type.Object({
  strokeColor: Type.Optional(colorSchema),
  backgroundColor: Type.Optional(colorSchema),
  textColor: Type.Optional(colorSchema),
  fillStyle: Type.Optional(
    Type.Union([
      Type.Literal("hachure"),
      Type.Literal("cross-hatch"),
      Type.Literal("solid"),
      Type.Literal("zigzag"),
    ]),
  ),
  strokeWidth: Type.Optional(Type.Number({ minimum: 1, maximum: 4 })),
  roughness: Type.Optional(Type.Number({ minimum: 0, maximum: 2 })),
  opacity: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
  fontSize: Type.Optional(Type.Number({ minimum: 10, maximum: 96 })),
  textAlign: Type.Optional(
    Type.Union([
      Type.Literal("left"),
      Type.Literal("center"),
      Type.Literal("right"),
    ]),
  ),
  verticalAlign: Type.Optional(
    Type.Union([
      Type.Literal("top"),
      Type.Literal("middle"),
      Type.Literal("bottom"),
    ]),
  ),
});

export const childLayoutSchema = Type.Object({
  slot: Type.Union([
    Type.Literal("header"),
    Type.Literal("media"),
    Type.Literal("body"),
    Type.Literal("footer"),
    Type.Literal("badge"),
    Type.Literal("center"),
  ]),
  align: Type.Optional(
    Type.Union([
      Type.Literal("left"),
      Type.Literal("center"),
      Type.Literal("right"),
      Type.Literal("stretch"),
    ]),
  ),
  order: Type.Optional(Type.Number({ minimum: 0, maximum: 20 })),
  padding: Type.Optional(Type.Number({ minimum: 0, maximum: 240 })),
  gap: Type.Optional(Type.Number({ minimum: 0, maximum: 120 })),
});

export const sectionContentLayoutSchema = Type.Object({
  mode: Type.Union([
    Type.Literal("row"),
    Type.Literal("column"),
    Type.Literal("grid"),
    Type.Literal("overlay"),
    Type.Literal("free"),
  ]),
  columns: Type.Optional(Type.Number({ minimum: 1, maximum: 12 })),
  gap: Type.Optional(Type.Number({ minimum: 0, maximum: 240 })),
  padding: Type.Optional(Type.Number({ minimum: 0, maximum: 240 })),
});

export const spaceLayoutSchema = Type.Object({
  mode: Type.Union([
    Type.Literal("row"),
    Type.Literal("column"),
    Type.Literal("grid"),
  ]),
  columns: Type.Optional(Type.Number({ minimum: 1, maximum: 12 })),
  gap: Type.Optional(Type.Number({ minimum: 0, maximum: 240 })),
  padding: Type.Optional(Type.Number({ minimum: 0, maximum: 240 })),
});

export const motionCharacterSchema = Type.Union([
  Type.Literal("precise"),
  Type.Literal("gentle"),
  Type.Literal("snappy"),
  Type.Literal("heavy"),
  Type.Literal("elastic"),
  Type.Literal("dramatic"),
]);

// Director time values are model-authored inputs. Accept compact numeric
// strings here so recoverable values such as "2500ms" reach deterministic
// normalization instead of being rejected by the tool-call JSON Schema.
export const directorNumberInputSchema = Type.Union([
  Type.Number(),
  Type.String({ maxLength: 32 }),
  Type.Null(),
]);

export const directorCameraSchema = Type.Object({
  framing: Type.Union([
    Type.Literal("wide"),
    Type.Literal("fit"),
    Type.Literal("medium"),
    Type.Literal("close"),
  ]),
  transition: Type.Union([
    Type.Literal("hold"),
    Type.Literal("cut"),
    Type.Literal("reframe"),
    Type.Literal("pan"),
    Type.Literal("whip-pan"),
    Type.Literal("push-in"),
    Type.Literal("pull-out"),
  ]),
  transitionDurationMs: Type.Optional(directorNumberInputSchema),
  motion: Type.Optional(motionCharacterSchema),
  zoomMotion: Type.Optional(motionCharacterSchema),
  travelZoomRatio: Type.Optional(directorNumberInputSchema),
  padding: Type.Optional(directorNumberInputSchema),
  offsetX: Type.Optional(directorNumberInputSchema),
  offsetY: Type.Optional(directorNumberInputSchema),
});

export const directorTransitionSchema = Type.Object({
  effect: Type.Union([
    Type.Literal("camera"),
    Type.Literal("color-wipe"),
    Type.Literal("directional-wipe"),
    Type.Literal("fade-through-color"),
    Type.Literal("push"),
    Type.Literal("iris"),
  ]),
  durationMs: directorNumberInputSchema,
  direction: Type.Optional(
    Type.Union([
      Type.Literal("left"),
      Type.Literal("right"),
      Type.Literal("up"),
      Type.Literal("down"),
    ]),
  ),
  origin: Type.Optional(
    Type.Union([
      Type.Literal("center"),
      Type.Literal("top-left"),
      Type.Literal("top-right"),
      Type.Literal("bottom-left"),
      Type.Literal("bottom-right"),
    ]),
  ),
  color: Type.Optional(colorSchema),
  backgroundColor: Type.Optional(colorSchema),
});

export const directorStylePropertySchema = Type.Union([
  Type.Literal("visual.opacity"),
  Type.Literal("visual.strokeColor"),
  Type.Literal("visual.backgroundColor"),
  Type.Literal("visual.fillStyle"),
  Type.Literal("visual.strokeWidth"),
  Type.Literal("visual.strokeStyle"),
  Type.Literal("visual.roughness"),
  Type.Literal("visual.roundness"),
  Type.Literal("text.fontSize"),
  Type.Literal("text.fontFamily"),
  Type.Literal("text.textAlign"),
  Type.Literal("text.verticalAlign"),
]);

export const directorCueSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 64 }),
  type: Type.Union([
    Type.Literal("enter"),
    Type.Literal("emphasize"),
    Type.Literal("exit"),
    Type.Literal("draw"),
    Type.Literal("style"),
  ]),
  targets: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), {
    minItems: 1,
    maxItems: 80,
  }),
  atMs: directorNumberInputSchema,
  durationMs: Type.Optional(directorNumberInputSchema),
  effect: Type.Union([
    Type.Literal("fade"),
    Type.Literal("slide"),
    Type.Literal("scale"),
    Type.Literal("pop"),
    Type.Literal("pulse"),
    Type.Literal("highlight"),
    Type.Literal("shake"),
    Type.Literal("bounce"),
    Type.Literal("style"),
  ]),
  direction: Type.Optional(
    Type.Union([
      Type.Literal("left"),
      Type.Literal("right"),
      Type.Literal("up"),
      Type.Literal("down"),
    ]),
  ),
  distance: Type.Optional(directorNumberInputSchema),
  staggerMs: Type.Optional(directorNumberInputSchema),
  motion: Type.Optional(motionCharacterSchema),
  count: Type.Optional(directorNumberInputSchema),
  color: Type.Optional(colorSchema),
  styleProperty: Type.Optional(directorStylePropertySchema),
  styleValue: Type.Optional(Type.Union([Type.Number(), Type.String()])),
  fromStyleValue: Type.Optional(Type.Union([Type.Number(), Type.String()])),
});

export const directorSceneSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 64 }),
  beatId: Type.String({ minLength: 1, maxLength: 64 }),
  startMs: directorNumberInputSchema,
  durationMs: directorNumberInputSchema,
  focusTargets: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), {
    minItems: 1,
    maxItems: 80,
  }),
  camera: Type.Optional(directorCameraSchema),
  transition: Type.Optional(directorTransitionSchema),
  cues: Type.Array(directorCueSchema, { minItems: 1, maxItems: 40 }),
});

export const directorContentSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 64 }),
  kind: Type.Union([
    Type.Literal("text"),
    Type.Literal("shape"),
    Type.Literal("visual"),
    Type.Literal("connector"),
  ]),
  role: Type.String({ minLength: 1, maxLength: 80 }),
  label: Type.Optional(Type.String({ maxLength: 500 })),
  sectionId: Type.Optional(Type.String({ maxLength: 64 })),
  from: Type.Optional(Type.String({ maxLength: 64 })),
  to: Type.Optional(Type.String({ maxLength: 64 })),
});

export const elementSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 64 }),
  type: Type.Union([
    Type.Literal("rectangle"),
    Type.Literal("ellipse"),
    Type.Literal("diamond"),
    Type.Literal("text"),
  ]),
  role: Type.Optional(Type.String({ maxLength: 64 })),
  label: Type.Optional(Type.String({ maxLength: 500 })),
  sectionId: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  parentId: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  layout: Type.Optional(childLayoutSchema),
  x: Type.Optional(Type.Number({ minimum: -20_000, maximum: 20_000 })),
  y: Type.Optional(Type.Number({ minimum: -20_000, maximum: 20_000 })),
  // Presentation canvases legitimately use small text, badges, separators,
  // bullets, and decorative marks. A blanket 20px minimum rejects valid
  // layouts before the tool can execute (for example 10px caption text).
  width: Type.Optional(Type.Number({ minimum: 1, maximum: 4000 })),
  height: Type.Optional(Type.Number({ minimum: 1, maximum: 4000 })),
  style: Type.Optional(styleSchema),
});
