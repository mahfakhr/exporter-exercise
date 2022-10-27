import { Exporter, HBExporter, HBExporterDependencies } from "../src/exporter";
import "regenerator-runtime/runtime";
import { MockPermissions, User } from "../src/permissions";
import { NewMockLogger } from "../src/logger";
import { createClient } from "redis-mock";
import { createReadStream } from "fs";
import { sleep } from "../src";

describe("Test export cancellation", () => {
  let exporter: Exporter;
  let testUser: User;
  let exporterTestDeps: HBExporterDependencies;
  let testReadStream;
  beforeEach(() => {
    const testUUIDGen = {
      NewUUID: () => {
        return "test";
      },
    };
    exporterTestDeps = {
      cache: createClient(),
      UUIDGen: testUUIDGen,
      allowedPermission: "canceller",
      permissionsService: MockPermissions,
      logger: NewMockLogger("canceller"),
    };

    testUser = {
      id: "test",
      permissions: ["canceller"],
    };

    testReadStream = createReadStream("mytestexport.txt", {
      encoding: "utf8",
      autoClose: true,
    });

    exporter = HBExporter(exporterTestDeps);
  });

  it("Throw permissions error if user do not have permission to cancel", async () => {
    const mockError = new Error("incorrect permission");
    testUser.permissions = ["exporter"];

    try {
      await exporter.CancelExport(testUser, testReadStream);
    } catch (e) {
      expect(e).toEqual(mockError);
    }
  });

  it("Cancel stream successfully and update status CANCELLED to cache", async () => {
    const cancelledExport = await exporter.CancelExport(
      testUser,
      testReadStream
    );
    expect(cancelledExport.status).toBe("CANCELLED");
    await sleep(25); // wait for cache to be written as destroy() emitting the close event

    const statusInCache = await exporter.GetExportStatus(cancelledExport.id);
    expect(statusInCache.status).toBe("CANCELLED");
  });

  it("Do not update CANCELLED status in cache if stream is already completed", async () => {
    await exporter.StartExport(testUser, testReadStream);
    await sleep(25); // wait for stream to complete

    await exporter.CancelExport(testUser, testReadStream);
    const statusInCache = await exporter.GetExportStatus("test");
    expect(statusInCache.status).toBe("COMPLETE");
  });
});
