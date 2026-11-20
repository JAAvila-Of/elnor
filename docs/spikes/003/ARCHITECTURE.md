# Spike 003 prototype architecture

The prototype resolves imports, projects the graph to TypeScript for
checking, and writes JavaScript modules and a shared DOM runtime. A preview
mounts the selected entry independently.

Component mounts receive a target, props, events, and slots. Child props
use live getters. Event contracts are typed. Slot content runs under the
child owner. Keyed lists preserve node identity. Mount disposers release
owned effects, listeners, and nodes.

The original parser uses bounded grammar and checks embedded expressions
with TypeScript. It writes temporary files to .elnor/check. This spike
uses shallow reactivity and one local preview origin. Incremental tooling,
general reactivity, production bundling, and server facilities are separate
experiments.
