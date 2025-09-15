Puppy UI 🐶

A tiny local web UI to chat with your code puppy and crank output tokens to the moon (within provider caps).

Quick start
1) Copy .env.example to .env and fill your API key(s)
   - OPENAI_API_KEY=sk-...
   - ANTHROPIC_API_KEY=...
   - GOOGLE_API_KEY=...
   Optional defaults:
   - PROVIDER=openai | anthropic | gemini
   - MODEL=gpt-4o-mini (or claude-3.5-sonnet, gemini-1.5-pro, etc.)
   - PORT=5173
   - MAX_OUTPUT_TOKENS=max (or a number)

2) Install deps
   npm install

3) Run
   npm run dev

4) Open the UI
   http://localhost:5173

Notes on max tokens
- You can type "max" in the UI to push near a safe cap (currently 8k). You can also enter a number.
- Providers have hard caps that vary by model. If you exceed, the API will error. Adjust down if that happens.
- Bigger outputs cost more and take longer. Start small, then ratchet up as needed. YAGNI.

Security
- API keys live only in your .env and are used server-side. The browser never sees them.

Why no streaming?
- Keeping it simple for v1. Add SSE later if you like.

License
- MIT. Have fun.
