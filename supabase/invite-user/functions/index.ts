name: web
on:
  workflow_dispatch:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/mobile
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install deps
        run: |
          if [ -f package-lock.json ]; then
            echo "Using npm ci (lockfile present)"
            npm ci --no-audit --no-fund
          else
            echo "No package-lock.json => npm install"
            npm install --no-audit --no-fund
          fi

      - name: Ensure web deps (Expo Web + Router)
        env:
          CI: "true"
        run: npx expo install react-dom react-native-web @expo/metro-runtime expo-router

      - name: Verify pdf-lib is installed
        run: node -e "console.log('pdf-lib ->', require.resolve('pdf-lib'))"

      - name: Export static web build
        env:
          EXPO_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          EXPO_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          EXPO_PUBLIC_DEV_BYPASS_LOGIN: "false"
        run: npx expo export --platform web --output-dir dist

      - name: Patch index.html for GitHub Pages
        working-directory: apps/mobile/dist
        run: |
          node -e "const fs=require('fs');let s=fs.readFileSync('index.html','utf8');s=s.replace(/(src|href)=\"\/_expo/g,'$1=\"./_expo');fs.writeFileSync('index.html',s)"
          cp index.html 404.html
          touch .nojekyll

      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: apps/mobile/dist

  deploy-edge:
    runs-on: ubuntu-latest
    env:
      # REQUIRED
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      # Function runtime secret (server-side only)
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      # OPTIONAL redirect used by the function
      INVITE_REDIRECT_TO: ${{ secrets.INVITE_REDIRECT_TO }}
      # OPTIONAL test token for smoke test
      SUPABASE_TEST_BEARER: ${{ secrets.SUPABASE_TEST_BEARER }}
    steps:
      - uses: actions/checkout@v4

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      # NEW: copy your file into the layout the CLI expects
      - name: Prepare function tree
        run: |
          set -e
          if [ -f "supabase/invite-user/functions/index.ts" ]; then
            mkdir -p supabase/functions/invite-user
            cp -f supabase/invite-user/functions/index.ts supabase/functions/invite-user/index.ts
          fi
          ls -R supabase/functions || true

      - name: Sanity check inputs
        run: |
          set -e
          test -n "$SUPABASE_ACCESS_TOKEN" || (echo "❌ SUPABASE_ACCESS_TOKEN is empty"; exit 1)
          test -f "supabase/functions/invite-user/index.ts" || (echo "❌ Missing supabase/functions/invite-user/index.ts"; exit 1)
          echo "✅ Using project ref: prhhlvdoplavakbgcbes"

      - name: Set Supabase function secrets
        run: |
          set -e
          supabase secrets set \
            SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
            --project-ref "prhhlvdoplavakbgcbes"
          if [ -n "$INVITE_REDIRECT_TO" ]; then
            supabase secrets set \
              INVITE_REDIRECT_TO="$INVITE_REDIRECT_TO" \
              --project-ref "prhhlvdoplavakbgcbes"
          fi

      - name: Deploy invite-user function
        run: |
          set -e
          supabase functions deploy invite-user \
            --project-ref "prhhlvdoplavakbgcbes" \
            --no-verify-jwt

      - name: Smoke test preflight (OPTIONS)
        continue-on-error: true
        run: |
          curl -i -X OPTIONS \
            "https://prhhlvdoplavakbgcbes.supabase.co/functions/v1/invite-user" \
            -H "Origin: https://albertoroca96.github.io" \
            -H "Access-Control-Request-Method: POST" \
            -H "Access-Control-Request-Headers: authorization,content-type" || true

      - name: Smoke test POST (requires SUPABASE_TEST_BEARER)
        if: ${{ env.SUPABASE_TEST_BEARER != '' }}
        continue-on-error: true
        run: |
          curl -i -X POST \
            "https://prhhlvdoplavakbgcbes.supabase.co/functions/v1/invite-user" \
            -H "Authorization: Bearer ${SUPABASE_TEST_BEARER}" \
            -H "Content-Type: application/json" \
            --data '{"email":"test+invite@example.com"}' || true

  deploy:
    needs: [build, deploy-edge]
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
