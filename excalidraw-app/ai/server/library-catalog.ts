import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

type CatalogTranslations = Record<string, string>;

type CatalogIndexEntry = {
  ref: string;
  libraryId?: string;
  libraryName: string;
  description: string;
  itemName: string;
  itemIndex: number;
  width: number;
  height: number;
  elementCount: number;
};

type SearchableCatalogIndexEntry = CatalogIndexEntry & {
  searchText: string;
};

type CatalogAuthor = { name?: string };

type CatalogLibrary = {
  id?: string;
  source: string;
  name?: string;
  description?: string;
  authors?: CatalogAuthor[];
  updated?: string;
  created?: string;
  itemNames?: string[];
};

type CatalogPackPreview = Pick<
  CatalogIndexEntry,
  "itemName" | "itemIndex" | "width" | "height" | "elementCount"
> & { ref: string };

export type LibraryCatalogPack = {
  id: string;
  name: string;
  description: string;
  author: string;
  source: string;
  updated: string;
  itemCount: number;
  category: "characters" | "ui" | "flow" | "architecture" | "icons" | "general";
  previewItems: CatalogPackPreview[];
};

type PublicCatalogEntry = Omit<
  SearchableCatalogIndexEntry,
  "libraryId" | "searchText"
>;

type CatalogLibraryData = {
  libraryItems?: unknown[];
  library?: unknown[];
};

const parseJson = <T>(text: string): T => JSON.parse(text) as T;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getLibraryItemElements = (value: unknown): unknown[] | undefined =>
  Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.elements)
    ? value.elements
    : undefined;

const CATALOG_ROOT = path.resolve(
  process.env.EXCALIDRAW_LIBRARY_CATALOG_DIR ||
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../library-catalog",
    ),
);
const LIBRARIES_ROOT = path.join(CATALOG_ROOT, "libraries");
const TRANSLATIONS_PATH = path.join(CATALOG_ROOT, "translations.zh-CN.json");
const MAX_QUERY_LENGTH = 160;
const MAX_RESULTS = 12;
const DISPLAY_TEXT_KEYS = new Set(["text", "originalText", "name", "label"]);
const PUBLIC_REF_PATTERN = /^素材-\d+-\d+$/;
const hasLatin = (value: unknown): boolean =>
  /[A-Za-z]/.test(String(value || ""));

const normalizeSearchText = (value: unknown): string =>
  String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const tokenize = (value: unknown): string[] =>
  normalizeSearchText(value).split(/\s+/).filter(Boolean);

let indexPromise: Promise<SearchableCatalogIndexEntry[]> | undefined;
let packsPromise: Promise<LibraryCatalogPack[]> | undefined;
let translationsPromise: Promise<CatalogTranslations> | undefined;
const loadTranslations = (): Promise<CatalogTranslations> => {
  translationsPromise ??= readFile(TRANSLATIONS_PATH, "utf8").then((text) =>
    parseJson<CatalogTranslations>(text),
  );
  return translationsPromise;
};

function localizeText(value: string, translations: CatalogTranslations): string;
function localizeText(
  value: undefined,
  translations: CatalogTranslations,
): undefined;
function localizeText(
  value: string | undefined,
  translations: CatalogTranslations,
): string | undefined;
function localizeText(
  value: string | undefined,
  translations: CatalogTranslations,
): string | undefined {
  if (typeof value !== "string" || !hasLatin(value)) {
    return value;
  }
  const translated = translations[value];
  if (
    typeof translated !== "string" ||
    !translated.trim() ||
    hasLatin(translated)
  ) {
    throw new Error("素材中文翻译缺失");
  }
  return translated;
}

const localizeDisplayText = (
  value: unknown,
  translations: CatalogTranslations,
  key = "",
): unknown => {
  if (typeof value === "string") {
    return DISPLAY_TEXT_KEYS.has(key)
      ? localizeText(value, translations)
      : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => localizeDisplayText(item, translations, key));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [
        childKey,
        localizeDisplayText(child, translations, childKey),
      ]),
    );
  }
  return value;
};

const loadIndex = (): Promise<SearchableCatalogIndexEntry[]> => {
  indexPromise ??= Promise.all([
    readFile(path.join(CATALOG_ROOT, "index.json"), "utf8").then((text) =>
      parseJson<CatalogIndexEntry[]>(text),
    ),
    loadTranslations(),
  ]).then(([entries, translations]) =>
    entries.map((entry) => {
      const localizedEntry = {
        ...entry,
        libraryName: localizeText(entry.libraryName, translations),
        description: localizeText(entry.description, translations),
        itemName: localizeText(entry.itemName, translations),
      };
      return {
        ...localizedEntry,
        searchText: normalizeSearchText(
          [
            localizedEntry.libraryName,
            localizedEntry.description,
            localizedEntry.itemName,
          ].join(" "),
        ),
      };
    }),
  );
  return indexPromise;
};

const sourceKey = (source: string): string =>
  String(source || "").replace(/\.excalidrawlib$/i, "");

const catalogFilePath = (source: string): string => {
  const filePath = path.resolve(LIBRARIES_ROOT, `${sourceKey(source)}.json`);
  if (!filePath.startsWith(`${LIBRARIES_ROOT}${path.sep}`)) {
    throw Object.assign(new Error("素材文件路径无效"), { status: 400 });
  }
  return filePath;
};

const writeJsonAtomically = async (
  filePath: string,
  value: unknown,
): Promise<void> => {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
};

export const resetLibraryCatalogCache = (): void => {
  indexPromise = undefined;
  packsPromise = undefined;
  translationsPromise = undefined;
};

const numericSourceId = (source: string): string => {
  let hash = 1469598103934665603n;
  for (const character of source) {
    hash ^= BigInt(character.codePointAt(0)!);
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return hash.toString();
};

const publicRefFor = (source: string, itemIndex: number): string =>
  `素材-${numericSourceId(source)}-${itemIndex}`;

const sourceFromInternalRef = (ref: string): string =>
  String(ref || "").slice(0, String(ref || "").lastIndexOf("#"));

const publicEntry = (
  entry: SearchableCatalogIndexEntry,
): PublicCatalogEntry => {
  const source = sourceFromInternalRef(entry.ref);
  const {
    ref: _internalRef,
    libraryId: _libraryId,
    searchText: _searchText,
    ...metadata
  } = entry;
  return {
    ...metadata,
    ref: publicRefFor(source, entry.itemIndex),
  };
};

const packIdFor = (library: CatalogLibrary, index: number): string =>
  library.id ||
  `${sourceKey(library.source)
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")}-${index + 1}`;

const categoryFor = (
  library: CatalogLibrary,
): LibraryCatalogPack["category"] => {
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

const loadPacks = (): Promise<LibraryCatalogPack[]> => {
  packsPromise ??= Promise.all([
    readFile(path.join(CATALOG_ROOT, "libraries.json"), "utf8").then((text) =>
      parseJson<CatalogLibrary[]>(text),
    ),
    loadIndex(),
    loadTranslations(),
  ]).then(([libraries, entries, translations]) => {
    const entriesBySource = new Map<string, SearchableCatalogIndexEntry[]>();
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
          name: localizeText(library.name, translations) || "未命名素材包",
          description:
            localizeText(library.description, translations) ||
            "可安装的手绘白板素材包",
          author:
            localizeText(library.authors?.[0]?.name, translations) ||
            "社区作者",
          source,
          updated: library.updated || library.created || "",
          itemCount: packEntries.length,
          category: categoryFor(library),
          previewItems: packEntries.slice(0, 4).map((entry) => ({
            ref: publicRefFor(source, entry.itemIndex),
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

export const isLibraryCatalogRef = (ref: unknown): boolean => {
  const value = String(ref || "");
  if (PUBLIC_REF_PATTERN.test(value)) {
    return true;
  }
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

const parseInternalRef = (
  ref: unknown,
): { source: string; itemIndex: number } => {
  if (!isLibraryCatalogRef(ref)) {
    throw new Error("素材引用无效");
  }
  const value = String(ref);
  const separatorIndex = value.lastIndexOf("#");
  const source = value.slice(0, separatorIndex);
  const itemIndex = Number(value.slice(separatorIndex + 1));
  return { source, itemIndex };
};

const resolveCatalogEntry = async (
  ref: unknown,
): Promise<SearchableCatalogIndexEntry> => {
  const entries = await loadIndex();
  if (PUBLIC_REF_PATTERN.test(String(ref || ""))) {
    const entry = entries.find(
      (candidate) =>
        publicRefFor(
          sourceFromInternalRef(candidate.ref),
          candidate.itemIndex,
        ) === ref,
    );
    if (!entry) {
      throw new Error("找不到素材项");
    }
    return entry;
  }
  const { source, itemIndex } = parseInternalRef(ref);
  const entry = entries.find(
    (candidate) =>
      sourceFromInternalRef(candidate.ref) === source &&
      candidate.itemIndex === itemIndex,
  );
  if (!entry) {
    throw new Error("找不到素材项");
  }
  return entry;
};

export const searchLibraryCatalog = async (
  query: string,
  requestedLimit = 8,
  { sources = [] }: { sources?: string[] } = {},
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
    .map(({ score: _score, ...entry }) => publicEntry(entry));
};

export const getLibraryCatalogItem = async (
  ref: unknown,
  { sources = [] }: { sources?: string[] } = {},
) => {
  const entry = await resolveCatalogEntry(ref);
  const source = sourceFromInternalRef(entry.ref);
  const itemIndex = entry.itemIndex;
  if (!new Set(sources.map(sourceKey)).has(source)) {
    throw new Error("素材所属资源包尚未安装");
  }
  const libraryData = parseJson<CatalogLibraryData>(
    await readFile(catalogFilePath(source), "utf8"),
  );
  const rawItem = (libraryData.libraryItems || libraryData.library || [])[
    itemIndex
  ];
  const elements = getLibraryItemElements(rawItem);
  if (!Array.isArray(elements) || elements.length === 0) {
    throw new Error("素材项内容无效");
  }
  const translations = await loadTranslations();
  return structuredClone({
    ...publicEntry(entry),
    elements: localizeDisplayText(elements, translations),
  });
};

export const getLibraryCatalogSummary = async () => {
  const [libraries, entries] = await Promise.all([
    readFile(path.join(CATALOG_ROOT, "libraries.json"), "utf8").then((text) =>
      parseJson<CatalogLibrary[]>(text),
    ),
    loadIndex(),
  ]);
  return { libraryCount: libraries.length, itemCount: entries.length };
};

export const listLibraryCatalogPacks = async () =>
  structuredClone(await loadPacks());

export const listLibraryCatalogPacksForAdmin = async () => {
  const packs = await loadPacks();
  return Promise.all(
    packs.map(async (pack) => {
      const filePath = catalogFilePath(pack.source);
      const file = await stat(filePath);
      return { ...structuredClone(pack), fileSize: file.size };
    }),
  );
};

export const getLibraryCatalogPack = async (packId: unknown) => {
  const packs = await loadPacks();
  const pack = packs.find((candidate) => candidate.id === String(packId || ""));
  if (!pack) {
    throw Object.assign(new Error("素材包不存在"), { status: 404 });
  }
  const entries = (await loadIndex())
    .filter((entry) => entry.ref.startsWith(`${pack.source}#`))
    .map(publicEntry);
  return structuredClone({ ...pack, items: entries });
};

export const getLibraryCatalogPackForAdmin = async (packId: unknown) => {
  const pack = await getLibraryCatalogPack(packId);
  return {
    ...pack,
    fileSize: (await stat(catalogFilePath(pack.source))).size,
  };
};

export const getLibraryCatalogPackItem = async (
  packId: unknown,
  itemIndex: unknown,
) => {
  const pack = await getLibraryCatalogPack(packId);
  const index = Number(itemIndex);
  if (!Number.isInteger(index) || index < 0 || index >= pack.items.length) {
    throw Object.assign(new Error("素材条目不存在"), { status: 404 });
  }
  const item = pack.items[index];
  const libraryData = parseJson<CatalogLibraryData>(
    await readFile(catalogFilePath(pack.source), "utf8"),
  );
  const rawItem = (libraryData.libraryItems || libraryData.library || [])[
    index
  ];
  const elements = getLibraryItemElements(rawItem);
  if (!Array.isArray(elements) || elements.length === 0) {
    throw Object.assign(new Error("素材条目内容无效"), { status: 422 });
  }
  const translations = await loadTranslations();
  return structuredClone({
    ...item,
    elements: localizeDisplayText(elements, translations),
  });
};

export const deleteLibraryCatalogPack = async (packId: unknown) => {
  const pack = await getLibraryCatalogPack(packId);
  const librariesPath = path.join(CATALOG_ROOT, "libraries.json");
  const indexPath = path.join(CATALOG_ROOT, "index.json");
  const [librariesText, indexText] = await Promise.all([
    readFile(librariesPath, "utf8"),
    readFile(indexPath, "utf8"),
  ]);
  const libraries = parseJson<CatalogLibrary[]>(librariesText);
  const entries = parseJson<CatalogIndexEntry[]>(indexText);
  const nextLibraries = libraries.filter(
    (library, index) => packIdFor(library, index) !== pack.id,
  );
  const nextEntries = entries.filter(
    (entry) => !String(entry.ref || "").startsWith(`${pack.source}#`),
  );
  if (nextLibraries.length === libraries.length) {
    throw Object.assign(new Error("素材包不存在"), { status: 404 });
  }

  const filePath = catalogFilePath(pack.source);
  try {
    await writeJsonAtomically(librariesPath, nextLibraries);
    await writeJsonAtomically(indexPath, nextEntries);
    await rm(filePath);
    const parent = path.dirname(filePath);
    if (parent !== LIBRARIES_ROOT) {
      await rm(parent, { recursive: false }).catch(() => undefined);
    }
  } catch (error) {
    await Promise.allSettled([
      mkdir(path.dirname(filePath), { recursive: true }),
      writeFile(librariesPath, librariesText, "utf8"),
      writeFile(indexPath, indexText, "utf8"),
    ]);
    resetLibraryCatalogCache();
    throw error;
  }
  resetLibraryCatalogCache();
  return { id: pack.id, source: pack.source };
};

export const deleteLibraryCatalogPackItem = async (
  packId: unknown,
  itemIndex: unknown,
) => {
  const pack = await getLibraryCatalogPack(packId);
  const index = Number(itemIndex);
  const item = pack.items.find((candidate) => candidate.itemIndex === index);
  if (!Number.isInteger(index) || index < 0 || !item) {
    throw Object.assign(new Error("素材条目不存在"), { status: 404 });
  }
  if (pack.items.length === 1) {
    await deleteLibraryCatalogPack(pack.id);
    return {
      id: pack.id,
      source: pack.source,
      deletedItem: item,
      packDeleted: true,
    };
  }

  const libraryPath = catalogFilePath(pack.source);
  const librariesPath = path.join(CATALOG_ROOT, "libraries.json");
  const indexPath = path.join(CATALOG_ROOT, "index.json");
  const [libraryText, librariesText, indexText] = await Promise.all([
    readFile(libraryPath, "utf8"),
    readFile(librariesPath, "utf8"),
    readFile(indexPath, "utf8"),
  ]);
  const libraryData = parseJson<CatalogLibraryData>(libraryText);
  const collectionKey = Array.isArray(libraryData.libraryItems)
    ? "libraryItems"
    : Array.isArray(libraryData.library)
    ? "library"
    : null;
  const collection = collectionKey ? libraryData[collectionKey] : undefined;
  if (!collection?.[index]) {
    throw Object.assign(new Error("素材条目内容无效"), { status: 422 });
  }
  collection.splice(index, 1);

  const libraries = parseJson<CatalogLibrary[]>(librariesText);
  const libraryMetadata = libraries.find(
    (candidate) =>
      candidate.id === pack.id || sourceKey(candidate.source) === pack.source,
  );
  if (Array.isArray(libraryMetadata?.itemNames)) {
    libraryMetadata.itemNames.splice(index, 1);
  }

  const entries = parseJson<CatalogIndexEntry[]>(indexText);
  const nextEntries = entries.flatMap((entry) => {
    const separatorIndex = String(entry.ref || "").lastIndexOf("#");
    const entrySource = entry.ref?.slice(0, separatorIndex);
    if (entrySource !== pack.source) {
      return [entry];
    }
    if (entry.itemIndex === index) {
      return [];
    }
    if (entry.itemIndex < index) {
      return [entry];
    }
    const nextItemIndex = entry.itemIndex - 1;
    return [
      {
        ...entry,
        ref: `${pack.source}#${nextItemIndex}`,
        itemIndex: nextItemIndex,
      },
    ];
  });

  try {
    await writeJsonAtomically(libraryPath, libraryData);
    await writeJsonAtomically(librariesPath, libraries);
    await writeJsonAtomically(indexPath, nextEntries);
  } catch (error) {
    await Promise.allSettled([
      writeFile(libraryPath, libraryText, "utf8"),
      writeFile(librariesPath, librariesText, "utf8"),
      writeFile(indexPath, indexText, "utf8"),
    ]);
    resetLibraryCatalogCache();
    throw error;
  }
  resetLibraryCatalogCache();
  const updatedPack = await getLibraryCatalogPack(pack.id);
  return {
    ...updatedPack,
    fileSize: (await stat(libraryPath)).size,
    deletedItem: item,
    packDeleted: false,
  };
};
