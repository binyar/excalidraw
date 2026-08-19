import assert from "node:assert/strict";
import test from "node:test";

import {
  getLibraryCatalogItem,
  getLibraryCatalogPack,
  getLibraryCatalogPackItem,
  getLibraryCatalogSummary,
  listLibraryCatalogPacks,
  searchLibraryCatalog,
} from "./library-catalog.mjs";

test("bundled library catalog exposes every vendored library item", async () => {
  assert.deepEqual(await getLibraryCatalogSummary(), {
    libraryCount: 231,
    itemCount: 4134,
  });
});

test("library search returns bounded stable refs without raw element JSON", async () => {
  const packs = await listLibraryCatalogPacks();
  const awsPack = packs.find((pack) =>
    `${pack.name} ${pack.description}`.toLowerCase().includes("aws"),
  );
  assert.ok(awsPack);
  const results = await searchLibraryCatalog("aws", 5, {
    sources: [awsPack.source],
  });
  assert.ok(results.length > 0 && results.length <= 5);
  assert.match(results[0].ref, /#\d+$/);
  assert.equal("elements" in results[0], false);

  const item = await getLibraryCatalogItem(results[0].ref, {
    sources: [awsPack.source],
  });
  assert.ok(item.elements.length > 0);
  assert.ok(item.width > 0);
  assert.ok(item.height > 0);
});

test("library packs expose marketplace metadata while an empty install list exposes no Agent assets", async () => {
  const packs = await listLibraryCatalogPacks();
  assert.ok(packs.length > 0);
  assert.ok(packs.every((pack) => pack.itemCount > 0));

  const pack = await getLibraryCatalogPack(packs[0].id);
  assert.equal(pack.source, packs[0].source);
  assert.equal(pack.items.length, pack.itemCount);
  const preview = await getLibraryCatalogPackItem(pack.id, 0);
  assert.equal(preview.ref, pack.items[0].ref);
  assert.ok(preview.elements.length > 0);

  assert.deepEqual(
    await searchLibraryCatalog(pack.items[0].itemName, 5, { sources: [] }),
    [],
  );
  await assert.rejects(
    getLibraryCatalogItem(pack.items[0].ref, { sources: [] }),
    /尚未安装/,
  );
  const installedItem = await getLibraryCatalogItem(pack.items[0].ref, {
    sources: [pack.source],
  });
  assert.ok(installedItem.elements.length > 0);
});
