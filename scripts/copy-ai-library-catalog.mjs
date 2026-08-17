import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourceRoot = path.resolve(
  process.argv[2] || path.join(PROJECT_ROOT, "../excalidraw-libraries-main"),
);
const targetRoot = path.join(PROJECT_ROOT, "excalidraw-app/ai/library-catalog");

const catalog = JSON.parse(
  await readFile(path.join(sourceRoot, "libraries.json"), "utf8"),
);
const catalogSources = new Set(catalog.map((library) => library.source));
const index = [];

const dimensionsOf = (elements) => {
  if (!elements.length) {
    return { width: 0, height: 0 };
  }
  const minX = Math.min(...elements.map((element) => element.x || 0));
  const minY = Math.min(...elements.map((element) => element.y || 0));
  const maxX = Math.max(
    ...elements.map((element) => (element.x || 0) + (element.width || 0)),
  );
  const maxY = Math.max(
    ...elements.map((element) => (element.y || 0) + (element.height || 0)),
  );
  return { width: maxX - minX, height: maxY - minY };
};

await rm(targetRoot, { recursive: true, force: true });
await mkdir(path.join(targetRoot, "libraries"), { recursive: true });

for (const library of catalog) {
  const source = path.join(sourceRoot, "libraries", library.source);
  const bundledSource = library.source.replace(/\.excalidrawlib$/i, ".json");
  const destination = path.join(targetRoot, "libraries", bundledSource);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination);
  const libraryData = JSON.parse(await readFile(source, "utf8"));
  const items = libraryData.libraryItems || libraryData.library || [];
  items.forEach((rawItem, itemIndex) => {
    const item = Array.isArray(rawItem)
      ? { elements: rawItem }
      : { elements: rawItem.elements || [], name: rawItem.name };
    if (!item.elements.length) {
      return;
    }
    index.push({
      ref: `${library.source.replace(/\.excalidrawlib$/i, "")}#${itemIndex}`,
      libraryId: library.id || library.source.replace(/\.excalidrawlib$/i, ""),
      libraryName: library.name,
      description: library.description,
      itemName:
        item.name || library.itemNames?.[itemIndex] || `Item ${itemIndex + 1}`,
      itemIndex,
      elementCount: item.elements.length,
      ...dimensionsOf(item.elements),
    });
  });
}

await cp(
  path.join(sourceRoot, "libraries.json"),
  path.join(targetRoot, "libraries.json"),
);
await cp(
  path.join(sourceRoot, "authors.json"),
  path.join(targetRoot, "authors.json"),
);
await cp(
  path.join(sourceRoot, "LICENSE"),
  path.join(targetRoot, "LICENSE.excalidraw-libraries"),
);
await writeFile(path.join(targetRoot, "index.json"), JSON.stringify(index));
await writeFile(
  path.join(targetRoot, "README.md"),
  `# Bundled Excalidraw libraries\n\nThis directory is a vendored snapshot of the distributable Excalidraw Libraries catalog.\n\n- All ${catalogSources.size} resources referenced by \`libraries.json\` are copied with a \`.json\` storage suffix so Vite never treats them as source modules. Their content remains the original Excalidraw library JSON.\n- \`index.json\` contains ${index.length} lightweight searchable item records and never embeds raw element JSON.\n- Preview images, the catalog website, and historical download statistics are intentionally excluded from the application runtime.\n- Upstream license: see \`LICENSE.excalidraw-libraries\`.\n- Refresh from a local checkout with \`node scripts/copy-ai-library-catalog.mjs [source-directory]\`.\n`,
);

console.log(
  `Copied ${catalogSources.size} Excalidraw libraries to ${targetRoot}`,
);
