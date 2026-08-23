import { exportToSvg } from "@excalidraw/utils/export";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  LockKeyhole,
  PackageOpen,
  Plus,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  ASSET_PACK_CATEGORIES,
  assetPackApi,
  type AssetPack,
  type AssetPackCategory,
  type AssetPackDetail,
  type AssetPackItem,
} from "./assetPacks";
import "./AssetLibrary.css";

const DETAIL_PAGE_SIZE = 24;

const categoryLabel = (category: AssetPackCategory) =>
  ASSET_PACK_CATEGORIES.find((candidate) => candidate.id === category)?.label ||
  "通用素材";

export const AssetPackArtwork = ({
  pack,
  large = false,
}: {
  pack: Pick<AssetPack, "id" | "previewItems" | "itemCount">;
  large?: boolean;
}) => {
  const previews = pack.previewItems.slice(0, 4);
  return (
    <div
      className={cn("asset-pack-artwork", large && "asset-pack-artwork--large")}
    >
      {previews.map((item) => (
        <AssetItemPreview
          key={item.ref}
          packId={pack.id}
          item={item}
          compact
          defer
        />
      ))}
      {!previews.length && (
        <div className="asset-pack-artwork__empty">
          <PackageOpen aria-hidden="true" />
        </div>
      )}
      <small>{pack.itemCount} 项</small>
    </div>
  );
};

const InstallButton = ({
  pack,
  busy,
  onToggle,
}: {
  pack: AssetPack;
  busy: boolean;
  onToggle: (pack: AssetPack) => void;
}) => (
  <Button
    type="button"
    variant={pack.installed ? "outline" : "default"}
    size="sm"
    disabled={busy || pack.builtin}
    onClick={(event) => {
      event.stopPropagation();
      onToggle(pack);
    }}
  >
    {pack.builtin ? <LockKeyhole /> : pack.installed ? <Check /> : <Plus />}
    {busy
      ? "处理中"
      : pack.builtin
      ? "官方内置"
      : pack.installed
      ? "已添加"
      : "添加素材"}
  </Button>
);

export const AssetItemPreview = ({
  packId,
  item,
  compact = false,
  defer = false,
}: {
  packId: string;
  item: AssetPackItem;
  compact?: boolean;
  defer?: boolean;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    defer ? "idle" : "loading",
  );

  useEffect(() => {
    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    const container = containerRef.current;
    if (!container) {
      return;
    }
    container.replaceChildren();
    const renderPreview = () => {
      setStatus("loading");
      void assetPackApi
        .getItemPreview(packId, item.itemIndex)
        .then(async (preview) => {
          const svg = await exportToSvg({
            elements: preview.elements as Parameters<
              typeof exportToSvg
            >[0]["elements"],
            appState: {
              exportBackground: false,
              viewBackgroundColor: "#ffffff",
            },
            files: null,
            renderEmbeddables: false,
            skipInliningFonts: true,
          });
          if (cancelled) {
            return;
          }
          svg.querySelector(".style-fonts")?.remove();
          svg.setAttribute("width", "100%");
          svg.setAttribute("height", "100%");
          svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
          container.replaceChildren(svg);
          setStatus("ready");
        })
        .catch(() => {
          if (!cancelled) {
            setStatus("error");
          }
        });
    };

    if (defer && previewRef.current && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) {
            return;
          }
          observer?.disconnect();
          renderPreview();
        },
        { rootMargin: "200px" },
      );
      observer.observe(previewRef.current);
    } else {
      renderPreview();
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      container.replaceChildren();
    };
  }, [defer, item.itemIndex, packId]);

  return (
    <div
      ref={previewRef}
      className={cn(
        compact ? "asset-pack-artwork__tile" : "asset-item-card__preview",
        (status === "idle" || status === "loading") && "is-loading",
        status === "error" && "is-error",
      )}
      role="img"
      aria-label={`${item.itemName} 素材预览`}
    >
      <div
        ref={containerRef}
        className={
          compact
            ? "asset-pack-artwork__preview-host"
            : "asset-item-card__preview-host"
        }
      />
      {!compact && status === "loading" && <span>正在生成预览</span>}
      {!compact && status === "error" && <span>预览不可用</span>}
    </div>
  );
};

export const AssetLibrary = ({
  packId,
  onOpenPack,
  onBack,
  onInstalledChange,
}: {
  packId: string | null;
  onOpenPack: (id: string) => void;
  onBack: () => void;
  onInstalledChange?: (count: number) => void;
}) => {
  const [packs, setPacks] = useState<AssetPack[]>([]);
  const [detail, setDetail] = useState<AssetPackDetail | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<AssetPackCategory>("all");
  const [installedOnly, setInstalledOnly] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailPage, setDetailPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const list = await assetPackApi.list();
      setPacks(list.packs);
      onInstalledChange?.(list.installedCount);
      setDetail(packId ? await assetPackApi.get(packId) : null);
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "素材加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setDetailPage(1);
    void load();
  }, [packId]);

  const toggleInstall = async (pack: AssetPack) => {
    if (busyId) {
      return;
    }
    setBusyId(pack.id);
    try {
      if (pack.installed) {
        await assetPackApi.uninstall(pack.id);
      } else {
        await assetPackApi.install(pack.id);
      }
      const installed = !pack.installed;
      setPacks((current) =>
        current.map((candidate) =>
          candidate.id === pack.id ? { ...candidate, installed } : candidate,
        ),
      );
      setDetail((current) =>
        current?.id === pack.id ? { ...current, installed } : current,
      );
      const previousCount = packs.filter(
        (candidate) => candidate.installed,
      ).length;
      onInstalledChange?.(Math.max(0, previousCount + (installed ? 1 : -1)));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "安装操作失败");
    } finally {
      setBusyId(null);
    }
  };

  const filteredPacks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return packs.filter((pack) => {
      if (installedOnly && !pack.installed) {
        return false;
      }
      if (category !== "all" && pack.category !== category) {
        return false;
      }
      return (
        !normalized ||
        `${pack.name} ${pack.description} ${pack.author}`
          .toLowerCase()
          .includes(normalized)
      );
    });
  }, [category, installedOnly, packs, query]);

  if (loading) {
    return (
      <div className="asset-library asset-library--state">
        <PackageOpen />
        <p>正在读取素材配置...</p>
      </div>
    );
  }

  if (detail) {
    const detailPageCount = Math.max(
      1,
      Math.ceil(detail.items.length / DETAIL_PAGE_SIZE),
    );
    const visibleItems = detail.items.slice(
      (detailPage - 1) * DETAIL_PAGE_SIZE,
      detailPage * DETAIL_PAGE_SIZE,
    );
    return (
      <div className="asset-library asset-pack-detail">
        <button type="button" className="asset-library__back" onClick={onBack}>
          <ArrowLeft /> 返回素材库
        </button>
        <header className="asset-pack-detail__header">
          <AssetPackArtwork pack={detail} large />
          <div className="asset-pack-detail__summary">
            <span className="asset-library__eyebrow">
              {categoryLabel(detail.category)}
            </span>
            <h1>{detail.name}</h1>
            <p>{detail.description}</p>
            <div className="asset-pack-detail__meta">
              <span>作者 {detail.author}</span>
              <span>{detail.itemCount} 项素材</span>
              {detail.updated && <span>更新于 {detail.updated}</span>}
            </div>
          </div>
          <InstallButton
            pack={detail}
            busy={busyId === detail.id}
            onToggle={toggleInstall}
          />
        </header>

        <section className="asset-pack-detail__content">
          <div className="asset-library__section-title">
            <div>
              <h2>素材内容</h2>
              <p>安装后，智能体才能通过素材工具检索并读取以下内容。</p>
            </div>
            <span>{detail.items.length} 项</span>
          </div>
          <div className="asset-items-grid">
            {visibleItems.map((item) => (
              <article key={item.ref} className="asset-item-card">
                <AssetItemPreview packId={detail.id} item={item} />
                <div>
                  <strong>{item.itemName}</strong>
                  <small>{item.elementCount} 个可编辑元素</small>
                </div>
              </article>
            ))}
          </div>
          {detailPageCount > 1 && (
            <nav className="asset-detail-pagination" aria-label="素材内容分页">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={detailPage === 1}
                onClick={() => setDetailPage((page) => Math.max(1, page - 1))}
              >
                上一页
              </Button>
              <span>
                第 {detailPage} / {detailPageCount} 页
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={detailPage === detailPageCount}
                onClick={() =>
                  setDetailPage((page) => Math.min(detailPageCount, page + 1))
                }
              >
                下一页
              </Button>
            </nav>
          )}
        </section>
        {error && <div className="asset-library__error">{error}</div>}
      </div>
    );
  }

  return (
    <div className="asset-library asset-library--catalog">
      <header className="asset-library__header">
        <div>
          <span className="asset-library__eyebrow">素材库</span>
          <h1>素材包</h1>
          <p>按需安装素材包。只有已安装内容会进入智能体的素材检索范围。</p>
        </div>
        <div className="asset-library__installed-summary">
          <strong>{packs.filter((pack) => pack.installed).length}</strong>
          <span>已安装</span>
        </div>
      </header>

      <section className="asset-library__controls" aria-label="筛选素材包">
        <label className="asset-library__search">
          <Search />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索素材包名称、作者或描述"
            aria-label="搜索素材包"
          />
        </label>
        <button
          type="button"
          className={cn(installedOnly && "is-active")}
          onClick={() => setInstalledOnly((current) => !current)}
        >
          <Check /> 只看已安装
        </button>
      </section>

      <div className="asset-library__layout">
        <nav className="asset-library__categories" aria-label="素材分类">
          {ASSET_PACK_CATEGORIES.map((candidate) => (
            <button
              type="button"
              key={candidate.id}
              className={cn(category === candidate.id && "is-active")}
              onClick={() => setCategory(candidate.id)}
            >
              {candidate.label}
              <span>
                {candidate.id === "all"
                  ? packs.length
                  : packs.filter((pack) => pack.category === candidate.id)
                      .length}
              </span>
            </button>
          ))}
        </nav>

        <section className="asset-library__packs">
          <div className="asset-library__section-title">
            <div>
              <h2>
                {installedOnly ? "已安装素材包" : categoryLabel(category)}
              </h2>
              <p>共 {filteredPacks.length} 个素材包</p>
            </div>
          </div>
          <div className="asset-pack-list">
            {filteredPacks.map((pack) => (
              <article
                key={pack.id}
                className="asset-pack-row"
                role="link"
                tabIndex={0}
                onClick={() => onOpenPack(pack.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    onOpenPack(pack.id);
                  }
                }}
              >
                <AssetPackArtwork pack={pack} />
                <div className="asset-pack-row__body">
                  <div className="asset-pack-row__title">
                    <h3>{pack.name}</h3>
                    <span>{categoryLabel(pack.category)}</span>
                  </div>
                  <p>{pack.description}</p>
                  <small>
                    {pack.author} · {pack.itemCount} 项素材
                  </small>
                </div>
                <div className="asset-pack-row__actions">
                  <InstallButton
                    pack={pack}
                    busy={busyId === pack.id}
                    onToggle={toggleInstall}
                  />
                </div>
              </article>
            ))}
            {!filteredPacks.length && (
              <div className="asset-library__empty">
                <PackageOpen />
                <strong>没有匹配的素材包</strong>
                <span>调整搜索词或筛选条件后重试。</span>
              </div>
            )}
          </div>
        </section>
      </div>
      {error && <div className="asset-library__error">{error}</div>}
    </div>
  );
};
