import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Eye,
  HardDrive,
  PackageCheck,
  PackageOpen,
  Pencil,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { AssetItemPreview, AssetPackArtwork } from "../workspace/AssetLibrary";

import {
  assetAdminApi,
  type AdminAssetPack,
  type AdminAssetPackDetail,
} from "./assetAdmin";

import type { AssetPackItem } from "../workspace/assetPacks";

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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const formatBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} 字节`;
  }
  if (bytes < 1024 ** 2) {
    return `${(bytes / 1024).toFixed(1)} 千字节`;
  }
  return `${(bytes / 1024 ** 2).toFixed(1)} 兆字节`;
};

const DETAIL_PAGE_SIZE = 24;

export const AssetAdminPage = () => {
  const [packs, setPacks] = useState<AdminAssetPack[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailTarget, setDetailTarget] = useState<AdminAssetPack | null>(null);
  const [detail, setDetail] = useState<AdminAssetPackDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailPage, setDetailPage] = useState(1);
  const [editTarget, setEditTarget] = useState<AdminAssetPack | null>(null);
  const [editBuiltin, setEditBuiltin] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminAssetPack | null>(null);
  const [itemDeleteTarget, setItemDeleteTarget] =
    useState<AssetPackItem | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const result = await assetAdminApi.list();
      setPacks(result.packs);
      setTotalBytes(result.totalBytes);
      setError("");
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "素材配置加载失败",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const updateBuiltin = async (pack: AdminAssetPack, builtin: boolean) => {
    if (busyId) {
      return false;
    }
    setBusyId(pack.id);
    try {
      await assetAdminApi.updateBuiltin(pack.id, builtin);
      setPacks((current) =>
        current.map((candidate) =>
          candidate.id === pack.id ? { ...candidate, builtin } : candidate,
        ),
      );
      setError("");
      return true;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "配置保存失败");
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const openDetail = async (pack: AdminAssetPack) => {
    setDetailTarget(pack);
    setDetail(null);
    setDetailPage(1);
    setDetailLoading(true);
    try {
      setDetail(await assetAdminApi.get(pack.id));
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "详情加载失败");
    } finally {
      setDetailLoading(false);
    }
  };

  const deleteItem = async () => {
    if (!detailTarget || !itemDeleteTarget || busyId) {
      return;
    }
    const pack = detailTarget;
    setBusyId(pack.id);
    try {
      const result = await assetAdminApi.deleteItem(
        pack.id,
        itemDeleteTarget.itemIndex,
      );
      if (result.packDeleted) {
        setPacks((current) =>
          current.filter((candidate) => candidate.id !== pack.id),
        );
        setTotalBytes((current) => Math.max(0, current - pack.fileSize));
        setDetailTarget(null);
        setDetail(null);
      } else {
        setPacks((current) =>
          current.map((candidate) =>
            candidate.id === pack.id
              ? {
                  ...candidate,
                  itemCount: result.itemCount,
                  fileSize: result.fileSize,
                  previewItems: result.previewItems,
                }
              : candidate,
          ),
        );
        setTotalBytes((current) =>
          Math.max(0, current - pack.fileSize + result.fileSize),
        );
        setDetail(result);
        setDetailTarget((current) =>
          current
            ? {
                ...current,
                itemCount: result.itemCount,
                fileSize: result.fileSize,
                previewItems: result.previewItems,
              }
            : current,
        );
        setDetailPage((current) =>
          Math.min(
            current,
            Math.max(1, Math.ceil(result.items.length / DETAIL_PAGE_SIZE)),
          ),
        );
      }
      setItemDeleteTarget(null);
      setError("");
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "素材项删除失败",
      );
    } finally {
      setBusyId(null);
    }
  };

  const deletePack = async () => {
    if (!deleteTarget || busyId) {
      return;
    }
    const target = deleteTarget;
    setBusyId(target.id);
    try {
      await assetAdminApi.delete(target.id);
      setPacks((current) =>
        current.filter((candidate) => candidate.id !== target.id),
      );
      setTotalBytes((current) => Math.max(0, current - target.fileSize));
      setDeleteTarget(null);
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "素材删除失败");
    } finally {
      setBusyId(null);
    }
  };

  const builtinCount = packs.filter((pack) => pack.builtin).length;
  const detailPageCount = Math.max(
    1,
    Math.ceil((detail?.items.length || 0) / DETAIL_PAGE_SIZE),
  );
  const visibleDetailItems =
    detail?.items.slice(
      (detailPage - 1) * DETAIL_PAGE_SIZE,
      detailPage * DETAIL_PAGE_SIZE,
    ) || [];

  return (
    <div className="min-h-svh bg-muted/30 text-foreground">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-xl text-primary-foreground">
              ⌁
            </span>
            <div>
              <div className="text-sm font-semibold">泡豆系统后台</div>
              <div className="text-xs text-muted-foreground">素材管理</div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => window.location.assign("/")}
          >
            <ArrowLeft /> 返回工作台
          </Button>
        </div>
      </header>

      <div className="mx-auto grid h-[calc(100svh-4rem)] max-w-[1500px] grid-cols-[220px_minmax(0,1fr)] gap-8 overflow-hidden px-6 py-8">
        <aside>
          <div className="mb-3 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            内容管理
          </div>
          <Button className="w-full justify-start" type="button">
            <Boxes /> 素材文件
          </Button>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col gap-4 overflow-hidden">
          <section className="flex min-h-16 items-center rounded-xl border bg-card px-5 py-3 shadow-sm">
            <div className="min-w-0 flex-1 pr-6">
              <h1 className="text-lg font-semibold tracking-tight">
                素材文件管理
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                管理现有素材包及官方内置状态
              </p>
            </div>

            <div className="flex shrink-0 items-center divide-x">
              <div className="flex min-w-32 items-center gap-3 px-5 first:pl-0">
                <PackageOpen className="size-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">素材包</div>
                  <div className="font-semibold tabular-nums">
                    {packs.length}
                  </div>
                </div>
              </div>
              <div className="flex min-w-32 items-center gap-3 px-5">
                <PackageCheck className="size-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">官方内置</div>
                  <div className="font-semibold tabular-nums">
                    {builtinCount}
                  </div>
                </div>
              </div>
              <div className="flex min-w-40 items-center gap-3 pl-5">
                <HardDrive className="size-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">磁盘占用</div>
                  <div className="font-semibold tabular-nums">
                    {formatBytes(totalBytes)}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {error && (
            <div
              className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              role="alert"
            >
              {error}
            </div>
          )}

          <Card className="min-h-0 flex-1 gap-0 py-0">
            <CardHeader className="shrink-0 border-b py-5">
              <CardTitle className="text-base">现有素材文件</CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto p-0 [&_[data-slot=table-container]]:overflow-visible">
              {loading ? (
                <div className="grid min-h-64 place-items-center text-sm text-muted-foreground">
                  正在读取磁盘素材...
                </div>
              ) : packs.length === 0 ? (
                <div className="grid min-h-64 place-items-center text-sm text-muted-foreground">
                  磁盘中暂无素材文件
                </div>
              ) : (
                <Table className="table-fixed">
                  <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_hsl(var(--border))]">
                    <TableRow>
                      <TableHead className="w-[32%] pl-6">素材包</TableHead>
                      <TableHead className="w-[15%]">文件</TableHead>
                      <TableHead className="w-[11%]">内容</TableHead>
                      <TableHead className="w-[14%]">状态</TableHead>
                      <TableHead className="w-[28%] pr-6 text-right">
                        操作
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {packs.map((pack) => (
                      <TableRow key={pack.id}>
                        <TableCell className="overflow-hidden whitespace-normal pl-6">
                          <div className="flex min-w-0 items-center gap-3 py-1">
                            <div className="w-28 shrink-0">
                              <AssetPackArtwork pack={pack} />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {pack.name}
                              </div>
                              <div className="mt-1 truncate text-xs text-muted-foreground">
                                {pack.description}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="overflow-hidden whitespace-normal">
                          <div className="text-sm">素材包数据文件</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatBytes(pack.fileSize)}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <div>{pack.itemCount} 项</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {pack.author}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          {pack.builtin ? (
                            <Badge>
                              <ShieldCheck /> 官方内置
                            </Badge>
                          ) : (
                            <Badge variant="outline">用户可选</Badge>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-normal pr-6 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => void openDetail(pack)}
                            >
                              <Eye /> 查看详情
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busyId === pack.id}
                              onClick={() => {
                                setEditTarget(pack);
                                setEditBuiltin(pack.builtin);
                              }}
                            >
                              <Pencil /> 编辑
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              disabled={busyId === pack.id}
                              onClick={() => setDeleteTarget(pack)}
                            >
                              <Trash2 /> 删除
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </main>
      </div>

      <Dialog
        open={Boolean(detailTarget)}
        onOpenChange={(open) => {
          if (!open && !busyId) {
            setDetailTarget(null);
            setDetail(null);
          }
        }}
      >
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>{detailTarget?.name}</DialogTitle>
            <DialogDescription>
              查看素材包内全部
              素材项；预览仅加载当前页，避免大量素材同时占用内存。
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-6 rounded-lg border bg-muted/20 p-4 text-sm">
            <div className="min-w-0 space-y-2">
              <p>{detailTarget?.description || "暂无描述"}</p>
              <p className="text-xs text-muted-foreground">素材包数据文件</p>
              <p className="text-xs text-muted-foreground">
                {detailTarget?.author} · {detailTarget?.itemCount} 项 ·{" "}
                {formatBytes(detailTarget?.fileSize || 0)}
              </p>
            </div>
            <div>
              {detailTarget?.builtin ? (
                <Badge>
                  <ShieldCheck /> 官方内置
                </Badge>
              ) : (
                <Badge variant="outline">用户可选</Badge>
              )}
            </div>
          </div>

          {detailLoading ? (
            <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">
              正在读取全部素材项...
            </div>
          ) : detail ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">素材项元素</h3>
                  <p className="text-xs text-muted-foreground">
                    共 {detail.items.length} 项，删除后将从素材文件中永久移除。
                  </p>
                </div>
                <span className="text-sm text-muted-foreground">
                  第 {detailPage} / {detailPageCount} 页
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {visibleDetailItems.map((item) => (
                  <article
                    key={item.ref}
                    className="grid min-w-0 grid-rows-[142px_auto] gap-3 rounded-xl border bg-background p-3"
                  >
                    <AssetItemPreview packId={detail.id} item={item} />
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <div className="min-w-0">
                        <strong className="block truncate text-sm">
                          {item.itemName}
                        </strong>
                        <small className="text-xs text-muted-foreground">
                          {item.elementCount} 个可编辑元素
                        </small>
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon-sm"
                        disabled={Boolean(busyId)}
                        aria-label={`永久删除 ${item.itemName}`}
                        onClick={() => setItemDeleteTarget(item)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
              {detailPageCount > 1 && (
                <nav
                  className="flex items-center justify-center gap-3 border-t pt-4"
                  aria-label="素材项内容分页"
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={detailPage === 1}
                    onClick={() =>
                      setDetailPage((current) => Math.max(1, current - 1))
                    }
                  >
                    <ChevronLeft /> 上一页
                  </Button>
                  <span className="min-w-28 text-center text-sm text-muted-foreground">
                    第 {detailPage} / {detailPageCount} 页
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={detailPage === detailPageCount}
                    onClick={() =>
                      setDetailPage((current) =>
                        Math.min(detailPageCount, current + 1),
                      )
                    }
                  >
                    下一页 <ChevronRight />
                  </Button>
                </nav>
              )}
            </>
          ) : (
            <div className="grid min-h-72 place-items-center text-sm text-destructive">
              素材项详情加载失败
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDetailTarget(null);
                setDetail(null);
              }}
            >
              关闭
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!detailTarget) {
                  return;
                }
                setEditTarget(detailTarget);
                setEditBuiltin(detailTarget.builtin);
                setDetailTarget(null);
                setDetail(null);
              }}
            >
              <Pencil /> 编辑配置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editTarget)}
        onOpenChange={(open) => {
          if (!open && !busyId) {
            setEditTarget(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑素材配置</DialogTitle>
            <DialogDescription>{editTarget?.name}</DialogDescription>
          </DialogHeader>
          <div className="flex items-start justify-between gap-6 rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="asset-builtin">设为官方内置素材</Label>
              <p className="text-sm text-muted-foreground">
                开启后将自动对所有用户启用，用户侧只能查看，不能关闭或移除。
              </p>
            </div>
            <Switch
              id="asset-builtin"
              checked={editBuiltin}
              disabled={Boolean(busyId)}
              onCheckedChange={setEditBuiltin}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(busyId)}
              onClick={() => setEditTarget(null)}
            >
              取消
            </Button>
            <Button
              type="button"
              disabled={Boolean(busyId)}
              onClick={() => {
                if (!editTarget) {
                  return;
                }
                void updateBuiltin(editTarget, editBuiltin).then((saved) => {
                  if (saved) {
                    setEditTarget(null);
                  }
                });
              }}
            >
              {busyId ? "正在保存..." : "保存配置"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(itemDeleteTarget)}
        onOpenChange={(open) => {
          if (!open && !busyId) {
            setItemDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>永久删除这个素材项？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>{`“${itemDeleteTarget?.itemName}”将从对应素材包数据文件中物理删除，无法恢复。`}</p>
                <p>
                  删除后会同步重排该素材包的素材项索引；如果这是最后一个
                  素材项，整个素材包文件也会被删除。
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(busyId)}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={Boolean(busyId)}
              onClick={(event) => {
                event.preventDefault();
                void deleteItem();
              }}
            >
              {busyId ? "正在永久删除..." : "确认永久删除素材项"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !busyId) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>永久删除这个素材包？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>{`“${deleteTarget?.name}”及其素材文件将从服务器磁盘物理删除，无法恢复。`}</p>
                <p>同时会清理目录索引、官方内置配置和所有用户的安装记录。</p>
                <p className="rounded-md bg-muted px-3 py-2 text-xs text-foreground">
                  对应素材包数据文件将一并删除
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(busyId)}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={Boolean(busyId)}
              onClick={(event) => {
                event.preventDefault();
                void deletePack();
              }}
            >
              {busyId ? "正在永久删除..." : "确认永久删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
