import {
  deleteLibraryCatalogPack,
  deleteLibraryCatalogPackItem,
  getLibraryCatalogPack,
  getLibraryCatalogPackForAdmin,
  getLibraryCatalogPackItem,
  listLibraryCatalogPacks,
  listLibraryCatalogPacksForAdmin,
} from "../../ai/server/library-catalog.ts";

import { HttpError } from "./http.ts";

import type { DatabaseSync } from "node:sqlite";

type PackIdRow = { pack_id: string };
type PackSourceRow = { source: string };

export const createAssetPackService = (
  database: DatabaseSync,
  now: () => string,
) => {
  const getBuiltinIds = () =>
    new Set(
      (
        database
          .prepare("SELECT pack_id FROM asset_pack_settings WHERE builtin = 1")
          .all() as PackIdRow[]
      ).map((row) => row.pack_id),
    );

  const getInstalledSources = (username: string) =>
    (
      database
        .prepare(
          `SELECT source FROM asset_pack_settings WHERE builtin = 1
           UNION
           SELECT source FROM asset_pack_installations WHERE username = ?`,
        )
        .all(username) as PackSourceRow[]
    ).map((row) => row.source);

  const removeInstallationRecords = (packId: string) => {
    database.exec("BEGIN");
    try {
      database
        .prepare("DELETE FROM asset_pack_installations WHERE pack_id = ?")
        .run(packId);
      database
        .prepare("DELETE FROM asset_pack_settings WHERE pack_id = ?")
        .run(packId);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  };

  const listForAdmin = async () => {
    const builtinIds = getBuiltinIds();
    const packs = (await listLibraryCatalogPacksForAdmin()).map((pack) => ({
      ...pack,
      builtin: builtinIds.has(pack.id),
    }));
    return {
      packs,
      totalCount: packs.length,
      builtinCount: packs.filter((pack) => pack.builtin).length,
      totalBytes: packs.reduce((total, pack) => total + pack.fileSize, 0),
    };
  };

  const getForAdmin = async (packId: string) => {
    const pack = await getLibraryCatalogPackForAdmin(packId);
    return { ...pack, builtin: getBuiltinIds().has(pack.id) };
  };

  const deleteItem = async (packId: string, itemIndex: string) => {
    const result = await deleteLibraryCatalogPackItem(packId, itemIndex);
    if (result.packDeleted) {
      removeInstallationRecords(packId);
      return result;
    }
    return { ...result, builtin: getBuiltinIds().has(packId) };
  };

  const setBuiltin = async (
    packId: string,
    builtin: unknown,
    username: string,
  ) => {
    if (typeof builtin !== "boolean") {
      throw new HttpError(400, "builtin 必须是布尔值");
    }
    const pack = await getLibraryCatalogPack(packId);
    database
      .prepare(
        `INSERT INTO asset_pack_settings(pack_id, source, builtin, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(pack_id) DO UPDATE SET source = excluded.source, builtin = excluded.builtin,
           updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      )
      .run(pack.id, pack.source, builtin ? 1 : 0, now(), username);
    return { ...pack, builtin };
  };

  const deletePack = async (packId: string) => {
    const deleted = await deleteLibraryCatalogPack(packId);
    removeInstallationRecords(packId);
    return { ...deleted, deleted: true as const };
  };

  const listForUser = async (username: string) => {
    const builtinIds = getBuiltinIds();
    const installedIds = new Set(
      (
        database
          .prepare(
            "SELECT pack_id FROM asset_pack_installations WHERE username = ?",
          )
          .all(username) as PackIdRow[]
      ).map((row) => row.pack_id),
    );
    const packs = (await listLibraryCatalogPacks()).map((pack) => ({
      ...pack,
      builtin: builtinIds.has(pack.id),
      installed: builtinIds.has(pack.id) || installedIds.has(pack.id),
    }));
    return {
      packs,
      installedCount: packs.filter((pack) => pack.installed).length,
    };
  };

  const getForUser = async (packId: string, username: string) => {
    const pack = await getLibraryCatalogPack(packId);
    const builtin = getBuiltinIds().has(packId);
    const installed =
      builtin ||
      Boolean(
        database
          .prepare(
            "SELECT 1 FROM asset_pack_installations WHERE username = ? AND pack_id = ?",
          )
          .get(username, packId),
      );
    return { ...pack, builtin, installed };
  };

  const install = async (packId: string, username: string) => {
    const pack = await getLibraryCatalogPack(packId);
    if (getBuiltinIds().has(packId)) {
      return { ...pack, builtin: true, installed: true };
    }
    database
      .prepare(
        `INSERT INTO asset_pack_installations(username, pack_id, source, installed_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(username, pack_id) DO UPDATE SET source = excluded.source, installed_at = excluded.installed_at`,
      )
      .run(username, pack.id, pack.source, now());
    return { ...pack, installed: true };
  };

  const uninstall = (packId: string, username: string) => {
    if (getBuiltinIds().has(packId)) {
      throw new HttpError(400, "官方内置素材不能从用户素材库移除");
    }
    database
      .prepare(
        "DELETE FROM asset_pack_installations WHERE username = ? AND pack_id = ?",
      )
      .run(username, packId);
    return { id: packId, installed: false };
  };

  return {
    deleteItem,
    deletePack,
    getForAdmin,
    getForUser,
    getInstalledSources,
    getItem: getLibraryCatalogPackItem,
    install,
    listForAdmin,
    listForUser,
    setBuiltin,
    uninstall,
  };
};

export type AssetPackService = ReturnType<typeof createAssetPackService>;
