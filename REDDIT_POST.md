**Title:** I made a free fix for the new Songsterr desktop layout (browser extension + userscript)

Not a fan of the new Songsterr UI? I wasn't either, so I built a small add-on that rearranges it:

- one floating top pill for navigation
- a compact floating bottom dock for player controls (grouped, with dividers)
- mixer / transpose / settings / revisions in a clean right-hand column
- the "original audio" video panel stacks above them instead of covering stuff
- centered search / My tabs panels, consistent rounded corners

It only changes layout (CSS + a bit of JS). No tracking, no network requests, no permissions, no account access. MIT licensed, source on GitHub.

- Chrome / Edge / Brave: [download from Releases] 
- Firefox: [AMO link / temporary install instructions in README]
- Tampermonkey / Violentmonkey: [raw .user.js link]

Screenshots: [before] [after]

Heads up: Songsterr uses hashed class names, so a site update can occasionally break parts of it. If something looks off, open an issue on GitHub (or comment here) and I'll patch it.

Unofficial, not affiliated with Songsterr. Feedback and PRs welcome.
