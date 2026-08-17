import { isStateAnimationProperty } from "../types";

import type {
  AnimationEasing,
  AnimationKeyframe,
  AnimationFillStyle,
  AnimationProject,
  AnimationProperty,
  AnimationTrack,
  AnimationValueByProperty,
  ColorAnimationPropertyName,
  ElementVisibility,
  NumericAnimationPropertyName,
} from "../types";

export const EDITABLE_ANIMATION_PROPERTIES = [
  "transform.x",
  "transform.y",
  "transform.scale",
  "transform.rotate",
  "visual.opacity",
  "visual.backgroundColor",
  "visual.fillStyle",
  "visual.strokeColor",
  "visual.strokeWidth",
  "visual.strokeStyle",
  "visual.roughness",
  "visual.roundness",
  "text.fontSize",
  "text.fontFamily",
  "text.textAlign",
  "text.verticalAlign",
  "element.visibility",
  "transition.progress",
  "transition.opacity",
  "transition.color",
  "transition.blur",
  "transition.scale",
] as const;

export const CAMERA_ANIMATION_PROPERTIES = [
  "camera.centerX",
  "camera.centerY",
  "camera.zoom",
] as const;

export const CAMERA_POSITION_PROPERTIES = [
  "camera.centerX",
  "camera.centerY",
] as const;

export type EditableAnimationPropertyName =
  typeof EDITABLE_ANIMATION_PROPERTIES[number];

export const POSITION_ANIMATION_PROPERTIES = [
  "transform.x",
  "transform.y",
] as const;

export const DEFAULT_ANIMATION_PROPERTY_VALUES: Record<
  NumericAnimationPropertyName,
  number
> = {
  "transform.x": 0,
  "transform.y": 0,
  "transform.scale": 1,
  "transform.rotate": 0,
  "camera.centerX": 0,
  "camera.centerY": 0,
  "camera.zoom": 1,
  "visual.opacity": 1,
  "visual.strokeWidth": 1,
  "visual.roughness": 1,
  "text.fontSize": 20,
  "text.fontFamily": 1,
  "advanced.drawProgress": 1,
  "advanced.blur": 0,
  "transition.progress": 0,
  "transition.opacity": 0,
  "transition.blur": 0,
  "transition.scale": 1,
};

export const getTrackContentEndMs = (track: AnimationTrack): number => {
  let endMs = 0;

  for (const property of track.properties ?? []) {
    for (const keyframe of property.keyframes) {
      endMs = Math.max(endMs, keyframe.atMs);
    }
  }

  for (const preset of track.presets ?? []) {
    endMs = Math.max(endMs, preset.atMs + preset.durationMs);
  }

  for (const loop of track.loops ?? []) {
    if (loop.iterations === "infinite") {
      endMs = Math.max(endMs, loop.atMs ?? 0, track.durationMs ?? 0);
      continue;
    }
    endMs = Math.max(
      endMs,
      (loop.atMs ?? 0) +
        (loop.durationMs + (loop.delayMs ?? 0)) * loop.iterations,
    );
  }

  return endMs;
};

export const getTrackAbsoluteStartMs = (
  project: AnimationProject,
  track: AnimationTrack,
): number =>
  (track.sceneId
    ? project.scenes?.find((scene) => scene.id === track.sceneId)?.startMs ?? 0
    : 0) + (track.startMs ?? 0);

export const getTrackKeyframeTimes = (track: AnimationTrack): number[] =>
  Array.from(
    new Set(
      (track.properties ?? []).flatMap((property) =>
        property.keyframes.map((keyframe) => keyframe.atMs),
      ),
    ),
  ).sort((a, b) => a - b);

export const getPositionKeyframeTimes = (track: AnimationTrack): number[] =>
  Array.from(
    new Set(
      (track.properties ?? [])
        .filter((property) =>
          POSITION_ANIMATION_PROPERTIES.includes(
            property.property as typeof POSITION_ANIMATION_PROPERTIES[number],
          ),
        )
        .flatMap((property) =>
          property.keyframes.map((keyframe) => keyframe.atMs),
        ),
    ),
  ).sort((a, b) => a - b);

export const getCameraPositionKeyframeTimes = (
  track: AnimationTrack,
): number[] =>
  Array.from(
    new Set(
      (track.properties ?? [])
        .filter((property) =>
          CAMERA_POSITION_PROPERTIES.includes(
            property.property as typeof CAMERA_POSITION_PROPERTIES[number],
          ),
        )
        .flatMap((property) =>
          property.keyframes.map((keyframe) => keyframe.atMs),
        ),
    ),
  ).sort((a, b) => a - b);

const updateTrack = (
  project: AnimationProject,
  trackId: string,
  update: (track: AnimationTrack) => AnimationTrack,
): AnimationProject => ({
  ...project,
  tracks: project.tracks.map((track) =>
    track.id === trackId ? update(track) : track,
  ),
});

const extendProjectToFitTracks = (
  project: AnimationProject,
): AnimationProject => ({
  ...project,
  durationMs: Math.max(
    project.durationMs,
    ...project.tracks.map(
      (track) =>
        getTrackAbsoluteStartMs(project, track) +
        (track.durationMs ?? getTrackContentEndMs(track)),
    ),
  ),
});

export const updateTrackTiming = (
  project: AnimationProject,
  trackId: string,
  timing: { startMs?: number; durationMs?: number },
): AnimationProject =>
  extendProjectToFitTracks(
    updateTrack(project, trackId, (track) => {
      const contentEndMs = getTrackContentEndMs(track);
      return {
        ...track,
        ...(timing.startMs === undefined
          ? null
          : { startMs: Math.max(0, timing.startMs) }),
        ...(timing.durationMs === undefined
          ? null
          : { durationMs: Math.max(contentEndMs, timing.durationMs) }),
      };
    }),
  );

const getKeyframeValue = (
  property: AnimationProperty | undefined,
  propertyName: NumericAnimationPropertyName,
  atMs: number,
) => {
  if (!property?.keyframes.length) {
    return DEFAULT_ANIMATION_PROPERTY_VALUES[propertyName];
  }
  const keyframes = [...property.keyframes].sort((a, b) => a.atMs - b.atMs);
  const before = [...keyframes]
    .reverse()
    .find((keyframe) => keyframe.atMs <= atMs);
  const after = keyframes.find((keyframe) => keyframe.atMs >= atMs);
  if (!before) {
    return after!.value as number;
  }
  if (!after || before.atMs === after.atMs || before.hold) {
    return before.value as number;
  }
  const progress = (atMs - before.atMs) / (after.atMs - before.atMs);
  return (
    (before.value as number) +
    ((after.value as number) - (before.value as number)) * progress
  );
};

export const getNumericPropertyValue = (
  project: AnimationProject,
  track: AnimationTrack,
  propertyName: NumericAnimationPropertyName,
  projectTimeMs: number,
): number => {
  const property = track.properties?.find(
    (candidate) => candidate.property === propertyName,
  );
  const relativeTimeMs = Math.max(
    0,
    projectTimeMs - getTrackAbsoluteStartMs(project, track),
  );
  return getKeyframeValue(property, propertyName, relativeTimeMs);
};

export const setNumericKeyframe = (
  project: AnimationProject,
  trackId: string,
  propertyName: NumericAnimationPropertyName,
  projectTimeMs: number,
  value: number,
): AnimationProject =>
  extendProjectToFitTracks(
    updateTrack(project, trackId, (track) => {
      const relativeTimeMs = Math.max(
        0,
        Math.min(
          projectTimeMs - getTrackAbsoluteStartMs(project, track),
          Math.max(
            0,
            project.durationMs - getTrackAbsoluteStartMs(project, track),
          ),
        ),
      );
      const properties = [...(track.properties ?? [])];
      const propertyIndex = properties.findIndex(
        (property) => property.property === propertyName,
      );
      const existingProperty = properties[propertyIndex];
      const keyframe: AnimationKeyframe<number> = {
        atMs: relativeTimeMs,
        value,
      };

      if (existingProperty) {
        properties[propertyIndex] = {
          ...existingProperty,
          keyframes: [
            ...existingProperty.keyframes.filter(
              (candidate) => candidate.atMs !== relativeTimeMs,
            ),
            keyframe,
          ].sort((a, b) => a.atMs - b.atMs),
        } as AnimationProperty;
      } else {
        properties.push({
          property: propertyName,
          keyframes: [keyframe],
        } as AnimationProperty);
      }

      return {
        ...track,
        durationMs: Math.max(track.durationMs ?? 0, relativeTimeMs),
        properties,
      };
    }),
  );

export const getColorPropertyValue = (
  track: AnimationTrack,
  propertyName: ColorAnimationPropertyName,
  projectTimeMs: number,
  project: AnimationProject,
  fallback: string,
): string => {
  const relativeTimeMs = Math.max(
    0,
    projectTimeMs - getTrackAbsoluteStartMs(project, track),
  );
  const keyframes = track.properties
    ?.find((property) => property.property === propertyName)
    ?.keyframes.filter(
      (keyframe): keyframe is AnimationKeyframe<string> =>
        typeof keyframe.value === "string",
    )
    .sort((left, right) => left.atMs - right.atMs);
  if (!keyframes?.length) {
    return fallback;
  }
  return (
    [...keyframes]
      .reverse()
      .find((keyframe) => keyframe.atMs <= relativeTimeMs) ?? keyframes[0]
  ).value;
};

export const setColorKeyframe = (
  project: AnimationProject,
  trackId: string,
  propertyName: ColorAnimationPropertyName,
  projectTimeMs: number,
  value: string,
): AnimationProject =>
  extendProjectToFitTracks(
    updateTrack(project, trackId, (track) => {
      const relativeTimeMs = Math.max(
        0,
        Math.min(
          projectTimeMs - getTrackAbsoluteStartMs(project, track),
          Math.max(
            0,
            project.durationMs - getTrackAbsoluteStartMs(project, track),
          ),
        ),
      );
      const properties = [...(track.properties ?? [])];
      const propertyIndex = properties.findIndex(
        (property) => property.property === propertyName,
      );
      const existingProperty = properties[propertyIndex];
      const keyframe: AnimationKeyframe<string> = {
        atMs: relativeTimeMs,
        value,
      };
      if (existingProperty) {
        properties[propertyIndex] = {
          ...existingProperty,
          keyframes: [
            ...existingProperty.keyframes.filter(
              (candidate) => candidate.atMs !== relativeTimeMs,
            ),
            keyframe,
          ].sort((left, right) => left.atMs - right.atMs),
        } as AnimationProperty;
      } else {
        properties.push({
          property: propertyName,
          keyframes: [keyframe],
        } as AnimationProperty);
      }
      return {
        ...track,
        durationMs: Math.max(track.durationMs ?? 0, relativeTimeMs),
        properties,
      };
    }),
  );

export const getFillStylePropertyValue = (
  track: AnimationTrack,
  projectTimeMs: number,
  project: AnimationProject,
  fallback: AnimationFillStyle,
): AnimationFillStyle => {
  const relativeTimeMs = Math.max(
    0,
    projectTimeMs - getTrackAbsoluteStartMs(project, track),
  );
  const keyframes = track.properties
    ?.find((property) => property.property === "visual.fillStyle")
    ?.keyframes.filter(
      (keyframe): keyframe is AnimationKeyframe<AnimationFillStyle> =>
        typeof keyframe.value === "string",
    )
    .sort((left, right) => left.atMs - right.atMs);
  if (!keyframes?.length) {
    return fallback;
  }
  return (
    [...keyframes]
      .reverse()
      .find((keyframe) => keyframe.atMs <= relativeTimeMs) ?? keyframes[0]
  ).value;
};

export const setFillStyleKeyframe = (
  project: AnimationProject,
  trackId: string,
  projectTimeMs: number,
  value: AnimationFillStyle,
): AnimationProject =>
  extendProjectToFitTracks(
    updateTrack(project, trackId, (track) => {
      const relativeTimeMs = Math.max(
        0,
        Math.min(
          projectTimeMs - getTrackAbsoluteStartMs(project, track),
          Math.max(
            0,
            project.durationMs - getTrackAbsoluteStartMs(project, track),
          ),
        ),
      );
      const properties = [...(track.properties ?? [])];
      const propertyIndex = properties.findIndex(
        (property) => property.property === "visual.fillStyle",
      );
      const existingProperty = properties[propertyIndex];
      const keyframe: AnimationKeyframe<AnimationFillStyle> = {
        atMs: relativeTimeMs,
        value,
        hold: true,
      };
      const nextProperty = {
        ...(existingProperty ?? {}),
        property: "visual.fillStyle" as const,
        keyframes: [
          ...(existingProperty?.keyframes.filter(
            (candidate) => candidate.atMs !== relativeTimeMs,
          ) ?? []),
          keyframe,
        ].sort((left, right) => left.atMs - right.atMs),
      } as AnimationProperty;
      if (propertyIndex >= 0) {
        properties[propertyIndex] = nextProperty;
      } else {
        properties.push(nextProperty);
      }
      return {
        ...track,
        durationMs: Math.max(track.durationMs ?? 0, relativeTimeMs),
        properties,
      };
    }),
  );

export const getVisibilityPropertyValue = (
  track: AnimationTrack,
  projectTimeMs: number,
  project: AnimationProject,
  fallback: ElementVisibility = "visible",
): ElementVisibility => {
  const relativeTimeMs = Math.max(
    0,
    projectTimeMs - getTrackAbsoluteStartMs(project, track),
  );
  const keyframes = track.properties
    ?.find((property) => property.property === "element.visibility")
    ?.keyframes.filter(
      (keyframe): keyframe is AnimationKeyframe<ElementVisibility> =>
        keyframe.value === "visible" || keyframe.value === "hidden",
    )
    .sort((left, right) => left.atMs - right.atMs);
  if (!keyframes?.length) {
    return fallback;
  }
  return (
    [...keyframes]
      .reverse()
      .find((keyframe) => keyframe.atMs <= relativeTimeMs) ?? keyframes[0]
  ).value;
};

export const getDiscreteStylePropertyValue = <
  TProperty extends
    | "visual.strokeStyle"
    | "visual.roughness"
    | "visual.roundness"
    | "text.fontFamily"
    | "text.textAlign"
    | "text.verticalAlign",
>(
  track: AnimationTrack,
  propertyName: TProperty,
  projectTimeMs: number,
  project: AnimationProject,
  fallback: AnimationValueByProperty[TProperty],
): AnimationValueByProperty[TProperty] => {
  const relativeTimeMs = Math.max(
    0,
    projectTimeMs - getTrackAbsoluteStartMs(project, track),
  );
  const keyframes = track.properties
    ?.find((property) => property.property === propertyName)
    ?.keyframes.slice()
    .sort((left, right) => left.atMs - right.atMs);
  const keyframe =
    [...(keyframes ?? [])]
      .reverse()
      .find((candidate) => candidate.atMs <= relativeTimeMs) ?? keyframes?.[0];
  const value = keyframe?.value ?? fallback;
  return (
    propertyName === "visual.roundness"
      ? typeof value === "number"
        ? Math.max(0, Math.min(1, value))
        : value === "round"
        ? 1
        : 0
      : value
  ) as AnimationValueByProperty[TProperty];
};

export const setDiscreteStyleKeyframe = <
  TProperty extends
    | "visual.strokeStyle"
    | "visual.roughness"
    | "visual.roundness"
    | "text.fontFamily"
    | "text.textAlign"
    | "text.verticalAlign",
>(
  project: AnimationProject,
  trackId: string,
  propertyName: TProperty,
  projectTimeMs: number,
  value: AnimationValueByProperty[TProperty],
): AnimationProject =>
  extendProjectToFitTracks(
    updateTrack(project, trackId, (track) => {
      const relativeTimeMs = Math.max(
        0,
        Math.min(
          projectTimeMs - getTrackAbsoluteStartMs(project, track),
          Math.max(
            0,
            project.durationMs - getTrackAbsoluteStartMs(project, track),
          ),
        ),
      );
      const properties = [...(track.properties ?? [])];
      const propertyIndex = properties.findIndex(
        (property) => property.property === propertyName,
      );
      const existingProperty = properties[propertyIndex];
      const nextProperty = {
        ...(existingProperty ?? {}),
        property: propertyName,
        keyframes: [
          ...(existingProperty?.keyframes.filter(
            (candidate) => candidate.atMs !== relativeTimeMs,
          ) ?? []),
          {
            atMs: relativeTimeMs,
            value,
            hold: isStateAnimationProperty(propertyName),
          },
        ].sort((left, right) => left.atMs - right.atMs),
      } as AnimationProperty;
      if (propertyIndex >= 0) {
        properties[propertyIndex] = nextProperty;
      } else {
        properties.push(nextProperty);
      }
      return {
        ...track,
        durationMs: Math.max(track.durationMs ?? 0, relativeTimeMs),
        properties,
      };
    }),
  );

export const setVisibilityKeyframe = (
  project: AnimationProject,
  trackId: string,
  projectTimeMs: number,
  value: ElementVisibility,
): AnimationProject =>
  extendProjectToFitTracks(
    updateTrack(project, trackId, (track) => {
      const relativeTimeMs = Math.max(
        0,
        Math.min(
          projectTimeMs - getTrackAbsoluteStartMs(project, track),
          Math.max(
            0,
            project.durationMs - getTrackAbsoluteStartMs(project, track),
          ),
        ),
      );
      const properties = [...(track.properties ?? [])];
      const propertyIndex = properties.findIndex(
        (property) => property.property === "element.visibility",
      );
      const existingProperty = properties[propertyIndex];
      const keyframe: AnimationKeyframe<ElementVisibility> = {
        atMs: relativeTimeMs,
        value,
        hold: true,
      };
      const nextProperty = {
        ...(existingProperty ?? {}),
        property: "element.visibility" as const,
        keyframes: [
          ...(existingProperty?.keyframes.filter(
            (candidate) => candidate.atMs !== relativeTimeMs,
          ) ?? []),
          keyframe,
        ].sort((left, right) => left.atMs - right.atMs),
      } as AnimationProperty;
      if (propertyIndex >= 0) {
        properties[propertyIndex] = nextProperty;
      } else {
        properties.push(nextProperty);
      }
      return {
        ...track,
        durationMs: Math.max(track.durationMs ?? 0, relativeTimeMs),
        properties,
      };
    }),
  );

export const removeAnimationProperty = (
  project: AnimationProject,
  trackId: string,
  propertyName: AnimationProperty["property"],
): AnimationProject =>
  updateTrack(project, trackId, (track) => ({
    ...track,
    properties: (track.properties ?? []).filter(
      (property) => property.property !== propertyName,
    ),
  }));

export const addKeyframe = (
  project: AnimationProject,
  trackId: string,
  propertyName: NumericAnimationPropertyName,
  projectTimeMs: number,
): AnimationProject => {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track) {
    return project;
  }
  return setNumericKeyframe(
    project,
    trackId,
    propertyName,
    projectTimeMs,
    getNumericPropertyValue(project, track, propertyName, projectTimeMs),
  );
};

export const addEditableKeyframe = (
  project: AnimationProject,
  trackId: string,
  propertyName: EditableAnimationPropertyName,
  projectTimeMs: number,
): AnimationProject => {
  if (
    propertyName === "visual.backgroundColor" ||
    propertyName === "visual.strokeColor" ||
    propertyName === "transition.color"
  ) {
    const track = project.tracks.find((candidate) => candidate.id === trackId);
    return track
      ? setColorKeyframe(
          project,
          trackId,
          propertyName,
          projectTimeMs,
          getColorPropertyValue(
            track,
            propertyName,
            projectTimeMs,
            project,
            propertyName === "transition.color" ? "#FFFFFFFF" : "#00000000",
          ),
        )
      : project;
  }
  if (propertyName === "visual.fillStyle") {
    const track = project.tracks.find((candidate) => candidate.id === trackId);
    return track
      ? setFillStyleKeyframe(
          project,
          trackId,
          projectTimeMs,
          getFillStylePropertyValue(track, projectTimeMs, project, "hachure"),
        )
      : project;
  }
  if (propertyName === "element.visibility") {
    const track = project.tracks.find((candidate) => candidate.id === trackId);
    return track
      ? setVisibilityKeyframe(
          project,
          trackId,
          projectTimeMs,
          getVisibilityPropertyValue(track, projectTimeMs, project),
        )
      : project;
  }
  if (
    propertyName === "visual.strokeStyle" ||
    propertyName === "visual.roundness" ||
    propertyName === "text.fontFamily" ||
    propertyName === "text.textAlign" ||
    propertyName === "text.verticalAlign"
  ) {
    const track = project.tracks.find((candidate) => candidate.id === trackId);
    const fallbackByProperty = {
      "visual.strokeStyle": "solid",
      "visual.roughness": 1,
      "visual.roundness": 0,
      "text.fontFamily": 1,
      "text.textAlign": "left",
      "text.verticalAlign": "top",
    } as const;
    return track
      ? setDiscreteStyleKeyframe(
          project,
          trackId,
          propertyName,
          projectTimeMs,
          getDiscreteStylePropertyValue(
            track,
            propertyName,
            projectTimeMs,
            project,
            fallbackByProperty[propertyName] as never,
          ) as never,
        )
      : project;
  }
  return addKeyframe(project, trackId, propertyName, projectTimeMs);
};

export const addPositionKeyframe = (
  project: AnimationProject,
  trackId: string,
  projectTimeMs: number,
): AnimationProject =>
  POSITION_ANIMATION_PROPERTIES.reduce(
    (nextProject, property) =>
      addKeyframe(nextProject, trackId, property, projectTimeMs),
    project,
  );

export const deleteKeyframe = (
  project: AnimationProject,
  trackId: string,
  propertyName: string,
  atMs: number,
): AnimationProject =>
  updateTrack(project, trackId, (track) => {
    const properties = (track.properties ?? [])
      .map((property) =>
        property.property === propertyName
          ? {
              ...property,
              keyframes: property.keyframes.filter(
                (keyframe) => keyframe.atMs !== atMs,
              ),
            }
          : property,
      )
      .filter(
        (property) => property.keyframes.length > 0,
      ) as AnimationProperty[];
    return { ...track, properties };
  });

export const deletePositionKeyframe = (
  project: AnimationProject,
  trackId: string,
  atMs: number,
): AnimationProject =>
  POSITION_ANIMATION_PROPERTIES.reduce(
    (nextProject, property) =>
      deleteKeyframe(nextProject, trackId, property, atMs),
    project,
  );

export const setPropertySegmentEasing = (
  project: AnimationProject,
  trackId: string,
  propertyName: AnimationProperty["property"],
  fromAtMs: number,
  easing: AnimationEasing,
): AnimationProject => {
  if (isStateAnimationProperty(propertyName)) {
    return project;
  }
  return updateTrack(project, trackId, (track) => ({
    ...track,
    properties: (track.properties ?? []).map((property) =>
      property.property === propertyName
        ? ({
            ...property,
            keyframes: property.keyframes.map((keyframe) =>
              keyframe.atMs === fromAtMs
                ? { ...keyframe, easing, hold: false }
                : keyframe,
            ),
          } as AnimationProperty)
        : property,
    ),
  }));
};

export const deletePropertySegment = (
  project: AnimationProject,
  trackId: string,
  propertyName: AnimationProperty["property"],
  fromAtMs: number,
  toAtMs: number,
): AnimationProject => {
  if (isStateAnimationProperty(propertyName)) {
    return project;
  }
  return updateTrack(project, trackId, (track) => {
    const properties = (track.properties ?? [])
      .map((property) => {
        if (property.property !== propertyName) {
          return property;
        }
        const keyframes = [...property.keyframes].sort(
          (left, right) => left.atMs - right.atMs,
        );
        const fromIndex = keyframes.findIndex(
          (keyframe) => keyframe.atMs === fromAtMs,
        );
        if (fromIndex < 0 || keyframes[fromIndex + 1]?.atMs !== toAtMs) {
          return property;
        }
        const source = keyframes[fromIndex];
        const target = keyframes[fromIndex + 1];
        const isConnected = (keyframe: typeof keyframes[number]) =>
          propertyName === "visual.roundness" &&
          typeof keyframe.value === "string"
            ? true
            : keyframe.hold !== true;
        const sourceHasOtherConnection =
          fromIndex > 0 && isConnected(keyframes[fromIndex - 1]);
        const targetHasOtherConnection =
          fromIndex + 2 < keyframes.length && isConnected(target);
        const removeTimes = new Set<number>();
        if (!sourceHasOtherConnection) {
          removeTimes.add(source.atMs);
        }
        if (!targetHasOtherConnection) {
          removeTimes.add(target.atMs);
        }
        const nextKeyframes = keyframes
          .filter((keyframe) => !removeTimes.has(keyframe.atMs))
          .map((keyframe) => {
            if (
              sourceHasOtherConnection &&
              targetHasOtherConnection &&
              keyframe.atMs === source.atMs
            ) {
              const held = { ...keyframe, hold: true };
              delete held.easing;
              return held;
            }
            return keyframe;
          });
        return {
          ...property,
          keyframes: nextKeyframes,
        } as AnimationProperty;
      })
      .filter((property) => property.keyframes.length > 0);
    return { ...track, properties };
  });
};

const getRelativeTrackTime = (
  project: AnimationProject,
  track: AnimationTrack,
  projectTimeMs: number,
) =>
  Math.max(
    0,
    Math.min(
      projectTimeMs - getTrackAbsoluteStartMs(project, track),
      Math.max(0, project.durationMs - getTrackAbsoluteStartMs(project, track)),
    ),
  );

/** Moves one property keyframe without changing its value or easing. */
export const movePropertyKeyframe = (
  project: AnimationProject,
  trackId: string,
  propertyName: AnimationProperty["property"],
  fromAtMs: number,
  toProjectTimeMs: number,
): AnimationProject =>
  extendProjectToFitTracks(
    updateTrack(project, trackId, (track) => {
      const toAtMs = getRelativeTrackTime(project, track, toProjectTimeMs);
      if (toAtMs === fromAtMs) {
        return track;
      }
      const properties = (track.properties ?? []).map((property) => {
        if (property.property !== propertyName) {
          return property;
        }
        const movingKeyframe = property.keyframes.find(
          (keyframe) => keyframe.atMs === fromAtMs,
        );
        if (!movingKeyframe) {
          return property;
        }
        return {
          ...property,
          keyframes: [
            ...property.keyframes.filter(
              (keyframe) =>
                keyframe.atMs !== fromAtMs && keyframe.atMs !== toAtMs,
            ),
            { ...movingKeyframe, atMs: toAtMs },
          ].sort((a, b) => a.atMs - b.atMs),
        } as AnimationProperty;
      });
      return {
        ...track,
        durationMs: Math.max(track.durationMs ?? 0, toAtMs),
        properties,
      };
    }),
  );

export const movePositionKeyframe = (
  project: AnimationProject,
  trackId: string,
  fromAtMs: number,
  toProjectTimeMs: number,
): AnimationProject =>
  POSITION_ANIMATION_PROPERTIES.reduce(
    (nextProject, property) =>
      movePropertyKeyframe(
        nextProject,
        trackId,
        property,
        fromAtMs,
        toProjectTimeMs,
      ),
    project,
  );

/**
 * Moves the aggregate object keyframe. Every property keyframe at the source
 * time moves together, matching the object-row keyframe behavior.
 */
export const moveTrackKeyframesAtTime = (
  project: AnimationProject,
  trackId: string,
  fromAtMs: number,
  toProjectTimeMs: number,
): AnimationProject =>
  extendProjectToFitTracks(
    updateTrack(project, trackId, (track) => {
      const toAtMs = getRelativeTrackTime(project, track, toProjectTimeMs);
      if (toAtMs === fromAtMs) {
        return track;
      }
      const properties = (track.properties ?? []).map((property) => {
        const movingKeyframe = property.keyframes.find(
          (keyframe) => keyframe.atMs === fromAtMs,
        );
        if (!movingKeyframe) {
          return property;
        }
        return {
          ...property,
          keyframes: [
            ...property.keyframes.filter(
              (keyframe) =>
                keyframe.atMs !== fromAtMs && keyframe.atMs !== toAtMs,
            ),
            { ...movingKeyframe, atMs: toAtMs },
          ].sort((a, b) => a.atMs - b.atMs),
        } as AnimationProperty;
      });
      return {
        ...track,
        durationMs: Math.max(track.durationMs ?? 0, toAtMs),
        properties,
      };
    }),
  );
