import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { findLinuxSteamPath } from "./steamPaths";

/**
 * The per-user Windows folders games keep data in: settings, load orders and
 * saves ("Documents\My Games", "AppData\Local", ...).
 */
export type WindowsUserFolder =
  | "home"
  | "documents"
  | "appData"
  | "localAppData"
  | "localLow"
  | "savedGames";

// Current Wine/Proton spellings first, then the ones older prefixes use.
const FOLDER_CANDIDATES: Record<WindowsUserFolder, string[][]> = {
  home: [[]],
  documents: [["Documents"], ["My Documents"]],
  appData: [["AppData", "Roaming"], ["Application Data"]],
  localAppData: [["AppData", "Local"], ["Local Settings", "Application Data"]],
  localLow: [["AppData", "LocalLow"]],
  savedGames: [["Saved Games"]],
};

// steamapps folder + lower-cased install dir -> app id. Only hits are cached:
// a game installed after the lookup must still be found.
const appIdCache = new Map<string, string>();

function isDirectory(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function isPrefix(prefixPath: string): boolean {
  return isDirectory(path.join(prefixPath, "drive_c", "users"));
}

/** Games installed by Heroic, Lutris, Bottles or plain Wine often live inside the prefix. */
function prefixContaining(gamePath: string): string | undefined {
  const segments = path.resolve(gamePath).split(path.sep);
  const driveIdx = segments.findIndex((segment) => segment.toLowerCase() === "drive_c");
  if (driveIdx <= 0) {
    return undefined;
  }
  const prefixPath = segments.slice(0, driveIdx).join(path.sep) || path.sep;
  return isPrefix(prefixPath) ? prefixPath : undefined;
}

function readAppManifest(manifestPath: string): string | undefined {
  try {
    return fs.readFileSync(manifestPath, "utf8");
  } catch {
    return undefined;
  }
}

/** The app id of the Steam game installed to steamapps/common/<installDir>. */
export function steamAppIdForInstallDir(steamAppsPath: string, installDir: string): string | undefined {
  const cacheKey = `${steamAppsPath}\u0000${installDir.toLowerCase()}`;
  const cached = appIdCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  let names: string[];
  try {
    names = fs.readdirSync(steamAppsPath);
  } catch {
    return undefined;
  }
  for (const name of names) {
    const appId = /^appmanifest_(\d+)\.acf$/i.exec(name)?.[1];
    const manifest = appId !== undefined ? readAppManifest(path.join(steamAppsPath, name)) : undefined;
    const manifestDir = manifest !== undefined ? /"installdir"\s+"([^"]*)"/i.exec(manifest)?.[1] : undefined;
    if (manifestDir?.toLowerCase() === installDir.toLowerCase()) {
      appIdCache.set(cacheKey, appId);
      return appId;
    }
  }
  return undefined;
}

function defaultSteamAppsPaths(): string[] {
  try {
    const steamPath = findLinuxSteamPath();
    return steamPath !== undefined ? [path.join(steamPath, "steamapps")] : [];
  } catch {
    return [];
  }
}

/**
 * Steam keeps a Proton game's prefix in compatdata/<appid>/pfx, normally in the
 * library the game is installed to, otherwise in the main Steam folder.
 */
function steamPrefixForGame(gamePath: string, extraSteamApps: () => string[]): string | undefined {
  const segments = path.resolve(gamePath).split(path.sep);
  const idx = segments.findIndex(
    (segment, i) =>
      segment.toLowerCase() === "steamapps" &&
      segments[i + 1]?.toLowerCase() === "common" &&
      segments[i + 2] !== undefined,
  );
  if (idx < 0) {
    return undefined;
  }
  const steamAppsPath = segments.slice(0, idx + 1).join(path.sep);
  const appId = steamAppIdForInstallDir(steamAppsPath, segments[idx + 2]);
  if (appId === undefined) {
    return undefined;
  }
  return [steamAppsPath, ...extraSteamApps()]
    .map((steamApps) => path.join(steamApps, "compatdata", appId, "pfx"))
    .find(isPrefix);
}

/**
 * The Wine prefix (the folder holding drive_c) a Windows game installed at
 * gamePath runs in: its Proton prefix for a Steam game, or the prefix the game
 * is installed inside. Undefined for native games and for Proton games that
 * haven't been started yet, since Steam only creates the prefix on first launch.
 *
 * @param extraSteamApps further steamapps folders to look for compatdata in
 */
export function findWinePrefixForGamePath(
  gamePath: string,
  extraSteamApps: () => string[] = defaultSteamAppsPaths,
): string | undefined {
  if (!gamePath) {
    return undefined;
  }
  return prefixContaining(gamePath) ?? steamPrefixForGame(gamePath, extraSteamApps);
}

function ownUserName(): string | undefined {
  try {
    return os.userInfo().username;
  } catch {
    return undefined;
  }
}

/** Proton always runs as "steamuser"; Wine uses the Linux user's name. */
function prefixUserName(prefixPath: string): string {
  let names: string[] = [];
  try {
    names = fs.readdirSync(path.join(prefixPath, "drive_c", "users"));
  } catch {
    // fall through to the Proton default
  }
  if (names.includes("steamuser")) {
    return "steamuser";
  }
  const own = ownUserName();
  if (own !== undefined && names.includes(own)) {
    return own;
  }
  return names.find((name) => name.toLowerCase() !== "public") ?? "steamuser";
}

/** Where a per-user Windows folder is inside a Wine prefix. */
export function windowsUserFolderInPrefix(prefixPath: string, folder: WindowsUserFolder): string {
  const userDir = path.join(prefixPath, "drive_c", "users", prefixUserName(prefixPath));
  const candidates = FOLDER_CANDIDATES[folder].map((segments) => path.join(userDir, ...segments));
  return candidates.find(isDirectory) ?? candidates[0];
}
