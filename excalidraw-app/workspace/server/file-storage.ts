import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

type FileContent = Parameters<typeof writeFile>[1];

export const createFileStorage = (filesRoot: string) => {
  const writeQueues = new Map<string, Promise<unknown>>();

  const storagePath = (storageName: string) =>
    path.join(filesRoot, storageName);

  const serializeWrite = async <T>(
    storageName: string,
    write: () => Promise<T>,
  ): Promise<T> => {
    const previous = writeQueues.get(storageName) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(write);
    writeQueues.set(storageName, current);
    try {
      return await current;
    } finally {
      if (writeQueues.get(storageName) === current) {
        writeQueues.delete(storageName);
      }
    }
  };

  const replaceAtomically = async (
    targetPath: string,
    content: FileContent,
  ) => {
    const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, content);
      await rename(temporaryPath, targetPath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  };

  return { replaceAtomically, serializeWrite, storagePath };
};

export type FileStorage = ReturnType<typeof createFileStorage>;
