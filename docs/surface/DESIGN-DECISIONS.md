# Surface v0.3 design decisions

See the [design draft](SPECIFICATION.md) for the proposed language.

Provisionally, Surface uses braces, TypeScript expressions and types,
template literals, component-local state, pure calculations, and explicit
actions and watched effects. Semantic elements use lowercase names. Component
names use PascalCase. Binding targets are mutable. The arrow shorthand
represents the primary event. Other handlers name the event explicitly.

Components need isolated previews with typed fixtures. The renderer manages
CSP and nonces. Deep mutation, parser conflicts, form-value typing, action
concurrency, context scopes, cleanup errors, deferred activation, and
browser security with third-party dependencies still need evidence.
