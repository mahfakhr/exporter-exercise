import { HBExporter, HBExporterDependencies } from "./exporter";

import { createClient } from "redis-mock";
import { MockUUIDGen } from "./uuid";
import { MockPermissions } from "./permissions";
import { createReadStream } from "fs";
import { NewMockLogger } from "./logger";

function mockOpenFile() {
  return createReadStream("myexport.txt", {
    encoding: "utf8",
    autoClose: true,
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function StartApp() {
  console.log("starting application");
  const redisClient = createClient();
  const exporterDeps: HBExporterDependencies = {
    cache: redisClient,
    UUIDGen: MockUUIDGen,
    allowedPermission: "exporter",
    permissionsService: MockPermissions,
    logger: NewMockLogger("exporter"),
  };
  const myUser = {
    id: "1",
    permissions: ["exporter"],
  };

  const exporter = HBExporter(exporterDeps);
  const openFileReadStream = mockOpenFile();

  try {
    // as it is async method but we are not using await here because otherwise GetExportStatus functionality does not
    // serve the purpose it is very cleverly running asynchronously in the background while we check the status via cache
    exporter.StartExport(myUser, openFileReadStream);
  } catch (e) {
    console.log(e);
  }

  // Cancel export functionality, Uncomment for demo
  // try {
  //   exporter.CancelExport(myUser, openFileReadStream);
  // } catch (e) {
  //   console.log(e);
  // }

  while (1) {
    await sleep(500);
    const res = await exporter.GetExportStatus(MockUUIDGen.NewUUID());
    console.log(res);
  }
}

// Starting application...
StartApp();
