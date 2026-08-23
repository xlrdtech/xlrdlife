# Wire the opt-in → Google Sheet (2-minute setup)

Luckie 2026-08-01: leads route to a **Google Sheet for now** → later GHL CRM sub-account
"Loan Hero" + Asana lead-intake automation. The page already POSTs each lead; you just
stand up the Sheet endpoint and paste one URL. (This step needs a Google login, which the
assistant is barred from doing — so it's turnkey for East.)

## Steps
1. **New Google Sheet.** Row 1 headers: `at | name | email | source`.
2. **Extensions → Apps Script**, paste this, Save:

```javascript
function doPost(e) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const p = e.parameter || {};
  sh.appendRow([p.at || new Date().toISOString(), p.name || '', p.email || '', p.source || '']);
  return ContentService.createTextOutput('ok');
}
```

3. **Deploy → New deployment → Web app.** Execute as *Me*; Who has access *Anyone*.
   Copy the `…/exec` URL.
4. In `index.html`, set `var SHEET_ENDPOINT = "…/exec";` (currently empty). Done — every
   opt-in appends a row.

## Notes
- Until `SHEET_ENDPOINT` is set, leads are still saved to the browser's localStorage
  (`l7s_leads`) as a backup, so nothing is lost during setup.
- `mode:'no-cors'` is used so the browser doesn't do a CORS preflight; Apps Script accepts
  the form-encoded POST and appends the row. You won't see a JSON response back (that's
  expected with no-cors) — verify by watching rows land in the Sheet.
- **Next hops (when ready):** point the same endpoint (or a Zapier/Make/n8n step reading
  the Sheet) into GHL "Loan Hero" and into Asana — new row → new lead → new project under
  the L7S portfolio, per Luckie's automation plan.
