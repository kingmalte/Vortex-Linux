import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildProtonEnvironment, proxyDllOverrides } from "./proton";

describe("proxyDllOverrides", () => {
  let exeDir: string;

  beforeEach(() => {
    exeDir = fs.mkdtempSync(path.join(os.tmpdir(), "vortex-proton-"));
  });

  afterEach(() => {
    fs.rmSync(exeDir, { recursive: true, force: true });
  });

  it("lists the mod loader proxies next to the executable, whatever their case", () => {
    for (const name of ["Cyberpunk2077.exe", "version.dll", "WINMM.dll", "d3d12.dll"]) {
      fs.writeFileSync(path.join(exeDir, name), "");
    }
    expect(proxyDllOverrides(exeDir)).toEqual(["version", "winmm"]);
  });

  it("is empty for a folder that can't be read", () => {
    expect(proxyDllOverrides(path.join(exeDir, "missing"))).toEqual([]);
  });
});

describe("buildProtonEnvironment", () => {
  const compatData = path.join(path.sep, "steamapps", "compatdata", "1091500");
  const steamPath = path.join(path.sep, "steam");

  it("prefers the game's copy of the given DLLs", () => {
    const env = buildProtonEnvironment(compatData, steamPath, {}, ["version", "winmm"]);
    expect(env.WINEDLLOVERRIDES).toBe("version,winmm=n,b");
    expect(env.WINEPREFIX).toBe(path.join(compatData, "pfx"));
  });

  it("keeps overrides that are already set", () => {
    const env = buildProtonEnvironment(compatData, steamPath, { WINEDLLOVERRIDES: "dxgi=n" }, [
      "version",
    ]);
    expect(env.WINEDLLOVERRIDES).toBe("dxgi=n;version=n,b");
  });
});
