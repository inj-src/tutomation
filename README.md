# Tutomation

## Save a logged-in Playwright session

```bash
npm install
npx playwright install chromium
npm run login
```

The browser opens at the teacher website. Log in manually, return to the terminal,
and press Enter. Playwright saves cookies and local storage to `.auth/state.json`.

To use a different login URL:

```bash
LOGIN_URL="https://teacher.udvash-unmesh.com/Teacher/Login" npm run login
```

The `.auth` directory is ignored by Git because it contains your authenticated
session.

Run the TypeScript check with:

```bash
npm run typecheck
```
