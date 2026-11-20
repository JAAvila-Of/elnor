# Contributing

Use the issue forms for bugs, proposals, performance regressions, documentation
problems, and questions. See [SECURITY.md](SECURITY.md) to disclose a
vulnerability privately. For a significant language, runtime, or tooling change,
open a proposal before implementing it.

## Local checks

Use Node.js 24 and run these commands from the repository root:

    npm ci
    npm run check
    npm test

For Surface changes, include a small readable reproduction and exercise the
normal authoring path. See the [Surface examples](docs/surface/EXAMPLES.md)
and [verification guide](docs/mvp/VERIFICATION.md) for focused checks and
the optional native editor suite.

## Pull requests and commits

Create a topic branch and open a pull request against main. Use English for
the title, commit messages, comments, and public documentation. Every commit
and the pull request title must follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

- feat(surface): add a form primitive
- fix(editor): retain the selected symbol after an edit
- docs: explain how to run a preview

Use an exclamation mark before the colon or a BREAKING CHANGE footer for
an incompatible change. Describe the migration in the pull request body.
Main uses squash merges. The pull request title becomes the commit subject.

Keep changes focused. Include the verification performed, limit evidence to
public or synthetic examples, and keep credentials, unpublished material,
personal data, and generated diagnostics out of the patch and commit history.
By submitting a contribution, you agree to license it under the project's
[MIT](LICENSE-MIT) or [Apache 2.0](LICENSE-APACHE) dual-license terms.
