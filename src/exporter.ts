import { Writable, Stream } from "stream";
import { RedisClient } from "redis";
import { PermissionsService, User } from "./permissions";
import util from "util";
import { UUID } from "./uuid";
import { Logger } from "./logger";
import { ReadStream } from "fs";
// @interface Defined interface for Exporter to have its own type
interface Exporter {
  StartExport: (user: User, data: Stream) => Promise<ExportStatus>;
  GetExportStatus: (id: string) => Promise<ExportStatus>;
  CancelExport: (
    user: User,
    id: string,
    data: ReadStream
  ) => Promise<ExportStatus>;
}
// Define ExportStatus type as a user defined type
type ExportStatus = {
  status: string;
  id: string;
};
// Define HBExporterDependencies type as a user defined type

export type HBExporterDependencies = {
  cache: RedisClient;
  permissionsService: PermissionsService;
  allowedPermission: string;
  UUIDGen: UUID;
  logger: Logger;
};
/**
 * Represents a HBExporter in the catalog.
 * @public
 */
export const HBExporter = (deps: HBExporterDependencies): Exporter => {
  const get = util.promisify(deps.cache.GET).bind(deps.cache);
  const set = util.promisify(deps.cache.SET).bind(deps.cache);
  return {
    /**
     * start to export a file to redis cache.
     *
     * @param user - The user who started to export
     * @param data - The data stream of the exporting file
     * @returns  if process happen successfully it will return an object which has the status and id of exporting process, else it will throw error
     *
     */
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
    /**
     * Get status of export process
     *
     * @param exportId - id of exporting process
     * @returns  if there is such an exportedId in redis cache it will return status key of ExportStatus type of exporting process , else it will throw error
     *
     */
    GetExportStatus: async (exportId) => {
      const strStatus = await get(exportId);
      if (!strStatus) {
        throw new Error(`no export found for id: ${exportId}`);
      }
      const status: ExportStatus = JSON.parse(strStatus);
      return status;
    },
    /**
     * cancel export process
     *
     * @param user - The user who started to export
     * @param id - id of exporting process
     * @param data - The data stream of the exporting file
     * @returns  if successfully run it will return an object which has the status and id of cencelled process, else it will throw error
     *
     */
    async CancelExport(user, exportId, dataStream) {
      deps.logger("cancelling export");
      try {
        const allowed = await deps.permissionsService.CheckPermissions(
          user,
          deps.allowedPermission
        );
        if (!allowed) throw new Error(`access denied`);

        const exportStatus = await this.GetExportStatus(exportId);
        if (exportStatus.status) {
          throw new Error(`Export process is ${exportStatus.status}`);
        }
        const newStatus = {
          status: "CANCELED",
          id: exportId,
        };
        const del = util.promisify(deps.cache.DEL).bind(deps.cache) as (
          key: string
        ) => Promise<number>;
        await del(exportId);
        dataStream.destroy();
        return newStatus;
      } catch (e) {
        throw e;
      }
    },
  };
};
/**
 * write cache
 *
 * @param exportId - id of exporting process
 * @param cache - redisClient cache
 * @returns  a writable class that write exportId to stream and at final set status COMPLETE and set expire for redis
 *
 */
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
