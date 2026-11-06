import * as path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { IState } from "../../../types/IState";
import { CaseInsensitivePathResolver, deploysCaseInsensitively } from "./CaseInsensitivePathResolver";

vi.mock("../../gamemode_management/util/getGame", () => ({
  getGame: (gameId: string) =>
    gameId === "cyberpunk2077"
      ? { executable: () => "bin/x64/Cyberpunk2077.exe" }
      : { executable: () => "factorio" },
}));

const BASE = path.join(path.sep, "games", "Cyberpunk 2077");

function enoent(): Error {
  return Object.assign(new Error("not found"), { code: "ENOENT" });
}

/** A readDir over a fixed tree of folders, given as paths relative to BASE. */
function fakeTree(dirs: Record<string, string[]>) {
  const listings = new Map(
    Object.entries(dirs).map(([dir, names]) => [path.join(BASE, dir), names]),
  );
  return vi.fn(async (dirPath: string) => {
    const names = listings.get(dirPath);
    if (names === undefined) {
      throw enoent();
    }
    return names;
  });
}

describe("CaseInsensitivePathResolver", () => {
  it("maps every segment onto the spelling on disk", async () => {
    const resolver = new CaseInsensitivePathResolver(
      fakeTree({ "": ["archive", "bin"], archive: ["pc"], "archive/pc": ["mod"], "archive/pc/mod": [] }),
    );
    await expect(resolver.resolve(BASE, "Archive/PC/Mod/My.archive")).resolves.toBe(
      path.join(BASE, "archive", "pc", "mod", "My.archive"),
    );
  });

  it("matches files the game ships, so they get backed up and replaced", async () => {
    const resolver = new CaseInsensitivePathResolver(
      fakeTree({ "": ["bin"], bin: ["x64"], "bin/x64": ["Version.dll"] }),
    );
    await expect(resolver.resolve(BASE, path.join("bin", "x64", "version.dll"))).resolves.toBe(
      path.join(BASE, "bin", "x64", "Version.dll"),
    );
  });

  it("keeps the first spelling of a new folder for all later files", async () => {
    const resolver = new CaseInsensitivePathResolver(fakeTree({ "": [] }));
    await expect(resolver.resolve(BASE, "R6/Scripts/a.reds")).resolves.toBe(
      path.join(BASE, "R6", "Scripts", "a.reds"),
    );
    await expect(resolver.resolve(BASE, "r6/scripts/b.reds")).resolves.toBe(
      path.join(BASE, "R6", "Scripts", "b.reds"),
    );
  });

  it("agrees on one spelling for concurrent calls", async () => {
    const resolver = new CaseInsensitivePathResolver(fakeTree({ "": [] }));
    const results = await Promise.all([
      resolver.resolve(BASE, "Mods/one.txt"),
      resolver.resolve(BASE, "mods/two.txt"),
      resolver.resolve(BASE, "MODS/three.txt"),
    ]);
    expect(results.map((result) => path.dirname(result))).toEqual([
      path.join(BASE, "Mods"),
      path.join(BASE, "Mods"),
      path.join(BASE, "Mods"),
    ]);
  });

  it("reads each folder only once", async () => {
    const readDir = fakeTree({ "": ["archive"], archive: [] });
    const resolver = new CaseInsensitivePathResolver(readDir);
    await resolver.resolve(BASE, "archive/a");
    await resolver.resolve(BASE, "Archive/b");
    expect(readDir).toHaveBeenCalledTimes(2);
  });

  it("passes on errors other than a missing folder", async () => {
    const denied = Object.assign(new Error("denied"), { code: "EACCES" });
    const resolver = new CaseInsensitivePathResolver(() => Promise.reject(denied));
    await expect(resolver.resolve(BASE, "a/b")).rejects.toBe(denied);
  });
});

describe("deploysCaseInsensitively", () => {
  const state = (discovered: Record<string, unknown>) =>
    ({ settings: { gameMode: { discovered } } }) as unknown as IState;

  it("is false on Windows", () => {
    expect(deploysCaseInsensitively(state({}), "cyberpunk2077", "win32")).toBe(false);
  });

  it("is true for a Windows game elsewhere", () => {
    const discovered = { cyberpunk2077: { path: BASE } };
    expect(deploysCaseInsensitively(state(discovered), "cyberpunk2077", "linux")).toBe(true);
  });

  it("goes by the discovered executable over the game's default", () => {
    const discovered = { factorio: { path: BASE, executable: "bin/Factorio.exe" } };
    expect(deploysCaseInsensitively(state(discovered), "factorio", "linux")).toBe(true);
  });

  it("is false for a native game", () => {
    const discovered = { factorio: { path: path.join(path.sep, "games", "factorio") } };
    expect(deploysCaseInsensitively(state(discovered), "factorio", "linux")).toBe(false);
  });
});
