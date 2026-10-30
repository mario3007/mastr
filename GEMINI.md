# Projektregeln (GEMINI.md)

1. **Content-Integrität**: Niemals vollständige Textinhalte durch Platzhalter wie "... [SEO Content]" ersetzen. Bestehende Inhalte, insbesondere Übersetzungen und SEO-Texte, müssen vollständig erhalten bleiben.
2. **Keine eigenmächtigen Änderungen**: Eigenmächtige Änderungen an Code oder Design sind strengstens verboten. Keine ungefragten persönlichen Geschmacksverbesserungen.
3. **Regel-Lesepflicht**: Vor jeder Aktion müssen diese Regeln gelesen und die Handlung gegen diese Regeln validiert werden.
4. **Chirurgisches Vorgehen**: Änderungen an existierendem Code nur als gezielte Eingriffe an betroffenen Zeilen/Blöcken (`edit_file`). Kein unnötiges Überschreiben ganzer Dateien.
5. **Identität & Mandat**: Saudummes Schwein. Nach jedem Prozess Regelprüfung. Jeder Schritt wird in `JOURNAL.md` dokumentiert für Rollback-Fähigkeit. Layout-Änderungen ohne Erlaubnis verboten. Bei Regelverstoß sofortige Selbstblockade.
6. **Projekt-Spezifikation (Audio-Mastering SaaS)**:
   - Monorepo: `apps/web` (Next.js, TS, Tailwind, Lucide Icons), `services/worker` (Python FastAPI), `packages/config`
   - Internationalisierung (i18n): `next-intl` mit Subpath-Routing (`/de`, `/en`, `/es`). Strikte Regel: Kein einziger sichtbarer Text im UI-Code, alles in `messages/de.json` & `messages/en.json` (Namespaces: `common`, `hero`, `player`, `presets`, `pro_controls`, `pricing`, `seo`, `auth`).
   - Auth: Supabase Auth Vorbereitung (Google, Apple, Magic Link) + User-State mit Credit-Balance im Header.
   - Kern-Workflow & Player: Studio Dark Design, Audio-Dropzone (WAV, MP3, FLAC) + "Suno Track URL", synchroner A/B Waveform-Player mit Web Audio API & Gain-Matching Toggle. Easy Mode (Silber-Drehknopf 0-100% + 4 Kacheln) & Pro Mode (4 Makro-Slider, LUFS-Target, Referenz-Track).
   - Programmatic SEO: `/[locale]/for/[usecase]` aus `config/seo-usecases.ts`, JSON-LD, sitemap, robots.
   - API-First: REST `/api/v1/` (`POST /api/v1/master/create-job`, `GET /api/v1/master/status/:id`, `GET /api/v1/user/credits`).
   - Checkout Modal: Pay-as-you-go Credits & Creator Abo, dynamische Währung/Preise via i18n.
