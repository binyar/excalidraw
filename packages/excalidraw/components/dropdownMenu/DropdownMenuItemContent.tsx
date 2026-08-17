import { useEditorInterface } from "../App";

import { Ellipsify } from "../Ellipsify";

import type { JSX } from "react";

const MenuItemContent = ({
  textStyle,
  icon,
  shortcut,
  children,
  badge,
}: {
  icon?: JSX.Element;
  shortcut?: string;
  textStyle?: React.CSSProperties;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) => {
  const editorInterface = useEditorInterface();
  return (
    <>
      {icon && (
        <div className="dropdown-menu-item__icon [&_svg]:size-4">{icon}</div>
      )}
      <div
        style={textStyle}
        className="dropdown-menu-item__text flex min-w-0 flex-1 items-center gap-3 overflow-hidden whitespace-nowrap"
      >
        <Ellipsify>{children}</Ellipsify>
      </div>
      {badge && <div className="dropdown-menu-item__badge">{badge}</div>}
      {shortcut && editorInterface.formFactor !== "phone" && (
        <div className="dropdown-menu-item__shortcut ml-auto text-xs tracking-widest text-muted-foreground">
          {shortcut}
        </div>
      )}
    </>
  );
};
export default MenuItemContent;
