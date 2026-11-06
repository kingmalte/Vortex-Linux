# Linux Build

How to build a plain Linux build of Vortex (an unpacked Electron app you start
directly), and what Vortex does differently when it manages Windows games on
Linux. There's no installer, AppImage or auto-update feed for this build; for
the Flatpak see [flatpak.md](flatpak.md).

## Building

Locally, with the prerequisites from
[install-instructions](../install-instructions/README.md) in place:

```bash
pnpm install
pnpm run package:linux
```

This builds the workspace, deploys `src/main/dist` and runs electron-builder's
`dir` target. The result is `dist/linux-unpacked/`; the executable in it is
`vortex`.

In CI, the manually triggered `Package (Linux)` workflow
(`.github/workflows/package-linux.yml`) does the same on `ubuntu-latest` and
uploads `vortex-<version>-linux-x64.tar.gz` as a workflow artifact.

## Running

```bash
tar -xzf vortex-<version>-linux-x64.tar.gz
cd vortex-<version>-linux-x64
./vortex
```

If Electron refuses to start with "The SUID sandbox helper binary was found,
but is not configured correctly", either give `chrome-sandbox` the permissions
Chromium wants, or start with `--no-sandbox`:

```bash
sudo chown root:root chrome-sandbox && sudo chmod 4755 chrome-sandbox
```

On first start Vortex writes `com.nexusmods.vortex.desktop` and a launcher
script into `~/.local/share/applications` and registers itself for `nxm://`
links, so "Mod Manager Download" on Nexus Mods opens this build. If you move
the folder, start `./vortex` once from the new place to update them.

## Windows games on Linux

Most games Vortex manages are Windows games, which Linux runs through Proton or
Wine. Two things follow from that, and Vortex handles both.

### User folders live in the game's prefix

A Windows game keeps settings, load orders and saves in "its" `Documents` and
`AppData`, which Proton puts inside the game's prefix, e.g.
`steamapps/compatdata/<appid>/pfx/drive_c/users/steamuser/Documents`. Code that
needs such a folder for a game calls `getGameUserFolder(gameId, folder)` (or
`util.getGameUserFolder` in extensions) instead of `getVortexPath("documents")`.
It finds the prefix from the game's install path: the Steam app manifest for a
Steam game, or the prefix the game is installed inside (Heroic, Lutris,
Bottles). On Windows, for native games, and before Steam has created the prefix
(it does so on the game's first launch), it returns Vortex's own folder.

Start the game once through Steam before managing it in Vortex, so the prefix
exists.

### File names are matched case-insensitively

Windows file names are case-insensitive, Linux ones aren't, so mods spelling the
same folder differently (`Archive/PC/Mod`, `archive/pc/mod`) would deploy into
separate folders. For a Windows game on Linux, deployment matches every path onto
the spelling already on disk and compares deployed files case-insensitively, so
they end up in one folder and conflicts between them are detected as on Windows.

### Mod loader DLLs need an override

Script extenders and mod loaders often install as stand-ins for system DLLs next
to the game's executable (`version.dll` for Cyber Engine Tweaks, `winmm.dll` for
RED4ext, `dinput8.dll` for ASI loaders, `winhttp.dll` for BepInEx). Wine only
loads them if `WINEDLLOVERRIDES` says to prefer the game's copy. When Vortex
starts a game or tool through Proton it adds `<dll>=n,b` for each of these it
finds next to the executable. Starting the game from Steam instead needs the
same in the game's launch options, e.g.
`WINEDLLOVERRIDES="winmm,version=n,b" %command%` for Cyberpunk 2077.

## Key Files

- `src/renderer/src/util/linux/winePrefix.ts` - finds a game's Wine/Proton prefix and the user folders in it
- `src/renderer/src/util/gameUserPath.ts` - `getGameUserFolder`, the game-aware replacement for user folder paths
- `src/renderer/src/extensions/mod_management/util/CaseInsensitivePathResolver.ts` - case-insensitive path matching for deployment
- `src/renderer/src/util/protocolRegistration/linux/nxm.ts` - desktop entry and `nxm://` registration
- `.github/workflows/package-linux.yml` - CI build of the tarball
