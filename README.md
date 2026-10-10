# Philosophy research room frontend

Website: https://tiagovasc.github.io/philosophy-rag-site/.

This repository contains only the browser frontend. The backend, authentication, provider keys, corpus archives, vectors and saved inquiries are maintained privately in GitHub, Railway and Supabase. This frontend connects to https://philosophy-api-production.up.railway.app/; that public URL is not a credential.

Choose SEP or IEP for each inquiry. SEP searches 1,776 articles / 156,013 passages; IEP searches 895 main articles / 31,471 passages. Sources retain their encyclopedia tags, exact passage context and original entry links. This is an independent tool and a snapshot, not an official encyclopedia service.

Host GitHub Pages from main / (root). No API keys or authentication files belong here. Commits use a non-personal noreply address. The app uses a random identifier stored in each browser to scope its saved inquiry library.

Current account continuation (10 October 2026): optional Google sign-in uses Supabase OAuth with PKCE and the locally bundled @supabase/auth-js 2.117.3 client (MIT license included). Signed-in inquiries and daily allowances follow the verified account across devices. Guests can still explore. A checked sign-in option brings this browser's saved inquiries into the account while preserving spent usage. Shared-network/global controls and Codex SDK synthesis continue unchanged. Only a public publishable key is provided by the private backend at runtime; service-role, Google OAuth and model credentials never belong in these assets.
