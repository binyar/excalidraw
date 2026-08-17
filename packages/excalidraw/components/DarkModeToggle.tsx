import { THEME } from "@excalidraw/common";
import { IconBrightnessIncrease, IconCloudMoon } from "nucleo-glass";

import type { Theme } from "@excalidraw/element/types";

import { t } from "../i18n";

import { IconButton } from "./IconButton";

import "./ToolIcon.scss";

// We chose to use only explicit toggle and not a third option for system value,
// but this could be added in the future.
export const DarkModeToggle = (props: {
  value: Theme;
  onChange: (value: Theme) => void;
  title?: string;
}) => {
  const title =
    props.title ||
    (props.value === THEME.DARK
      ? t("buttons.lightMode")
      : t("buttons.darkMode"));

  return (
    <IconButton
      type="icon"
      icon={props.value === THEME.LIGHT ? ICONS.MOON : ICONS.SUN}
      title={title}
      aria-label={title}
      onClick={() =>
        props.onChange(props.value === THEME.DARK ? THEME.LIGHT : THEME.DARK)
      }
      data-testid="toggle-dark-mode"
    />
  );
};

const ICONS = {
  SUN: <IconBrightnessIncrease aria-hidden="true" size="1em" />,
  MOON: <IconCloudMoon aria-hidden="true" size="1em" />,
};
