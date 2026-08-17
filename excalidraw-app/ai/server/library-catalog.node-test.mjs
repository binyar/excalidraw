import assert from "node:assert/strict";
import test from "node:test";

import {
  getLibraryCatalogItem,
  getLibraryCatalogSummary,
  searchLibraryCatalog,
} from "./library-catalog.mjs";

test("bundled library catalog exposes every vendored library item", async () => {
  assert.deepEqual(await getLibraryCatalogSummary(), {
    libraryCount: 231,
    itemCount: 4134,
  });
});

test("library search returns bounded stable refs without raw element JSON", async () => {
  const results = await searchLibraryCatalog("aws", 5);
  assert.ok(results.length > 0 && results.length <= 5);
  assert.match(results[0].ref, /#\d+$/);
  assert.equal("elements" in results[0], false);

  const item = await getLibraryCatalogItem(results[0].ref);
  assert.ok(item.elements.length > 0);
  assert.ok(item.width > 0);
  assert.ok(item.height > 0);
});
