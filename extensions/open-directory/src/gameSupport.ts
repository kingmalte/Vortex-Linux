import * as path from "path";

import { selectors, types, util } from "@nexusmods/vortex-api";
import * as Redux from "redux";

interface IGameSupport {
  settingsPath?: (gameId: string) => string;
  appDataPath?: (gameId: string) => string;
}

// the game's own folders: inside its Wine/Proton prefix on Linux
const myGames = (gameId: string, dir: string) =>
  path.join(util.getGameUserFolder(gameId, "documents"), "My Games", dir);
const localAppData = (gameId: string, dir: string) =>
  path.join(util.getGameUserFolder(gameId, "localAppData"), dir);

const gameSupport = util.makeOverlayableDictionary<string, IGameSupport>(
  {
    fallout3: {
      settingsPath: (gameId) => myGames(gameId, "Fallout3"),
      appDataPath: (gameId) => localAppData(gameId, "Fallout3"),
    },
    falloutnv: {
      settingsPath: (gameId) => myGames(gameId, "FalloutNV"),
      appDataPath: (gameId) => localAppData(gameId, "FalloutNV"),
    },
    fallout4: {
      settingsPath: (gameId) => myGames(gameId, "Fallout4"),
      appDataPath: (gameId) => localAppData(gameId, "Fallout4"),
    },
    fallout4vr: {
      settingsPath: (gameId) => myGames(gameId, "Fallout4VR"),
      appDataPath: (gameId) => localAppData(gameId, "Fallout4VR"),
    },
    starfield: {
      settingsPath: (gameId) => myGames(gameId, "Starfield"),
      appDataPath: (gameId) => localAppData(gameId, "Starfield"),
    },
    oblivion: {
      settingsPath: (gameId) => myGames(gameId, "Oblivion"),
      appDataPath: (gameId) => localAppData(gameId, "Oblivion"),
    },
    skyrim: {
      settingsPath: (gameId) => myGames(gameId, "Skyrim"),
      appDataPath: (gameId) => localAppData(gameId, "Skyrim"),
    },
    skyrimse: {
      settingsPath: (gameId) => myGames(gameId, "Skyrim Special Edition"),
      appDataPath: (gameId) => localAppData(gameId, "Skyrim Special Edition"),
    },
    skyrimvr: {
      settingsPath: (gameId) => myGames(gameId, "SkyrimVR"),
      appDataPath: (gameId) => localAppData(gameId, "SkyrimVR"),
    },
  },
  {
    xbox: {
      skyrimse: {
        settingsPath: (gameId) => myGames(gameId, "Skyrim Special Edition MS"),
        appDataPath: (gameId) => localAppData(gameId, "Skyrim Special Edition MS"),
      },
      fallout4: {
        settingsPath: (gameId) => myGames(gameId, "Fallout4 MS"),
        appDataPath: (gameId) => localAppData(gameId, "Fallout4 MS"),
      },
    },
    gog: {
      skyrimse: {
        settingsPath: (gameId) => myGames(gameId, "Skyrim Special Edition GOG"),
        appDataPath: (gameId) => localAppData(gameId, "Skyrim Special Edition GOG"),
      },
      enderalspecialedition: {
        settingsPath: (gameId) => myGames(gameId, "Enderal Special Edition GOG"),
        appDataPath: (gameId) => localAppData(gameId, "Enderal Special Edition GOG"),
      },
    },
    epic: {
      skyrimse: {
        settingsPath: (gameId) => myGames(gameId, "Skyrim Special Edition EPIC"),
        appDataPath: (gameId) => localAppData(gameId, "Skyrim Special Edition EPIC"),
      },
      fallout4: {
        settingsPath: (gameId) => myGames(gameId, "Fallout4 EPIC"),
        appDataPath: (gameId) => localAppData(gameId, "Fallout4 EPIC"),
      },
    },
  },
  (gameId) => gameStoreForGame(gameId),
);

let gameStoreForGame: (gameId: string) => string = () => undefined;

export function initGameSupport(api: types.IExtensionApi) {
  gameStoreForGame = (gameId: string) =>
    selectors.discoveryByGame(api.store.getState(), gameId)?.store;
}

export function settingsPath(game: types.IGame): string {
  return gameSupport.get(game.id, "settingsPath")?.(game.id) ?? game.details?.settingsPath?.();
}

export function appDataPath(game: types.IGame): string {
  return gameSupport.get(game.id, "appDataPath")?.(game.id) ?? game.details?.appDataPath?.();
}
