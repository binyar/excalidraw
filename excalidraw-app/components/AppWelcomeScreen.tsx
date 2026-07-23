import { WelcomeScreen } from "@excalidraw/excalidraw/index";
import React from "react";

export const AppWelcomeScreen = React.memo(() => (
  <WelcomeScreen>
    <WelcomeScreen.Hints.MenuHint>画布与显示设置</WelcomeScreen.Hints.MenuHint>
    <WelcomeScreen.Hints.ToolbarHint />
    <WelcomeScreen.Center>
      <WelcomeScreen.Center.Logo />
      <WelcomeScreen.Center.Heading>
        选择工具开始绘制
        <br />
        内容会自动保存到文件管理系统
      </WelcomeScreen.Center.Heading>
    </WelcomeScreen.Center>
  </WelcomeScreen>
));
