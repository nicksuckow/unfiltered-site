# unfiltered-site

The static site at https://unfilteredinvestmentsllc.com: privacy and support pages for Nicholas Suckow's apps. Plain HTML with one `<style>` block, the same on every page (no `style` attributes). No scripts, analytics, cookies, trackers or web fonts.

Roll Call's final URLs (the app links to these, so changing one means a new app build):

- Privacy policy: https://unfilteredinvestmentsllc.com/roll-call/privacy/
- Support: https://unfilteredinvestmentsllc.com/roll-call/support/
- Accessibility: https://unfilteredinvestmentsllc.com/roll-call/support/#accessibility

The apex domain is canonical; `www` redirects to it.

## Setup

Node 22.22.0 or later (`.nvmrc` says 22; html-validate 11.17.0 needs 22.22.0), then `npm ci`.

## Commands

- `npm test` runs the unit tests and the site checks (`checkSite('docs')`). Offline.
- `npm run check` runs only the site checks on `docs/`. Offline.
- `npm run check:live` fetches the real URLs and checks status, redirects, page text and that no cookie is set. It is the only command that uses the network.

Only `docs/` is published. It holds `.html` files, `CNAME` and `.nojekyll`, nothing else.

## Preview

```
python3 -m http.server --directory docs 8000
```

Then open http://localhost:8000/. Don't open the files directly: the links are root-relative and break.

The 404 page is at http://localhost:8000/404.html. This server doesn't use it for missing paths; GitHub Pages does.

To look on an iPhone on the same Wi-Fi, open `http://<your Mac's local IP>:8000/` there; the server listens on every interface. Judge text size and dark mode on the iPhone, with Larger Text at its largest and Dark Mode on: a Mac browser shows neither the way the phone does.

## Publishing

1. Commit on a branch.
2. `npm test`, with 0 failures.
3. `git switch main && git merge --ff-only <branch> && git push`
4. Wait for the Pages deploy to finish (the "pages build and deployment" run in the repo's Actions tab), then run `npm run check:live`. Pages does not wait for CI, and until the deploy finishes the live check reads the old pages, so this is the real check.

## Hosting

- GitHub Pages, deployed from branch `main`, folder `/docs`, custom domain `unfilteredinvestmentsllc.com`, Enforce HTTPS on. Nicholas Suckow does the account steps (repo, Pages, domain verification, DNS).
- DNS at the domain's host:

| Type | Host | Value |
|---|---|---|
| A | `@` | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (four records) |
| AAAA | `@` | `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` (four records) |
| CNAME | `www` | `nicksuckow.github.io` |

- No wildcard (`*`) record: it is a takeover risk.
- Never delete the `_github-pages-challenge-nicksuckow` TXT record (it stops other accounts publishing Pages on the domain), or any MX or TXT record (mail for support@unfilteredinvestmentsllc.com depends on them).
- If the domain has a CAA record, it must allow `letsencrypt.org`, or no certificate can be issued.

## Adding Cookie Tin

Create `docs/cookie-tin/privacy/index.html` and `docs/cookie-tin/support/index.html` from the Roll Call pages' shell, link them from the home page, add a facts test like the Roll Call ones, and add rows for their URLs to `LIVE_CHECKS` in `scripts/live-checks.mjs`, so `npm run check:live` covers them.

## Before each app release

- Re-read both Roll Call pages against the build: the app's final copy, including button names, match reasons and Review's lines.
- Re-run the storage-key check (the keys the app writes to AsyncStorage must match what the privacy page says is stored):
  `git -C <path-to-roll-call-repo> grep -nE "'app/[a-z-]+/v[0-9]+'" main -- src`
  (`<path-to-roll-call-repo>` is your local checkout of the Roll Call app repo.)
  Expected: only `app/settings/v1`, `app/session/v1` and `app/history-token/v1`. Any other key needs a line in the privacy page's "What Roll Call stores on your iPhone" section, and a key that would hold names, phone numbers or email addresses breaks the policy.
- Check that the screen Roll Call shows when it has no access to contacts still opens Recently removed, with export and Delete these copies now: the privacy policy's "Turning off access and deleting your data" section says it does.
- Run `npm test` and `npm run check:live`.
- Check that `src/lib/links.ts` in the app matches the live URLs.
