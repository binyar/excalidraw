import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CATALOG_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../library-catalog",
);
const LIBRARIES_ROOT = path.join(CATALOG_ROOT, "libraries");
const MAX_QUERY_LENGTH = 160;
const MAX_RESULTS = 12;

const normalizeSearchText = (value) =>
  String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const tokenize = (value) =>
  normalizeSearchText(value).split(/\s+/).filter(Boolean);

let indexPromise;
let packsPromise;
const loadIndex = () => {
  indexPromise ??= readFile(path.join(CATALOG_ROOT, "index.json"), "utf8").then(
    (data) =>
      JSON.parse(data).map((entry) => ({
        ...entry,
        searchText: normalizeSearchText(
          [entry.libraryName, entry.description, entry.itemName].join(" "),
        ),
      })),
  );
  return indexPromise;
};

const sourceKey = (source) =>
  String(source || "").replace(/\.excalidrawlib$/i, "");

const packIdFor = (library, index) =>
  library.id ||
  `${sourceKey(library.source)
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")}-${index + 1}`;

const categoryFor = (library) => {
  const text = normalizeSearchText(
    `${library.name || ""} ${library.description || ""}`,
  );
  if (/character|people|person|avatar|human|人物|角色/.test(text)) {
    return "characters";
  }
  if (/wireframe|ui |ux |mobile|web |screen|component/.test(text)) {
    return "ui";
  }
  if (/flow|process|bpmn|journey|diagram|流程/.test(text)) {
    return "flow";
  }
  if (
    /cloud|aws|azure|server|network|database|architecture|system/.test(text)
  ) {
    return "architecture";
  }
  if (/icon|logo|symbol/.test(text)) {
    return "icons";
  }
  return "general";
};

const loadPacks = () => {
  packsPromise ??= Promise.all([
    readFile(path.join(CATALOG_ROOT, "libraries.json"), "utf8").then(
      JSON.parse,
    ),
    loadIndex(),
  ]).then(([libraries, entries]) => {
    const entriesBySource = new Map();
    entries.forEach((entry) => {
      const source = entry.ref.slice(0, entry.ref.lastIndexOf("#"));
      const list = entriesBySource.get(source) || [];
      list.push(entry);
      entriesBySource.set(source, list);
    });
    return libraries
      .map((library, index) => {
        const source = sourceKey(library.source);
        const packEntries = entriesBySource.get(source) || [];
        return {
          id: packIdFor(library, index),
          name: library.name || "未命名素材包",
          description: library.description || "可安装的 Excalidraw 素材包",
          author: library.authors?.[0]?.name || "社区作者",
          source,
          updated: library.updated || library.created || "",
          itemCount: packEntries.length,
          category: categoryFor(library),
          previewItems: packEntries.slice(0, 4).map((entry) => ({
            ref: entry.ref,
            itemName: entry.itemName,
            itemIndex: entry.itemIndex,
            width: entry.width,
            height: entry.height,
            elementCount: entry.elementCount,
          })),
        };
      })
      .filter((pack) => pack.itemCount > 0);
  });
  return packsPromise;
};

export const isLibraryCatalogRef = (ref) => {
  const value = String(ref || "");
  const separatorIndex = value.lastIndexOf("#");
  const source = value.slice(0, separatorIndex);
  const itemIndex = Number(value.slice(separatorIndex + 1));
  return !(
    separatorIndex < 1 ||
    !source ||
    source.includes("..") ||
    path.isAbsolute(source) ||
    !Number.isInteger(itemIndex) ||
    itemIndex < 0
  );
};

const parseRef = (ref) => {
  if (!isLibraryCatalogRef(ref)) {
    throw new Error(`资源引用无效：${ref}`);
  }
  const value = String(ref);
  const separatorIndex = value.lastIndexOf("#");
  const source = value.slice(0, separatorIndex);
  const itemIndex = Number(value.slice(separatorIndex + 1));
  return { source, itemIndex };
};

export const searchLibraryCatalog = async (
  query,
  requestedLimit = 8,
  { sources = [] } = {},
) => {
  const normalizedQuery = normalizeSearchText(query).slice(0, MAX_QUERY_LENGTH);
  if (!normalizedQuery) {
    throw new Error("资源搜索词不能为空");
  }
  const terms = tokenize(normalizedQuery);
  const limit = Math.max(1, Math.min(MAX_RESULTS, Number(requestedLimit) || 8));
  const allowedSources = new Set(sources.map(sourceKey));
  const entries = await loadIndex();
  return entries
    .flatMap((entry) => {
      const entrySource = entry.ref.slice(0, entry.ref.lastIndexOf("#"));
      if (!allowedSources.has(entrySource)) {
        return [];
      }
      if (!terms.every((term) => entry.searchText.includes(term))) {
        return [];
      }
      const itemText = normalizeSearchText(entry.itemName);
      const libraryText = normalizeSearchText(entry.libraryName);
      const descriptionText = normalizeSearchText(entry.description);
      const score = terms.reduce(
        (total, term) =>
          total +
          (itemText === term
            ? 30
            : itemText.startsWith(term)
            ? 18
            : itemText.includes(term)
            ? 12
            : 0) +
          (libraryText === term ? 20 : libraryText.includes(term) ? 8 : 0) +
          (descriptionText.includes(term) ? 3 : 0),
        0,
      );
      return [{ ...entry, score }];
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.elementCount - right.elementCount ||
        left.ref.localeCompare(right.ref),
    )
    .slice(0, limit)
    .map(({ searchText: _searchText, score: _score, ...entry }) => entry);
};

export const getLibraryCatalogItem = async (ref, { sources = [] } = {}) => {
  const { source, itemIndex } = parseRef(ref);
  if (!new Set(sources.map(sourceKey)).has(source)) {
    throw new Error(`素材所属资源包尚未安装：${source}`);
  }
  const entries = await loadIndex();
  const entry = entries.find((candidate) => candidate.ref === ref);
  if (!entry) {
    throw new Error(`找不到资源条目：${ref}`);
  }
  const libraryData = JSON.parse(
    await readFile(path.join(LIBRARIES_ROOT, `${source}.json`), "utf8"),
  );
  const rawItem = (libraryData.libraryItems || libraryData.library || [])[
    itemIndex
  ];
  const elements = Array.isArray(rawItem) ? rawItem : rawItem?.elements;
  if (!Array.isArray(elements) || elements.length === 0) {
    throw new Error(`资源条目内容无效：${ref}`);
  }
  const { searchText: _searchText, ...publicEntry } = entry;
  return structuredClone({ ...publicEntry, elements });
};

export const getLibraryCatalogSummary = async () => {
  const [libraries, entries] = await Promise.all([
    readFile(path.join(CATALOG_ROOT, "libraries.json"), "utf8").then(
      JSON.parse,
    ),
    loadIndex(),
  ]);
  return { libraryCount: libraries.length, itemCount: entries.length };
};

export const listLibraryCatalogPacks = async () =>
  structuredClone(await loadPacks());

export const getLibraryCatalogPack = async (packId) => {
  const packs = await loadPacks();
  const pack = packs.find((candidate) => candidate.id === String(packId || ""));
  if (!pack) {
    throw Object.assign(new Error("素材包不存在"), { status: 404 });
  }
  const entries = (await loadIndex())
    .filter((entry) => entry.ref.startsWith(`${pack.source}#`))
    .map(({ searchText: _searchText, ...entry }) => entry);
  return structuredClone({ ...pack, items: entries });
};

export const getLibraryCatalogPackItem = async (packId, itemIndex) => {
  const pack = await getLibraryCatalogPack(packId);
  const index = Number(itemIndex);
  if (!Number.isInteger(index) || index < 0 || index >= pack.items.length) {
    throw Object.assign(new Error("素材条目不存在"), { status: 404 });
  }
  const item = pack.items[index];
  const libraryData = JSON.parse(
    await readFile(path.join(LIBRARIES_ROOT, `${pack.source}.json`), "utf8"),
  );
  const rawItem = (libraryData.libraryItems || libraryData.library || [])[
    index
  ];
  const elements = Array.isArray(rawItem) ? rawItem : rawItem?.elements;
  if (!Array.isArray(elements) || elements.length === 0) {
    throw Object.assign(new Error("素材条目内容无效"), { status: 422 });
  }
  return structuredClone({ ...item, elements });
};
