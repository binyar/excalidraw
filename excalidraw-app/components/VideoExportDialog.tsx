import { useRef, useState } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  readCameraViewport,
  restoreCameraViewport,
} from "../../src/animation/excalidraw/CameraViewportBinding";
import {
  downloadAnimationVideo,
  recordAnimationVideo,
} from "../../src/animation/export";
import { animationWorkspace } from "../../src/animation/inspector";

import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

type VideoExportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  excalidrawAPI: ExcalidrawImperativeAPI;
};

const RESOLUTIONS = {
  "720p": { width: 1280, height: 720, label: "720p · 1280 × 720" },
  "1080p": { width: 1920, height: 1080, label: "1080p · 1920 × 1080" },
} as const;

const safeVideoFilename = (name: string) =>
  name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "动画故事";

export const VideoExportDialog = ({
  open,
  onOpenChange,
  excalidrawAPI,
}: VideoExportDialogProps) => {
  const [resolution, setResolution] =
    useState<keyof typeof RESOLUTIONS>("720p");
  const [frameRate, setFrameRate] = useState<30 | 60>(30);
  const [progress, setProgress] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  const close = () => {
    if (exporting) {
      abortControllerRef.current?.abort();
      return;
    }
    setError("");
    setProgress(0);
    onOpenChange(false);
  };

  const exportVideo = async () => {
    const sourceCanvas = document.querySelector<HTMLCanvasElement>(
      ".editor-shell__canvas canvas.powdoo__canvas.static",
    );
    if (!sourceCanvas) {
      setError("无法读取当前故事画布");
      return;
    }

    const previous = animationWorkspace.getSnapshot();
    if (previous.status === "loading") {
      setError("动画仍在加载，请稍后重试");
      return;
    }
    if (previous.status === "error") {
      setError(previous.error || "动画工程不可用");
      return;
    }
    const previousCamera = readCameraViewport(excalidrawAPI);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setExporting(true);
    setProgress(0);
    setError("");
    try {
      const target = RESOLUTIONS[resolution];
      const blob = await recordAnimationVideo({
        playback: animationWorkspace,
        project: previous.project,
        sourceCanvas,
        width: target.width,
        height: target.height,
        frameRate,
        backgroundColor: excalidrawAPI.getAppState().viewBackgroundColor,
        signal: controller.signal,
        onProgress: setProgress,
      });
      downloadAnimationVideo(blob, safeVideoFilename(excalidrawAPI.getName()));
      excalidrawAPI.setToast({ message: "视频导出完成", duration: 3000 });
      onOpenChange(false);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause.message : "视频导出失败");
      }
    } finally {
      animationWorkspace.seek(previous.timeMs);
      restoreCameraViewport(excalidrawAPI, previousCamera);
      if (previous.status === "playing") {
        void animationWorkspace.play();
      }
      abortControllerRef.current = null;
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent showCloseButton={!exporting}>
        <DialogHeader>
          <DialogTitle>导出视频</DialogTitle>
          <DialogDescription>
            浏览器支持时导出 MP4，否则自动回退为
            WebM。导出期间会完整播放一次故事。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">分辨率</span>
            <select
              className="h-9 rounded-md border bg-background px-3"
              value={resolution}
              disabled={exporting}
              onChange={(event) =>
                setResolution(event.target.value as keyof typeof RESOLUTIONS)
              }
            >
              {Object.entries(RESOLUTIONS).map(([value, option]) => (
                <option key={value} value={value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">帧率</span>
            <select
              className="h-9 rounded-md border bg-background px-3"
              value={frameRate}
              disabled={exporting}
              onChange={(event) =>
                setFrameRate(Number(event.target.value) as 30 | 60)
              }
            >
              <option value={30}>30 FPS</option>
              <option value={60}>60 FPS</option>
            </select>
          </label>

          {exporting && (
            <div className="grid gap-2" role="status" aria-live="polite">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>正在录制故事动画…</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            {exporting ? "取消导出" : "取消"}
          </Button>
          <Button
            type="button"
            disabled={exporting}
            onClick={() => void exportVideo()}
          >
            开始导出
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
