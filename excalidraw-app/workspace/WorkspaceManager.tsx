import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { authApi } from "../auth/client";

import { AI_STORY_PROMPT_EXAMPLE } from "../ai/copy";

import { savePendingAiCreatePrompt } from "../ai/pendingPrompt";

import { downloadWorkspaceFile, workspaceApi } from "./client";

import { getWorkspaceEditorPath } from "./editorRoute";

import { Icon } from "./icons";

import { WorkspacePreview } from "./WorkspacePreview";

import type {
  WorkspaceFile,
  WorkspaceFolder,
  WorkspaceScope,
  WorkspaceStats,
} from "./types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;
const emptyStats: WorkspaceStats = {
  fileCount: 0,
  folderCount: 0,
  usedBytes: 0,
  capacityBytes: 10 * 1024 ** 3,
};
const scopeLabels: Record<WorkspaceScope, string> = {
  all: "全部文件",
  recent: "最近使用",
  favorites: "收藏夹",
  trash: "回收站",
};
const navItems: { scope: WorkspaceScope; label: string; icon: string }[] = [
  { scope: "all", label: "全部文件", icon: "folder" },
  { scope: "recent", label: "最近使用", icon: "clock" },
  { scope: "favorites", label: "收藏夹", icon: "star" },
  { scope: "trash", label: "回收站", icon: "trash" },
];

const formatBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 ** 2) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  if (bytes < 1024 ** 3) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  }
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(value))
    .replaceAll("/", "-");
const openEditor = (file: WorkspaceFile) => {
  window.location.href = getWorkspaceEditorPath(file.id);
};

const aiFileNameFromPrompt = (prompt: string) => {
  const normalized = prompt
    .replace(/^(请帮我|帮我|请|创建|生成|设计|做一个|画一个)+/g, "")
    .replace(/[，。！？,.!?\n].*$/s, "")
    .replace(/\s+/g, " ")
    .trim();
  return (normalized || "AI 动画流程").slice(0, 24);
};

type DialogState =
  | { kind: "folder"; title: string; initial: string; id?: string }
  | { kind: "file"; title: string; initial: string; id?: string }
  | null;

const NameDialog = ({
  state,
  onClose,
  onSubmit,
}: {
  state: DialogState;
  onClose: () => void;
  onSubmit: (value: string) => void;
}) => {
  const [value, setValue] = useState(state?.initial || "");
  useEffect(() => setValue(state?.initial || ""), [state]);
  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (value.trim()) {
              onSubmit(value.trim());
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{state?.title}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="workspace-item-name">名称</Label>
            <Input
              id="workspace-item-name"
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              maxLength={180}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={!value.trim()}>
              确定
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export const WorkspaceManager = () => {
  const [scope, setScope] = useState<WorkspaceScope>("all");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [folders, setFolders] = useState<WorkspaceFolder[]>([]);
  const [allFolders, setAllFolders] = useState<WorkspaceFolder[]>([]);
  const [stats, setStats] = useState(emptyStats);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("updated_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [kindFilter, setKindFilter] = useState<
    "all" | "files" | "folders" | "favorites"
  >("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [dragging, setDragging] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiCreating, setAiCreating] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [items, folderList] = await Promise.all([
        workspaceApi.list({
          scope,
          folderId: scope === "all" ? folderId : null,
          query,
          sort,
          order,
        }),
        workspaceApi.folders(),
      ]);
      setFiles(items.files);
      setFolders(items.folders);
      setStats(items.stats);
      setAllFolders(folderList.folders);
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [folderId, order, query, scope, sort]);

  useEffect(() => {
    const timer = window.setTimeout(load, query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [scope, folderId, query, sort, order, kindFilter]);
  useEffect(() => {
    document.documentElement.dataset.workspaceTheme = "light";
    localStorage.removeItem("workspace-theme");
  }, []);
  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(""), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const visibleFolders = useMemo(
    () => (kindFilter === "files" || kindFilter === "favorites" ? [] : folders),
    [folders, kindFilter],
  );
  const filteredFiles = useMemo(
    () =>
      kindFilter === "folders"
        ? []
        : files.filter((file) => kindFilter !== "favorites" || file.isFavorite),
    [files, kindFilter],
  );
  const pages = Math.max(1, Math.ceil(filteredFiles.length / PAGE_SIZE));
  const visibleFiles = filteredFiles.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );
  const hasVisibleItems = visibleFolders.length > 0 || filteredFiles.length > 0;
  const currentFolder = allFolders.find((folder) => folder.id === folderId);
  const title = currentFolder?.name || scopeLabels[scope];
  const storagePercent = Math.min(
    100,
    (stats.usedBytes / stats.capacityBytes) * 100,
  );

  const notifyError = (nextError: unknown) =>
    setError(nextError instanceof Error ? nextError.message : "操作失败");
  const mutate = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action();
      await load();
      setToast(message);
    } catch (nextError) {
      notifyError(nextError);
    }
  };
  const createFile = async (name = "未命名画板") => {
    try {
      const file = await workspaceApi.createFile(name, folderId);
      openEditor(file);
    } catch (nextError) {
      notifyError(nextError);
    }
  };
  const createFileWithAi = async () => {
    const prompt = aiPrompt.trim();
    if (!prompt || aiCreating) {
      return;
    }
    setAiCreating(true);
    try {
      const file = await workspaceApi.createFile(
        aiFileNameFromPrompt(prompt),
        folderId,
      );
      savePendingAiCreatePrompt(file.id, prompt);
      openEditor(file);
    } catch (nextError) {
      notifyError(nextError);
      setAiCreating(false);
    }
  };
  const upload = async (incoming: FileList | File[]) => {
    const accepted = Array.from(incoming).filter(
      (file) =>
        file.name.toLowerCase().endsWith(".excalidraw") ||
        file.type.includes("json"),
    );
    if (!accepted.length) {
      setError("请选择 .excalidraw 文件");
      return;
    }
    try {
      await Promise.all(
        accepted.map((file) => workspaceApi.importFile(file, folderId)),
      );
      await load();
      setToast(`已上传 ${accepted.length} 个文件`);
    } catch (nextError) {
      notifyError(nextError);
    }
  };
  const chooseScope = (nextScope: WorkspaceScope) => {
    setScope(nextScope);
    setFolderId(null);
  };
  const toggleSelection = (key: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const removeSelected = async () => {
    const permanent = scope === "trash";
    if (
      !window.confirm(
        permanent
          ? "确定永久删除选中项目？此操作无法撤销。"
          : "确定将选中项目移到回收站？",
      )
    ) {
      return;
    }
    await mutate(
      async () =>
        Promise.all(
          Array.from(selected).map(async (key) => {
            const [kind, id] = key.split(":");
            return kind === "file"
              ? workspaceApi.deleteFile(id, permanent)
              : workspaceApi.deleteFolder(id, permanent);
          }),
        ),
      permanent ? "已永久删除" : "已移到回收站",
    );
    setSelected(new Set());
  };
  const submitDialog = async (name: string) => {
    if (!dialog) {
      return;
    }
    const action =
      dialog.kind === "folder"
        ? dialog.id
          ? () => workspaceApi.updateFolder(dialog.id!, name)
          : () => workspaceApi.createFolder(name, folderId)
        : dialog.id
        ? () => workspaceApi.updateFile(dialog.id!, { name })
        : () => workspaceApi.createFile(name, folderId);
    await mutate(action, dialog.id ? "名称已更新" : "创建成功");
    setDialog(null);
  };

  const ItemMenu = ({
    file,
    folder,
    label,
  }: {
    file?: WorkspaceFile;
    folder?: WorkspaceFolder;
    label: string;
  }) => {
    const item = file || folder!;
    const isTrash = scope === "trash";
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute right-2 top-2 opacity-70 hover:opacity-100"
            aria-label={label}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <Icon name="more" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onClick={(event) => event.stopPropagation()}
        >
          <DropdownMenuLabel>{item.name}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {isTrash ? (
            <DropdownMenuItem
              onSelect={() =>
                void mutate(
                  () =>
                    file
                      ? workspaceApi.restoreFile(file.id)
                      : workspaceApi.restoreFolder(folder!.id),
                  "已恢复",
                )
              }
            >
              <Icon name="restore" size={17} />
              恢复
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem
                onSelect={() =>
                  setDialog({
                    kind: file ? "file" : "folder",
                    title: `重命名${file ? "文件" : "文件夹"}`,
                    initial: item.name,
                    id: item.id,
                  })
                }
              >
                重命名
              </DropdownMenuItem>
              {file && (
                <DropdownMenuItem
                  onSelect={() =>
                    void mutate(
                      () =>
                        workspaceApi.updateFile(file.id, {
                          isFavorite: !file.isFavorite,
                        }),
                      file.isFavorite ? "已取消收藏" : "已收藏",
                    )
                  }
                >
                  <Icon name="star" size={17} />
                  {file.isFavorite ? "取消收藏" : "收藏"}
                </DropdownMenuItem>
              )}
              {file && (
                <DropdownMenuItem onSelect={() => downloadWorkspaceFile(file)}>
                  <Icon name="download" size={17} />
                  下载
                </DropdownMenuItem>
              )}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              if (
                window.confirm(isTrash ? "确定永久删除？" : "确定移到回收站？")
              ) {
                void mutate(
                  () =>
                    file
                      ? workspaceApi.deleteFile(file.id, isTrash)
                      : workspaceApi.deleteFolder(folder!.id, isTrash),
                  isTrash ? "已永久删除" : "已移到回收站",
                );
              }
            }}
          >
            <Icon name="trash" size={17} />
            {isTrash ? "永久删除" : "删除"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const renderFolderCard = (folder: WorkspaceFolder) => {
    const key = `folder:${folder.id}`;
    return (
      <Card
        key={key}
        className={cn(
          "group relative cursor-default gap-3 overflow-hidden p-4 py-4 transition-colors hover:bg-muted/40",
          view === "list" && "grid grid-cols-[auto_1fr] items-center",
          selected.has(key) && "border-primary ring-2 ring-primary/15",
        )}
        onDoubleClick={() => {
          setScope("all");
          setFolderId(folder.id);
        }}
      >
        <Checkbox
          className="absolute left-3 top-3 z-10"
          checked={selected.has(key)}
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={() => {
            toggleSelection(key);
          }}
          aria-label="选择文件夹"
        />
        <div className="grid size-16 place-items-center rounded-lg bg-muted text-foreground">
          <Icon name="folder" size={36} filled />
        </div>
        <div className="min-w-0 pr-8">
          <strong className="block truncate text-sm font-medium">
            {folder.name}
          </strong>
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            {folder.itemCount} 个项目 · {formatDate(folder.updatedAt)}
          </span>
        </div>
        <ItemMenu folder={folder} label={`打开 ${folder.name} 的操作菜单`} />
      </Card>
    );
  };

  const renderFileCard = (file: WorkspaceFile) => {
    const key = `file:${file.id}`;
    return (
      <Card
        key={key}
        className={cn(
          "group relative cursor-default gap-0 overflow-hidden py-0 transition-colors hover:bg-muted/30",
          view === "list" && "grid grid-cols-[160px_1fr]",
          selected.has(key) && "border-primary ring-2 ring-primary/15",
        )}
        onDoubleClick={() => scope !== "trash" && openEditor(file)}
      >
        <Checkbox
          className="absolute left-3 top-3 z-10 bg-background"
          checked={selected.has(key)}
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={() => {
            toggleSelection(key);
          }}
          aria-label="选择文件"
        />
        <div className="relative min-h-36 overflow-hidden border-b bg-muted/50 [_.workspace-preview]:h-full [_.workspace-preview]:min-h-36">
          <WorkspacePreview fileId={file.id} />
          {file.isFavorite && (
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              className="absolute bottom-2 right-2"
              onClick={(event) => {
                event.stopPropagation();
                void mutate(
                  () => workspaceApi.updateFile(file.id, { isFavorite: false }),
                  "已取消收藏",
                );
              }}
              aria-label="取消收藏"
            >
              <Icon name="star" filled size={18} />
            </Button>
          )}
        </div>
        <CardContent className="relative grid gap-2 p-4 pr-12">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted">
              <Icon name="file" size={16} filled />
            </span>
            <strong className="truncate text-sm font-medium" title={file.name}>
              {file.name}
            </strong>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{formatBytes(file.size)}</span>
            <span>{formatDate(file.updatedAt)}</span>
          </div>
          <ItemMenu file={file} label={`打开 ${file.name} 的操作菜单`} />
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-svh bg-background text-foreground">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-sidebar transition-transform duration-200",
          sidebarCollapsed && "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b px-4">
          <span className="grid size-9 place-items-center rounded-lg bg-sidebar-primary text-xl text-sidebar-primary-foreground">
            ⌁
          </span>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold">Powdoo</div>
            <div className="truncate text-xs text-muted-foreground">
              Animation Workspace
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
          <Button className="w-full" onClick={() => void createFile()}>
            <Icon name="plus" />
            新建画板
          </Button>

          <nav className="grid gap-1" aria-label="工作区导航">
            <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
              工作区
            </p>
            {navItems.map((item) => {
              const active = scope === item.scope && !folderId;
              return (
                <Button
                  key={item.scope}
                  variant="ghost"
                  className={cn(
                    "justify-start",
                    active &&
                      "bg-sidebar-accent text-sidebar-accent-foreground",
                  )}
                  onClick={() => chooseScope(item.scope)}
                >
                  <Icon name={item.icon} size={19} />
                  {item.label}
                </Button>
              );
            })}
          </nav>

          <Separator />

          <div className="grid gap-1">
            <div className="flex items-center justify-between px-2">
              <p className="text-xs font-medium text-muted-foreground">
                我的文件夹
              </p>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() =>
                  setDialog({
                    kind: "folder",
                    title: "新建文件夹",
                    initial: "",
                  })
                }
                aria-label="新建文件夹"
              >
                <Icon name="plus" size={17} />
              </Button>
            </div>
            {allFolders
              .filter((folder) => !folder.parentId)
              .map((folder) => (
                <Button
                  key={folder.id}
                  variant="ghost"
                  className={cn(
                    "justify-start",
                    folderId === folder.id &&
                      "bg-sidebar-accent text-sidebar-accent-foreground",
                  )}
                  onClick={() => {
                    setScope("all");
                    setFolderId(folder.id);
                  }}
                >
                  <Icon name="folder" size={18} />
                  <span className="truncate">{folder.name}</span>
                </Button>
              ))}
            {!allFolders.length && (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                还没有文件夹
              </p>
            )}
          </div>

          <Card className="mt-auto gap-3 py-4 shadow-none">
            <CardContent className="grid gap-3 px-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">存储空间</span>
                <span className="text-muted-foreground">
                  {storagePercent.toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${storagePercent}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {formatBytes(stats.usedBytes)} / 10 GB
              </span>
            </CardContent>
          </Card>
        </div>

        <div className="border-t p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-auto w-full justify-start p-2"
              >
                <span className="grid size-8 place-items-center rounded-full bg-muted text-xs font-semibold">
                  F
                </span>
                <span className="min-w-0 flex-1 text-left leading-tight">
                  <span className="block truncate text-sm font-medium">
                    fanmd
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    工作区管理员
                  </span>
                </span>
                <Icon name="chevron" size={15} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel>账户</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={async () => {
                  try {
                    await authApi.logout();
                  } finally {
                    window.location.replace("/login");
                  }
                }}
              >
                退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div
        className={cn(
          "min-h-svh transition-[padding] duration-200",
          sidebarCollapsed ? "pl-0" : "pl-64",
        )}
      >
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
          <Button
            variant="outline"
            size="icon"
            aria-label="切换侧边栏"
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            <Icon name="menu" />
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div className="relative w-full max-w-md">
            <Icon
              name="search"
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={searchRef}
              className="pl-9 pr-20"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索文件、文件夹..."
              aria-label="搜索文件和文件夹"
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Ctrl K
            </kbd>
          </div>
          <div className="ml-auto hidden items-center gap-2 sm:flex">
            <Badge variant="outline">{stats.fileCount} 个文件</Badge>
          </div>
        </header>

        <main
          className="relative mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:p-6"
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) {
              setDragging(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            upload(event.dataTransfer.files);
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {folderId && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setFolderId(currentFolder?.parentId || null)}
                >
                  <Icon name="back" />
                </Button>
              )}
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  共 {files.length} 个文件和 {folders.length} 个文件夹
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => uploadRef.current?.click()}
              >
                <Icon name="upload" size={17} />
                上传
              </Button>
              <Button onClick={() => void createFile()}>
                <Icon name="plus" size={17} />
                新建画板
              </Button>
            </div>
          </div>

          {scope !== "trash" && (
            <Card aria-labelledby="ai-create-title">
              <CardContent className="grid gap-5 px-6 md:grid-cols-[minmax(240px,0.7fr)_minmax(360px,1.3fr)] md:items-center">
                <div className="flex gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                    <Icon name="magic" size={21} />
                  </span>
                  <div>
                    <Badge variant="secondary" className="mb-2">
                      AI CREATE
                    </Badge>
                    <h2 id="ai-create-title" className="font-semibold">
                      描述故事，直接创建动画画板
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      主 Agent 先创建完整画布，再由动画 Agent 规划时间轴。
                    </p>
                  </div>
                </div>
                <form
                  className="grid gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void createFileWithAi();
                  }}
                >
                  <Textarea
                    value={aiPrompt}
                    onChange={(event) => setAiPrompt(event.target.value)}
                    placeholder={AI_STORY_PROMPT_EXAMPLE}
                    rows={3}
                    disabled={aiCreating}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                      Enter 创建 · Shift + Enter 换行
                    </span>
                    <Button
                      type="submit"
                      disabled={!aiPrompt.trim() || aiCreating}
                    >
                      <Icon name={aiCreating ? "clock" : "send"} size={17} />
                      {aiCreating ? "正在创建" : "AI 创建"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-2 shadow-xs">
            <div className="flex flex-wrap items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => uploadRef.current?.click()}
              >
                <Icon name="upload" size={17} />
                上传
              </Button>
              <input
                ref={uploadRef}
                hidden
                type="file"
                accept=".excalidraw,application/json"
                multiple
                onChange={(event) =>
                  event.target.files && void upload(event.target.files)
                }
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setDialog({
                    kind: "folder",
                    title: "新建文件夹",
                    initial: "",
                  })
                }
              >
                <Icon name="folder" size={17} />
                新建文件夹
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={
                  !selected.size ||
                  selected.size > 1 ||
                  !Array.from(selected)[0]?.startsWith("file:")
                }
                onClick={() => {
                  const key = Array.from(selected)[0];
                  const file = files.find(
                    (value) => `file:${value.id}` === key,
                  );
                  if (file) {
                    void downloadWorkspaceFile(file);
                  }
                }}
              >
                <Icon name="download" size={17} />
                下载
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={!selected.size}
                onClick={() => void removeSelected()}
              >
                <Icon name="trash" size={17} />
                删除
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-8 rounded-md border bg-background px-2 text-sm shadow-xs outline-none focus:ring-2 focus:ring-ring/40"
                value={kindFilter}
                onChange={(event) =>
                  setKindFilter(event.target.value as typeof kindFilter)
                }
                aria-label="筛选项目类型"
              >
                <option value="all">全部项目</option>
                <option value="files">仅文件</option>
                <option value="folders">仅文件夹</option>
                <option value="favorites">仅收藏文件</option>
              </select>
              <select
                className="h-8 rounded-md border bg-background px-2 text-sm shadow-xs outline-none focus:ring-2 focus:ring-ring/40"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                aria-label="排序字段"
              >
                <option value="updated_at">修改时间</option>
                <option value="created_at">创建时间</option>
                <option value="name">名称</option>
                <option value="size">大小</option>
              </select>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() =>
                  setOrder((value) => (value === "desc" ? "asc" : "desc"))
                }
                aria-label="切换排序方向"
              >
                <Icon name="sort" size={17} />
              </Button>
              <div className="flex rounded-md border bg-background p-0.5 shadow-xs">
                <Button
                  variant={view === "grid" ? "secondary" : "ghost"}
                  size="icon-sm"
                  className="size-7"
                  onClick={() => setView("grid")}
                  aria-label="网格视图"
                >
                  <Icon name="grid" size={17} />
                </Button>
                <Button
                  variant={view === "list" ? "secondary" : "ghost"}
                  size="icon-sm"
                  className="size-7"
                  onClick={() => setView("list")}
                  aria-label="列表视图"
                >
                  <Icon name="list" size={17} />
                </Button>
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <span className="flex-1">{error}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setError("")}
              >
                <Icon name="close" size={16} />
              </Button>
            </div>
          )}

          {loading && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-56 w-full rounded-xl" />
              ))}
            </div>
          )}

          {!loading && !hasVisibleItems && (
            <Card className="items-center py-14 text-center">
              <span className="grid size-14 place-items-center rounded-full bg-muted">
                <Icon name={scope === "trash" ? "trash" : "folder"} size={30} />
              </span>
              <div className="space-y-1">
                <h2 className="font-semibold">
                  {query
                    ? "没有找到匹配的项目"
                    : scope === "trash"
                    ? "回收站是空的"
                    : "这里还没有文件"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {query
                    ? "换一个关键词试试"
                    : "新建画板或上传已有的 .excalidraw 文件"}
                </p>
              </div>
              {scope !== "trash" && !query && (
                <Button onClick={() => void createFile()}>
                  <Icon name="plus" size={17} />
                  新建文件
                </Button>
              )}
            </Card>
          )}

          {!loading && visibleFolders.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">文件夹</h2>
                <Badge variant="secondary">{visibleFolders.length}</Badge>
              </div>
              <div
                className={cn(
                  "grid gap-4",
                  view === "grid"
                    ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                    : "grid-cols-1",
                )}
              >
                {visibleFolders.map(renderFolderCard)}
              </div>
            </section>
          )}

          {!loading && kindFilter !== "folders" && filteredFiles.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">文件</h2>
                <Badge variant="secondary">{filteredFiles.length}</Badge>
              </div>
              <div
                className={cn(
                  "grid gap-4",
                  view === "grid"
                    ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                    : "grid-cols-1",
                )}
              >
                {visibleFiles.map(renderFileCard)}
                {scope !== "trash" && (
                  <Button
                    variant="outline"
                    className="h-full min-h-48 flex-col border-dashed text-muted-foreground hover:text-foreground"
                    onClick={() => uploadRef.current?.click()}
                  >
                    <Icon name="upload" size={28} />
                    <span className="font-medium">拖拽文件到这里上传</span>
                    <span className="text-xs">或点击选择文件</span>
                  </Button>
                )}
              </div>
              {filteredFiles.length > PAGE_SIZE && (
                <div className="flex justify-center gap-1 pt-3">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={page === 1}
                    onClick={() => setPage((value) => value - 1)}
                  >
                    <Icon name="back" size={17} />
                  </Button>
                  {Array.from({ length: pages }, (_, index) => index + 1).map(
                    (value) => (
                      <Button
                        variant={page === value ? "default" : "outline"}
                        size="icon-sm"
                        key={value}
                        onClick={() => setPage(value)}
                      >
                        {value}
                      </Button>
                    ),
                  )}
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={page === pages}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    <Icon name="chevron" size={17} />
                  </Button>
                </div>
              )}
            </section>
          )}
          {dragging && (
            <div className="absolute inset-4 z-50 grid place-content-center gap-3 rounded-xl border-2 border-dashed border-primary bg-background/90 text-center backdrop-blur">
              <Icon name="upload" size={38} />
              <h2 className="font-semibold">松开以上传文件</h2>
            </div>
          )}
        </main>
      </div>

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-lg border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg">
          <Icon name="check" size={17} />
          {toast}
        </div>
      )}
      <NameDialog
        state={dialog}
        onClose={() => setDialog(null)}
        onSubmit={submitDialog}
      />
    </div>
  );
};
