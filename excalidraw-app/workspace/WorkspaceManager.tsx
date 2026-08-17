import { useCallback, useEffect, useState } from "react";

import {
  BrainCircuit,
  Cpu,
  FilePenLine,
  Folder,
  Lightbulb,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Send,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  WandSparkles,
} from "lucide-react";

import { savePendingAiCreatePrompt } from "../ai/pendingPrompt";
import { authApi } from "../auth/client";

import { workspaceApi } from "./client";
import { getWorkspaceEditorPath } from "./editorRoute";
import { Icon } from "./icons";
import "./WorkspaceManager.css";
import { WorkspaceProjectList } from "./WorkspaceProjectList";

import type { WorkspaceFile, WorkspaceFolder, WorkspaceStats } from "./types";

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
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const emptyStats: WorkspaceStats = {
  fileCount: 0,
  folderCount: 0,
  usedBytes: 0,
  capacityBytes: 10 * 1024 ** 3,
};

const creationModes = [
  {
    id: "story",
    label: "故事短片",
    icon: WandSparkles,
    skill: "故事编排",
    tabPrompt: "创建一段完整的动画故事，包含开场、冲突、转折和结尾。",
    templates: [
      ["成长故事", "讲述一个角色从遇到问题到完成成长的动画故事。", "warm"],
      ["品牌起源", "讲述一个产品从想法诞生到被用户认可的故事。", "dark"],
      ["客户案例", "用故事方式呈现客户问题、解决过程和最终成果。", "photo"],
      ["未来畅想", "创作一段从当下走向未来的愿景动画故事。", "red"],
    ],
    suggestions: [
      [
        "讲述一个普通人借助新工具解决工作难题并获得成长的故事。",
        "创建一个职场成长动画故事。",
      ],
      [
        "用三幕式结构讲述团队从遭遇挑战到找到突破口的过程。",
        "创建一个团队突破困境的三幕式故事。",
      ],
      [
        "以一天的时间线串联人物、事件和最终改变。",
        "创建一个以一天为时间线的动画故事。",
      ],
    ],
  },
  {
    id: "launch",
    label: "产品发布",
    icon: ShoppingBag,
    skill: "发布叙事",
    tabPrompt: "创建一个产品发布故事，从用户痛点、核心能力到最终成果。",
    templates: [
      ["新品发布", "创建一个新品发布动画，突出核心卖点与使用价值。", "warm"],
      ["功能上新", "介绍一项新功能解决的问题、使用方式和实际收益。", "dark"],
      ["方案发布", "从行业挑战开始，完整呈现解决方案与落地成果。", "photo"],
      ["版本升级", "对比升级前后体验，讲清本次版本的关键变化。", "red"],
    ],
    suggestions: [
      [
        "从用户痛点、解决方案到核心能力与最终成果。",
        "创建一个完整的产品发布动画故事。",
      ],
      [
        "用三个真实使用场景说明新产品如何提升效率。",
        "创建一个场景化产品发布演示。",
      ],
      [
        "先制造悬念，再逐步揭晓产品能力与发布信息。",
        "创建一个带悬念的新品发布故事。",
      ],
    ],
  },
  {
    id: "data",
    label: "数据叙事",
    icon: SlidersHorizontal,
    skill: "数据讲解",
    tabPrompt: "创建一份数据复盘动画，讲清趋势、原因、结论和下一步行动。",
    templates: [
      ["季度复盘", "用动画呈现季度目标、关键数据和下一步计划。", "warm"],
      ["增长分析", "围绕增长趋势、驱动因素和机会点展开数据故事。", "dark"],
      ["用户洞察", "通过用户数据讲述行为变化和核心发现。", "photo"],
      ["运营周报", "将运营指标、异常和行动计划组织成简洁动画。", "red"],
    ],
    suggestions: [
      [
        "用清晰的数据节奏讲述增长、效率与用户价值。",
        "创建一份增长数据复盘动画。",
      ],
      [
        "先展示结果，再逐层拆解变化原因和关键驱动指标。",
        "创建一个倒叙式数据分析故事。",
      ],
      [
        "将复杂指标转成三个易理解的业务结论。",
        "创建一个面向管理层的数据汇报动画。",
      ],
    ],
  },
  {
    id: "tutorial",
    label: "教学演示",
    icon: Monitor,
    skill: "步骤讲解",
    tabPrompt: "创建一个分步骤教学动画，用清晰镜头讲解操作过程和注意事项。",
    templates: [
      ["产品教程", "分步骤演示产品的核心操作和使用技巧。", "warm"],
      ["流程培训", "将业务流程拆解成易理解的教学动画。", "dark"],
      ["概念讲解", "使用类比和图示解释一个复杂概念。", "photo"],
      ["快速入门", "制作一段新用户快速上手的入门动画。", "red"],
    ],
    suggestions: [
      [
        "把复杂操作拆成准备、执行和检查三个阶段。",
        "创建一个三阶段操作教学动画。",
      ],
      [
        "使用错误示例与正确示例对比讲清注意事项。",
        "创建一个正误对比教学故事。",
      ],
      ["以新用户视角完成从零开始的首次使用。", "创建一个新手入门引导动画。"],
    ],
  },
  {
    id: "creative",
    label: "创意动画",
    icon: Sparkles,
    skill: "视觉创意",
    tabPrompt: "创建一段富有视觉创意的动画，用独特转场和节奏表达主题。",
    templates: [
      ["概念动画", "用抽象图形和动态隐喻表达一个核心概念。", "warm"],
      ["节奏短片", "通过快速节奏、视觉冲击和连续转场制造记忆点。", "dark"],
      ["情绪动画", "围绕一种情绪设计画面、色彩与运动变化。", "photo"],
      ["创意开场", "制作一段具有强烈视觉吸引力的动画开场。", "red"],
    ],
    suggestions: [
      [
        "让几何图形随音乐节奏组合成一个完整主题。",
        "创建一个几何图形节奏动画。",
      ],
      [
        "通过空间穿梭和连续变形连接不同故事场景。",
        "创建一个连续变形转场动画。",
      ],
      [
        "从一个微小元素开始，逐步扩展成完整视觉世界。",
        "创建一个由小到大的视觉创意故事。",
      ],
    ],
  },
] as const;

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

type FolderDialogState = {
  title: string;
  initial: string;
  id?: string;
} | null;

type DeleteConfirmation = {
  folderId: string;
  folderName: string;
} | null;

const FolderNameDialog = ({
  state,
  onClose,
  onSubmit,
}: {
  state: FolderDialogState;
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
            <Label htmlFor="workspace-folder-name">名称</Label>
            <Input
              id="workspace-folder-name"
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
  const [workspaceMode, setWorkspaceMode] = useState<"create" | "projects">(
    "create",
  );
  const [allFolders, setAllFolders] = useState<WorkspaceFolder[]>([]);
  const [stats, setStats] = useState(emptyStats);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderDialog, setFolderDialog] = useState<FolderDialogState>(null);
  const [deleteConfirmation, setDeleteConfirmation] =
    useState<DeleteConfirmation>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [creationModeId, setCreationModeId] = useState(
    creationModes[0].id as typeof creationModes[number]["id"],
  );
  const [aiPrompt, setAiPrompt] = useState("");
  const [typedPromptHint, setTypedPromptHint] = useState("");
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [aiCreating, setAiCreating] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const loadWorkspace = useCallback(async () => {
    try {
      const [overview, folderList] = await Promise.all([
        workspaceApi.list({ scope: "all", folderId: null }),
        workspaceApi.folders(),
      ]);
      setStats(overview.stats);
      setAllFolders(folderList.folders);
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

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

  const rootFolders = allFolders.filter(
    (folder) => !folder.parentId && !folder.isDeleted,
  );
  const currentFolder = allFolders.find((folder) => folder.id === folderId);
  const activeCreationMode =
    creationModes.find((mode) => mode.id === creationModeId) ||
    creationModes[0];
  useEffect(() => {
    const prompt = activeCreationMode.tabPrompt;
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setTypedPromptHint(prompt);
      return;
    }
    setTypedPromptHint("");
    let characterIndex = 0;
    let intervalId: number | undefined;
    const startTimer = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        characterIndex += 1;
        setTypedPromptHint(prompt.slice(0, characterIndex));
        if (characterIndex >= prompt.length && intervalId !== undefined) {
          window.clearInterval(intervalId);
        }
      }, 38);
    }, 180);
    return () => {
      window.clearTimeout(startTimer);
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [activeCreationMode.tabPrompt]);
  const storagePercent = Math.min(
    100,
    (stats.usedBytes / stats.capacityBytes) * 100,
  );

  const mutateFolder = async (
    action: () => Promise<unknown>,
    message: string,
  ) => {
    try {
      await action();
      await loadWorkspace();
      setToast(message);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "操作失败");
    }
  };

  const submitFolderDialog = async (name: string) => {
    if (!folderDialog) {
      return;
    }
    const action = folderDialog.id
      ? () => workspaceApi.updateFolder(folderDialog.id!, name)
      : () => workspaceApi.createFolder(name, null);
    await mutateFolder(action, folderDialog.id ? "名称已更新" : "文件夹已创建");
    setFolderDialog(null);
  };

  const confirmFolderDeletion = async () => {
    if (!deleteConfirmation) {
      return;
    }
    const deletingFolderId = deleteConfirmation.folderId;
    setDeleteConfirmation(null);
    await mutateFolder(
      () => workspaceApi.deleteFolder(deletingFolderId),
      "已移到回收站",
    );
    if (folderId === deletingFolderId) {
      setFolderId(null);
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
        null,
      );
      savePendingAiCreatePrompt(file.id, prompt, { thinkingEnabled });
      openEditor(file);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "创建失败");
      setAiCreating(false);
    }
  };

  const renderFolder = (folder: WorkspaceFolder) => (
    <div key={folder.id} className="group relative">
      <Button
        type="button"
        variant="ghost"
        className={cn(
          "h-9 w-full justify-start pr-10 text-sm font-normal",
          workspaceMode === "projects" &&
            folderId === folder.id &&
            "bg-sidebar-accent font-medium",
        )}
        onClick={() => {
          setFolderId(folder.id);
          setWorkspaceMode("projects");
        }}
      >
        <Folder className="size-4" />
        <span className="truncate">{folder.name}</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute right-0 top-0 size-9 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
            aria-label={`打开 ${folder.name} 的操作菜单`}
          >
            <Icon name="more" size={17} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="right"
          align="start"
          className="w-56 max-w-[calc(100vw-2rem)]"
        >
          <DropdownMenuLabel className="truncate" title={folder.name}>
            {folder.name}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() =>
              setFolderDialog({
                title: "重命名文件夹",
                initial: folder.name,
                id: folder.id,
              })
            }
          >
            <Icon name="rename" size={17} />
            重命名
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() =>
              setDeleteConfirmation({
                folderId: folder.id,
                folderName: folder.name,
              })
            }
          >
            <Icon name="trash" size={17} />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <div className="workspace-home h-svh overflow-hidden bg-muted/20 text-foreground">
      <aside
        className={cn(
          "workspace-home__sidebar fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-sidebar transition-transform duration-200",
          sidebarCollapsed && "-translate-x-full",
        )}
      >
        <div className="workspace-home__brand flex h-20 shrink-0 items-center gap-3 px-4">
          <span className="grid size-10 place-items-center rounded-xl bg-sidebar-primary text-xl text-sidebar-primary-foreground">
            ⌁
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-base font-bold">Powdoo</div>
            <div className="truncate text-xs text-muted-foreground">
              Animation Workspace
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="收起侧边栏"
            onClick={() => setSidebarCollapsed(true)}
          >
            <PanelLeftClose className="size-4" />
          </Button>
        </div>

        <nav
          className="workspace-home__nav grid shrink-0 gap-1 px-3 pb-4"
          aria-label="创作导航"
        >
          <Button
            variant={workspaceMode === "create" ? "default" : "ghost"}
            className="justify-start"
            aria-current={workspaceMode === "create" ? "page" : undefined}
            onClick={() => {
              setWorkspaceMode("create");
              setFolderId(null);
            }}
          >
            <FilePenLine className="size-4" />
            创作
          </Button>
          <Button variant="ghost" className="justify-start" disabled>
            <Lightbulb className="size-4" />
            灵感
          </Button>
          <Button variant="ghost" className="justify-start" disabled>
            <Sparkles className="size-4" />
            技能
          </Button>
        </nav>

        <section className="workspace-home__folders flex min-h-0 flex-1 flex-col border-t px-3 py-4">
          <div className="mb-2 flex items-center justify-between px-2">
            <div>
              <h2 className="text-xs font-medium text-muted-foreground">
                文件夹
              </h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                浏览工作台项目文件
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() =>
                setFolderDialog({ title: "新建文件夹", initial: "" })
              }
              aria-label="新建文件夹"
            >
              <Plus className="size-4" />
            </Button>
          </div>

          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            <Button
              type="button"
              variant="ghost"
              className={cn(
                "h-9 w-full justify-start text-sm font-normal",
                workspaceMode === "projects" &&
                  !folderId &&
                  "bg-sidebar-accent font-medium",
              )}
              onClick={() => {
                setFolderId(null);
                setWorkspaceMode("projects");
              }}
            >
              <Folder className="size-4" />
              全部文件
            </Button>
            {rootFolders.map(renderFolder)}
            {!rootFolders.length && (
              <p className="px-2 py-4 text-xs text-muted-foreground">
                还没有文件夹
              </p>
            )}
          </div>
        </section>

        <section className="workspace-home__account shrink-0 border-t p-3">
          <Card className="mb-2 gap-3 py-4 shadow-none">
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-auto w-full justify-start p-2"
              >
                <span className="grid size-9 place-items-center rounded-full bg-muted text-xs font-semibold">
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
              <DropdownMenuLabel>个人中心</DropdownMenuLabel>
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
        </section>
      </aside>

      {sidebarCollapsed && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="fixed left-4 top-4 z-30 bg-background"
          aria-label="展开侧边栏"
          onClick={() => setSidebarCollapsed(false)}
        >
          <PanelLeftOpen className="size-5" />
        </Button>
      )}

      <main
        className={cn(
          "workspace-home__main h-svh overflow-y-auto transition-[padding] duration-200",
          sidebarCollapsed ? "pl-0" : "pl-64",
          sidebarCollapsed && "workspace-home__main--collapsed",
        )}
      >
        {workspaceMode === "create" ? (
          <div className="workspace-home__canvas mx-auto flex min-h-full w-full max-w-5xl items-center px-6 py-12 lg:px-10">
            <section
              className="workspace-home__creator w-full space-y-5"
              aria-labelledby="create-title"
            >
              <div className="agent-entry__banner">
                <div className="agent-entry__brand">
                  <h1 id="create-title">Powdoo</h1>
                  <span>ANIMATED STORY AGENT</span>
                  <div className="agent-entry__categories">
                    {creationModes.map((mode) => {
                      const ModeIcon = mode.icon;
                      return (
                        <button
                          type="button"
                          key={mode.id}
                          className={cn(
                            creationModeId === mode.id &&
                              "agent-entry__category--active",
                          )}
                          onClick={() => {
                            setCreationModeId(mode.id);
                            setAiPrompt("");
                          }}
                        >
                          <ModeIcon /> {mode.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="agent-entry__mascot" aria-hidden="true">
                  <span className="agent-entry__bubble agent-entry__bubble--one">
                    故事
                  </span>
                  <span className="agent-entry__bubble agent-entry__bubble--two">
                    镜头
                  </span>
                  <span className="agent-entry__bubble agent-entry__bubble--three">
                    动画
                  </span>
                  <span className="agent-entry__mascot-ear agent-entry__mascot-ear--left" />
                  <span className="agent-entry__mascot-ear agent-entry__mascot-ear--right" />
                  <span className="agent-entry__mascot-head">
                    <i />
                    <i />
                  </span>
                  <span className="agent-entry__mascot-body" />
                  <svg
                    className="agent-entry__mascot-towel"
                    viewBox="0 0 78 54"
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient
                        id="agent-entry-scarf-fill"
                        x1="39"
                        y1="4"
                        x2="39"
                        y2="52"
                        gradientUnits="userSpaceOnUse"
                      >
                        <stop stopColor="#fff" />
                        <stop offset="0.52" stopColor="#f8f8f8" />
                        <stop offset="1" stopColor="#e4e4e6" />
                      </linearGradient>
                    </defs>
                    <path
                      className="agent-entry__mascot-towel-tail"
                      d="M8 16.5C11 17.7 14 18.5 17 19L15.2 49.5C15 52 12.8 53.2 10.5 52.5L5.8 51.1C4.2 50.6 3.3 49 3.7 47.4L8 16.5Z"
                    />
                    <path
                      className="agent-entry__mascot-towel-band"
                      d="M2 5.5C20.5 12.5 57.5 12.5 76 5L75 17C56 29.5 21.5 29.5 3 17.8L2 5.5Z"
                    />
                    <path
                      className="agent-entry__mascot-towel-fold"
                      d="M5 15.3C23 24.1 55.5 24 73.5 15"
                    />
                  </svg>
                  <span className="agent-entry__mascot-hand agent-entry__mascot-hand--left" />
                  <span className="agent-entry__mascot-hand agent-entry__mascot-hand--right" />
                  <span className="agent-entry__mascot-device">P</span>
                </div>
              </div>

              <form
                className="agent-entry__composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  void createFileWithAi();
                }}
              >
                <div className="agent-entry__input">
                  {!aiPrompt && (
                    <div className="agent-entry__hint">
                      <kbd>Tab</kbd>
                      <span
                        className="agent-entry__typed-hint"
                        aria-label={activeCreationMode.tabPrompt}
                      >
                        {typedPromptHint}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setAiPrompt(activeCreationMode.tabPrompt)
                        }
                      >
                        查看教程
                      </button>
                    </div>
                  )}
                  <Textarea
                    value={aiPrompt}
                    onChange={(event) => setAiPrompt(event.target.value)}
                    aria-label="描述你想创建的动画故事"
                    className="agent-entry__textarea"
                    disabled={aiCreating}
                    onKeyDown={(event) => {
                      if (event.key === "Tab" && !aiPrompt.trim()) {
                        event.preventDefault();
                        setAiPrompt(activeCreationMode.tabPrompt);
                        return;
                      }
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <div className="agent-entry__tools">
                    <div className="agent-entry__tools-right">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="agent-entry__auto"
                            aria-label="打开模型和 Thinking 设置"
                          >
                            <SlidersHorizontal /> 自动
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="end"
                          side="top"
                          className="agent-entry__settings"
                        >
                          <div className="agent-entry__settings-model">
                            <span>
                              <Cpu /> 模型
                            </span>
                            <button
                              type="button"
                              disabled
                              title="当前固定使用 DeepSeek V4 Flash，暂不支持切换"
                            >
                              DeepSeek V4 Flash
                            </button>
                          </div>
                          <div className="agent-entry__settings-thinking">
                            <span>Thinking</span>
                            <span
                              className="agent-entry__thinking-help"
                              data-tooltip={
                                thinkingEnabled
                                  ? "已开启：会进行更深入的推理，生成时间可能更长"
                                  : "已关闭：优先生成速度，减少额外推理"
                              }
                              tabIndex={0}
                              aria-label={
                                thinkingEnabled
                                  ? "Thinking 已开启，会进行更深入的推理，生成时间可能更长"
                                  : "Thinking 已关闭，优先生成速度，减少额外推理"
                              }
                            >
                              <BrainCircuit />
                            </span>
                            <Switch
                              checked={thinkingEnabled}
                              onCheckedChange={setThinkingEnabled}
                              aria-label="切换 Thinking 模式"
                            />
                          </div>
                        </PopoverContent>
                      </Popover>
                      <button
                        type="submit"
                        className="agent-entry__send"
                        disabled={!aiPrompt.trim() || aiCreating}
                        aria-label={aiCreating ? "正在创建" : "开始创作"}
                      >
                        {aiCreating ? (
                          <Icon name="clock" size={16} />
                        ) : (
                          <Send />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </form>

              {error && (
                <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  <span className="flex-1">{error}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setError("")}
                    aria-label="关闭错误提示"
                  >
                    <Icon name="close" size={16} />
                  </Button>
                </div>
              )}

              <div className="agent-entry__templates">
                {activeCreationMode.templates.map(([title, prompt, tone]) => (
                  <button
                    type="button"
                    key={title}
                    onClick={() => setAiPrompt(prompt)}
                  >
                    <span
                      className={`agent-entry__template-thumb agent-entry__template-thumb--${tone}`}
                    />
                    {title}
                  </button>
                ))}
                <button type="button" className="agent-entry__more">
                  更多
                </button>
              </div>

              <div className="agent-entry__suggestions">
                <p>不知道从何开始？试试这些模板。</p>
                <div className="agent-entry__suggestion-grid">
                  {activeCreationMode.suggestions.map(
                    ([description, prompt]) => (
                      <button
                        type="button"
                        key={description}
                        onClick={() => setAiPrompt(prompt)}
                      >
                        {description}
                      </button>
                    ),
                  )}
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="workspace-home__projects">
            <WorkspaceProjectList
              folderId={folderId}
              folderName={currentFolder?.name}
              onOpenFolder={(nextFolderId) => setFolderId(nextFolderId)}
              onWorkspaceChanged={() => void loadWorkspace()}
            />
          </div>
        )}
      </main>

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-lg border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg">
          <Icon name="check" size={17} />
          {toast}
        </div>
      )}

      <FolderNameDialog
        state={folderDialog}
        onClose={() => setFolderDialog(null)}
        onSubmit={submitFolderDialog}
      />

      <AlertDialog
        open={Boolean(deleteConfirmation)}
        onOpenChange={(open) => !open && setDeleteConfirmation(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除文件夹？</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteConfirmation?.folderName || "该文件夹"}
              ”及其中内容将移到回收站。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => void confirmFolderDeletion()}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
