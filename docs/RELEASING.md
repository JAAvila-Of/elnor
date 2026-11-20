# Versioning and releases

Elnor uses Semantic Versioning. During initial development, a feature or an
incompatible change increments the minor version. A fix or performance
improvement increments the patch version. Documentation, maintenance, and
test-only changes ship with the next release unless marked as breaking.

The CI workflow publishes releases from main after the operating-system
matrix and repository checks pass. It reads Conventional Commit messages
since the previous release, computes the version, and publishes a GitHub
release with notes, a versioned source archive, and a SHA-256 checksum.
The workflow can also be rerun from main after a transient failure.

Git tags and the versioned release archive are the source of truth for
published versions. The archive includes versioned root and editor manifests.
The package manifests in Git describe the development baseline. GitHub's
automatically generated source downloads reflect that baseline. Use the
attached archive to get the synchronized release version.

The release archive contains the public source, examples, and tests. To
build it, extract it and run the checks in [CONTRIBUTING.md](../CONTRIBUTING.md).
Releases currently use GitHub as the distribution channel.
