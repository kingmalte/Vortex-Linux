import * as path from "path";

import getVortexPath from "./getVortexPath";
import {
  findWinePrefixForGamePath,
  windowsUserFolderInPrefix,
  type WindowsUserFolder,
} from "./linux/winePrefix";

export type { WindowsUserFolder } from "./linux/winePrefix";

let discoveredGamePath: (gameId: string) => string | undefined = () => undefined;

/** Lets {@link getGameUserFolder} look up where a game is installed. */
export function attachGameUserPathLookup(lookup: (gameId: string) => string | undefined): void {
  discoveredGamePath = lookup;
}

function ownUserFolder(folder: WindowsUserFolder): string {
  switch (folder) {
    case "localLow":
      return path.resolve(getVortexPath("appData"), "..", "LocalLow");
    case "savedGames":
      return path.join(getVortexPath("home"), "Saved Games");
    default:
      return getVortexPath(folder);
  }
}

/**
 * Where a game installed at gamePath keeps a per-user Windows folder such as
 * "Documents" or "AppData\Local".
 *
 * On Windows that's simply the user's folder. On Linux a Windows game runs
 * through Proton or Wine, which keep these folders inside the game's prefix, so
 * this returns the folder in there. Native Linux games, and Proton games Steam
 * hasn't created a prefix for yet, get Vortex's own folder of that kind, as on
 * Windows.
 */
export function getGameUserPath(folder: WindowsUserFolder, gamePath: string | undefined): string {
  if (process.platform !== "win32" && gamePath) {
    const prefix = findWinePrefixForGamePath(gamePath);
    if (prefix !== undefined) {
      return windowsUserFolderInPrefix(prefix, folder);
    }
  }
  return ownUserFolder(folder);
}

/**
 * {@link getGameUserPath} for a game by id, for the install Vortex discovered.
 * Use this instead of getVortexPath("documents") and the like for paths that
 * belong to a game, so they also resolve on Linux.
 *
 * @param gamePath where the game is installed, when the caller already has it
 *                 (e.g. in queryModPath, which can run before the discovery is stored)
 */
export function getGameUserFolder(
  gameId: string,
  folder: WindowsUserFolder,
  gamePath?: string,
): string {
  return getGameUserPath(folder, gamePath || discoveredGamePath(gameId));
}
