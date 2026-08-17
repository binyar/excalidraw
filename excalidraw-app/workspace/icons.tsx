import {
  ArrowLeft,
  ArrowUpDown,
  Check,
  ChevronRight,
  Clock,
  Download,
  File,
  Filter,
  Folder,
  LayoutGrid,
  List,
  Menu,
  Moon,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";

const icons: Record<string, LucideIcon> = {
  search: Search,
  menu: Menu,
  grid: LayoutGrid,
  list: List,
  folder: Folder,
  clock: Clock,
  star: Star,
  trash: Trash2,
  upload: Upload,
  download: Download,
  plus: Plus,
  filter: Filter,
  sort: ArrowUpDown,
  more: MoreVertical,
  sun: Sun,
  moon: Moon,
  file: File,
  back: ArrowLeft,
  chevron: ChevronRight,
  restore: RotateCcw,
  close: X,
  check: Check,
  magic: WandSparkles,
  send: Send,
  rename: Pencil,
  sparkle: Sparkles,
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
  const GenericIcon = icons[name] ?? File;

  return (
    <GenericIcon
      aria-hidden="true"
      className={className}
      data-filled={filled || undefined}
      size={size}
      strokeWidth={1.8}
    />
  );
};
