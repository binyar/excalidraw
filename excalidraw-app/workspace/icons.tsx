import { useId } from "react";
import {
  IconArrowBoldLeft,
  IconBoxCaretRight,
  IconBoxCaretUp,
  IconBrightnessIncrease,
  IconBulletList,
  IconCircleCheck,
  IconCloudDownload,
  IconCloudMoon,
  IconCloudUpload,
  IconDeleteX,
  IconDotsVertical,
  IconFile,
  IconFolder,
  IconGrid,
  IconLoader2,
  IconMagicWandSparkle,
  IconMagnifier,
  IconPaperPlane,
  IconRefresh,
  IconSparkle,
  IconStar,
  IconTabClose,
  IconTriangleWarning,
} from "nucleo-glass";

import type { ComponentType } from "react";
import type { IconProps } from "nucleo-glass";

type WorkspaceIcon = ComponentType<IconProps & { uniqueId?: string }>;

const icons: Record<string, WorkspaceIcon> = {
  search: IconMagnifier,
  menu: IconBulletList,
  grid: IconGrid,
  list: IconBulletList,
  folder: IconFolder,
  clock: IconLoader2,
  star: IconStar,
  trash: IconDeleteX,
  upload: IconCloudUpload,
  download: IconCloudDownload,
  plus: IconSparkle,
  filter: IconTriangleWarning,
  sort: IconBoxCaretUp,
  more: IconDotsVertical,
  sun: IconBrightnessIncrease,
  moon: IconCloudMoon,
  file: IconFile,
  back: IconArrowBoldLeft,
  chevron: IconBoxCaretRight,
  restore: IconRefresh,
  close: IconTabClose,
  check: IconCircleCheck,
  magic: IconMagicWandSparkle,
  send: IconPaperPlane,
};

export const Icon = ({
  name,
  size = 20,
  filled = false,
  className,
}: {
  name: string;
  size?: number;
  filled?: boolean;
  className?: string;
}) => {
  const uniqueId = useId().replace(/:/g, "");
  const GlassIcon = icons[name] ?? IconFile;

  return (
    <GlassIcon
      aria-hidden="true"
      className={
        className ? `nucleo-glass-icon ${className}` : "nucleo-glass-icon"
      }
      data-filled={filled || undefined}
      size={size}
      uniqueId={`workspace-${uniqueId}-`}
    />
  );
};
