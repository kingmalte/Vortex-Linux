import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { findWinePrefixForGamePath, windowsUserFolderInPrefix } from "./winePrefix";

vi.mock("./steamPaths", () => ({ findLinuxSteamPath: () => undefined }));

const APP_ID = "1091500";
const INSTALL_DIR = "Cyberpunk 2077";

let root: string;

function mkdir(...segments: string[]): string {
  const dirPath = path.join(root, ...segments);
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function writeManifest(steamApps: string, appId: string, installDir: string): void {
  fs.writeFileSync(
    path.join(steamApps, `appmanifest_${appId}.acf`),
    `"AppState"\n{\n\t"appid"\t\t"${appId}"\n\t"installdir"\t\t"${installDir}"\n}\n`,
  );
}

/** A Steam library with the game installed and, optionally, its Proton prefix. */
function steamLibrary(withPrefix: boolean): { steamApps: string; gamePath: string } {
  const steamApps = mkdir("library", "steamapps");
  const gamePath = mkdir("library", "steamapps", "common", INSTALL_DIR);
  writeManifest(steamApps, "570", "dota 2 beta");
  writeManifest(steamApps, APP_ID, INSTALL_DIR);
  if (withPrefix) {
    mkdir("library", "steamapps", "compatdata", APP_ID, "pfx", "drive_c", "users", "steamuser");
  }
  return { steamApps, gamePath };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "vortex-wineprefix-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("findWinePrefixForGamePath", () => {
  it("finds the Proton prefix of a Steam game by its app manifest", () => {
    const { steamApps, gamePath } = steamLibrary(true);
    expect(findWinePrefixForGamePath(gamePath, () => [])).toBe(
      path.join(steamApps, "compatdata", APP_ID, "pfx"),
    );
  });

  it("also finds it from a folder inside the game", () => {
    const { steamApps, gamePath } = steamLibrary(true);
    expect(findWinePrefixForGamePath(path.join(gamePath, "bin", "x64"), () => [])).toBe(
      path.join(steamApps, "compatdata", APP_ID, "pfx"),
    );
  });

  it("looks for compatdata in the other steamapps folders it's given", () => {
    const { gamePath } = steamLibrary(false);
    const mainSteamApps = mkdir("steam", "steamapps");
    mkdir("steam", "steamapps", "compatdata", APP_ID, "pfx", "drive_c", "users", "steamuser");
    expect(findWinePrefixForGamePath(gamePath, () => [mainSteamApps])).toBe(
      path.join(mainSteamApps, "compatdata", APP_ID, "pfx"),
    );
  });

  it("is undefined while Steam hasn't created the prefix yet", () => {
    const { gamePath } = steamLibrary(false);
    expect(findWinePrefixForGamePath(gamePath, () => [])).toBeUndefined();
  });

  it("finds the prefix a game is installed inside", () => {
    const prefix = mkdir("Games", "heroic", "Prefixes", "Witcher");
    mkdir("Games", "heroic", "Prefixes", "Witcher", "drive_c", "users", "me");
    const gamePath = mkdir("Games", "heroic", "Prefixes", "Witcher", "drive_c", "GOG", "Witcher");
    expect(findWinePrefixForGamePath(gamePath, () => [])).toBe(prefix);
  });

  it("is undefined for a native game", () => {
    expect(findWinePrefixForGamePath(mkdir("games", "factorio"), () => [])).toBeUndefined();
  });
});

describe("windowsUserFolderInPrefix", () => {
  it("maps the user folders into a Proton prefix", () => {
    const prefix = mkdir("pfx");
    mkdir("pfx", "drive_c", "users", "Public");
    mkdir("pfx", "drive_c", "users", "steamuser", "AppData", "Local");
    const user = path.join(prefix, "drive_c", "users", "steamuser");

    expect(windowsUserFolderInPrefix(prefix, "localAppData")).toBe(
      path.join(user, "AppData", "Local"),
    );
    expect(windowsUserFolderInPrefix(prefix, "documents")).toBe(path.join(user, "Documents"));
    expect(windowsUserFolderInPrefix(prefix, "appData")).toBe(
      path.join(user, "AppData", "Roaming"),
    );
    expect(windowsUserFolderInPrefix(prefix, "savedGames")).toBe(path.join(user, "Saved Games"));
  });

  it("uses the spellings of older prefixes where those exist", () => {
    const prefix = mkdir("pfx");
    mkdir("pfx", "drive_c", "users", "steamuser", "My Documents");
    expect(windowsUserFolderInPrefix(prefix, "documents")).toBe(
      path.join(prefix, "drive_c", "users", "steamuser", "My Documents"),
    );
  });

  it("uses the prefix's own user for a plain Wine prefix", () => {
    const prefix = mkdir("pfx");
    mkdir("pfx", "drive_c", "users", "Public");
    mkdir("pfx", "drive_c", "users", "someone");
    expect(windowsUserFolderInPrefix(prefix, "home")).toBe(
      path.join(prefix, "drive_c", "users", "someone"),
    );
  });
});
