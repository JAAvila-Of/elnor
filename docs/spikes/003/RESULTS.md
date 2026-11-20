# Spike 003 results

The original 2026-11-04 experiment used Node.js 22.16.0 and TypeScript 5.8.3
on Linux. It checked and built the four-component UserEditor graph, built
ConfirmDialog independently, and passed 17 tests.

The suite exercised typed props, events, slots, invalid bindings, standalone
mount and cleanup, keyed list identity, asynchronous save, and composition.
The local HTTP response included a restrictive Content-Security-Policy and
external scripts. The browser navigation timed out, so enforcement remained
open in this spike.

Explicit boundary cleanup removed listeners from retained DOM nodes.
A regression test confirmed that a click on a retained node could no longer
emit an event. The shared runtime measured 5,104 unminified bytes.

The tooling probe verified navigation, rename, and completion in virtual
TypeScript. Mapping those operations back to Surface was the next step.
