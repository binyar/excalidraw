import React, { useId } from "react";
import * as Glass from "nucleo-glass";

import "./nucleoGlassIcons.scss";

import type { IconProps } from "nucleo-glass";

type GlassIconComponent = React.ComponentType<
  IconProps & {
    uniqueId?: string;
  }
>;

const GlassIcon = ({ icon: Icon }: { icon: GlassIconComponent }) => {
  const uniqueId = useId().replace(/:/g, "");
  return (
    <Icon
      aria-hidden="true"
      className="nucleo-glass-icon"
      focusable="false"
      size="1em"
      uniqueId={`excalidraw-${uniqueId}-`}
    />
  );
};

const glassIcon = (icon: GlassIconComponent) => <GlassIcon icon={icon} />;
export const PlusPromoIcon = glassIcon(Glass.IconDuplicatePlus);
export const LibraryIcon = glassIcon(Glass.IconBookOpen);
export const PlusIcon = glassIcon(Glass.IconCircleCopyPlus);
export const DotsIcon = glassIcon(Glass.IconDotsVertical);
export const DotsHorizontalIcon = glassIcon(Glass.IconDots);
export const PinIcon = glassIcon(Glass.IconPin);
export const polygonIcon = glassIcon(Glass.IconShapes);
export const UnlockedIcon = glassIcon(Glass.IconKey);
export const LockedIcon = glassIcon(Glass.IconLock);
export const LockedIconFilled = glassIcon(Glass.IconLock);
export const SelectionIcon = glassIcon(Glass.IconSquarePointer);
export const LassoIcon = glassIcon(Glass.IconCrosshairs);
export const RectangleIcon = glassIcon(Glass.IconBox);
export const DiamondIcon = glassIcon(Glass.IconShapes);
export const EllipseIcon = glassIcon(Glass.IconCircleSquare);
export const ArrowIcon = glassIcon(Glass.IconArrowBoldRight);
export const LineIcon = glassIcon(Glass.IconMoveDownRight);
export const PenModeIcon = glassIcon(Glass.IconPen);
export const FreedrawIcon = glassIcon(Glass.IconFeather);
export const TextIcon = glassIcon(Glass.IconNote);
export const TextSizeIcon = glassIcon(Glass.IconNoteSparkle);
export const ImageIcon = glassIcon(Glass.IconImage);
export const EraserIcon = glassIcon(Glass.IconDeleteKey);
export const ZoomInIcon = glassIcon(Glass.IconMagnifier);
export const ZoomOutIcon = glassIcon(Glass.IconMagnifier);
export const ZoomResetIcon = glassIcon(Glass.IconRefresh);
export const TrashIcon = glassIcon(Glass.IconDeleteX);
export const EmbedIcon = glassIcon(Glass.IconCodeEditor);
export const DuplicateIcon = glassIcon(Glass.IconDuplicate);
export const MoonIcon = glassIcon(Glass.IconCloudMoon);
export const SunIcon = glassIcon(Glass.IconBrightnessIncrease);
export const HamburgerMenuIcon = glassIcon(Glass.IconBulletList);
export const ExportIcon = glassIcon(Glass.IconFileDownload);
export const HelpIcon = glassIcon(Glass.IconCircleQuestion);
export const HelpIconThin = glassIcon(Glass.IconCircleQuestion);
export const ExternalLinkIcon = glassIcon(Glass.IconOpenInBrowser);
export const checkIcon = glassIcon(Glass.IconCircleCheck);
export const LinkIcon = glassIcon(Glass.IconLink);
export const save = glassIcon(Glass.IconSavedItems);
export const saveAs = glassIcon(Glass.IconNoteSparkle);
export const LoadIcon = glassIcon(Glass.IconFolder);
export const clipboard = glassIcon(Glass.IconClipboard);
export const palette = glassIcon(Glass.IconColorPalette);
export const bucketFillIcon = glassIcon(Glass.IconColorPalette);
export const ExportImageIcon = glassIcon(Glass.IconImageDepth);
export const exportToFileIcon = glassIcon(Glass.IconFileDownload);
export const done = glassIcon(Glass.IconCircleCheck);
export const menu = glassIcon(Glass.IconBulletList);
export const questionCircle = glassIcon(Glass.IconCircleQuestion);
export const share = glassIcon(Glass.IconConnections);
export const warning = glassIcon(Glass.IconTriangleWarning);
export const shareIOS = glassIcon(Glass.IconPaperPlane);
export const exportToPlus = glassIcon(Glass.IconComputerUpload);
export const shareWindows = glassIcon(Glass.IconPaperPlane);
export const resetZoom = glassIcon(Glass.IconRefresh);
export const UndoIcon = glassIcon(Glass.IconArrowBoldLeft);
export const RedoIcon = glassIcon(Glass.IconArrowBoldRight);
export const BringForwardIcon = glassIcon(Glass.IconLayers);
export const SendBackwardIcon = glassIcon(Glass.IconStackPerspective);
export const BringToFrontIcon = glassIcon(Glass.IconAppStack);
export const SendToBackIcon = glassIcon(Glass.IconTileToBottom);
export const AlignTopIcon = glassIcon(Glass.IconArrowBoldUp);
export const AlignBottomIcon = glassIcon(Glass.IconArrowBoldDown);
export const AlignLeftIcon = glassIcon(Glass.IconArrowBoldLeft);
export const AlignRightIcon = glassIcon(Glass.IconArrowBoldRight);
export const DistributeHorizontallyIcon = glassIcon(
  Glass.IconArrowsBoldOppositeDirection,
);
export const DistributeVerticallyIcon = glassIcon(
  Glass.IconArrowsBoldOppositeDirection,
);
export const CenterVerticallyIcon = glassIcon(Glass.IconArrowsConverge);
export const CenterHorizontallyIcon = glassIcon(Glass.IconArrowsConverge);
export const usersIcon = glassIcon(Glass.IconUsers);
export const start = glassIcon(Glass.IconStackPlay);
export const stop = glassIcon(Glass.IconTabClose);
export const CloseIcon = glassIcon(Glass.IconTabClose);
export const clone = glassIcon(Glass.IconCopies);
export const shield = glassIcon(Glass.IconClipboardLock);
export const file = glassIcon(Glass.IconFile);
export const GroupIcon = (_props: { theme?: unknown }) =>
  glassIcon(Glass.IconAbstractIntersection);
export const UngroupIcon = (_props: { theme?: unknown }) =>
  glassIcon(Glass.IconArrowsBoldOppositeDirection);
export const FontFamilyHeadingIcon = glassIcon(Glass.IconNoteSparkle);
export const FontFamilyNormalIcon = glassIcon(Glass.IconNote);
export const codeIcon = glassIcon(Glass.IconCodeEditor);
export const FontFamilyCodeIcon = glassIcon(Glass.IconCodeEditor);
export const FontSizeSmallIcon = glassIcon(Glass.IconNote);
export const FontSizeMediumIcon = glassIcon(Glass.IconNote);
export const FontSizeLargeIcon = glassIcon(Glass.IconNoteSparkle);
export const FontSizeExtraLargeIcon = glassIcon(Glass.IconNoteSparkle);
export const fontSizeIcon = glassIcon(Glass.IconNoteSparkle);
export const TextAlignLeftIcon = glassIcon(Glass.IconBulletList);
export const TextAlignCenterIcon = glassIcon(Glass.IconBulletList);
export const TextAlignRightIcon = glassIcon(Glass.IconBulletList);
export const TextAlignTopIcon = (_props: { theme?: unknown }) =>
  glassIcon(Glass.IconArrowBoldUp);
export const TextAlignBottomIcon = (_props: { theme?: unknown }) =>
  glassIcon(Glass.IconArrowBoldDown);
export const TextAlignMiddleIcon = (_props: { theme?: unknown }) =>
  glassIcon(Glass.IconArrowsConverge);
export const angleIcon = glassIcon(Glass.IconDial);
export const publishIcon = glassIcon(Glass.IconCloudUpload);
export const eraser = glassIcon(Glass.IconDeleteKey);
export const handIcon = glassIcon(Glass.IconMoveUpLeft);
export const downloadIcon = glassIcon(Glass.IconCloudDownload);
export const copyIcon = glassIcon(Glass.IconCopies);
export const cutIcon = glassIcon(Glass.IconScissors);
export const helpIcon = glassIcon(Glass.IconHelpChat);
export const playerPlayIcon = glassIcon(Glass.IconStackPlay);
export const playerStopFilledIcon = glassIcon(Glass.IconTabClose);
export const tablerCheckIcon = glassIcon(Glass.IconCircleCheck);
export const alertTriangleIcon = glassIcon(Glass.IconTriangleWarning);
export const eyeDropperIcon = glassIcon(Glass.IconColorPalette);
export const extraToolsIcon = glassIcon(Glass.IconShapes);
export const frameToolIcon = glassIcon(Glass.IconRectLayoutGrid);
export const RetryIcon = glassIcon(Glass.IconRefresh);
export const stackPushIcon = glassIcon(Glass.IconAppStack);
export const ArrowRightIcon = glassIcon(Glass.IconArrowBoldRight);
export const laserPointerToolIcon = glassIcon(Glass.IconCrosshairs);
export const MagicIcon = glassIcon(Glass.IconMagicWandSparkle);
export const MagicIconThin = glassIcon(Glass.IconMagicWandSparkle);
export const fullscreenIcon = glassIcon(Glass.IconExpandWindow);
export const eyeIcon = glassIcon(Glass.IconEye);
export const eyeClosedIcon = glassIcon(Glass.IconEyeClosed);
export const brainIcon = glassIcon(Glass.IconThinkingHead);
export const brainIconThin = glassIcon(Glass.IconThinkingHead);
export const searchIcon = glassIcon(Glass.IconMagnifier);
export const historyCommandIcon = glassIcon(Glass.IconRoadmap);
export const historyIcon = glassIcon(Glass.IconRoadmap);
export const microphoneIcon = glassIcon(Glass.IconWebcam);
export const microphoneMutedIcon = glassIcon(Glass.IconBan);
export const boltIcon = glassIcon(Glass.IconBolt);
export const selectAllIcon = glassIcon(Glass.IconSquareGrid2);
export const abacusIcon = glassIcon(Glass.IconAnalytics);
export const flipVertical = glassIcon(Glass.IconSwap);
export const flipHorizontal = glassIcon(Glass.IconSwap);
export const paintIcon = glassIcon(Glass.IconColorPalette);
export const zoomAreaIcon = glassIcon(Glass.IconCrosshairs);
export const svgIcon = glassIcon(Glass.IconCodeEditor);
export const pngIcon = glassIcon(Glass.IconImage);
export const magnetIcon = glassIcon(Glass.IconConnect);
export const coffeeIcon = glassIcon(Glass.IconCoffee);
export const DeviceDesktopIcon = glassIcon(Glass.IconMonitor);
export const loginIcon = glassIcon(Glass.IconLock);
export const youtubeIcon = glassIcon(Glass.IconVideo);
export const gridIcon = glassIcon(Glass.IconGrid);
export const lineEditorIcon = glassIcon(Glass.IconStepsIndicator);
export const sharpArrowIcon = glassIcon(Glass.IconArrowBoldRight);
export const elbowArrowIcon = glassIcon(Glass.IconConnections);
export const roundArrowIcon = glassIcon(Glass.IconRefresh);
export const collapseDownIcon = glassIcon(Glass.IconBoxCaretDown);
export const collapseUpIcon = glassIcon(Glass.IconBoxCaretUp);
export const upIcon = glassIcon(Glass.IconArrowBoldUp);
export const cropIcon = glassIcon(Glass.IconImageDepth);
export const elementLinkIcon = glassIcon(Glass.IconLink);
export const resizeIcon = glassIcon(Glass.IconCaretMaximizeDiagonal);
export const adjustmentsIcon = glassIcon(Glass.IconSlidersVertical);
export const strokeIcon = glassIcon(Glass.IconPen);
export const pencilIcon = glassIcon(Glass.IconFeather);
export const chevronLeftIcon = glassIcon(Glass.IconBoxCaretLeft);
export const sidebarRightIcon = glassIcon(Glass.IconSidebarLeftShow);
export const messageCircleIcon = glassIcon(Glass.IconMsgs);
export const presentationIcon = glassIcon(Glass.IconMonitor);
export const chevronRight = glassIcon(Glass.IconBoxCaretRight);
export const settingsIcon = glassIcon(Glass.IconGear);
