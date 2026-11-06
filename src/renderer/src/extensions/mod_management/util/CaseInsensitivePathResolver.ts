import * as fs from "node:fs/promises";
import * as path from "node:path";

import { getErrorCode } from "@vortex/shared";

import type { IState } from "../../../types/IState";
import getNormalizeFunc, { type Normalize } from "../../../util/getNormalizeFunc";
import { isWindowsExecutable } from "../../../util/linux/proton";
import { findWinePrefixForGamePath } from "../../../util/linux/winePrefix";
import { getGame } from "../../gamemode_management/util/getGame";

export type ReadDir = (dirPath: string) => Promise<string[]>;

const defaultReadDir: ReadDir = (dirPath) => fs.readdir(dirPath);

/**
 * Maps paths onto the spelling already on disk, one segment at a time.
 *
 * Windows games, also when run through Wine or Proton, treat file names
 * case-insensitively, so mods spell the same folder in different ways
 * ("Archive/PC/Mod", "archive/pc/mod"). On a case-sensitive Linux file system
 * deploying them as they are creates several folders where the game expects
 * one. Resolving each file onto the existing spelling puts it where the game
 * (and every other mod) has it.
 *
 * The first spelling used for a folder that doesn't exist yet is remembered, so
 * later and concurrent calls agree on it. Directory listings are cached, so use
 * one instance per deployment run and don't change the folders behind its back.
 */
export class CaseInsensitivePathResolver {
  readonly #readDir: ReadDir;
  // directory -> lower-cased entry name -> entry name as it is on disk
  readonly #listings = new Map<string, Promise<Map<string, string>>>();

  constructor(readDir: ReadDir = defaultReadDir) {
    this.#readDir = readDir;
  }

  /** The path relPath has below basePath, spelled the way it already exists. */
  public async resolve(basePath: string, relPath: string): Promise<string> {
    let current = basePath;
    for (const segment of relPath.split(/[\\/]+/)) {
      if (segment === "" || segment === "." || segment === "..") {
        current = path.join(current, segment);
        continue;
      }
      const listing = await this.#listing(current);
      const key = segment.toLowerCase();
      let actual = listing.get(key);
      if (actual === undefined) {
        actual = segment;
        listing.set(key, actual);
      }
      current = path.join(current, actual);
    }
    return current;
  }

  #listing(dirPath: string): Promise<Map<string, string>> {
    let listing = this.#listings.get(dirPath);
    if (listing === undefined) {
      listing = this.#readDir(dirPath).then(toListing, (err: unknown) => {
        // a folder that doesn't exist yet has no entries to match
        if (["ENOENT", "ENOTDIR"].includes(getErrorCode(err))) {
          return new Map<string, string>();
        }
        throw err;
      });
      this.#listings.set(dirPath, listing);
    }
    return listing;
  }
}

function toListing(names: string[]): Map<string, string> {
  const listing = new Map<string, string>();
  for (const name of names) {
    // with several spellings on disk already, stick to one of them
    const key = name.toLowerCase();
    if (!listing.has(key)) {
      listing.set(key, name);
    }
  }
  return listing;
}

/**
 * Whether deploying for a game has to map file names case-insensitively: true
 * for Windows games on other platforms, which the game runs through Wine or
 * Proton. Native games keep the case-sensitive behavior of their file system.
 */
export function deploysCaseInsensitively(
  state: IState,
  gameId: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform === "win32") {
    return false;
  }
  const discovery = state.settings?.gameMode?.discovered?.[gameId];
  let executable = discovery?.executable;
  if (!executable) {
    try {
      executable = getGame(gameId)?.executable?.(discovery?.path);
    } catch {
      executable = undefined;
    }
  }
  if (executable && isWindowsExecutable(executable)) {
    return true;
  }
  return discovery?.path !== undefined && findWinePrefixForGamePath(discovery.path) !== undefined;
}

/** The normalize function for comparing a game's deployed file paths below deployPath. */
export function getDeploymentNormalizeFunc(
  state: IState,
  gameId: string,
  deployPath: string,
): Promise<Normalize> {
  return Promise.resolve(
    getNormalizeFunc(
      deployPath,
      deploysCaseInsensitively(state, gameId) ? { caseInsensitive: true } : undefined,
    ),
  );
}
