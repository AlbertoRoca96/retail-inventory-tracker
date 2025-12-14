import type { ConfigContext, ExpoConfig } from "@expo/config";
import "dotenv/config";
import { resolveSupabaseConfig } from "./src/config/supabaseEnv";

export default ({ config }: ConfigContext): ExpoConfig => {
  const { supabaseUrl, supabaseAnonKey } = resolveSupabaseConfig();

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
