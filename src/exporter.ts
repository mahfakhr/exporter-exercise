import { Writable, Stream, Readable } from "stream";
import { RedisClient } from "redis";
import { PermissionsService, User } from "./permissions";
import util from "util";
import { UUID } from "./uuid";
import { Logger } from "./logger";

export interface Exporter {
  StartExport: (user: User, data: Stream) => Promise<ExportStatus>;
  GetExportStatus: (id: string) => Promise<ExportStatus>;
  CancelExport: (user: User, readStream: Readable) => Promise<ExportStatus>;
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

//This returns an object of type Exporter which holds StartExporter and GetExporterStatus methods,
//which in itself returns promises of type ExportStatus
export const HBExporter = (deps: HBExporterDependencies): Exporter => {
  return {
    StartExport: async (user, data) => {
      //Console log the message of tag exporter as this logger initialized with the exporter tag.
      deps.logger("starting export");
      try {
        // check permissions of the user using allowed permissions, example user object:
        // myUser = {
        //     id: "1",
        //     permissions: ["exporter"],
        //   }
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

        // util.promisify().bind() makes a new promised function which has its 'this' keyword set to the redisClient context
        // (the term function used above because The bind() method creates a new function that, when called, has its this keyword set to the provided value )
        // set contains the promise of redis's SET method(which sets the string value of a key. If key already holds a value, it is overwritten, regardless of its type)
        const set = util.promisify(deps.cache.SET).bind(deps.cache);

        // As set is an async function we need to await for it
        // Sets the { status: "CREATED", id: exportId } value against the exportId (AAAA) key
        await set(exportId, JSON.stringify(newStatus));

        // (data)Readable.pipe() method is used to attach writable stream to the readable stream
        // newCacheWriter returns the destined writable stream which eventually have write() and final() built in methods(detail in the scope of method below)
        // It writes/appends data to cache for a key {id}-data
        data.pipe(newCacheWriter(exportId, deps.cache));

        return newStatus;
      } catch (e) {
        console.log("error");
        throw e;
      }
    },
    GetExportStatus: async (exportId) => {
      // util.promisify().bind() makes a new promised function which has its 'this' keyword set to the redisClient context
      // get just Gets the value of a key
      const get = util.promisify(deps.cache.GET).bind(deps.cache);
      const strStatus = await get(exportId);
      if (!strStatus) {
        throw new Error(`no export found for id: ${exportId}`);
      }
      // parse String to ExportStatus
      const status: ExportStatus = JSON.parse(strStatus);
      return status;
    },
    CancelExport: async (user, readStream) => {
      deps.logger("cancelling export");
      try {
        // check if user has permission to cancel the export
        const allowed = await deps.permissionsService.CheckPermissions(
          user,
          deps.allowedPermission
        );
        if (!allowed) {
          throw new Error("incorrect permission");
        }

        const exportId = deps.UUIDGen.NewUUID();
        const newStatus = {
          status: "CANCELLED",
          id: exportId,
        };

        readStream.destroy();

        // I have added close event specifically to handle the 2 edge cases while calling destroy(),
        // 1- lets say we set the CANCELLED state before calling destroy and there is one chunk in the writable state still appending into the cache
        // then at the same time stream is destroyed and the status will set to PENDING, with that, CANCELLED status will be overwritten
        // So instead of setting status before destroy(), setting it after the stream has closed and destroy() emits the 'close' event is safer
        // 2- if someone calls this method after the stream is completed if we set status outside of cache it will override complete status
        readStream.on("close", async function () {
          deps.logger(
            `Stream has been destroyed and file has been closed for exportId: ${exportId}`
          );
          const set = util.promisify(deps.cache.SET).bind(deps.cache);
          await set(exportId, JSON.stringify(newStatus));
        });

        return newStatus;
      } catch (e) {
        console.log("error");
        throw e;
      }
    },
  };
};

function newCacheWriter(exportId: string, cache: RedisClient) {
  // If key already exists and is a string, this appends the value at the end of the string. If key does not exist it is created and set as an empty string
  const append = util.promisify(cache.APPEND).bind(cache);
  // Set the string value of a key. If key already holds a value, it is overwritten, regardless of its type
  const set = util.promisify(cache.SET).bind(cache);
  // Set a timeout on key. After the timeout has expired, the key will automatically be deleted.
  const expire = util.promisify(cache.EXPIRE).bind(cache);

  // return the new writable stream
  return new Writable({
    // write() method writes the data to stream and call the callback when the data has been fully handled
    // returns true if the internal buffer is less than thehighWaterMark (16834)
    async write(chunk, _, callback) {
      // appends the binary string data for the key eg. AAAA-data
      await append(exportId + "-data", chunk.toString("binary"));
      // set the status of key to Pending as the chunks/data has not fully handled
      await set(exportId, JSON.stringify({ status: "PENDING", id: exportId }));
      callback();
    },
    // when all the data is handled the final() is called
    async final(callback) {
      // set/override the status of key to Completed as the chunks/data has fully handled
      await set(exportId, JSON.stringify({ status: "COMPLETE", id: exportId }));
      // set keys time to live in seconds, so it will set to 1 hour
      await expire(exportId, 60 * 60);
      // same as above but now for data
      await expire(exportId + "-data", 60 * 60);
      callback();
    },
  });
}
