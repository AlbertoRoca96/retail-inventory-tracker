import type { ConfigContext, ExpoConfig } from "@expo/config";
import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import supabaseFallback from "./src/config/staticSupabase.json";

const FALLBACK_SUPABASE_URL = supabaseFallback.url;
const FALLBACK_SUPABASE_ANON_KEY = supabaseFallback.anonKey;
const FALLBACK_WEB_ORIGIN = "https://albertoroca96.github.io";

const sanitize = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return undefined;
  return trimmed;
};

const sanitizeOrigin = (value?: string | null): string | undefined => {
  const clean = sanitize(value);
  if (!clean) return undefined;
  try {
    return new URL(clean).origin;
  } catch {
    return undefined;
  }
};

const APP_VERSION = "1.0.0";
const ANDROID_VERSION_CODE_MAX = 2147483647;

const sanitizeNumericString = (value?: string | number | null): string | undefined => {
  if (value == null) return undefined;
  const text = `${value}`.trim();
  if (!text) return undefined;
  if (!/^[0-9]+$/.test(text)) return undefined;
  return text;
};

const sanitizeInteger = (value?: string | number | null): number | undefined => {
  if (value == null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  if (parsed < 1) return undefined;
  return Math.floor(parsed);
};

const ensureAndroidBounds = (value: number): number => {
  return Math.min(Math.max(value, 1), ANDROID_VERSION_CODE_MAX);
};

const GENERATED_META_PATH = path.resolve(__dirname, ".generated", "build-meta.json");

const isEasBuild = process.env.EAS_BUILD === "true";

type BuildMeta = { ios: string; android: number };
type GlobalWithBuildMeta = typeof globalThis & {
  __retailInventoryBuildMeta?: BuildMeta;
};

const readGeneratedBuildMeta = (): Partial<BuildMeta> => {
  try {
    const raw = fs.readFileSync(GENERATED_META_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const ios = sanitizeNumericString(parsed?.iosBuildNumber);
    const android = sanitizeInteger(parsed?.androidVersionCode);
    return {
      ios: ios,
      android: android ? ensureAndroidBounds(android) : undefined,
    };
  } catch {
    return {};
  }
};

const resolveAutoBuildMeta = (): BuildMeta => {
  const globalScope = globalThis as GlobalWithBuildMeta;
  if (globalScope.__retailInventoryBuildMeta) {
    return globalScope.__retailInventoryBuildMeta;
  }

  const now = Date.now();
  const iosAuto = String(now);
  const androidAuto = ensureAndroidBounds(Math.floor(now / 1000));

  const meta: BuildMeta = {
    ios: iosAuto,
    android: androidAuto,
  };
  globalScope.__retailInventoryBuildMeta = meta;
  return meta;
};

const envIosBuild =
  sanitizeNumericString(process.env.IOS_BUILD_NUMBER ?? process.env.EXPO_IOS_BUILD_NUMBER) ?? undefined;
const envAndroidBuild =
  sanitizeInteger(process.env.ANDROID_VERSION_CODE ?? process.env.EXPO_ANDROID_VERSION_CODE) ?? undefined;

const generatedMeta = readGeneratedBuildMeta();
const autoMeta = resolveAutoBuildMeta();

const iosBuildNumber = envIosBuild ?? generatedMeta.ios ?? autoMeta.ios;
const androidVersionCode = ensureAndroidBounds(
  envAndroidBuild ?? generatedMeta.android ?? autoMeta.android
);

export default ({ config }: ConfigContext): ExpoConfig => {
  const supabaseUrl =
    sanitize(process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL) ??
    FALLBACK_SUPABASE_URL;
  const supabaseAnonKey =
    sanitize(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY) ??
    FALLBACK_SUPABASE_ANON_KEY;
  const webOrigin =
    sanitizeOrigin(process.env.EXPO_PUBLIC_WEB_ORIGIN ?? process.env.WEB_ORIGIN) ??
    FALLBACK_WEB_ORIGIN;

  const iosBuildNumber = isEasBuild ? undefined : (envIosBuild ?? generatedMeta.ios ?? autoMeta.ios);
  const androidVersionCode = ensureAndroidBounds(
    envAndroidBuild ?? generatedMeta.android ?? autoMeta.android
  );

  return {
    ...config,
    name: "RWS",
    slug: "retail-inventory-tracker",
    icon: "./assets/app-icon.png",
    splash: {
      image: "./assets/app-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    notification: {
      icon: "./assets/app-icon.png",
      color: "#2563eb",
      iosDisplayInForeground: true,
    },
    owner: "al96",
    version: APP_VERSION,
    orientation: "portrait",
    scheme: "retailinventory",
    jsEngine: "hermes",
    newArchEnabled: false,
    ios: {
      supportsTablet: true,
      icon: "./assets/app-icon.png",
      bundleIdentifier: "io.github.albertoroca96.retailinventorytracker",
      ...(iosBuildNumber ? { buildNumber: iosBuildNumber } : {}),
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        UIFileSharingEnabled: true,
        LSSupportsOpeningDocumentsInPlace: true,
      },
    },
    android: {
      package: "io.github.albertoroca96.retailinventorytracker",
      versionCode: androidVersionCode,
      permissions: ["android.permission.RECORD_AUDIO"],
      adaptiveIcon: {
        foregroundImage: "./assets/app-icon.png",
        backgroundColor: "#ffffff",
      },
      icon: "./assets/app-icon.png",
    },
    plugins: [
      [
        "expo-image-picker",
        {
          photosPermission:
            "Allow $(PRODUCT_NAME) to access your photos to attach store shelf images.",
        },
      ],
      [
        "expo-router",
        {
          origin: webOrigin,
        },
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/app-icon.png",
          color: "#2563eb",
        },
      ],
      [
        "expo-build-properties",
        {
          ios: {
            useHermes: true,
            newArchEnabled: false,
          },
          android: {
            useHermes: true,
          },
        },
      ],
    ],
    extra: {
      ...config.extra,
      eas: {
        projectId: "71c55632-484d-4208-a4f6-ca6fa815a5bb",
      },
      supabaseUrl,
      supabaseAnonKey,
      webOrigin,
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/logo.png",
    },
    experiments: {
      baseUrl: "/retail-inventory-tracker",
    },
  };
};
