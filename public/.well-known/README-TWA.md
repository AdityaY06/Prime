# TWA deployment — Digital Asset Links (`assetlinks.json`)

This is **deployment tooling**, not project documentation: it explains how the
`public/.well-known/assetlinks.json` template ships PRIME to the Google Play
Store as a Trusted Web Activity (TWA) and how to replace its placeholder
fingerprint at release time.

## What the file does

`assetlinks.json` is a Digital Asset Links statement that proves the website
and the Android package are the same entity. Chrome on Android fetches
`https://YOUR_DOMAIN/.well-known/assetlinks.json` when the TWA launches; if
the statement matches the APK's signing certificate, the URL bar stays hidden
and the app runs full-screen like a native app. Without a verified match the
TWA still works but shows the Chrome URL bar.

- **relation** — `delegate_permission/common.handle_all_urls` is the canonical
  verification statement Chrome and Play check (the standard Google template).
  If your build tooling ever emits additional relation entries, they can be
  added as extra objects in the top-level array — unrelated statements are
  simply ignored by the verifier.
- **package_name** — `com.prime.ascendant` (the TWA application id; keep it in
  sync with the bubblewrap config if you change it).
- **sha256_cert_fingerprints** — **PLACEHOLDER**. Replace with the real
  SHA-256 fingerprint of the certificate that signs the release APK before you
  publish or before you verify deep links. Serving the placeholder in
  production simply fails verification (URL bar shows) — it is never a crash.

## Building the TWA with bubblewrap

Prerequisites: Node 16+ and JDK 17 (`JAVA_HOME` set). Then, from a scratch
directory (NOT inside the Next.js repo — bubblewrap scaffolds its own project):

```bash
npm init @bubblewrap/cli@latest
# or with an existing bubblewrap install:
npx @bubblewrap/cli init --manifest https://YOUR_DOMAIN/manifest.webmanifest
```

Bubblewrap reads the live web manifest (name, icons, display, orientation,
theme/background colors, `?tab=` shortcuts surface as Android launcher
shortcuts automatically for Chrome ≥ 108). Answer the prompts:

- **Package ID:** `com.prime.ascendant` (must match assetlinks.json)
- **Signing key:** create a new keystore, keep it safe (lose it → you can
  never update the app under the same listing unless Play App Signing is on).
- **Host:** `https://YOUR_DOMAIN`

Then build + sign:

```bash
npx @bubblewrap/cli build
```

This produces `app-release-signed.apk` (and `.aab`). For the Play Store,
upload the **`.aab`** — Play App Signing then manages the final key.

## Getting the real SHA-256 fingerprint

**If you sign locally** (APK path):

```bash
keytool -exportcert -list -printcert -jarfile app-release-signed.apk | grep SHA-256
```

**If you use Play App Signing (recommended, and the default for `.aab`):**
Play Console → *Release → Setup → App signing* → copy the **SHA-256 certificate
fingerprint** of the *App signing key certificate* (NOT the upload key). Paste
it into `sha256_cert_fingerprints` (colon-separated uppercase form, exactly as
shown by keytool/Play).

Multiple fingerprints are allowed in the array (e.g. upload key + app signing
key during migration) — Chrome accepts a match against any listed cert.

## Deploying the statement

1. Replace `REPLACE_WITH_PLAY_APP_SIGNING_CERT_SHA256` in
   `public/.well-known/assetlinks.json` and deploy the site — the file must be
   reachable at exactly `https://YOUR_DOMAIN/.well-known/assetlinks.json`
   (HTTP 200, `application/json`, no auth, no redirects).
2. Verify from an Android device with the app installed: open
   `https://YOUR_DOMAIN/` — no URL bar = verified. For a hard check use the
   "Asset Links Tool" app (Google Play) → statement lister → enter the site
   and package name.
3. Next.js serves everything in `public/` verbatim, so no route changes are
   needed.

## Play Store listing checklist (PRIME-specific)

- Store listing screenshots: reuse the house QA screenshots (390×844 frame).
- Content rating questionnaire, privacy policy URL, and "Health & Fitness"
  category (matches manifest `categories: ["health","fitness","lifestyle"]`).
- The PWA itself must stay installable in-browser too: `/manifest.webmanifest`
  (id/scope/shortcuts) + the service worker (`/sw.js`) + the install banner
  are already wired — this file only closes the TWA gap.
