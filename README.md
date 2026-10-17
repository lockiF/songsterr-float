# Songsterr Float (unofficial)

Not happy with the new Songsterr desktop layout? This restores a cleaner, more compact one:

- one floating **top pill** with navigation (Search · My tabs · New tab · … · Inbox · Help · profile)
- floating **bottom dock** with player controls, grouped with dividers
- **tools pill** (play, original/synth, loop, speed…) in the left column
- mixer / transpose / settings / revisions windows in a tidy right column
- the "original audio" video panel stacks above those windows instead of covering them
- centered search / My tabs / New tab panels, consistent rounded corners, subtle fade-in animations

It only changes CSS layout. It does **not** collect data, make network requests, or touch your account.

> Unofficial. Not affiliated with or endorsed by Songsterr. All trademarks belong to their owners.

## Screenshots

<p align="center">
  <img src="https://github.com/user-attachments/assets/7eb30765-7bc1-4a35-bca5-fbdef1dc6d46" alt="Songsterr Float Overview" width="100%">
</p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/6bb21fcd-d60f-41a0-a6bd-85622c2127da" alt="Songsterr Float Player & Controls" width="48%">
  <img src="https://github.com/user-attachments/assets/f9a72a19-0787-492d-afc2-bd1c0a2f2796" alt="Songsterr Float Panels" width="48%">
</p>

## Install

### As a browser extension
- **Chrome / Edge / Brave:** download `songsterr-float-extension-vX.Y.Z.zip` from [Releases](https://github.com/lockiF/songsterr-float/releases), unzip, open `chrome://extensions`, enable *Developer mode* → *Load unpacked* → pick the folder.
- **Firefox:** (store link here once published). Until then: `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* → pick `manifest.json` (temporary, removed on restart).

### As a userscript
Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/), then open
[`songsterr-float.user.js`](https://github.com/lockiF/songsterr-float/raw/main/songsterr-float.user.js) and click *Install*.

Both builds are generated from the same `src/core.js`.

## Customize

Open `src/core.js` and edit the `G` object at the top (pill height, offsets, radius, widths…), then `node build.js`.
Or tweak the generated userscript directly in Tampermonkey.

## Known limitations

- Songsterr uses hashed CSS class names (e.g. `_0meAjW_bottomBarCenter`). When they redeploy, those hashes can change and parts of the layout may break until the `C` object in `src/core.js` is updated. If that happens, please [open an issue](https://github.com/lockiF/songsterr-float/issues) with the new class names or a screenshot.
- Desktop only; designed for wide windows (the video panel moves to the right column from 1811px).

## Build
