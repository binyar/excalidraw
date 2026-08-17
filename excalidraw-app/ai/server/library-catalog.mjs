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

export const searchLibraryCatalog = async (query, requestedLimit = 8) => {
  const normalizedQuery = normalizeSearchText(query).slice(0, MAX_QUERY_LENGTH);
  if (!normalizedQuery) {
    throw new Error("资源搜索词不能为空");
  }
  const terms = tokenize(normalizedQuery);
  const limit = Math.max(1, Math.min(MAX_RESULTS, Number(requestedLimit) || 8));
  const entries = await loadIndex();
  return entries
    .flatMap((entry) => {
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

export const getLibraryCatalogItem = async (ref) => {
  const { source, itemIndex } = parseRef(ref);
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
