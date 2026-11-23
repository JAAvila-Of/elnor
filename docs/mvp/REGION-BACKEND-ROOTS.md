# Region roots and semantic containers

The region backend used to accept only components whose `ui` was a single
container, and only `section`, `div`, `ul`, `li`, `form` and `fieldset` as
containers. Neither rule followed from region semantics. Both sent ordinary
components to the general renderer.

## Semantic containers

`main`, `article`, `header`, `footer` and `nav` are plain containers for the
parser and the general renderer. The region backend now accepts them too.
`tests/region-semantic-containers.test.mjs` renders and updates a component
that uses all five elements in both backends. The serialized DOM must match
after every step and after unmount.

## Component roots

A component `ui` may now start with any node the region backend accepts:

- a single element without children, such as `p`, `span`, `button`, `input`
  or `select`;
- several sibling nodes, such as a heading followed by a button;
- an `if`, an `each` or a child component, alone or next to other nodes;
- nothing at all.

The blueprint mode, used by components without props, inserted only the first
root node and removed only that node on unmount. It now inserts and removes all
of them. The sequential mode already handled several roots.

`tests/region-root-shapes.test.mjs` covers eleven root shapes, each mounted
directly and inlined in a parent inside an `if` branch that closes and
reopens. The serialized DOM must match the general renderer after every
update and after unmount. Other rules still apply inside these roots. For
example, a row of an `each` still needs a container as its root.

## Effect on real components

The region selection was measured on 188 unique components from the
repository examples and the private rehearsals, with child components
resolved from their directories as in a project build. The backend accepted 35
of them before these two changes, 44 after the semantic containers and 64
after the root change. An earlier count did not resolve child components,
rejected every parent with children for that reason, and reported 28, 36 and
51 instead.
