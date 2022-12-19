import { HBExporter, HBExporterDependencies } from "./exporter";

import { createClient } from "redis-mock";
import { MockUUIDGen } from "./uuid";
import { MockPermissions } from "./permissions";
import { createReadStream } from "fs";
import { NewMockLogger } from "./logger";
import { log } from "util";

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

  let stream = mockOpenFile();
  try {
    console.log(exporter.StartExport(myUser, stream));
  } catch (e) {
    console.log(e);
  }
  let i = 0;
  while (true) {
    await sleep(10);
    const res = await exporter.GetExportStatus(MockUUIDGen.NewUUID());
    console.log(res);
    redisClient.get("AAAA", (err, rep) => {
      console.log(rep);
    });
    redisClient.get("AAAA-data", (err, rep) => {
      console.log(rep?.length);
    });
    if (i == 3) {
      await exporter.CancelExport(myUser, "AAAA", stream);
    }
    i++;
    if (res.status === "COMPLETE" || res.status === "CANCELED") break;
  }
}

// Starting application...
StartApp();
