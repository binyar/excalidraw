import {
  chevronLeftIcon,
  ExportIcon,
  save,
} from "@excalidraw/excalidraw/components/icons";
import { MainMenu } from "@excalidraw/excalidraw/index";
import React from "react";

export const AppMainMenu: React.FC<{
  onSave: () => void;
  onBackToWorkspace: () => void;
  onExportVideo: () => void;
}> = React.memo(({ onSave, onBackToWorkspace, onExportVideo }) => (
  <MainMenu>
    <MainMenu.Item
      icon={chevronLeftIcon}
      onSelect={onBackToWorkspace}
      data-testid="back-to-workspace-button"
      aria-label="返回工作台"
    >
      返回工作台
    </MainMenu.Item>
    <MainMenu.Separator />
    <MainMenu.Item
      icon={save}
      shortcut="Ctrl/Cmd+S"
      onSelect={onSave}
      data-testid="workspace-save-button"
      aria-label="保存"
    >
      保存
    </MainMenu.Item>
    <MainMenu.Item
      icon={ExportIcon}
      shortcut="Ctrl/Cmd+Shift+E"
      onSelect={onExportVideo}
      data-testid="video-export-button"
      aria-label="导出视频"
    >
      导出视频…
    </MainMenu.Item>
    <MainMenu.DefaultItems.ClearCanvas />
    <MainMenu.DefaultItems.ChangeCanvasBackground />
  </MainMenu>
));
