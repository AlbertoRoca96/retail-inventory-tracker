import type { ConfigContext, ExpoConfig } from "@expo/config";
import "dotenv/config";

const FALLBACK_SUPABASE_URL = "https://prhhlvdoplavakbgcbes.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByaGhsdmRvcGxhdmFrYmdjYmVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUzNDQ5MzQsImV4cCI6MjA3MDkyMDkzNH0.1m2eqSItpNq_rl_uU5PwOlSubdCfwp-NmW2QCPVWB5c";

const sanitize = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return undefined;
  return trimmed;
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const supabaseUrl =
    sanitize(process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL) ??
    FALLBACK_SUPABASE_URL;
  const supabaseAnonKey =
    sanitize(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY) ??
    FALLBACK_SUPABASE_ANON_KEY;

  return {
    ...config,
    name: "Retail Inventory Tracker",
    slug: "retail-inventory-tracker",
    owner: "al96",
    version: "1.0.0",
    orientation: "portrait",
    scheme: "retailinventory",
    jsEngine: "hermes",
    newArchEnabled: false,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "io.github.albertoroca96.retailinventorytracker",
      buildNumber: "25",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: "io.github.albertoroca96.retailinventorytracker",
      versionCode: 3,
      permissions: ["android.permission.RECORD_AUDIO"],
    },
    plugins: [
      [
        "expo-image-picker",
        {
          photosPermission:
            "Allow $(PRODUCT_NAME) to access your photos to attach store shelf images.",
        },
      ],
      "expo-router",
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
