# Preview build-status notice

The authoring exercise now explains the saved-source/build boundary in the page
itself. On each navigation or reload, its server compares saved Surface/CSS
inputs with the last successful build record and renders a plain HTML notice.

- Matching inputs: the notice identifies the last successful build as matching
  those saved files.
- Changed or missing inputs: the notice says those changes are not in the
  preview, lists relative filenames and directs the author to run
  `npm run authoring -- build` from `elnor`, then reload. Source errors must be
  repaired before rebuilding successfully.
- Missing, malformed or incompatible build record: freshness is unverified;
  the page does not claim to match saved sources or expose internal errors.

The server does not rebuild, overwrite source or update generated files when
serving the notice. A failed checked build retains the previous preview, whose
next reload visibly reports the outstanding saved changes. Rebuilding and
reloading clears the stale notice when recorded inputs match.

The existing CSP is unchanged, including `connect-src 'none'`. No browser
polling, extra fetch, inline script, watcher or HMR was introduced. Recorded
filenames are HTML-escaped. The shared static server supports an optional index
renderer; ordinary previews without it retain their static behavior.

The notice reads saved files on page load. It cannot inspect unsaved editor
buffers, establish freshness for all transitive TS dependencies or update an
already loaded page automatically. An existing server process must be restarted
to use the updated helper. No manually launched server was restarted by the
runner, and the edited `Counter.eln` was not changed.

Five new real HTTP regressions in
[the authoring corpus](../../tests/authoring-session.test.mjs) cover stale/rebuilt
pages, failed build preservation, missing/malformed records, changed/missing CSS,
filename escaping and retained CSP/cache policy. The original missing-notice
regression failed before implementation. The authoring corpus passes sixteen
cases and the complete Node suite passes 376. The existing four-component check
also passes. These are HTTP/fake-DOM observations, not a new browser-rendering
test or independent human DX evaluation. Historical native editor results are
unchanged by this server/helper increment.
