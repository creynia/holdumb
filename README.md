# holdumb

A phone-first web app that teaches **Ultimate Texas Hold'em** from zero to perfect strategy, with an interactive table simulator that shows the EV of every decision before you confirm it.

## Use it

- **Open it:** <https://creynia.github.io/holdumb/>
- **Add to Home screen (Android/Chrome):** open the link, tap the Chrome menu (three dots), then **Add to Home screen** (or **Install app**). It launches full screen and works offline after the first load.
- **Download one offline file:** go to this repo's **Releases**, open **Latest build** and download `holdumb.html` (also linked from the site's Home screen). Open it from Chrome's Downloads list and choose **Chrome**, not "HTML Viewer". It makes no external requests. Progress in this copy is separate from the website copy, so use Settings, then Export/Import to move it.
- **Reload past the cache:** the installed app updates itself and shows "Update available, Reload". If it doesn't, open **Settings, Check for updates**. Tap **Reload** on the toast; if none shows, close the app completely (swipe it away from Recents) and open it again. To wipe the site's data in Chrome on Android: **⋮, Settings, Site settings, All sites, creynia.github.io, Delete & reset**.

### One-time setup (maintainer, from a phone)

The repo must be public (**Settings, General, Danger Zone, Change visibility**). In Chrome on github.com (menu, then **Desktop site** if a tab is hidden):

1. **Settings, Pages, Build and deployment, Source: GitHub Actions.**
2. Run **Deploy to GitHub Pages** from the **Actions** tab (**Run workflow**), or merge to `main`.

If a deploy fails with "deployment in progress", re-run the failed job.

## Is this gambling advice?

No. holdumb is for education. In Ultimate Texas Hold'em the house always has an edge, and no betting system changes that; the lessons show you how big the edge is and which plays cost the least, not how to win. Play money only here. If gambling is causing you or someone you know harm, call **1-800-GAMBLER** (US) or find local resources at your national problem-gambling helpline.

## Development

Requires Node >= 22.12.

```sh
npm ci
npm run dev        # local dev server
npm run check      # lint, typecheck, format check, unit tests
npm run build:all  # dist/ (PWA) and dist-single/holdumb.html
npm run test:e2e   # Playwright (needs a browser, see CONTRIBUTING.md)
```

Design documents are in [`docs/design/`](docs/design/). Planned future work is listed in [`docs/chips.md`](docs/chips.md). See [CONTRIBUTING.md](CONTRIBUTING.md) to get involved.

## License

MIT, see [LICENSE](LICENSE).
