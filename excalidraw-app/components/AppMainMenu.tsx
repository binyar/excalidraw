import { save } from "@excalidraw/excalidraw/components/icons";
import { MainMenu } from "@excalidraw/excalidraw/index";
import React from "react";

import type { Theme } from "@excalidraw/element/types";

import { LanguageList } from "../app-language/LanguageList";

export const AppMainMenu: React.FC<{
  onSave: () => void;
  theme: Theme | "system";
}> = React.memo(({ onSave, theme }) => (
  <MainMenu>
    <MainMenu.Item
      icon={save}
      shortcut="Ctrl/Cmd+S"
      onSelect={onSave}
      data-testid="workspace-save-button"
      aria-label="保存"
    >
      保存
    </MainMenu.Item>
    <MainMenu.DefaultItems.SaveAsImage />
    <MainMenu.DefaultItems.SearchMenu />
    <MainMenu.DefaultItems.ClearCanvas />
    <MainMenu.Separator />
    <MainMenu.DefaultItems.Preferences />
    <MainMenu.DefaultItems.ToggleTheme allowSystemTheme theme={theme} />
    <MainMenu.ItemCustom>
      <LanguageList style={{ width: "100%" }} />
    </MainMenu.ItemCustom>
    <MainMenu.DefaultItems.ChangeCanvasBackground />
  </MainMenu>
));
