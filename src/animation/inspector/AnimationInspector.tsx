import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { downloadAnimationProject } from "../export";
import {
  DEFAULT_ANIMATION_PROPERTY_VALUES,
  getColorPropertyValue,
  getFillStylePropertyValue,
  getNumericPropertyValue,
} from "../ui/animationEditorState";

import "./AnimationInspector.scss";

import {
  ANIMATION_INSPECTOR_CATEGORIES,
  defaultInspectorConfig,
  getInspectorPreset,
  getInspectorPresets,
  readInspectorConfig,
} from "./inspectorPresets";
import { animationWorkspace } from "./AnimationWorkspace";

import type { AnimationWorkspaceSnapshot } from "./AnimationWorkspace";
import type {
  AnimationInspectorCategory,
  AnimationInspectorConfig,
  AnimationInspectorElement,
  AnimationInspectorPresetId,
} from "./inspectorPresets";
import type {
  AnimationEasingPresetName,
  AnimationFillStyle,
  AnimationPropertyName,
  NumericAnimationPropertyName,
} from "../types";

export type AnimationInspectorController = {
  getSnapshot(): AnimationWorkspaceSnapshot;
  subscribe(listener: () => void): () => void;
  getElementTrack(
    elementId: string,
  ): AnimationWorkspaceSnapshot["project"]["tracks"][number] | undefined;
  setElementAnimation(
    element: AnimationInspectorElement,
    config: AnimationInspectorConfig,
  ): void;
  removeElementAnimation(elementId: string): void;
  setElementPropertyKeyframe(
    elementId: string,
    property: NumericAnimationPropertyName,
    value: number,
    timeMs?: number,
  ): void;
  setElementColorKeyframe(
    elementId: string,
    property: "visual.backgroundColor",
    value: string,
    timeMs?: number,
  ): void;
  setElementFillStyleKeyframe(
    elementId: string,
    value: AnimationFillStyle,
    timeMs?: number,
  ): void;
  removeElementProperty(
    elementId: string,
    property: AnimationPropertyName,
  ): void;
  preview(): Promise<void>;
};

export type AnimationInspectorProps = {
  element: AnimationInspectorElement | null;
  controller?: AnimationInspectorController;
};

const EASING_OPTIONS: readonly AnimationEasingPresetName[] = [
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
];

const BACKGROUND_COLOR_OPTIONS = [
  { label: "透明", value: "#00000000" },
  { label: "红色", value: "#FFC9C9FF" },
  { label: "绿色", value: "#B2F2BBFF" },
  { label: "蓝色", value: "#A5D8FFFF" },
  { label: "黄色", value: "#FFEC99FF" },
] as const;

const FILL_STYLE_LABELS: Record<AnimationFillStyle, string> = {
  hachure: "斜线",
  "cross-hatch": "交叉线",
  solid: "纯色",
  zigzag: "锯齿线",
};

const EASING_LABELS: Record<AnimationEasingPresetName, string> = {
  linear: "线性",
  ease: "缓动",
  "ease-in": "渐快",
  "ease-out": "渐慢",
  "ease-in-out": "渐快渐慢",
  smooth: "平滑",
  sharp: "锐利",
  bounce: "弹跳",
  "back-in": "回拉进入",
  "back-out": "回拉退出",
  "back-in-out": "双向回拉",
};

const ELEMENT_TYPE_LABELS: Record<string, string> = {
  rectangle: "矩形",
  ellipse: "椭圆",
  diamond: "菱形",
  text: "文本",
  line: "线条",
  arrow: "箭头",
  freedraw: "自由绘制",
  image: "图片",
};

const STATUS_LABELS: Record<string, string> = {
  idle: "就绪",
  loading: "准备中",
  playing: "播放中",
  paused: "已暂停",
  stopped: "已停止",
  error: "出错",
};

const PROPERTY_CONTROLS: ReadonlyArray<{
  property: NumericAnimationPropertyName;
  label: string;
  step: number;
  min?: number;
  max?: number;
  unit?: string;
  displayScale?: number;
  description?: string;
  supports?: (elementType: string) => boolean;
}> = [
  { property: "transform.x", label: "水平位置", step: 1, unit: "px" },
  { property: "transform.y", label: "垂直位置", step: 1, unit: "px" },
  { property: "transform.scale", label: "缩放", step: 0.05, min: 0 },
  { property: "transform.rotate", label: "旋转", step: 1, unit: "°" },
  {
    property: "visual.opacity",
    label: "不透明度",
    step: 1,
    min: 0,
    max: 100,
    unit: "%",
    displayScale: 100,
    description: "0% 为完全透明，100% 为完全可见。",
  },
];

export const AnimationInspector = ({
  element,
  controller = animationWorkspace,
}: AnimationInspectorProps) => {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const existingTrack = element
    ? controller.getElementTrack(element.id)
    : undefined;
  const existingConfig = useMemo(
    () => readInspectorConfig(existingTrack),
    [existingTrack],
  );
  const [config, setConfig] = useState<AnimationInspectorConfig>(
    existingConfig ?? defaultInspectorConfig(),
  );

  useEffect(() => {
    setConfig(existingConfig ?? defaultInspectorConfig());
  }, [element?.id, existingConfig]);

  if (!element) {
    return (
      <section className="animation-inspector animation-inspector--empty">
        <div className="animation-inspector__empty-icon" aria-hidden="true">
          ◇
        </div>
        <h3>请选择元素</h3>
        <p>选择一个画布元素，即可添加并预览动画。</p>
      </section>
    );
  }

  const update = (next: AnimationInspectorConfig) => {
    setConfig(next);
    controller.setElementAnimation(element, next);
  };

  const selectCategory = (category: AnimationInspectorCategory) => {
    const next = defaultInspectorConfig(category);
    update(next);
  };

  const selectPreset = (presetId: AnimationInspectorPresetId) => {
    const preset = getInspectorPreset(presetId);
    update({
      ...config,
      category: preset.category,
      presetId,
      duration: preset.defaultDuration,
      easing: preset.defaultEasing,
    });
  };

  const preset = getInspectorPreset(config.presetId);
  const isBusy = snapshot.status === "loading";
  const runtimeValue = snapshot.values?.[element.id];

  return (
    <section className="animation-inspector" aria-label="动画检查器">
      <header className="animation-inspector__header">
        <div>
          <span>动画检查器</span>
          <strong>{ELEMENT_TYPE_LABELS[element.type] ?? "元素"}</strong>
        </div>
        <span
          className={`animation-inspector__status animation-inspector__status--${snapshot.status}`}
        >
          {STATUS_LABELS[snapshot.status] ?? "就绪"}
        </span>
      </header>

      <div className="animation-inspector__section">
        <div className="animation-inspector__property-heading">
          <span className="animation-inspector__label">属性</span>
          <output>{(snapshot.timeMs / 1000).toFixed(2)}s</output>
        </div>
        <div className="animation-inspector__property-list">
          {PROPERTY_CONTROLS.map((control) => {
            const property = existingTrack?.properties?.find(
              (candidate) => candidate.property === control.property,
            );
            const enabled = Boolean(property);
            const available = control.supports?.(element.type) ?? true;
            const value =
              snapshot.status === "playing" && runtimeValue
                ? readRuntimeValue(runtimeValue, control.property)
                : existingTrack
                ? getNumericPropertyValue(
                    snapshot.project,
                    existingTrack,
                    control.property,
                    snapshot.timeMs,
                  )
                : DEFAULT_ANIMATION_PROPERTY_VALUES[control.property];
            const displayValue = value * (control.displayScale ?? 1);
            const helpId = `animation-property-help-${control.property}`;
            return (
              <div
                className={`animation-inspector__property-item ${
                  available ? "" : "is-unavailable"
                }`}
                key={control.property}
              >
                <div
                  className={`animation-inspector__property-row ${
                    enabled ? "is-animated" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="animation-inspector__keyframe-toggle"
                    aria-label={`${enabled ? "停用" : "启用"}${
                      control.label
                    }动画`}
                    aria-pressed={enabled}
                    disabled={!available}
                    onClick={() => {
                      if (enabled) {
                        controller.removeElementProperty(
                          element.id,
                          control.property,
                        );
                      } else {
                        controller.setElementPropertyKeyframe(
                          element.id,
                          control.property,
                          value,
                          snapshot.timeMs,
                        );
                      }
                    }}
                  >
                    <span />
                  </button>
                  <label htmlFor={`animation-property-${control.property}`}>
                    {control.label}
                  </label>
                  <span className="animation-inspector__input-unit">
                    <input
                      id={`animation-property-${control.property}`}
                      aria-describedby={
                        control.description ? helpId : undefined
                      }
                      type="number"
                      step={control.step}
                      min={control.min}
                      max={control.max}
                      disabled={!available}
                      value={roundPropertyValue(displayValue)}
                      onChange={(event) =>
                        controller.setElementPropertyKeyframe(
                          element.id,
                          control.property,
                          Number(event.target.value) /
                            (control.displayScale ?? 1),
                          snapshot.timeMs,
                        )
                      }
                    />
                    {control.unit && <em>{control.unit}</em>}
                  </span>
                </div>
                {control.description && (
                  <p id={helpId} className="animation-inspector__property-note">
                    {available
                      ? control.description
                      : "仅在线条、箭头或自由绘制元素上可用。"}
                  </p>
                )}
              </div>
            );
          })}
          <BackgroundColorProperty
            element={element}
            existingTrack={existingTrack}
            runtimeValue={runtimeValue}
            project={snapshot.project}
            timeMs={snapshot.timeMs}
            isPlaying={snapshot.status === "playing"}
            controller={controller}
          />
        </div>
        <p className="animation-inspector__property-help">
          启用菱形按钮后，移动播放头并修改数值即可写入关键帧。
        </p>
      </div>

      <div className="animation-inspector__section">
        <label className="animation-inspector__label">动画类型</label>
        <div className="animation-inspector__categories">
          {ANIMATION_INSPECTOR_CATEGORIES.map((category) => (
            <button
              type="button"
              className={config.category === category.id ? "is-selected" : ""}
              aria-pressed={config.category === category.id}
              key={category.id}
              onClick={() => selectCategory(category.id)}
            >
              {category.label}
            </button>
          ))}
        </div>
      </div>

      <div className="animation-inspector__section">
        <label
          className="animation-inspector__label"
          htmlFor="animation-preset"
        >
          预设
        </label>
        <select
          id="animation-preset"
          value={config.presetId}
          onChange={(event) =>
            selectPreset(event.target.value as AnimationInspectorPresetId)
          }
        >
          {getInspectorPresets(config.category).map((option) => (
            <option value={option.id} key={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="animation-inspector__description">{preset.description}</p>
      </div>

      <div className="animation-inspector__section animation-inspector__parameters">
        <span className="animation-inspector__label">参数</span>
        <label>
          <span>持续时间</span>
          <span className="animation-inspector__input-unit">
            <input
              type="number"
              min={1}
              step={50}
              value={config.duration}
              onChange={(event) =>
                update({
                  ...config,
                  duration: Math.max(1, Number(event.target.value) || 1),
                })
              }
            />
            <em>毫秒</em>
          </span>
        </label>
        <label>
          <span>延迟</span>
          <span className="animation-inspector__input-unit">
            <input
              type="number"
              min={0}
              step={50}
              value={config.delay}
              onChange={(event) =>
                update({
                  ...config,
                  delay: Math.max(0, Number(event.target.value) || 0),
                })
              }
            />
            <em>毫秒</em>
          </span>
        </label>
        <label>
          <span>缓动</span>
          <select
            aria-label="缓动"
            value={config.easing}
            onChange={(event) =>
              update({
                ...config,
                easing: event.target.value as AnimationEasingPresetName,
              })
            }
          >
            {EASING_OPTIONS.map((easing) => (
              <option value={easing} key={easing}>
                {EASING_LABELS[easing]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="animation-inspector__preview-card">
        <div
          className="animation-inspector__preview-graphic"
          aria-hidden="true"
        >
          <span />
        </div>
        <div>
          <strong>画布实时预览</strong>
          <span>动画定义 → 运行时 → 画布</span>
        </div>
      </div>

      {snapshot.error && (
        <p className="animation-inspector__error" role="alert">
          {snapshot.error}
        </p>
      )}

      <div className="animation-inspector__actions">
        <button
          type="button"
          className="animation-inspector__preview-button"
          disabled={isBusy}
          onClick={() => {
            if (!existingConfig) {
              update(config);
            } else {
              void controller.preview();
            }
          }}
        >
          {isBusy ? "准备中…" : existingConfig ? "重新预览" : "添加并预览"}
        </button>
        {existingConfig && (
          <button
            type="button"
            className="animation-inspector__remove-button"
            onClick={() => controller.removeElementAnimation(element.id)}
          >
            移除动画
          </button>
        )}
        {snapshot.project.tracks.length > 0 && (
          <button
            type="button"
            className="animation-inspector__remove-button"
            onClick={() => downloadAnimationProject(snapshot.project)}
          >
            导出 animation.json
          </button>
        )}
      </div>
    </section>
  );
};

const BackgroundColorProperty = ({
  element,
  existingTrack,
  runtimeValue,
  project,
  timeMs,
  isPlaying,
  controller,
}: {
  element: AnimationInspectorElement;
  existingTrack:
    | AnimationWorkspaceSnapshot["project"]["tracks"][number]
    | undefined;
  runtimeValue:
    | NonNullable<AnimationWorkspaceSnapshot["values"]>[string]
    | undefined;
  project: AnimationWorkspaceSnapshot["project"];
  timeMs: number;
  isPlaying: boolean;
  controller: AnimationInspectorController;
}) => {
  const property = existingTrack?.properties?.find(
    (candidate) => candidate.property === "visual.backgroundColor",
  );
  const fillStyleProperty = existingTrack?.properties?.find(
    (candidate) => candidate.property === "visual.fillStyle",
  );
  const enabled = Boolean(property || fillStyleProperty);
  const fillStyle =
    runtimeValue?.visual.fillStyle ??
    (existingTrack
      ? getFillStylePropertyValue(
          existingTrack,
          timeMs,
          project,
          element.fillStyle ?? "hachure",
        )
      : element.fillStyle ?? "hachure");
  const value = normalizeAnimationColor(
    isPlaying && runtimeValue
      ? runtimeValue.visual.backgroundColor
      : existingTrack
      ? getColorPropertyValue(
          existingTrack,
          "visual.backgroundColor",
          timeMs,
          project,
          element.backgroundColor,
        )
      : element.backgroundColor,
  );
  return (
    <div className="animation-inspector__property-item">
      <div
        className={`animation-inspector__property-row ${
          enabled ? "is-animated" : ""
        }`}
      >
        <button
          type="button"
          className="animation-inspector__keyframe-toggle"
          aria-label={`${enabled ? "停用" : "启用"}背景颜色动画`}
          aria-pressed={enabled}
          onClick={() =>
            enabled
              ? (controller.removeElementProperty(
                  element.id,
                  "visual.backgroundColor",
                ),
                controller.removeElementProperty(
                  element.id,
                  "visual.fillStyle",
                ))
              : (controller.setElementColorKeyframe(
                  element.id,
                  "visual.backgroundColor",
                  value,
                  timeMs,
                ),
                controller.setElementFillStyleKeyframe(
                  element.id,
                  element.fillStyle ?? "hachure",
                  timeMs,
                ))
          }
        >
          <span />
        </button>
        <label htmlFor="animation-property-visual.backgroundColor">
          背景颜色
        </label>
        <span className="animation-inspector__color-input">
          <input
            id="animation-property-visual.backgroundColor"
            type="color"
            value={value.slice(0, 7)}
            onChange={(event) =>
              controller.setElementColorKeyframe(
                element.id,
                "visual.backgroundColor",
                `${event.target.value.toUpperCase()}FF`,
                timeMs,
              )
            }
          />
          <output>{value.slice(0, 7)}</output>
        </span>
      </div>
      <div
        className="animation-inspector__background-palette"
        aria-label="背景颜色预设"
      >
        {BACKGROUND_COLOR_OPTIONS.map((color) => (
          <button
            type="button"
            className={color.value === "#00000000" ? "is-transparent" : ""}
            aria-label={`将动画背景设置为${color.label}`}
            aria-pressed={value === color.value}
            title={color.label}
            key={color.value}
            style={
              color.value === "#00000000"
                ? undefined
                : { backgroundColor: color.value.slice(0, 7) }
            }
            onClick={() =>
              controller.setElementColorKeyframe(
                element.id,
                "visual.backgroundColor",
                color.value,
                timeMs,
              )
            }
          />
        ))}
      </div>
      <div
        className="animation-inspector__fill-style-palette"
        aria-label="填充样式预设"
      >
        {(["hachure", "cross-hatch", "solid", "zigzag"] as const).map(
          (style) => (
            <button
              type="button"
              className={`is-${style}`}
              aria-label={`将动画填充样式设置为${FILL_STYLE_LABELS[style]}`}
              aria-pressed={fillStyle === style}
              title={FILL_STYLE_LABELS[style]}
              key={style}
              onClick={() =>
                controller.setElementFillStyleKeyframe(
                  element.id,
                  style,
                  timeMs,
                )
              }
            />
          ),
        )}
      </div>
    </div>
  );
};

const normalizeAnimationColor = (value: string): string => {
  if (value === "transparent") {
    return "#00000000";
  }
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    const [red, green, blue] = value.slice(1);
    return `#${red}${red}${green}${green}${blue}${blue}FF`.toUpperCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return `${value}FF`.toUpperCase();
  }
  if (/^#[0-9a-f]{8}$/i.test(value)) {
    return value.toUpperCase();
  }
  return "#00000000";
};

const roundPropertyValue = (value: number) =>
  Math.round((value + Number.EPSILON) * 1000) / 1000;

const readRuntimeValue = (
  value: NonNullable<AnimationWorkspaceSnapshot["values"]>[string],
  property: NumericAnimationPropertyName,
): number => {
  switch (property) {
    case "camera.centerX":
      return value.camera.centerX;
    case "camera.centerY":
      return value.camera.centerY;
    case "camera.zoom":
      return value.camera.zoom;
    case "transform.x":
      return value.transform.x;
    case "transform.y":
      return value.transform.y;
    case "transform.scale":
      return value.transform.scale;
    case "transform.rotate":
      return value.transform.rotate;
    case "visual.opacity":
      return value.visual.opacity;
    case "visual.strokeWidth":
      return value.visual.strokeWidth;
    case "visual.roughness":
      return value.visual.roughness;
    case "text.fontSize":
      return value.text.fontSize;
    case "text.fontFamily":
      return value.text.fontFamily;
    case "advanced.drawProgress":
      return value.advanced.drawProgress;
    case "advanced.blur":
      return value.advanced.blur;
    case "transition.progress":
      return value.transition.progress;
    case "transition.opacity":
      return value.transition.opacity;
    case "transition.blur":
      return value.transition.blur;
    case "transition.scale":
      return value.transition.scale;
  }
};
