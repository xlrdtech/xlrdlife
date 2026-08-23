# Omni Inject — iOS Share-Sheet Shortcut

Share any text, URL, or selection from any app on iPhone/iPad and have it POST to the
omni inject webhook, fanning the content to all 3 trinity panes (genesis / exodus /
leviticus) in ~1 second.

Verified live 2026-06-12 against the public Cloudflare tunnel:
`POST https://api.xlrd.org/api/route` returned `{"ok":true,"hits":3,"expected":3}`
with all three panes `true`. Missing-token POST correctly returns HTTP 401.

---

## The one value you must paste

`XEN_API_TOKEN` — found on the Mac at `~/.xen/secrets.env` (line `XEN_API_TOKEN=...`).
Copy the value after the `=`. Paste it into the Shortcut's `X-Xen-Token` header where it
says `PASTE_XEN_API_TOKEN_HERE`. Nothing else needs editing. The token is NOT stored in
this file or any repo.

---

## Endpoint contract (verified, not fabricated)

PRIMARY (fans to ALL 3 panes — use this one):

```
POST https://api.xlrd.org/api/route
Headers:
  Content-Type: application/json
  X-Xen-Token: <XEN_API_TOKEN>
Body (JSON):
  { "text": "<the shared text/url>" }
Behavior: role omitted => fans to genesis(%2), exodus(%3), leviticus(%4).
Success: { "ok": true, "fanout": {"genesis":true,"exodus":true,"leviticus":true}, "hits": 3, "expected": 3 }
```

FALLBACK (single pane only — NOT a 3-way fan; documented for completeness):

```
POST https://api.xlrd.org/api/inject
Body: { "role": "user", "text": "<the shared text/url>" }
Behavior: injects ONLY into the main [VOICE] pane. Use /api/route for the 3-of-3 fan.
```

Notes on the original spec wording:
- There is NO `/api/omni/inject` route on the spine. The real inject route is
  `/api/inject`, and the real fan-to-all-3 route is `/api/route`. Use `/api/route`.
- Both routes read the JSON field `text` and are gated by the `X-Xen-Token` header
  (compared to `XEN_API_TOKEN` from `~/.xen/secrets.env`). Write methods without the
  header return 401.

---

## Build it in ~60 seconds (step-by-step recipe)

1. Open the **Shortcuts** app -> tap **+** (new shortcut) -> name it **Omni Inject**.

2. Tap the shortcut's **(i)** info button (or "Details") and turn ON
   **Show in Share Sheet**. Under **Share Sheet Types**, leave the defaults on (Text,
   URLs, Articles, Safari web pages) or set to "Text" + "URLs" + "Safari web pages".
   This is what makes it appear in every app's Share button.

3. Add action **Receive** (search "Receive"). Set it to:
   "Receive **Text and URLs** input from **Share Sheet**".
   If nothing is passed, set "If there's no input" -> **Ask For Text** (so you can also
   run it standalone and type something).
   This produces the variable **Shortcut Input**.

4. (Recommended) Add action **Text**. In the text body, insert the **Shortcut Input**
   variable. This guarantees the input is coerced to a clean string before JSON encoding.
   Call this step's output **Text** (default).

5. Add action **Get Contents of URL**. Configure:
   - URL: `https://api.xlrd.org/api/route`
   - Tap **Show More**.
   - Method: **POST**
   - Headers -> Add header:
       Key: `X-Xen-Token`   Value: `PASTE_XEN_API_TOKEN_HERE`
     (Add a second header is optional; Shortcuts sets Content-Type automatically when
      Request Body = JSON. If you want it explicit: Key `Content-Type`,
      Value `application/json`.)
   - Request Body: **JSON**
       Add field -> Type **Text**, Key: `text`,
       Value: the **Text** variable from step 4 (or **Shortcut Input** directly).

6. (Optional but nice) Add action **Get Dictionary Value** -> get value for key
   `hits` from the **Contents of URL** output. Then add **Show Notification** with body
   like: "Injected to `hits`/3 panes". This gives instant confirmation that the fan hit
   3-of-3. Alternatively just add **Show Result** with the **Contents of URL** output to
   see the raw JSON.

7. Done. To use: in ANY app, select text or tap **Share** -> scroll to **Omni Inject**.
   The shared content POSTs and fans to all 3 panes. You should see `hits 3/3`.

---

## Self-test (no share needed)

Run the shortcut directly from the Shortcuts app. With "Ask For Text" set as the
no-input fallback (step 3), type a test string like `hello from iphone`. A success
shows the JSON `{"ok":true, ... "hits":3,"expected":3}` (or the notification
"Injected to 3/3 panes").

---

## Why an importable .shortcut file is not shipped here

An iCloud shortcut share link (`https://www.icloud.com/shortcuts/...`) can only be
minted by signing the shortcut on a logged-in Apple device — it cannot be generated
headlessly from this environment. The signed `.shortcut` plist also embeds an Apple
signing blob that this environment cannot produce. The 7-step recipe above builds the
identical shortcut by hand in under a minute, with zero dependency on Apple signing.
If you later want the iCloud link: build it once with these steps, then on the device
tap the shortcut's share button -> Copy iCloud Link.
