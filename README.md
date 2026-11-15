# unfiltered-site

The static site at https://unfilteredinvestmentsllc.com: privacy and support pages for Nicholas Suckow's apps. Plain HTML with inline styles. No scripts, analytics, cookies, trackers or web fonts.

Roll Call's final URLs (the app links to these, so changing one means a new app build):

- Privacy policy: https://unfilteredinvestmentsllc.com/roll-call/privacy/
- Support: https://unfilteredinvestmentsllc.com/roll-call/support/
- Accessibility: https://unfilteredinvestmentsllc.com/roll-call/support/#accessibility

The apex domain is canonical; `www` redirects to it.

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

## Publishing

1. Commit on a branch.
2. `npm test`, with 0 failures.
3. `git switch main && git merge --ff-only <branch> && git push`
4. `npm run check:live`. Pages does not wait for CI, so this is the real check.

## Hosting

- GitHub Pages, deployed from branch `main`, folder `/docs`, custom domain `unfilteredinvestmentsllc.com`, Enforce HTTPS on. Nick does the account steps (repo, Pages, domain verification, DNS).
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

Create `docs/cookie-tin/privacy/index.html` and `docs/cookie-tin/support/index.html` from the Roll Call pages' shell, link them from the home page, and add a facts test like the Roll Call ones.

## Before each app release

- Re-read both Roll Call pages against the build: the final words from Plan 6, including button names and match reasons.
- Re-run the storage-key check (the keys the app writes to AsyncStorage must match what the privacy page says is stored):
  `git -C <path-to-roll-call-repo> grep -nE "'app/[a-z-]+/v[0-9]+'" main -- src`
  (`<path-to-roll-call-repo>` is your local checkout of the Roll Call app repo.)
- Run `npm test` and `npm run check:live`.
- Check that `src/lib/links.ts` in the app matches the live URLs.
