import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";

import { authApi } from "../auth/client";

import { downloadWorkspaceFile, workspaceApi } from "./client";
import { Icon } from "./icons";
import { WorkspacePreview } from "./WorkspacePreview";
import "./workspace.scss";

import type {
  WorkspaceFile,
  WorkspaceFolder,
  WorkspaceScope,
  WorkspaceStats,
} from "./types";

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
  window.location.href = `/editor?workspace=${file.id}`;
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
  if (!state) {
    return null;
  }
  return (
    <div className="workspace-modal" role="presentation" onMouseDown={onClose}>
      <form
        className="workspace-modal__card"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) {
            onSubmit(value.trim());
          }
        }}
      >
        <div className="workspace-modal__header">
          <h2>{state.title}</h2>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="关闭"
          >
            <Icon name="close" />
          </button>
        </div>
        <label>
          名称
          <input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={180}
          />
        </label>
        <div className="workspace-modal__actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" type="submit">
            确定
          </button>
        </div>
      </form>
    </div>
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
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [dark, setDark] = useState(
    () => localStorage.getItem("workspace-theme") === "dark",
  );
  const [dragging, setDragging] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
    document.documentElement.dataset.workspaceTheme = dark ? "dark" : "light";
    localStorage.setItem("workspace-theme", dark ? "dark" : "light");
  }, [dark]);
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
      setMenuFor(null);
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
  }: {
    file?: WorkspaceFile;
    folder?: WorkspaceFolder;
  }) => {
    const item = file || folder!;
    const isTrash = scope === "trash";
    return (
      <div className="item-menu" onClick={(event) => event.stopPropagation()}>
        {isTrash ? (
          <button
            onClick={() =>
              mutate(
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
          </button>
        ) : (
          <>
            <button
              onClick={() =>
                setDialog({
                  kind: file ? "file" : "folder",
                  title: `重命名${file ? "文件" : "文件夹"}`,
                  initial: item.name,
                  id: item.id,
                })
              }
            >
              重命名
            </button>
            {file && (
              <button
                onClick={() =>
                  mutate(
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
              </button>
            )}
            {file && (
              <button onClick={() => downloadWorkspaceFile(file)}>
                <Icon name="download" size={17} />
                下载
              </button>
            )}
          </>
        )}
        <button
          className="danger"
          onClick={() => {
            if (
              window.confirm(isTrash ? "确定永久删除？" : "确定移到回收站？")
            ) {
              mutate(
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
        </button>
      </div>
    );
  };

  const renderFolderCard = (folder: WorkspaceFolder) => {
    const key = `folder:${folder.id}`;
    return (
      <article
        key={key}
        className={clsx("folder-card", { selected: selected.has(key) })}
        onDoubleClick={() => {
          setScope("all");
          setFolderId(folder.id);
        }}
      >
        <button
          className="selection-check"
          onClick={(event) => {
            event.stopPropagation();
            toggleSelection(key);
          }}
          aria-label="选择文件夹"
        >
          {selected.has(key) && <Icon name="check" size={14} />}
        </button>
        <div className="folder-card__icon">
          <Icon name="folder" size={39} filled />
        </div>
        <div>
          <strong>{folder.name}</strong>
          <span>
            {folder.itemCount} 个项目 · {formatDate(folder.updatedAt)}
          </span>
        </div>
        <button
          className="more-button"
          onClick={(event) => {
            event.stopPropagation();
            setMenuFor(menuFor === key ? null : key);
          }}
        >
          <Icon name="more" />
        </button>
        {menuFor === key && <ItemMenu folder={folder} />}
      </article>
    );
  };

  const renderFileCard = (file: WorkspaceFile) => {
    const key = `file:${file.id}`;
    return (
      <article
        key={key}
        className={clsx("file-card", { selected: selected.has(key) })}
        onDoubleClick={() => scope !== "trash" && openEditor(file)}
      >
        <button
          className="selection-check"
          onClick={(event) => {
            event.stopPropagation();
            toggleSelection(key);
          }}
          aria-label="选择文件"
        >
          {selected.has(key) && <Icon name="check" size={14} />}
        </button>
        <div className="file-card__preview">
          <WorkspacePreview fileId={file.id} />
          {file.isFavorite && (
            <button
              className="favorite-mark"
              onClick={(event) => {
                event.stopPropagation();
                mutate(
                  () => workspaceApi.updateFile(file.id, { isFavorite: false }),
                  "已取消收藏",
                );
              }}
              aria-label="取消收藏"
            >
              <Icon name="star" filled size={20} />
            </button>
          )}
        </div>
        <div className="file-card__info">
          <div className="file-name">
            <span>
              <Icon name="file" size={17} filled />
            </span>
            <strong title={file.name}>{file.name}</strong>
          </div>
          <button
            className="more-button"
            onClick={(event) => {
              event.stopPropagation();
              setMenuFor(menuFor === key ? null : key);
            }}
          >
            <Icon name="more" />
          </button>
          <p>
            <span>{formatBytes(file.size)}</span>
            <span>{formatDate(file.updatedAt)}</span>
          </p>
        </div>
        {menuFor === key && <ItemMenu file={file} />}
      </article>
    );
  };

  return (
    <div
      className={clsx("workspace-shell", {
        "is-dark": dark,
        "sidebar-collapsed": sidebarCollapsed,
      })}
      onClick={() => setMenuFor(null)}
    >
      <header className="workspace-header">
        <div className="workspace-brand">
          <span className="workspace-brand__mark">⌁</span>
          <span>
            <strong>Excalidraw</strong> File Manager
          </span>
        </div>
        <button
          className="icon-button workspace-menu-button"
          aria-label="菜单"
          onClick={(event) => {
            event.stopPropagation();
            setSidebarCollapsed((value) => !value);
          }}
        >
          <Icon name="menu" />
        </button>
        <div className="workspace-search">
          <Icon name="search" size={19} />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索文件、文件夹..."
            aria-label="搜索文件和文件夹"
          />
          <kbd>Ctrl + K</kbd>
        </div>
        <button
          className="icon-button header-round"
          onClick={(event) => {
            event.stopPropagation();
            setDark((value) => !value);
          }}
          aria-label="切换主题"
        >
          <Icon name={dark ? "moon" : "sun"} />
        </button>
        <div className="workspace-avatar">F</div>
      </header>
      <aside className="workspace-sidebar">
        <button className="new-file-button" onClick={() => createFile()}>
          <Icon name="plus" />
          新建文件
        </button>
        <nav>
          {navItems.map((item) => (
            <button
              key={item.scope}
              className={clsx({ active: scope === item.scope && !folderId })}
              onClick={() => chooseScope(item.scope)}
            >
              <Icon name={item.icon} size={20} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-folders">
          <div className="sidebar-section-title">
            <span>我的文件夹</span>
            <button
              className="icon-button"
              onClick={() =>
                setDialog({ kind: "folder", title: "新建文件夹", initial: "" })
              }
              aria-label="新建文件夹"
            >
              <Icon name="plus" size={18} />
            </button>
          </div>
          {allFolders
            .filter((folder) => !folder.parentId)
            .map((folder) => (
              <button
                key={folder.id}
                className={clsx({ active: folderId === folder.id })}
                onClick={() => {
                  setScope("all");
                  setFolderId(folder.id);
                }}
              >
                <Icon name="folder" size={19} />
                {folder.name}
              </button>
            ))}
          {!allFolders.length && <p className="sidebar-empty">还没有文件夹</p>}
        </div>
        <div className="storage-card">
          <strong>存储空间</strong>
          <span>{formatBytes(stats.usedBytes)} / 10 GB</span>
          <div>
            <i style={{ width: `${storagePercent}%` }} />
          </div>
          <small>{storagePercent.toFixed(1)}%</small>
        </div>
        <button
          type="button"
          className="profile-card"
          title="退出登录"
          onClick={async () => {
            try {
              await authApi.logout();
            } finally {
              window.location.replace("/login");
            }
          }}
        >
          <div className="workspace-avatar">F</div>
          <div>
            <strong>fanmd</strong>
            <span>退出登录</span>
          </div>
          <Icon name="chevron" size={16} />
        </button>
      </aside>
      <main
        className="workspace-main"
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
        <div className="workspace-title">
          <div>
            {folderId && (
              <button
                className="icon-button"
                onClick={() => setFolderId(currentFolder?.parentId || null)}
              >
                <Icon name="back" />
              </button>
            )}
            <section>
              <h1>{title}</h1>
              <p>
                共 {files.length} 个文件和 {folders.length} 个文件夹
              </p>
            </section>
          </div>
        </div>
        <div className="workspace-toolbar">
          <div>
            <button
              className="toolbar-button"
              onClick={() => uploadRef.current?.click()}
            >
              <Icon name="upload" size={18} />
              上传
            </button>
            <input
              ref={uploadRef}
              hidden
              type="file"
              accept=".excalidraw,application/json"
              multiple
              onChange={(event) =>
                event.target.files && upload(event.target.files)
              }
            />
            <button
              className="toolbar-button"
              onClick={() =>
                setDialog({ kind: "folder", title: "新建文件夹", initial: "" })
              }
            >
              <Icon name="folder" size={18} />
              新建文件夹
            </button>
            <button
              className="toolbar-button"
              disabled={
                !selected.size ||
                selected.size > 1 ||
                !Array.from(selected)[0]?.startsWith("file:")
              }
              onClick={() => {
                const key = Array.from(selected)[0];
                const file = files.find((value) => `file:${value.id}` === key);
                if (file) {
                  downloadWorkspaceFile(file);
                }
              }}
            >
              <Icon name="download" size={18} />
              下载
            </button>
            <button
              className="toolbar-button danger"
              disabled={!selected.size}
              onClick={removeSelected}
            >
              <Icon name="trash" size={18} />
              删除
            </button>
          </div>
          <div>
            <div className="view-switch">
              <button
                className={clsx({ active: view === "grid" })}
                onClick={() => setView("grid")}
                aria-label="网格视图"
              >
                <Icon name="grid" size={18} />
              </button>
              <button
                className={clsx({ active: view === "list" })}
                onClick={() => setView("list")}
                aria-label="列表视图"
              >
                <Icon name="list" size={19} />
              </button>
            </div>
            <button
              className="toolbar-button"
              onClick={() =>
                setOrder((value) => (value === "desc" ? "asc" : "desc"))
              }
            >
              <Icon name="sort" size={18} />
              {sort === "name"
                ? "按名称"
                : sort === "size"
                ? "按大小"
                : "按修改时间"}
            </button>
            <select
              className="toolbar-select"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              aria-label="筛选排序"
            >
              <option value="updated_at">修改时间</option>
              <option value="created_at">创建时间</option>
              <option value="name">名称</option>
              <option value="size">大小</option>
            </select>
            <label className="filter-control">
              <span className="toolbar-button">
                <Icon name="filter" size={18} />
                {kindFilter === "all"
                  ? "筛选"
                  : kindFilter === "files"
                  ? "仅文件"
                  : kindFilter === "folders"
                  ? "仅文件夹"
                  : "仅收藏"}
              </span>
              <select
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
            </label>
          </div>
        </div>
        {error && (
          <div className="workspace-error">
            <span>{error}</span>
            <button onClick={() => setError("")}>
              <Icon name="close" size={17} />
            </button>
          </div>
        )}
        <div
          className={clsx("workspace-content", `workspace-content--${view}`)}
        >
          {loading && <div className="workspace-state">正在加载...</div>}
          {!loading && !hasVisibleItems && (
            <div className="workspace-state">
              <span className="empty-folder">
                <Icon name={scope === "trash" ? "trash" : "folder"} size={44} />
              </span>
              <h2>
                {query
                  ? "没有找到匹配的项目"
                  : scope === "trash"
                  ? "回收站是空的"
                  : "这里还没有文件"}
              </h2>
              <p>
                {query
                  ? "换一个关键词试试"
                  : "新建画板或上传已有的 .excalidraw 文件"}
              </p>
              {scope !== "trash" && !query && (
                <button className="primary-button" onClick={() => createFile()}>
                  <Icon name="plus" size={18} />
                  新建文件
                </button>
              )}
            </div>
          )}
          {!loading && visibleFolders.length > 0 && (
            <section className="workspace-section workspace-section--folders">
              <div className="workspace-section__header">
                <h2>文件夹</h2>
                <span>{visibleFolders.length} 个</span>
              </div>
              <div
                className={clsx(
                  "workspace-section__items",
                  `workspace-section__items--${view}`,
                )}
              >
                {visibleFolders.map(renderFolderCard)}
              </div>
            </section>
          )}
          {!loading && kindFilter !== "folders" && filteredFiles.length > 0 && (
            <section className="workspace-section workspace-section--files">
              <div className="workspace-section__header">
                <h2>文件</h2>
                <span>{filteredFiles.length} 个</span>
              </div>
              <div
                className={clsx(
                  "workspace-section__items",
                  `workspace-section__items--${view}`,
                )}
              >
                {visibleFiles.map(renderFileCard)}
                {scope !== "trash" && (
                  <button
                    className="drop-card"
                    onClick={() => uploadRef.current?.click()}
                  >
                    <span>
                      <Icon name="upload" size={32} />
                    </span>
                    <strong>拖拽文件到这里上传</strong>
                    <small>或点击选择文件</small>
                  </button>
                )}
              </div>
              {filteredFiles.length > PAGE_SIZE && (
                <div className="workspace-pagination">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage((value) => value - 1)}
                  >
                    <Icon name="back" size={18} />
                  </button>
                  {Array.from({ length: pages }, (_, index) => index + 1).map(
                    (value) => (
                      <button
                        className={clsx({ active: page === value })}
                        key={value}
                        onClick={() => setPage(value)}
                      >
                        {value}
                      </button>
                    ),
                  )}
                  <button
                    disabled={page === pages}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    <Icon name="chevron" size={18} />
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
        {dragging && (
          <div className="drag-overlay">
            <span>
              <Icon name="upload" size={42} />
            </span>
            <h2>松开以上传文件</h2>
          </div>
        )}
      </main>
      {toast && (
        <div className="workspace-toast">
          <Icon name="check" size={18} />
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
