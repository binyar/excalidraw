import {
  ANIMATION_SCHEMA_VERSION,
  type AnimationDirection,
  type AnimationEasing,
  type AnimationFillMode,
  type AnimationGroup,
  type AnimationIterationCount,
  type AnimationPath,
  type AnimationPreset,
  type AnimationProject,
  type AnimationProperty,
  type AnimationScene,
  type AnimationShadow,
  type AnimationTrack,
  type GroupAnimationOptions,
  type LoopAnimation,
} from "./types";

export type AnimationSchemaPath = Array<string | number>;

export type AnimationSchemaIssueCode =
  | "invalid_type"
  | "invalid_value"
  | "missing_field"
  | "unknown_field"
  | "duplicate_id"
  | "duplicate_time"
  | "invalid_reference"
  | "cyclic_group"
  | "out_of_bounds";

export type AnimationSchemaIssue = {
  code: AnimationSchemaIssueCode;
  path: AnimationSchemaPath;
  message: string;
};

export type AnimationSchemaResult<T> =
  | { success: true; data: T }
  | { success: false; error: AnimationSchemaError };

export interface AnimationRuntimeSchema<T> {
  parse(input: unknown): T;
  safeParse(input: unknown): AnimationSchemaResult<T>;
}

export class AnimationSchemaError extends Error {
  readonly issues: AnimationSchemaIssue[];

  constructor(issues: AnimationSchemaIssue[]) {
    super(formatIssues(issues));
    this.name = "AnimationSchemaError";
    this.issues = issues;
  }
}

type IssueCollector = AnimationSchemaIssue[];
type ValueValidator = (
  value: unknown,
  path: AnimationSchemaPath,
  issues: IssueCollector,
) => void;

const fillModes = new Set<AnimationFillMode>([
  "none",
  "forwards",
  "backwards",
  "both",
]);

const directions = new Set<AnimationDirection>([
  "normal",
  "reverse",
  "alternate",
  "alternate-reverse",
]);

const easingPresetNames = new Set([
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "smooth",
  "sharp",
  "bounce",
  "back-in",
  "back-out",
  "back-in-out",
]);

const propertyNames = new Set([
  "transform.x",
  "transform.y",
  "transform.scale",
  "transform.rotate",
  "camera.centerX",
  "camera.centerY",
  "camera.zoom",
  "visual.opacity",
  "visual.strokeColor",
  "visual.backgroundColor",
  "visual.fillStyle",
  "visual.strokeWidth",
  "visual.strokeStyle",
  "visual.roughness",
  "visual.roundness",
  "text.fontSize",
  "text.fontFamily",
  "text.textAlign",
  "text.verticalAlign",
  "element.visibility",
  "advanced.path",
  "advanced.drawProgress",
  "advanced.blur",
  "advanced.shadow",
  "transition.progress",
  "transition.opacity",
  "transition.color",
  "transition.blur",
  "transition.scale",
]);
const cameraPropertyNames = new Set([
  "camera.centerX",
  "camera.centerY",
  "camera.zoom",
]);
const transitionPropertyNames = new Set([
  "transition.progress",
  "transition.opacity",
  "transition.color",
  "transition.blur",
  "transition.scale",
]);

const createSchema = <T>(
  validator: ValueValidator,
): AnimationRuntimeSchema<T> => ({
  safeParse(input: unknown): AnimationSchemaResult<T> {
    const issues: AnimationSchemaIssue[] = [];
    validator(input, [], issues);
    return issues.length
      ? { success: false, error: new AnimationSchemaError(issues) }
      : { success: true, data: input as T };
  },
  parse(input: unknown): T {
    const result = this.safeParse(input);
    if (!result.success) {
      throw result.error;
    }
    return result.data;
  },
});

const formatIssues = (issues: AnimationSchemaIssue[]) =>
  issues
    .map((issue) => {
      const path = issue.path.length
        ? issue.path
            .map((part) =>
              typeof part === "number" ? `[${part}]` : `.${part}`,
            )
            .join("")
            .replace(/^\./, "")
        : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("\n");

const addIssue = (
  issues: IssueCollector,
  code: AnimationSchemaIssueCode,
  path: AnimationSchemaPath,
  message: string,
) => issues.push({ code, path, message });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validateObject = (
  value: unknown,
  path: AnimationSchemaPath,
  issues: IssueCollector,
): value is Record<string, unknown> => {
  if (!isRecord(value)) {
    addIssue(issues, "invalid_type", path, "Expected an object.");
    return false;
  }
  return true;
};

const validateKnownKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: AnimationSchemaPath,
  issues: IssueCollector,
) => {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      addIssue(
        issues,
        "unknown_field",
        [...path, key],
        `Unknown field "${key}".`,
      );
    }
  }
};

const requireField = (
  value: Record<string, unknown>,
  key: string,
  path: AnimationSchemaPath,
  issues: IssueCollector,
) => {
  if (!(key in value)) {
    addIssue(
      issues,
      "missing_field",
      [...path, key],
      `Missing required field "${key}".`,
    );
    return false;
  }
  return true;
};

const validateString = (
  value: unknown,
  path: AnimationSchemaPath,
  issues: IssueCollector,
  options: { nonEmpty?: boolean } = { nonEmpty: true },
) => {
  if (typeof value !== "string") {
    addIssue(issues, "invalid_type", path, "Expected a string.");
    return false;
  }
  if (options.nonEmpty !== false && value.trim().length === 0) {
    addIssue(issues, "invalid_value", path, "String must not be empty.");
    return false;
  }
  return true;
};

const validateOptionalString = (
  value: Record<string, unknown>,
  key: string,
  path: AnimationSchemaPath,
  issues: IssueCollector,
) => {
  if (key in value) {
    validateString(value[key], [...path, key], issues);
  }
};

const validateBoolean = (
  value: unknown,
  path: AnimationSchemaPath,
  issues: IssueCollector,
) => {
  if (typeof value !== "boolean") {
    addIssue(issues, "invalid_type", path, "Expected a boolean.");
    return false;
  }
  return true;
};

const validateFiniteNumber = (
  value: unknown,
  path: AnimationSchemaPath,
  issues: IssueCollector,
  options: {
    min?: number;
    max?: number;
    integer?: boolean;
    exclusiveMin?: boolean;
  } = {},
) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    addIssue(issues, "invalid_type", path, "Expected a finite number.");
    return false;
  }
  if (options.integer && !Number.isInteger(value)) {
    addIssue(issues, "invalid_value", path, "Expected an integer.");
  }
  if (
    options.min !== undefined &&
    (options.exclusiveMin ? value <= options.min : value < options.min)
  ) {
    addIssue(
      issues,
      "out_of_bounds",
      path,
      options.exclusiveMin
        ? `Value must be greater than ${options.min}.`
        : `Value must be at least ${options.min}.`,
    );
  }
  if (options.max !== undefined && value > options.max) {
    addIssue(
      issues,
      "out_of_bounds",
      path,
      `Value must be at most ${options.max}.`,
    );
  }
  return true;
};

const validateOptionalNumber = (
  value: Record<string, unknown>,
  key: string,
  path: AnimationSchemaPath,
  issues: IssueCollector,
  options: Parameters<typeof validateFiniteNumber>[3] = {},
) => {
  if (key in value) {
    validateFiniteNumber(value[key], [...path, key], issues, options);
  }
};

const validateEnum = <T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  path: AnimationSchemaPath,
  issues: IssueCollector,
) => {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    addIssue(
      issues,
      "invalid_value",
      path,
      `Expected one of: ${Array.from(allowed).join(", ")}.`,
    );
    return false;
  }
  return true;
};

const validateOptionalEnum = <T extends string>(
  value: Record<string, unknown>,
  key: string,
  allowed: ReadonlySet<T>,
  path: AnimationSchemaPath,
  issues: IssueCollector,
) => {
  if (key in value) {
    validateEnum(value[key], allowed, [...path, key], issues);
  }
};

const validatePoint: ValueValidator = (value, path, issues) => {
  if (!validateObject(value, path, issues)) {
    return;
  }
  validateKnownKeys(value, ["x", "y"], path, issues);
  if (requireField(value, "x", path, issues)) {
    validateFiniteNumber(value.x, [...path, "x"], issues);
  }
  if (requireField(value, "y", path, issues)) {
    validateFiniteNumber(value.y, [...path, "y"], issues);
  }
};

const validateColor: ValueValidator = (value, path, issues) => {
  validateString(value, path, issues);
};

const validateShadow: ValueValidator = (value, path, issues) => {
  if (!validateObject(value, path, issues)) {
    return;
  }
  validateKnownKeys(
    value,
    ["offsetX", "offsetY", "blur", "spread", "color"],
    path,
    issues,
  );
  for (const key of ["offsetX", "offsetY", "spread"] as const) {
    if (requireField(value, key, path, issues)) {
      validateFiniteNumber(value[key], [...path, key], issues);
    }
  }
  if (requireField(value, "blur", path, issues)) {
    validateFiniteNumber(value.blur, [...path, "blur"], issues, { min: 0 });
  }
  if (requireField(value, "color", path, issues)) {
    validateColor(value.color, [...path, "color"], issues);
  }
};

const validatePath: ValueValidator = (value, path, issues) => {
  if (!validateObject(value, path, issues)) {
    return;
  }
  if (!requireField(value, "type", path, issues)) {
    return;
  }
  if (value.type === "polyline") {
    validateKnownKeys(value, ["type", "points", "closed"], path, issues);
    if (!Array.isArray(value.points)) {
      addIssue(
        issues,
        "invalid_type",
        [...path, "points"],
        "Expected an array of points.",
      );
    } else {
      if (value.points.length < 2) {
        addIssue(
          issues,
          "invalid_value",
          [...path, "points"],
          "A polyline path requires at least two points.",
        );
      }
      value.points.forEach((point, index) =>
        validatePoint(point, [...path, "points", index], issues),
      );
    }
    if ("closed" in value) {
      validateBoolean(value.closed, [...path, "closed"], issues);
    }
  } else if (value.type === "svg") {
    validateKnownKeys(value, ["type", "d"], path, issues);
    if (requireField(value, "d", path, issues)) {
      validateString(value.d, [...path, "d"], issues);
    }
  } else if (value.type === "bezier") {
    validateKnownKeys(
      value,
      ["type", "start", "segments", "closed"],
      path,
      issues,
    );
    if (requireField(value, "start", path, issues)) {
      validatePoint(value.start, [...path, "start"], issues);
    }
    if (!Array.isArray(value.segments)) {
      addIssue(
        issues,
        "invalid_type",
        [...path, "segments"],
        "Expected an array of cubic Bezier segments.",
      );
    } else {
      if (value.segments.length === 0) {
        addIssue(
          issues,
          "invalid_value",
          [...path, "segments"],
          "A Bezier path requires at least one segment.",
        );
      }
      value.segments.forEach((segment, index) => {
        const segmentPath = [...path, "segments", index];
        if (!validateObject(segment, segmentPath, issues)) {
          return;
        }
        validateKnownKeys(
          segment,
          ["control1", "control2", "to"],
          segmentPath,
          issues,
        );
        for (const key of ["control1", "control2", "to"] as const) {
          if (requireField(segment, key, segmentPath, issues)) {
            validatePoint(segment[key], [...segmentPath, key], issues);
          }
        }
      });
    }
    if ("closed" in value) {
      validateBoolean(value.closed, [...path, "closed"], issues);
    }
  } else {
    addIssue(
      issues,
      "invalid_value",
      [...path, "type"],
      'Expected path type "polyline", "bezier", or "svg".',
    );
  }
};

const validateEasing: ValueValidator = (value, path, issues) => {
  if (!validateObject(value, path, issues)) {
    return;
  }
  if (!requireField(value, "type", path, issues)) {
    return;
  }
  switch (value.type) {
    case "preset":
      validateKnownKeys(value, ["type", "name"], path, issues);
      if (requireField(value, "name", path, issues)) {
        validateEnum(value.name, easingPresetNames, [...path, "name"], issues);
      }
      break;
    case "cubic-bezier":
      validateKnownKeys(value, ["type", "x1", "y1", "x2", "y2"], path, issues);
      for (const key of ["x1", "x2"] as const) {
        if (requireField(value, key, path, issues)) {
          validateFiniteNumber(value[key], [...path, key], issues, {
            min: 0,
            max: 1,
          });
        }
      }
      for (const key of ["y1", "y2"] as const) {
        if (requireField(value, key, path, issues)) {
          validateFiniteNumber(value[key], [...path, key], issues);
        }
      }
      break;
    case "steps":
      validateKnownKeys(value, ["type", "count", "position"], path, issues);
      if (requireField(value, "count", path, issues)) {
        validateFiniteNumber(value.count, [...path, "count"], issues, {
          min: 1,
          integer: true,
        });
      }
      if (requireField(value, "position", path, issues)) {
        validateEnum(
          value.position,
          new Set(["start", "end"]),
          [...path, "position"],
          issues,
        );
      }
      break;
    case "spring":
      validateKnownKeys(
        value,
        ["type", "mass", "stiffness", "damping", "velocity"],
        path,
        issues,
      );
      for (const key of ["mass", "stiffness", "damping"] as const) {
        if (requireField(value, key, path, issues)) {
          validateFiniteNumber(value[key], [...path, key], issues, {
            min: 0,
            exclusiveMin: true,
          });
        }
      }
      validateOptionalNumber(value, "velocity", path, issues);
      break;
    default:
      addIssue(
        issues,
        "invalid_value",
        [...path, "type"],
        "Unknown easing type.",
      );
  }
};

const validateOptionalEasing = (
  value: Record<string, unknown>,
  path: AnimationSchemaPath,
  issues: IssueCollector,
) => {
  if ("easing" in value) {
    validateEasing(value.easing, [...path, "easing"], issues);
  }
};

const validateKeyframes = (
  value: unknown,
  path: AnimationSchemaPath,
  issues: IssueCollector,
  validateValue: ValueValidator,
) => {
  if (!Array.isArray(value)) {
    addIssue(issues, "invalid_type", path, "Expected an array of keyframes.");
    return;
  }
  if (value.length === 0) {
    addIssue(
      issues,
      "invalid_value",
      path,
      "At least one keyframe is required.",
    );
    return;
  }
  let previousTime = -Infinity;
  const times = new Set<number>();
  value.forEach((keyframe, index) => {
    const keyframePath = [...path, index];
    if (!validateObject(keyframe, keyframePath, issues)) {
      return;
    }
    validateKnownKeys(
      keyframe,
      ["atMs", "value", "easing", "hold", "label"],
      keyframePath,
      issues,
    );
    if (requireField(keyframe, "atMs", keyframePath, issues)) {
      if (
        validateFiniteNumber(keyframe.atMs, [...keyframePath, "atMs"], issues, {
          min: 0,
        })
      ) {
        const time = keyframe.atMs as number;
        if (times.has(time)) {
          addIssue(
            issues,
            "duplicate_time",
            [...keyframePath, "atMs"],
            `Duplicate keyframe time ${time}ms.`,
          );
        }
        if (time < previousTime) {
          addIssue(
            issues,
            "invalid_value",
            [...keyframePath, "atMs"],
            "Keyframes must be ordered by ascending atMs.",
          );
        }
        times.add(time);
        previousTime = time;
      }
    }
    if (requireField(keyframe, "value", keyframePath, issues)) {
      validateValue(keyframe.value, [...keyframePath, "value"], issues);
    }
    validateOptionalEasing(keyframe, keyframePath, issues);
    if ("hold" in keyframe) {
      validateBoolean(keyframe.hold, [...keyframePath, "hold"], issues);
    }
    validateOptionalString(keyframe, "label", keyframePath, issues);
  });
};

const validateNumberValue: ValueValidator = (value, path, issues) => {
  validateFiniteNumber(value, path, issues);
};

const validateScaleValue: ValueValidator = (value, path, issues) => {
  validateFiniteNumber(value, path, issues, { min: 0 });
};

const validateOpacityValue: ValueValidator = (value, path, issues) => {
  validateFiniteNumber(value, path, issues, { min: 0, max: 1 });
};

const validateBlurValue: ValueValidator = (value, path, issues) => {
  validateFiniteNumber(value, path, issues, { min: 0 });
};

const validatePathProgress: ValueValidator = (value, path, issues) => {
  validateFiniteNumber(value, path, issues, { min: 0, max: 1 });
};

const validateProperty: ValueValidator = (value, path, issues) => {
  if (!validateObject(value, path, issues)) {
    return;
  }
  if (!requireField(value, "property", path, issues)) {
    return;
  }
  if (
    !validateEnum(value.property, propertyNames, [...path, "property"], issues)
  ) {
    return;
  }
  const isPath = value.property === "advanced.path";
  validateKnownKeys(
    value,
    isPath
      ? [
          "id",
          "property",
          "enabled",
          "fill",
          "keyframes",
          "motionPath",
          "orientToPath",
          "anchor",
        ]
      : ["id", "property", "enabled", "fill", "keyframes"],
    path,
    issues,
  );
  validateOptionalString(value, "id", path, issues);
  if ("enabled" in value) {
    validateBoolean(value.enabled, [...path, "enabled"], issues);
  }
  validateOptionalEnum(value, "fill", fillModes, path, issues);

  let valueValidator: ValueValidator = validateNumberValue;
  switch (value.property) {
    case "transform.scale":
    case "camera.zoom":
      valueValidator = validateScaleValue;
      break;
    case "visual.opacity":
    case "advanced.drawProgress":
    case "transition.progress":
    case "transition.opacity":
      valueValidator = validateOpacityValue;
      break;
    case "visual.strokeColor":
    case "visual.backgroundColor":
    case "transition.color":
      valueValidator = validateColor;
      break;
    case "visual.fillStyle":
      valueValidator = (fillStyle, fillStylePath, fillStyleIssues) => {
        validateEnum(
          fillStyle,
          new Set(["hachure", "cross-hatch", "solid", "zigzag"]),
          fillStylePath,
          fillStyleIssues,
        );
      };
      break;
    case "visual.strokeWidth":
    case "text.fontSize":
      valueValidator = (number, numberPath, numberIssues) =>
        validateFiniteNumber(number, numberPath, numberIssues, {
          min: 0,
        });
      break;
    case "visual.roughness":
      valueValidator = (roughness, roughnessPath, roughnessIssues) =>
        validateFiniteNumber(roughness, roughnessPath, roughnessIssues, {
          min: 0,
          max: 2,
          integer: true,
        });
      break;
    case "text.fontFamily":
      valueValidator = (fontFamily, fontFamilyPath, fontFamilyIssues) =>
        validateFiniteNumber(fontFamily, fontFamilyPath, fontFamilyIssues, {
          min: 1,
          integer: true,
        });
      break;
    case "visual.strokeStyle":
      valueValidator = (style, stylePath, styleIssues) =>
        validateEnum(
          style,
          new Set(["solid", "dashed", "dotted"]),
          stylePath,
          styleIssues,
        );
      break;
    case "visual.roundness":
      valueValidator = (roundness, roundnessPath, roundnessIssues) => {
        if (typeof roundness === "number") {
          validateFiniteNumber(roundness, roundnessPath, roundnessIssues, {
            min: 0,
            max: 1,
          });
          return;
        }
        validateEnum(
          roundness,
          new Set(["sharp", "round"]),
          roundnessPath,
          roundnessIssues,
        );
      };
      break;
    case "text.textAlign":
      valueValidator = (align, alignPath, alignIssues) =>
        validateEnum(
          align,
          new Set(["left", "center", "right"]),
          alignPath,
          alignIssues,
        );
      break;
    case "text.verticalAlign":
      valueValidator = (align, alignPath, alignIssues) =>
        validateEnum(
          align,
          new Set(["top", "middle", "bottom"]),
          alignPath,
          alignIssues,
        );
      break;
    case "element.visibility":
      valueValidator = (visibility, visibilityPath, visibilityIssues) => {
        validateEnum(
          visibility,
          new Set(["visible", "hidden"]),
          visibilityPath,
          visibilityIssues,
        );
      };
      break;
    case "advanced.blur":
    case "transition.blur":
      valueValidator = validateBlurValue;
      break;
    case "transition.scale":
      valueValidator = validateScaleValue;
      break;
    case "advanced.shadow":
      valueValidator = validateShadow;
      break;
    case "advanced.path":
      valueValidator = validatePathProgress;
      if (requireField(value, "motionPath", path, issues)) {
        validatePath(value.motionPath, [...path, "motionPath"], issues);
      }
      if ("orientToPath" in value) {
        validateBoolean(value.orientToPath, [...path, "orientToPath"], issues);
      }
      if ("anchor" in value) {
        validatePoint(value.anchor, [...path, "anchor"], issues);
        if (isRecord(value.anchor)) {
          validateFiniteNumber(
            value.anchor.x,
            [...path, "anchor", "x"],
            issues,
            { min: 0, max: 1 },
          );
          validateFiniteNumber(
            value.anchor.y,
            [...path, "anchor", "y"],
            issues,
            { min: 0, max: 1 },
          );
        }
      }
      break;
  }
  if (requireField(value, "keyframes", path, issues)) {
    validateKeyframes(
      value.keyframes,
      [...path, "keyframes"],
      issues,
      valueValidator,
    );
  }
};

const validateTarget: ValueValidator = (value, path, issues) => {
  if (!validateObject(value, path, issues)) {
    return;
  }
  if (!requireField(value, "type", path, issues)) {
    return;
  }
  if (value.type === "element") {
    validateKnownKeys(value, ["type", "elementId"], path, issues);
    if (requireField(value, "elementId", path, issues)) {
      validateString(value.elementId, [...path, "elementId"], issues);
    }
  } else if (value.type === "group") {
    validateKnownKeys(value, ["type", "groupId"], path, issues);
    if (requireField(value, "groupId", path, issues)) {
      validateString(value.groupId, [...path, "groupId"], issues);
    }
  } else if (value.type === "camera") {
    validateKnownKeys(value, ["type", "cameraId"], path, issues);
    if (
      requireField(value, "cameraId", path, issues) &&
      value.cameraId !== "main"
    ) {
      addIssue(
        issues,
        "invalid_value",
        [...path, "cameraId"],
        'Expected cameraId "main".',
      );
    }
  } else if (value.type === "transition") {
    validateKnownKeys(
      value,
      [
        "type",
        "transitionId",
        "layerId",
        "fromSceneId",
        "toSceneId",
        "effect",
        "direction",
        "role",
      ],
      path,
      issues,
    );
    for (const key of [
      "transitionId",
      "layerId",
      "fromSceneId",
      "toSceneId",
    ] as const) {
      if (requireField(value, key, path, issues)) {
        validateString(value[key], [...path, key], issues);
      }
    }
    if (requireField(value, "effect", path, issues)) {
      validateEnum(
        value.effect,
        new Set([
          "camera",
          "color-wipe",
          "directional-wipe",
          "fade-through-color",
          "push",
          "iris",
        ]),
        [...path, "effect"],
        issues,
      );
    }
    validateOptionalEnum(
      value,
      "direction",
      new Set(["left", "right", "up", "down"]),
      path,
      issues,
    );
    validateOptionalEnum(
      value,
      "role",
      new Set(["exit", "bridge", "enter"]),
      path,
      issues,
    );
  } else {
    addIssue(
      issues,
      "invalid_value",
      [...path, "type"],
      'Expected target type "element", "group", "camera", or "transition".',
    );
  }
};

const validateGroupMember: ValueValidator = (value, path, issues) => {
  if (!validateObject(value, path, issues)) {
    return;
  }
  if (!requireField(value, "type", path, issues)) {
    return;
  }
  if (value.type === "element") {
    validateKnownKeys(value, ["type", "elementId", "role"], path, issues);
    if (requireField(value, "elementId", path, issues)) {
      validateString(value.elementId, [...path, "elementId"], issues);
    }
  } else if (value.type === "group") {
    validateKnownKeys(value, ["type", "groupId", "role"], path, issues);
    if (requireField(value, "groupId", path, issues)) {
      validateString(value.groupId, [...path, "groupId"], issues);
    }
  } else {
    addIssue(
      issues,
      "invalid_value",
      [...path, "type"],
      'Expected member type "element" or "group".',
    );
  }
  validateOptionalString(value, "role", path, issues);
};

const validateGroup: ValueValidator = (value, path, issues) => {
  if (!validateObject(value, path, issues)) {
    return;
  }
  validateKnownKeys(
    value,
    ["id", "name", "description", "members"],
    path,
    issues,
  );
  if (requireField(value, "id", path, issues)) {
    validateString(value.id, [...path, "id"], issues);
  }
  validateOptionalString(value, "name", path, issues);
  validateOptionalString(value, "description", path, issues);
  if (requireField(value, "members", path, issues)) {
    if (!Array.isArray(value.members)) {
      addIssue(
        issues,
        "invalid_type",
        [...path, "members"],
        "Expected an array of group members.",
      );
    } else {
      if (value.members.length === 0) {
        addIssue(
          issues,
          "invalid_value",
          [...path, "members"],
          "A group must contain at least one member.",
        );
      }
      const memberRefs = new Set<string>();
      value.members.forEach((member, index) => {
        validateGroupMember(member, [...path, "members", index], issues);
        if (isRecord(member)) {
          const ref =
            member.type === "element" && typeof member.elementId === "string"
              ? `element:${member.elementId}`
              : member.type === "group" && typeof member.groupId === "string"
              ? `group:${member.groupId}`
              : null;
          if (ref && memberRefs.has(ref)) {
            addIssue(
              issues,
              "duplicate_id",
              [...path, "members", index],
              `Duplicate group member ${ref}.`,
            );
          }
          if (ref) {
            memberRefs.add(ref);
          }
        }
      });
    }
  }
};

const validateGroupOptions: ValueValidator = (value, path, issues) => {
  if (!validateObject(value, path, issues)) {
    return;
  }
  if (!requireField(value, "mode", path, issues)) {
    return;
  }
  if (value.mode === "together") {
    validateKnownKeys(value, ["mode"], path, issues);
  } else if (value.mode === "stagger") {
    validateKnownKeys(
      value,
      ["mode", "eachMs", "order", "seed", "roleOrder"],
      path,
      issues,
    );
    if (requireField(value, "eachMs", path, issues)) {
      validateFiniteNumber(value.eachMs, [...path, "eachMs"], issues, {
        min: 0,
      });
    }
    validateOptionalEnum(
      value,
      "order",
      new Set(["forward", "reverse", "random", "by-role"]),
      path,
      issues,
    );
    validateOptionalNumber(value, "seed", path, issues, { integer: true });
    if ("roleOrder" in value) {
      if (!Array.isArray(value.roleOrder)) {
        addIssue(
          issues,
          "invalid_type",
          [...path, "roleOrder"],
          "Expected an array of role names.",
        );
      } else {
        value.roleOrder.forEach((role, index) =>
          validateString(role, [...path, "roleOrder", index], issues),
        );
      }
    }
    if (value.order === "random" && !("seed" in value)) {
      addIssue(
        issues,
        "missing_field",
        [...path, "seed"],
        "Random stagger order requires a deterministic seed.",
      );
    }
    if (value.order === "by-role" && !("roleOrder" in value)) {
      addIssue(
        issues,
        "missing_field",
        [...path, "roleOrder"],
        "by-role stagger order requires roleOrder.",
      );
    }
  } else {
    addIssue(
      issues,
      "invalid_value",
      [...path, "mode"],
      'Expected group mode "together" or "stagger".',
    );
  }
};

const presetNamesByCategory = {
  entrance: new Set(["fade-in", "slide-in", "scale-in", "pop-in"]),
  exit: new Set(["fade-out", "slide-out", "scale-out", "pop-out"]),
  emphasis: new Set(["pulse", "shake", "bounce", "highlight"]),
  motion: new Set(["move-to", "follow-path", "orbit"]),
  data: new Set(["count-up", "progress", "reveal"]),
} as const;

const presetSpecificKeys: Record<string, string[]> = {
  "fade-in": ["fromOpacity"],
  "slide-in": ["direction", "distance"],
  "scale-in": ["fromScale"],
  "pop-in": ["fromScale", "overshoot"],
  "fade-out": ["toOpacity"],
  "slide-out": ["direction", "distance"],
  "scale-out": ["toScale"],
  "pop-out": ["toScale", "overshoot"],
  pulse: ["scale", "count"],
  shake: ["distance", "count", "axis"],
  bounce: ["distance", "count"],
  highlight: ["color", "count"],
  "move-to": ["to", "from"],
  "follow-path": ["path", "orientToPath"],
  orbit: ["center", "radius", "turns", "clockwise"],
  "count-up": ["from", "to", "format"],
  progress: ["from", "to", "min", "max"],
  reveal: ["direction"],
};

const validatePreset: ValueValidator = (value, path, issues) => {
  if (!validateObject(value, path, issues)) {
    return;
  }
  const commonKeys = [
    "id",
    "category",
    "name",
    "atMs",
    "durationMs",
    "easing",
    "fill",
  ];
  const category = value.category;
  const name = value.name;
  const specificKeys =
    typeof name === "string" ? presetSpecificKeys[name] ?? [] : [];
  validateKnownKeys(value, [...commonKeys, ...specificKeys], path, issues);
  validateOptionalString(value, "id", path, issues);
  if (requireField(value, "category", path, issues)) {
    validateEnum(
      category,
      new Set(Object.keys(presetNamesByCategory)),
      [...path, "category"],
      issues,
    );
  }
  if (requireField(value, "name", path, issues)) {
    validateString(name, [...path, "name"], issues);
    if (
      typeof category === "string" &&
      category in presetNamesByCategory &&
      !presetNamesByCategory[
        category as keyof typeof presetNamesByCategory
      ].has(name as never)
    ) {
      addIssue(
        issues,
        "invalid_value",
        [...path, "name"],
        `Preset "${String(name)}" is not valid for category "${category}".`,
      );
    }
  }
  if (requireField(value, "atMs", path, issues)) {
    validateFiniteNumber(value.atMs, [...path, "atMs"], issues, { min: 0 });
  }
  if (requireField(value, "durationMs", path, issues)) {
    validateFiniteNumber(value.durationMs, [...path, "durationMs"], issues, {
      min: 0,
      exclusiveMin: true,
    });
  }
  validateOptionalEasing(value, path, issues);
  validateOptionalEnum(value, "fill", fillModes, path, issues);

  switch (name) {
    case "fade-in":
      validateOptionalNumber(value, "fromOpacity", path, issues, {
        min: 0,
        max: 1,
      });
      break;
    case "fade-out":
      validateOptionalNumber(value, "toOpacity", path, issues, {
        min: 0,
        max: 1,
      });
      break;
    case "slide-in":
    case "slide-out":
      if (requireField(value, "direction", path, issues)) {
        validateEnum(
          value.direction,
          new Set(["left", "right", "up", "down"]),
          [...path, "direction"],
          issues,
        );
      }
      validateOptionalNumber(value, "distance", path, issues, { min: 0 });
      break;
    case "scale-in":
      validateOptionalNumber(value, "fromScale", path, issues, { min: 0 });
      break;
    case "pop-in":
      validateOptionalNumber(value, "fromScale", path, issues, { min: 0 });
      validateOptionalNumber(value, "overshoot", path, issues, { min: 0 });
      break;
    case "scale-out":
      validateOptionalNumber(value, "toScale", path, issues, { min: 0 });
      break;
    case "pop-out":
      validateOptionalNumber(value, "toScale", path, issues, { min: 0 });
      validateOptionalNumber(value, "overshoot", path, issues, { min: 0 });
      break;
    case "pulse":
      validateOptionalNumber(value, "scale", path, issues, { min: 0 });
      validateOptionalNumber(value, "count", path, issues, {
        min: 1,
        integer: true,
      });
      break;
    case "shake":
      validateOptionalNumber(value, "distance", path, issues, { min: 0 });
      validateOptionalNumber(value, "count", path, issues, {
        min: 1,
        integer: true,
      });
      validateOptionalEnum(
        value,
        "axis",
        new Set(["x", "y", "both"]),
        path,
        issues,
      );
      break;
    case "bounce":
      validateOptionalNumber(value, "distance", path, issues, { min: 0 });
      validateOptionalNumber(value, "count", path, issues, {
        min: 1,
        integer: true,
      });
      break;
    case "highlight":
      if (requireField(value, "color", path, issues)) {
        validateColor(value.color, [...path, "color"], issues);
      }
      validateOptionalNumber(value, "count", path, issues, {
        min: 1,
        integer: true,
      });
      break;
    case "move-to":
      if (requireField(value, "to", path, issues)) {
        validatePoint(value.to, [...path, "to"], issues);
      }
      if ("from" in value) {
        validatePoint(value.from, [...path, "from"], issues);
      }
      break;
    case "follow-path":
      if (requireField(value, "path", path, issues)) {
        validatePath(value.path, [...path, "path"], issues);
      }
      if ("orientToPath" in value) {
        validateBoolean(value.orientToPath, [...path, "orientToPath"], issues);
      }
      break;
    case "orbit":
      if (requireField(value, "center", path, issues)) {
        validatePoint(value.center, [...path, "center"], issues);
      }
      if (requireField(value, "radius", path, issues)) {
        validateFiniteNumber(value.radius, [...path, "radius"], issues, {
          min: 0,
        });
      }
      validateOptionalNumber(value, "turns", path, issues);
      if ("clockwise" in value) {
        validateBoolean(value.clockwise, [...path, "clockwise"], issues);
      }
      break;
    case "count-up":
      for (const key of ["from", "to"] as const) {
        if (requireField(value, key, path, issues)) {
          validateFiniteNumber(value[key], [...path, key], issues);
        }
      }
      if ("format" in value) {
        validateDataNumberFormat(value.format, [...path, "format"], issues);
      }
      break;
    case "progress":
      if (requireField(value, "to", path, issues)) {
        validateFiniteNumber(value.to, [...path, "to"], issues);
      }
      validateOptionalNumber(value, "from", path, issues);
      validateOptionalNumber(value, "min", path, issues);
      validateOptionalNumber(value, "max", path, issues);
      if (
        typeof value.min === "number" &&
        typeof value.max === "number" &&
        value.min >= value.max
      ) {
        addIssue(
          issues,
          "invalid_value",
          [...path, "max"],
          "max must be greater than min.",
        );
      }
      break;
    case "reveal":
      validateOptionalEnum(
        value,
        "direction",
        new Set(["left-to-right", "right-to-left", "top-to-bottom"]),
        path,
        issues,
      );
      break;
  }
};

const validateDataNumberFormat: ValueValidator = (value, path, issues) => {
  if (!validateObject(value, path, issues)) {
    return;
  }
  validateKnownKeys(
    value,
    ["decimals", "prefix", "suffix", "useGrouping"],
    path,
    issues,
  );
  validateOptionalNumber(value, "decimals", path, issues, {
    min: 0,
    max: 20,
    integer: true,
  });
  validateOptionalString(value, "prefix", path, issues);
  validateOptionalString(value, "suffix", path, issues);
  if ("useGrouping" in value) {
    validateBoolean(value.useGrouping, [...path, "useGrouping"], issues);
  }
};

const validateIterationCount = (
  value: unknown,
  path: AnimationSchemaPath,
  issues: IssueCollector,
) => {
  if (value === "infinite") {
    return;
  }
  validateFiniteNumber(value, path, issues, { min: 1, integer: true });
};

const loopSpecificKeys: Record<string, string[]> = {
  pulse: ["fromScale", "toScale", "fromOpacity", "toOpacity"],
  blink: ["minOpacity", "maxOpacity", "dutyCycle"],
  rotate: ["fromDegrees", "toDegrees", "clockwise"],
};

const validateLoop: ValueValidator = (value, path, issues) => {
  if (!validateObject(value, path, issues)) {
    return;
  }
  const type = value.type;
  const commonKeys = [
    "id",
    "type",
    "atMs",
    "durationMs",
    "iterations",
    "direction",
    "delayMs",
    "easing",
  ];
  validateKnownKeys(
    value,
    [
      ...commonKeys,
      ...(typeof type === "string" ? loopSpecificKeys[type] ?? [] : []),
    ],
    path,
    issues,
  );
  validateOptionalString(value, "id", path, issues);
  if (requireField(value, "type", path, issues)) {
    validateEnum(
      value.type,
      new Set(["pulse", "blink", "rotate"]),
      [...path, "type"],
      issues,
    );
  }
  validateOptionalNumber(value, "atMs", path, issues, { min: 0 });
  if (requireField(value, "durationMs", path, issues)) {
    validateFiniteNumber(value.durationMs, [...path, "durationMs"], issues, {
      min: 0,
      exclusiveMin: true,
    });
  }
  if (requireField(value, "iterations", path, issues)) {
    validateIterationCount(value.iterations, [...path, "iterations"], issues);
  }
  validateOptionalEnum(value, "direction", directions, path, issues);
  validateOptionalNumber(value, "delayMs", path, issues, { min: 0 });
  validateOptionalEasing(value, path, issues);

  if (type === "pulse") {
    for (const key of ["fromScale", "toScale"] as const) {
      validateOptionalNumber(value, key, path, issues, { min: 0 });
    }
    for (const key of ["fromOpacity", "toOpacity"] as const) {
      validateOptionalNumber(value, key, path, issues, { min: 0, max: 1 });
    }
  } else if (type === "blink") {
    for (const key of ["minOpacity", "maxOpacity", "dutyCycle"] as const) {
      validateOptionalNumber(value, key, path, issues, { min: 0, max: 1 });
    }
    if (
      typeof value.minOpacity === "number" &&
      typeof value.maxOpacity === "number" &&
      value.minOpacity > value.maxOpacity
    ) {
      addIssue(
        issues,
        "invalid_value",
        [...path, "maxOpacity"],
        "maxOpacity must be greater than or equal to minOpacity.",
      );
    }
  } else if (type === "rotate") {
    validateOptionalNumber(value, "fromDegrees", path, issues);
    validateOptionalNumber(value, "toDegrees", path, issues);
    if ("clockwise" in value) {
      validateBoolean(value.clockwise, [...path, "clockwise"], issues);
    }
  }
};

const validateArray = (
  value: unknown,
  path: AnimationSchemaPath,
  issues: IssueCollector,
  itemValidator: ValueValidator,
) => {
  if (!Array.isArray(value)) {
    addIssue(issues, "invalid_type", path, "Expected an array.");
    return;
  }
  value.forEach((item, index) => itemValidator(item, [...path, index], issues));
};

const validateTrack: ValueValidator = (value, path, issues) => {
  if (!validateObject(value, path, issues)) {
    return;
  }
  validateKnownKeys(
    value,
    [
      "id",
      "target",
      "sceneId",
      "name",
      "description",
      "enabled",
      "priority",
      "startMs",
      "durationMs",
      "fill",
      "properties",
      "presets",
      "loops",
      "group",
    ],
    path,
    issues,
  );
  if (requireField(value, "id", path, issues)) {
    validateString(value.id, [...path, "id"], issues);
  }
  if (requireField(value, "target", path, issues)) {
    validateTarget(value.target, [...path, "target"], issues);
  }
  validateOptionalString(value, "sceneId", path, issues);
  validateOptionalString(value, "name", path, issues);
  validateOptionalString(value, "description", path, issues);
  if ("enabled" in value) {
    validateBoolean(value.enabled, [...path, "enabled"], issues);
  }
  validateOptionalNumber(value, "priority", path, issues, { integer: true });
  validateOptionalNumber(value, "startMs", path, issues, { min: 0 });
  validateOptionalNumber(value, "durationMs", path, issues, {
    min: 0,
    exclusiveMin: true,
  });
  validateOptionalEnum(value, "fill", fillModes, path, issues);
  if ("properties" in value) {
    validateArray(
      value.properties,
      [...path, "properties"],
      issues,
      validateProperty,
    );
    if (Array.isArray(value.properties) && isRecord(value.target)) {
      const target = value.target;
      value.properties.forEach((property, index) => {
        if (!isRecord(property) || typeof property.property !== "string") {
          return;
        }
        const isCameraProperty = cameraPropertyNames.has(property.property);
        const isTransitionProperty = transitionPropertyNames.has(
          property.property,
        );
        if (target.type === "camera" && !isCameraProperty) {
          addIssue(
            issues,
            "invalid_value",
            [...path, "properties", index, "property"],
            "Camera tracks only support camera position and zoom properties.",
          );
        } else if (target.type === "transition" && !isTransitionProperty) {
          addIssue(
            issues,
            "invalid_value",
            [...path, "properties", index, "property"],
            "Transition tracks only support transition properties.",
          );
        } else if (target.type !== "camera" && isCameraProperty) {
          addIssue(
            issues,
            "invalid_value",
            [...path, "properties", index, "property"],
            "Camera properties require a camera target.",
          );
        } else if (target.type !== "transition" && isTransitionProperty) {
          addIssue(
            issues,
            "invalid_value",
            [...path, "properties", index, "property"],
            "Transition properties require a transition target.",
          );
        }
      });
    }
  }
  if ("presets" in value) {
    validateArray(value.presets, [...path, "presets"], issues, validatePreset);
  }
  if ("loops" in value) {
    validateArray(value.loops, [...path, "loops"], issues, validateLoop);
  }
  if (
    isRecord(value.target) &&
    value.target.type === "camera" &&
    ((Array.isArray(value.presets) && value.presets.length > 0) ||
      (Array.isArray(value.loops) && value.loops.length > 0))
  ) {
    addIssue(
      issues,
      "invalid_value",
      path,
      "Camera tracks do not support element presets or loops.",
    );
  }
  if ("group" in value) {
    validateGroupOptions(value.group, [...path, "group"], issues);
    if (!isRecord(value.target) || value.target.type !== "group") {
      addIssue(
        issues,
        "invalid_value",
        [...path, "group"],
        "Group animation options are only valid for a group target.",
      );
    }
  }

  if (Array.isArray(value.properties)) {
    validateUniqueField(
      value.properties,
      "property",
      [...path, "properties"],
      issues,
      "Duplicate property in one track",
    );
    validateOptionalIds(value.properties, [...path, "properties"], issues);
  }
  if (Array.isArray(value.presets)) {
    validateOptionalIds(value.presets, [...path, "presets"], issues);
  }
  if (Array.isArray(value.loops)) {
    validateOptionalIds(value.loops, [...path, "loops"], issues);
  }
};

const validateUniqueField = (
  values: unknown[],
  field: string,
  path: AnimationSchemaPath,
  issues: IssueCollector,
  label: string,
) => {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (!isRecord(value) || typeof value[field] !== "string") {
      return;
    }
    const fieldValue = value[field] as string;
    if (seen.has(fieldValue)) {
      addIssue(
        issues,
        "duplicate_id",
        [...path, index, field],
        `${label}: "${fieldValue}".`,
      );
    }
    seen.add(fieldValue);
  });
};

const validateOptionalIds = (
  values: unknown[],
  path: AnimationSchemaPath,
  issues: IssueCollector,
) => {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (!isRecord(value) || typeof value.id !== "string") {
      return;
    }
    if (seen.has(value.id)) {
      addIssue(
        issues,
        "duplicate_id",
        [...path, index, "id"],
        `Duplicate id "${value.id}" in this track collection.`,
      );
    }
    seen.add(value.id);
  });
};

const validatePlayback: ValueValidator = (value, path, issues) => {
  if (!validateObject(value, path, issues)) {
    return;
  }
  validateKnownKeys(
    value,
    ["autoplay", "rate", "direction", "iterations"],
    path,
    issues,
  );
  if ("autoplay" in value) {
    validateBoolean(value.autoplay, [...path, "autoplay"], issues);
  }
  validateOptionalNumber(value, "rate", path, issues, {
    min: 0,
    exclusiveMin: true,
  });
  validateOptionalEnum(value, "direction", directions, path, issues);
  if ("iterations" in value) {
    validateIterationCount(value.iterations, [...path, "iterations"], issues);
  }
};

const validateMetadata: ValueValidator = (value, path, issues) => {
  if (!validateObject(value, path, issues)) {
    return;
  }
  validateKnownKeys(
    value,
    [
      "title",
      "description",
      "author",
      "createdAt",
      "updatedAt",
      "tags",
      "source",
      "prompt",
    ],
    path,
    issues,
  );
  for (const key of [
    "title",
    "description",
    "author",
    "createdAt",
    "updatedAt",
    "prompt",
  ]) {
    validateOptionalString(value, key, path, issues);
  }
  validateOptionalEnum(
    value,
    "source",
    new Set(["ai", "user", "imported", "mixed"]),
    path,
    issues,
  );
  if ("tags" in value) {
    if (!Array.isArray(value.tags)) {
      addIssue(
        issues,
        "invalid_type",
        [...path, "tags"],
        "Expected an array of tags.",
      );
    } else {
      value.tags.forEach((tag, index) =>
        validateString(tag, [...path, "tags", index], issues),
      );
    }
  }
};

const validateScene: ValueValidator = (value, path, issues) => {
  if (!validateObject(value, path, issues)) {
    return;
  }
  validateKnownKeys(
    value,
    ["id", "name", "description", "startMs", "durationMs"],
    path,
    issues,
  );
  if (requireField(value, "id", path, issues)) {
    validateString(value.id, [...path, "id"], issues);
  }
  validateOptionalString(value, "name", path, issues);
  validateOptionalString(value, "description", path, issues);
  if (requireField(value, "startMs", path, issues)) {
    validateFiniteNumber(value.startMs, [...path, "startMs"], issues, {
      min: 0,
    });
  }
  if (requireField(value, "durationMs", path, issues)) {
    validateFiniteNumber(value.durationMs, [...path, "durationMs"], issues, {
      min: 0,
      exclusiveMin: true,
    });
  }
};

const validateProject: ValueValidator = (value, path, issues) => {
  if (!validateObject(value, path, issues)) {
    return;
  }
  validateKnownKeys(
    value,
    [
      "schemaVersion",
      "id",
      "durationMs",
      "frameRate",
      "playback",
      "metadata",
      "scenes",
      "groups",
      "tracks",
    ],
    path,
    issues,
  );
  if (requireField(value, "schemaVersion", path, issues)) {
    if (value.schemaVersion !== ANIMATION_SCHEMA_VERSION) {
      addIssue(
        issues,
        "invalid_value",
        [...path, "schemaVersion"],
        `Expected schemaVersion "${ANIMATION_SCHEMA_VERSION}".`,
      );
    }
  }
  if (requireField(value, "id", path, issues)) {
    validateString(value.id, [...path, "id"], issues);
  }
  if (requireField(value, "durationMs", path, issues)) {
    validateFiniteNumber(value.durationMs, [...path, "durationMs"], issues, {
      min: 0,
      exclusiveMin: true,
    });
  }
  if (requireField(value, "frameRate", path, issues)) {
    validateFiniteNumber(value.frameRate, [...path, "frameRate"], issues, {
      min: 1,
      max: 240,
      integer: true,
    });
  }
  if ("playback" in value) {
    validatePlayback(value.playback, [...path, "playback"], issues);
  }
  if ("metadata" in value) {
    validateMetadata(value.metadata, [...path, "metadata"], issues);
  }
  if ("scenes" in value) {
    validateArray(value.scenes, [...path, "scenes"], issues, validateScene);
  }
  if ("groups" in value) {
    validateArray(value.groups, [...path, "groups"], issues, validateGroup);
  }
  if (requireField(value, "tracks", path, issues)) {
    validateArray(value.tracks, [...path, "tracks"], issues, validateTrack);
  }

  if (Array.isArray(value.groups)) {
    validateUniqueField(
      value.groups,
      "id",
      [...path, "groups"],
      issues,
      "Duplicate group id",
    );
  }
  if (Array.isArray(value.scenes)) {
    validateUniqueField(
      value.scenes,
      "id",
      [...path, "scenes"],
      issues,
      "Duplicate scene id",
    );
  }
  if (Array.isArray(value.tracks)) {
    validateUniqueField(
      value.tracks,
      "id",
      [...path, "tracks"],
      issues,
      "Duplicate track id",
    );
  }

  validateProjectReferencesAndTiming(value, path, issues);
};

const validateProjectReferencesAndTiming = (
  value: Record<string, unknown>,
  path: AnimationSchemaPath,
  issues: IssueCollector,
) => {
  const groups = Array.isArray(value.groups)
    ? value.groups.filter(isRecord)
    : [];
  const tracks = Array.isArray(value.tracks)
    ? value.tracks.filter(isRecord)
    : [];
  const groupIds = new Set(
    groups
      .map((group) => group.id)
      .filter((id): id is string => typeof id === "string"),
  );
  const scenes = Array.isArray(value.scenes)
    ? value.scenes.filter(isRecord)
    : [];
  const sceneById = new Map(
    scenes
      .filter((scene) => typeof scene.id === "string")
      .map((scene) => [scene.id as string, scene]),
  );
  const projectDuration =
    typeof value.durationMs === "number" && Number.isFinite(value.durationMs)
      ? value.durationMs
      : null;
  const cameraTracks = tracks.filter(
    (track) => isRecord(track.target) && track.target.type === "camera",
  );
  if (cameraTracks.length > 1) {
    cameraTracks.slice(1).forEach((track) => {
      const trackIndex = tracks.indexOf(track);
      addIssue(
        issues,
        "duplicate_id",
        [...path, "tracks", trackIndex, "target", "cameraId"],
        "Only one main camera track is supported.",
      );
    });
  }

  scenes.forEach((scene, sceneIndex) => {
    if (
      projectDuration !== null &&
      typeof scene.startMs === "number" &&
      typeof scene.durationMs === "number" &&
      scene.startMs + scene.durationMs > projectDuration
    ) {
      addIssue(
        issues,
        "out_of_bounds",
        [...path, "scenes", sceneIndex],
        `Scene ends at ${
          scene.startMs + scene.durationMs
        }ms, after project duration ${projectDuration}ms.`,
      );
    }
  });

  groups.forEach((group, groupIndex) => {
    if (!Array.isArray(group.members)) {
      return;
    }
    group.members.forEach((member, memberIndex) => {
      if (
        isRecord(member) &&
        member.type === "group" &&
        typeof member.groupId === "string" &&
        !groupIds.has(member.groupId)
      ) {
        addIssue(
          issues,
          "invalid_reference",
          [...path, "groups", groupIndex, "members", memberIndex, "groupId"],
          `Unknown group "${member.groupId}".`,
        );
      }
    });
  });

  detectGroupCycles(groups, path, issues);

  tracks.forEach((track, trackIndex) => {
    if (
      isRecord(track.target) &&
      track.target.type === "group" &&
      typeof track.target.groupId === "string" &&
      !groupIds.has(track.target.groupId)
    ) {
      addIssue(
        issues,
        "invalid_reference",
        [...path, "tracks", trackIndex, "target", "groupId"],
        `Unknown group "${track.target.groupId}".`,
      );
    }
    if (isRecord(track.target) && track.target.type === "transition") {
      for (const key of ["fromSceneId", "toSceneId"] as const) {
        const referencedSceneId = track.target[key];
        if (
          typeof referencedSceneId === "string" &&
          !sceneById.has(referencedSceneId)
        ) {
          addIssue(
            issues,
            "invalid_reference",
            [...path, "tracks", trackIndex, "target", key],
            `Unknown scene "${referencedSceneId}".`,
          );
        }
      }
    }
    const sceneId = typeof track.sceneId === "string" ? track.sceneId : null;
    const scene = sceneId ? sceneById.get(sceneId) : undefined;
    if (sceneId && !scene) {
      addIssue(
        issues,
        "invalid_reference",
        [...path, "tracks", trackIndex, "sceneId"],
        `Unknown scene "${sceneId}".`,
      );
    }
    validateTrackTiming(
      track,
      [...path, "tracks", trackIndex],
      projectDuration,
      issues,
      scene,
    );
  });
};

const detectGroupCycles = (
  groups: Record<string, unknown>[],
  path: AnimationSchemaPath,
  issues: IssueCollector,
) => {
  const edges = new Map<string, string[]>();
  const indexById = new Map<string, number>();
  groups.forEach((group, index) => {
    if (typeof group.id !== "string") {
      return;
    }
    indexById.set(group.id, index);
    const children = Array.isArray(group.members)
      ? group.members
          .filter(
            (member): member is Record<string, unknown> =>
              isRecord(member) &&
              member.type === "group" &&
              typeof member.groupId === "string",
          )
          .map((member) => member.groupId as string)
      : [];
    edges.set(group.id, children);
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, ancestry: string[]) => {
    if (visiting.has(id)) {
      const index = indexById.get(id);
      addIssue(
        issues,
        "cyclic_group",
        index === undefined ? [...path, "groups"] : [...path, "groups", index],
        `Cyclic group reference: ${[...ancestry, id].join(" -> ")}.`,
      );
      return;
    }
    if (visited.has(id)) {
      return;
    }
    visiting.add(id);
    for (const child of edges.get(id) ?? []) {
      visit(child, [...ancestry, id]);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of edges.keys()) {
    visit(id, []);
  }
};

const validateTrackTiming = (
  track: Record<string, unknown>,
  path: AnimationSchemaPath,
  projectDuration: number | null,
  issues: IssueCollector,
  scene?: Record<string, unknown>,
) => {
  const startMs = typeof track.startMs === "number" ? track.startMs : 0;
  const trackDuration =
    typeof track.durationMs === "number" ? track.durationMs : null;
  let maxLocalEnd = 0;

  if (Array.isArray(track.properties)) {
    track.properties.forEach((property) => {
      if (!isRecord(property) || !Array.isArray(property.keyframes)) {
        return;
      }
      for (const keyframe of property.keyframes) {
        if (isRecord(keyframe) && typeof keyframe.atMs === "number") {
          maxLocalEnd = Math.max(maxLocalEnd, keyframe.atMs);
        }
      }
    });
  }
  if (Array.isArray(track.presets)) {
    track.presets.forEach((preset) => {
      if (
        isRecord(preset) &&
        typeof preset.atMs === "number" &&
        typeof preset.durationMs === "number"
      ) {
        maxLocalEnd = Math.max(maxLocalEnd, preset.atMs + preset.durationMs);
      }
    });
  }
  if (Array.isArray(track.loops)) {
    track.loops.forEach((loop) => {
      if (!isRecord(loop) || typeof loop.durationMs !== "number") {
        return;
      }
      const loopStart = typeof loop.atMs === "number" ? loop.atMs : 0;
      const delay = typeof loop.delayMs === "number" ? loop.delayMs : 0;
      if (typeof loop.iterations === "number") {
        maxLocalEnd = Math.max(
          maxLocalEnd,
          loopStart + (loop.durationMs + delay) * loop.iterations,
        );
      }
    });
  }

  if (trackDuration !== null && maxLocalEnd > trackDuration) {
    addIssue(
      issues,
      "out_of_bounds",
      [...path, "durationMs"],
      `Track content ends at ${maxLocalEnd}ms, after durationMs ${trackDuration}.`,
    );
  }
  const sceneStart = typeof scene?.startMs === "number" ? scene.startMs : 0;
  const sceneDuration =
    typeof scene?.durationMs === "number" ? scene.durationMs : null;
  const localEnd = startMs + (trackDuration ?? maxLocalEnd);
  if (sceneDuration !== null && localEnd > sceneDuration) {
    addIssue(
      issues,
      "out_of_bounds",
      path,
      `Track ends at ${localEnd}ms, after scene duration ${sceneDuration}ms.`,
    );
  }
  const effectiveEnd = sceneStart + localEnd;
  if (projectDuration !== null && effectiveEnd > projectDuration) {
    addIssue(
      issues,
      "out_of_bounds",
      path,
      `Track ends at ${effectiveEnd}ms, after project duration ${projectDuration}ms.`,
    );
  }
};

export const animationEasingSchema =
  createSchema<AnimationEasing>(validateEasing);

export const animationPathSchema = createSchema<AnimationPath>(validatePath);

export const animationShadowSchema =
  createSchema<AnimationShadow>(validateShadow);

export const animationPropertySchema =
  createSchema<AnimationProperty>(validateProperty);

export const animationPresetSchema =
  createSchema<AnimationPreset>(validatePreset);

export const loopAnimationSchema = createSchema<LoopAnimation>(validateLoop);

export const animationGroupSchema = createSchema<AnimationGroup>(validateGroup);

export const animationSceneSchema = createSchema<AnimationScene>(validateScene);

export const groupAnimationOptionsSchema =
  createSchema<GroupAnimationOptions>(validateGroupOptions);

export const animationTrackSchema = createSchema<AnimationTrack>(validateTrack);

export const animationProjectSchema =
  createSchema<AnimationProject>(validateProject);

export const parseAnimationProject = (input: unknown): AnimationProject =>
  animationProjectSchema.parse(input);

export const safeParseAnimationProject = (
  input: unknown,
): AnimationSchemaResult<AnimationProject> =>
  animationProjectSchema.safeParse(input);

/** Type-only assertions used by downstream compiler implementations. */
export type { AnimationEasing, AnimationFillMode, AnimationIterationCount };
