import { Writable, Stream } from "stream";
import { RedisClient } from "redis";
import { PermissionsService, User } from "./permissions";
import util from "util";
import { UUID } from "./uuid";
import { Logger } from "./logger";
import { ReadStream } from "fs";
interface Exporter {
  StartExport: (user: User, data: Stream) => Promise<ExportStatus>;
  GetExportStatus: (id: string) => Promise<ExportStatus>;
  CancelExport: (
    user: User,
    id: string,
    data: ReadStream
  ) => Promise<ExportStatus>;
}

type ExportStatus = {
  status: string;
  id: string;
};

export type HBExporterDependencies = {
  cache: RedisClient;
  permissionsService: PermissionsService;
  allowedPermission: string;
  UUIDGen: UUID;
  logger: Logger;
};

export const HBExporter = (deps: HBExporterDependencies): Exporter => {
  const get = util.promisify(deps.cache.GET).bind(deps.cache);
  const set = util.promisify(deps.cache.SET).bind(deps.cache);
  return {
    StartExport: async (user, data) => {
      deps.logger("starting export");
      try {
        const allowed = await deps.permissionsService.CheckPermissions(
          user,
          deps.allowedPermission
        );
        if (!allowed) {
          throw new Error("incorrect permission");
        }
        const exportId = deps.UUIDGen.NewUUID();
        const newStatus = {
          status: "CREATED",
          id: exportId,
        };
        await set(exportId, JSON.stringify(newStatus));
        data.pipe(newCacheWriter(exportId, deps.cache));
        return newStatus;
      } catch (e) {
        console.log("error");
        throw e;
      }
    },
    GetExportStatus: async (exportId) => {
      const strStatus = await get(exportId);
      if (!strStatus) {
        throw new Error(`no export found for id: ${exportId}`);
      }
      const status: ExportStatus = JSON.parse(strStatus);
      return status;
    },
    async CancelExport(user, id, dataStream) {
      deps.logger("cancelling export");
      try {
        const allowed = await deps.permissionsService.CheckPermissions(
          user,
          deps.allowedPermission
        );
        if (!allowed) throw new Error(`access denied`);

        const exportStatus = await this.GetExportStatus(id);
        if (exportStatus.status) {
          throw new Error(`Export process is ${exportStatus.status}`);
        }
        const newStatus = {
          status: "CANCELED",
          id,
        };
        const del = util.promisify(deps.cache.DEL).bind(deps.cache) as (
          key: string
        ) => Promise<number>;
        await del(id);
        dataStream.destroy();
        return newStatus;
      } catch (e) {
        throw e;
      }
    },
  };
};

function newCacheWriter(exportId: string, cache: RedisClient) {
  const append = util.promisify(cache.APPEND).bind(cache);
  const set = util.promisify(cache.SET).bind(cache);
  const expire = util.promisify(cache.EXPIRE).bind(cache);
  return new Writable({
    async write(chunk, _, callback) {
      await append(exportId + "-data", chunk.toString("binary"));
      await set(exportId, JSON.stringify({ status: "PENDING", id: exportId }));
      callback();
    },
    async final(callback) {
      await set(exportId, JSON.stringify({ status: "COMPLETE", id: exportId }));
      await expire(exportId, 60 * 60);
      await expire(exportId + "-data", 60 * 60);
      callback();
    },
  });
}
