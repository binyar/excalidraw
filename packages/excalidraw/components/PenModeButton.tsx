import clsx from "clsx";

import { editorPenModeIcon } from "./editorControlIcons";
import { IconButton } from "./IconButton";

type PenModeButtonProps = {
  title?: string;
  checked: boolean;
  onChange?(): void;
  isMobile?: boolean;
  penDetected: boolean;
};

export const PenModeButton = (props: PenModeButtonProps) => {
  if (!props.penDetected) {
    return null;
  }

  return (
    <IconButton
      className={clsx("ToolIcon__penMode", { "is-mobile": props.isMobile })}
      type="toggle"
      icon={editorPenModeIcon}
      checked={props.checked}
      title={`${props.title}`}
      aria-label={`${props.title}`}
      onSelect={() => props.onChange?.()}
    />
  );
};
