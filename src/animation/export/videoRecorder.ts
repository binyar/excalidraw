import { getStageTransitionLayers } from "../ui/StageTransitionOverlay";

import type { AnimationWorkspaceSnapshot } from "../inspector/AnimationWorkspace";
import type { AnimationProject } from "../types";

export const VIDEO_EXPORT_MIME_TYPES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

export type AnimationVideoPlaybackPort = {
  getSnapshot: () => AnimationWorkspaceSnapshot;
  subscribe: (listener: () => void) => () => void;
  seek: (timeMs: number) => void;
  play: () => Promise<boolean | void>;
  pause: () => void;
};

export type RecordAnimationVideoOptions = {
  playback: AnimationVideoPlaybackPort;
  project: AnimationProject;
  sourceCanvas: HTMLCanvasElement;
  width?: number;
  height?: number;
  frameRate?: number;
  backgroundColor?: string;
  videoBitsPerSecond?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
};

export const resolveVideoRecorderMimeType = (
  isTypeSupported: (mimeType: string) => boolean,
): string | null =>
  VIDEO_EXPORT_MIME_TYPES.find((mimeType) => isTypeSupported(mimeType)) ?? null;

export const getVideoFileExtension = (mimeType: string): "mp4" | "webm" =>
  mimeType.toLowerCase().startsWith("video/mp4") ? "mp4" : "webm";

export const getContainRect = (
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) => {
  const scale = Math.min(
    targetWidth / Math.max(1, sourceWidth),
    targetHeight / Math.max(1, sourceHeight),
  );
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
    width,
    height,
  };
};

const drawTransitionLayer = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  layer: ReturnType<typeof getStageTransitionLayers>[number],
  backdrop?: HTMLCanvasElement,
) => {
  const progress = Math.max(0, Math.min(1, layer.progress));
  context.save();
  context.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
  context.fillStyle = layer.color;
  if (layer.effect !== "iris") {
    context.translate(width / 2, height / 2);
    context.scale(layer.scale, layer.scale);
    context.translate(-width / 2, -height / 2);
  }

  if (layer.effect === "iris") {
    const origin = {
      center: [width / 2, height / 2],
      "top-left": [0, 0],
      "top-right": [width, 0],
      "bottom-left": [0, height],
      "bottom-right": [width, height],
    }[layer.origin];
    const maximumRadius = Math.max(
      Math.hypot(origin[0], origin[1]),
      Math.hypot(width - origin[0], origin[1]),
      Math.hypot(origin[0], height - origin[1]),
      Math.hypot(width - origin[0], height - origin[1]),
    );
    context.beginPath();
    context.arc(
      origin[0],
      origin[1],
      maximumRadius * progress * layer.scale,
      0,
      Math.PI * 2,
    );
    context.clip();
  } else if (
    layer.effect === "color-wipe" ||
    layer.effect === "directional-wipe"
  ) {
    context.beginPath();
    if (layer.direction === "right") {
      context.rect(width * (1 - progress), 0, width * progress, height);
    } else if (layer.direction === "up") {
      context.rect(0, 0, width, height * progress);
    } else if (layer.direction === "down") {
      context.rect(0, height * (1 - progress), width, height * progress);
    } else {
      context.rect(0, 0, width * progress, height);
    }
    context.clip();
  } else if (layer.effect === "push") {
    const remaining = 1 - progress;
    context.translate(
      layer.direction === "right"
        ? -width * remaining
        : layer.direction === "left"
        ? width * remaining
        : 0,
      layer.direction === "up"
        ? height * remaining
        : layer.direction === "down"
        ? -height * remaining
        : 0,
    );
  }
  if (layer.blur > 0 && backdrop) {
    context.save();
    context.filter = `blur(${layer.blur}px)`;
    context.drawImage(backdrop, 0, 0, width, height);
    context.restore();
  }
  context.fillRect(0, 0, width, height);
  context.restore();
};

export const drawAnimationVideoFrame = ({
  canvas,
  sourceCanvas,
  project,
  snapshot,
  backgroundColor = "#ffffff",
}: {
  canvas: HTMLCanvasElement;
  sourceCanvas: HTMLCanvasElement;
  project: AnimationProject;
  snapshot: AnimationWorkspaceSnapshot;
  backgroundColor?: string;
}) => {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("当前浏览器无法创建视频合成画布");
  }
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const target = getContainRect(
    sourceCanvas.width,
    sourceCanvas.height,
    canvas.width,
    canvas.height,
  );
  context.drawImage(
    sourceCanvas,
    target.x,
    target.y,
    target.width,
    target.height,
  );
  context.restore();

  getStageTransitionLayers(project, snapshot.values).forEach((layer) => {
    let backdrop: HTMLCanvasElement | undefined;
    if (layer.blur > 0) {
      backdrop = document.createElement("canvas");
      backdrop.width = canvas.width;
      backdrop.height = canvas.height;
      backdrop.getContext("2d")?.drawImage(canvas, 0, 0);
    }
    drawTransitionLayer(context, canvas.width, canvas.height, layer, backdrop);
  });
};

const nextPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export const recordAnimationVideo = async ({
  playback,
  project,
  sourceCanvas,
  width = 1280,
  height = 720,
  frameRate = 30,
  backgroundColor = "#ffffff",
  videoBitsPerSecond = 6_000_000,
  signal,
  onProgress,
}: RecordAnimationVideoOptions): Promise<Blob> => {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("当前浏览器不支持视频录制");
  }
  if (typeof sourceCanvas.captureStream !== "function") {
    throw new Error("当前浏览器不支持画布视频流");
  }
  if (signal?.aborted) {
    throw new DOMException("视频导出已取消", "AbortError");
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(width / 2) * 2);
  canvas.height = Math.max(2, Math.round(height / 2) * 2);
  const stream = canvas.captureStream(frameRate);
  let recorder: MediaRecorder | null = null;
  let mimeType = "";
  for (const candidate of VIDEO_EXPORT_MIME_TYPES) {
    if (!MediaRecorder.isTypeSupported(candidate)) {
      continue;
    }
    try {
      recorder = new MediaRecorder(stream, {
        mimeType: candidate,
        videoBitsPerSecond,
      });
      mimeType = candidate;
      break;
    } catch {
      // Some browsers report support but reject the recorder configuration.
      // Continue through MP4 candidates and then fall back to WebM.
    }
  }
  if (!recorder) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error("当前浏览器不支持 MP4 或 WebM 视频编码");
  }
  const chunks: Blob[] = [];
  let frameRequest = 0;
  let completed = false;

  const paint = () => {
    drawAnimationVideoFrame({
      canvas,
      sourceCanvas,
      project,
      snapshot: playback.getSnapshot(),
      backgroundColor,
    });
  };
  const schedulePaint = () => {
    if (frameRequest) {
      return;
    }
    frameRequest = requestAnimationFrame(() => {
      frameRequest = 0;
      paint();
    });
  };

  const recording = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onerror = () => reject(new Error("浏览器视频编码失败"));
    recorder.onstop = () => {
      if (!completed) {
        reject(new DOMException("视频导出已取消", "AbortError"));
        return;
      }
      if (chunks.length === 0) {
        reject(new Error("浏览器没有生成视频数据"));
        return;
      }
      resolve(new Blob(chunks, { type: recorder.mimeType || mimeType }));
    };
  });

  const abort = () => {
    playback.pause();
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
  };
  signal?.addEventListener("abort", abort, { once: true });
  const reverse =
    project.playback?.direction === "reverse" ||
    project.playback?.direction === "alternate-reverse";
  const terminalTimeMs = reverse ? 0 : project.durationMs;
  const terminalThresholdMs = Math.min(
    project.durationMs / 4,
    Math.max(2, 1500 / frameRate),
  );
  let sawPlaying = false;
  let sawNonTerminalTime = false;
  let resolvePlayback: () => void = () => undefined;
  let rejectPlayback: (cause: unknown) => void = () => undefined;
  const playbackCompletion =
    project.tracks.length === 0
      ? new Promise<void>((resolve) =>
          window.setTimeout(resolve, project.durationMs),
        )
      : new Promise<void>((resolve, reject) => {
          resolvePlayback = resolve;
          rejectPlayback = reject;
        });
  const unsubscribe = playback.subscribe(() => {
    const snapshot = playback.getSnapshot();
    const elapsedTimeMs = reverse
      ? project.durationMs - snapshot.timeMs
      : snapshot.timeMs;
    onProgress?.(Math.max(0, Math.min(1, elapsedTimeMs / project.durationMs)));
    schedulePaint();
    if (snapshot.status === "error") {
      rejectPlayback(new Error(snapshot.error || "动画播放失败"));
      return;
    }
    if (snapshot.status === "playing") {
      sawPlaying = true;
      if (Math.abs(snapshot.timeMs - terminalTimeMs) > terminalThresholdMs) {
        sawNonTerminalTime = true;
      }
    }
    if (
      sawPlaying &&
      sawNonTerminalTime &&
      Math.abs(snapshot.timeMs - terminalTimeMs) <= terminalThresholdMs
    ) {
      resolvePlayback();
    }
  });

  try {
    playback.pause();
    playback.seek(reverse ? project.durationMs : 0);
    await nextPaint();
    paint();
    recorder.start(250);
    void playback.play().catch(rejectPlayback);
    await Promise.race([playbackCompletion, recording]);
    playback.pause();
    playback.seek(terminalTimeMs);
    await nextPaint();
    paint();
    completed = true;
    onProgress?.(1);
    recorder.stop();
    return await recording;
  } finally {
    unsubscribe();
    signal?.removeEventListener("abort", abort);
    if (frameRequest) {
      cancelAnimationFrame(frameRequest);
    }
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
    stream.getTracks().forEach((track) => track.stop());
  }
};

export const downloadAnimationVideo = (blob: Blob, filename = "animation") => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const extension = getVideoFileExtension(blob.type);
  const basename = filename.replace(/\.(?:mp4|webm)$/i, "");
  anchor.download = `${basename}.${extension}`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};
