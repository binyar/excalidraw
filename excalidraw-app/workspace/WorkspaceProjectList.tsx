import { useCallback, useEffect, useMemo, useState } from "react";

import { ArrowUpDown, Grid2X2, List, Plus } from "lucide-react";

import { workspaceApi } from "./client";
import { getWorkspaceEditorPath } from "./editorRoute";
import { getWorkspaceFileDisplayName } from "./fileName";
import { Icon } from "./icons";
import { WorkspacePreview } from "./WorkspacePreview";

import type { WorkspaceFile, WorkspaceFolder } from "./types";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

const formatBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 ** 2) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
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

type NameDialogState = {
  kind: "file" | "folder";
  id?: string;
  initial: string;
} | null;

type DeleteTarget = {
  kind: "file" | "folder";
  id: string;
};

export const WorkspaceProjectList = ({
  folderId,
  folderName,
  onOpenFolder,
  onWorkspaceChanged,
}: {
  folderId: string | null;
  folderName?: string;
  onOpenFolder: (folderId: string) => void;
  onWorkspaceChanged: () => void;
}) => {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [folders, setFolders] = useState<WorkspaceFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState("updated_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [kindFilter, setKindFilter] = useState<"all" | "files" | "folders">(
    "all",
  );
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [nameDialog, setNameDialog] = useState<NameDialogState>(null);
  const [nameValue, setNameValue] = useState("");
  const [deleteTargets, setDeleteTargets] = useState<DeleteTarget[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await workspaceApi.list({
        scope: "all",
        folderId,
        sort,
        order,
      });
      setFiles(result.files);
      setFolders(result.folders);
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [folderId, order, sort]);

  useEffect(() => {
    void load();
    setPage(1);
    setSelected(new Set());
  }, [load]);

  useEffect(() => {
    setNameValue(nameDialog?.initial || "");
  }, [nameDialog]);

  const visibleFolders = kindFilter === "files" ? [] : folders;
  const filteredFiles = kindFilter === "folders" ? [] : files;
  const pages = Math.max(1, Math.ceil(filteredFiles.length / PAGE_SIZE));
  const visibleFiles = filteredFiles.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );
  const canShowCreateCard = kindFilter !== "folders" && page === pages;

  const toggleSelection = (key: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const refresh = async () => {
    await load();
    onWorkspaceChanged();
  };

  const createFile = async () => {
    try {
      const file = await workspaceApi.createFile("未命名画板", folderId);
      window.location.href = getWorkspaceEditorPath(file.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "创建失败");
    }
  };

  const createFolder = async () => {
    setNameDialog({ kind: "folder", initial: "" });
  };

  const submitRename = async () => {
    if (!nameDialog || !nameValue.trim()) {
      return;
    }
    try {
      if (nameDialog.kind === "file" && nameDialog.id) {
        await workspaceApi.updateFile(nameDialog.id, {
          name: getWorkspaceFileDisplayName(nameValue.trim()),
        });
      } else if (nameDialog.id) {
        await workspaceApi.updateFolder(nameDialog.id, nameValue.trim());
      } else {
        await workspaceApi.createFolder(nameValue.trim(), folderId);
      }
      setNameDialog(null);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "重命名失败");
    }
  };

  const confirmDeletion = async () => {
    const targets = deleteTargets;
    setDeleteTargets([]);
    try {
      await Promise.all(
        targets.map((target) =>
          target.kind === "file"
            ? workspaceApi.deleteFile(target.id)
            : workspaceApi.deleteFolder(target.id),
        ),
      );
      setSelected(new Set());
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "删除失败");
    }
  };

  const requestSelectedDeletion = () => {
    const targets = Array.from(selected).map((key) => {
      const [kind, id] = key.split(":");
      return { kind: kind as DeleteTarget["kind"], id };
    });
    setDeleteTargets(targets);
  };

  const ItemMenu = ({
    file,
    folder,
  }: {
    file?: WorkspaceFile;
    folder?: WorkspaceFolder;
  }) => {
    const item = file || folder!;
    const displayName = file
      ? getWorkspaceFileDisplayName(item.name)
      : item.name;
    const kind = file ? "file" : "folder";
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute right-2 top-2 z-10 opacity-70 hover:opacity-100"
            aria-label={`打开 ${displayName} 的操作菜单`}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <Icon name="more" size={18} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-64 max-w-[calc(100vw-2rem)]"
        >
          <DropdownMenuLabel className="truncate" title={displayName}>
            {displayName}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() =>
              setNameDialog({
                kind,
                id: item.id,
                initial: displayName,
              })
            }
          >
            <Icon name="rename" size={17} />
            重命名
          </DropdownMenuItem>
          {file && (
            <DropdownMenuItem
              onSelect={async () => {
                await workspaceApi.updateFile(file.id, {
                  isFavorite: !file.isFavorite,
                });
                await refresh();
              }}
            >
              <Icon name="star" size={17} />
              {file.isFavorite ? "取消收藏" : "收藏"}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDeleteTargets([{ kind, id: item.id }])}
          >
            <Icon name="trash" size={17} />
            删除
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
        onDoubleClick={() => onOpenFolder(folder.id)}
      >
        <Checkbox
          className="absolute left-3 top-3 z-10"
          checked={selected.has(key)}
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={() => toggleSelection(key)}
          aria-label="选择文件夹"
        />
        <div className="grid size-16 place-items-center rounded-lg bg-muted">
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
        <ItemMenu folder={folder} />
      </Card>
    );
  };

  const renderFileCard = (file: WorkspaceFile) => {
    const key = `file:${file.id}`;
    const displayName = getWorkspaceFileDisplayName(file.name);
    return (
      <Card
        key={key}
        className={cn(
          "group relative cursor-default gap-0 overflow-hidden py-0 transition-colors hover:bg-muted/30",
          view === "list" && "grid grid-cols-[160px_1fr]",
          selected.has(key) && "border-primary ring-2 ring-primary/15",
        )}
        onDoubleClick={() =>
          (window.location.href = getWorkspaceEditorPath(file.id))
        }
      >
        <Checkbox
          className="absolute left-3 top-3 z-10 bg-background"
          checked={selected.has(key)}
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={() => toggleSelection(key)}
          aria-label="选择文件"
        />
        <div
          className={cn(
            "relative h-52 overflow-hidden border-b bg-muted/50 [_.workspace-preview]:block [_.workspace-preview]:size-full",
            view === "list" && "h-36 border-r border-b-0",
          )}
        >
          <WorkspacePreview fileId={file.id} />
        </div>
        <CardContent className="relative grid min-h-24 gap-2 p-4 pr-12">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted">
              <Icon name="file" size={16} filled />
            </span>
            <strong
              className="truncate text-sm font-medium"
              title={displayName}
            >
              {displayName}
            </strong>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{formatBytes(file.size)}</span>
            <span>{formatDate(file.updatedAt)}</span>
          </div>
          <ItemMenu file={file} />
        </CardContent>
      </Card>
    );
  };

  return (
    <section className="workspace-projects" aria-labelledby="project-title">
      <header className="workspace-projects__header">
        <div>
          <h1 id="project-title" className="text-2xl font-bold tracking-tight">
            {folderName || "全部文件"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            共 {files.length} 个文件和 {folders.length} 个文件夹
          </p>
        </div>
      </header>

      <div className="workspace-projects__toolbar">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => void createFolder()}>
            <Icon name="folder" size={17} />
            新建文件夹
          </Button>
          {selected.size > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={requestSelectedDeletion}
            >
              <Icon name="trash" size={17} />
              删除
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={kindFilter}
            onValueChange={(value) => setKindFilter(value as typeof kindFilter)}
          >
            <SelectTrigger size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部项目</SelectItem>
              <SelectItem value="files">仅文件</SelectItem>
              <SelectItem value="folders">仅文件夹</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated_at">修改时间</SelectItem>
              <SelectItem value="created_at">创建时间</SelectItem>
              <SelectItem value="name">名称</SelectItem>
              <SelectItem value="size">大小</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() =>
              setOrder((value) => (value === "desc" ? "asc" : "desc"))
            }
            aria-label="切换排序方向"
          >
            <ArrowUpDown className="size-4" />
          </Button>
          <div className="flex rounded-md border bg-background p-0.5 shadow-xs">
            <Button
              variant={view === "grid" ? "secondary" : "ghost"}
              size="icon-sm"
              className="size-7"
              onClick={() => setView("grid")}
              aria-label="网格视图"
            >
              <Grid2X2 className="size-4" />
            </Button>
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="icon-sm"
              className="size-7"
              onClick={() => setView("list")}
              aria-label="列表视图"
            >
              <List className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="workspace-projects__items">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-56 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            {visibleFolders.length > 0 && (
              <div className="space-y-3">
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
              </div>
            )}
            {kindFilter !== "folders" && (
              <div
                className={cn("space-y-3", visibleFolders.length > 0 && "mt-5")}
              >
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
                  {canShowCreateCard && (
                    <button
                      type="button"
                      className={cn(
                        "flex min-h-[304px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-background p-6 text-center hover:bg-muted/40",
                        view === "list" &&
                          "min-h-36 flex-row justify-start px-8 text-left",
                      )}
                      onClick={() => void createFile()}
                    >
                      <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
                        <Plus className="size-6" />
                      </span>
                      <span>
                        <strong className="block text-sm">新建画板</strong>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          创建一个空白画板
                        </span>
                      </span>
                    </button>
                  )}
                </div>
                {filteredFiles.length > PAGE_SIZE && (
                  <div className="flex justify-center gap-1 pt-3">
                    {Array.from({ length: pages }, (_, index) => index + 1).map(
                      (value) => (
                        <Button
                          key={value}
                          variant={page === value ? "default" : "outline"}
                          size="icon-sm"
                          onClick={() => setPage(value)}
                        >
                          {value}
                        </Button>
                      ),
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <Dialog
        open={Boolean(nameDialog)}
        onOpenChange={(open) => !open && setNameDialog(null)}
      >
        <DialogContent>
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              void submitRename();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {nameDialog?.id
                  ? `重命名${nameDialog.kind === "file" ? "文件" : "文件夹"}`
                  : "新建文件夹"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="project-item-name">名称</Label>
              <Input
                id="project-item-name"
                autoFocus
                value={nameValue}
                onChange={(event) => setNameValue(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setNameDialog(null)}
              >
                取消
              </Button>
              <Button type="submit" disabled={!nameValue.trim()}>
                确定
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTargets.length > 0}
        onOpenChange={(open) => !open && setDeleteTargets([])}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除项目？</AlertDialogTitle>
            <AlertDialogDescription>
              选中的 {deleteTargets.length} 个项目将移到回收站。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => void confirmDeletion()}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};
