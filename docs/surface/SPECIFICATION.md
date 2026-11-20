# RFC-0001 — Elnor Surface v0.3

**Status:** historical design draft dated 2026-11-04. See the
[implemented subset](MVP-SUBSET.md) and [operational contracts](MVP-CONTRACTS.md)
for current behavior.

Surface is declarative UI notation. Its priorities are readable composition,
diagnostics, and editing. Declaring syntax supported requires evidence from
parsing, type checking, runtime, formatting, and diagnostics.

## Reading the language

Components own mutable state. Calculations are synchronous and pure. Actions
write state or perform effects. Watches observe explicit dependencies.
Lowercase names represent HTML elements or semantic primitives. PascalCase
names represent components. Properties use name=expression. Parentheses
delimit complex expressions. Interpolation uses TypeScript template literals.

The arrow introduces the primary event. Other events use an explicit handler.
Bindings require compatible controls and mutable targets. Dynamic lists
require stable keys. Newlines separate declarations. Executable blocks use
TypeScript statement grammar. Use typed style properties or CSS custom
properties for dynamic values.

Queries and commands define server contracts. Enforce access on the server.
The renderer manages CSP and nonces. Keep infrastructure side effects out of
component imports so Studio can mount components with typed fixtures.

## Parsing and diagnostics

Reuse TypeScript identifiers, expressions, types, and modules. Preserve source
paths and offsets. Define mutation tracking for plain objects, arrays, class
instances, maps, and other host values before declaring support. Reassignment
is the proposed fallback. SafeHtml requires a trusted sanitizer.

## Twenty authoring scenarios

### 01 — State and derivation

```eln
component Counter {
  state count = 0
  calc doubled = count * 2
  ui {
    h2 `Doble: ${doubled}`
    button "+" => count++
    button "−" => count--
  }
}
```

State belongs to each instance. Calculations are pure and read-only.

### 02 — Props and defaults

```eln
component StatusBadge(text: string, tone: "success" | "warning" = "success") {
  ui {
    span text class="badge" data-tone=tone
  }
}
```

Props are typed and read-only. Evaluate defaults at instance creation.

### 03 — Typed custom events

```eln
component ParticipantCard(participant: Participant) {
  event selected(participant: Participant)
  ui {
    article {
      strong participant.name
      button "Abrir" => emit.selected(participant)
    }
  }
}

// Uso dentro de ui de un padre
ParticipantCard participant=person on selected(value) => open(value)
```

The child declares the event contract. Its DOM remains private.

### 04 — Composition and named slots

```eln
component Panel(title: string) {
  ui {
    section .panel {
      header {
        h2 title
        slot actions
      }
      slot
    }
  }
}

// Uso dentro de ui
Panel title="Usuarios" {
  fill actions {
    button "Nuevo" => createUser()
  }
  p "Administra los accesos del equipo"
}
```

Use slot for default content and slot name with fill name for named content.

### 05 — Conditionals and identity

```eln
ui {
  if editing {
    UserEditor user=selected
  } else {
    UserDetails user=selected
  }
}
```

Branches start with new local state after a remount.

### 06 — Keyed lists and empty state

```eln
ui {
  ul {
    each user in users by user.id {
      li {
        UserRow user=user
      }
    } empty {
      li "No encontramos usuarios"
    }
  }
}
```

Stable keys preserve identity. Duplicate keys produce diagnostics.

### 07 — Schema-backed forms and binding

```eln
form profile {
  name: text.required().min(2) = ""
  email: email.required() = ""
}

ui {
  form model=profile {
    field "Name" <-> profile.name
    field "Email" <-> profile.email
    submit "Save" => save(profile.value)
  }
}
```

Validate before submission. Access to the form value returns valid data or raises a typed error.

### 08 — Async actions

```eln
action save(input: ProfileInput) async {
  await updateProfile(input);
}

ui {
  button "Save" disabled=save.pending => save(profile.value)
  if save.error {
    alert save.error.message
  }
}
```

Expose pending, error, and result. The proposed default drops overlapping calls within an instance.

### 09 — Remote resources and exhaustive status

```eln
fetch users = listUsers({ search })

ui {
  resolve users {
    pending { skeleton }
    ready(data) { UserList users=data }
    failed(error) { alert error.publicMessage }
  }
}
```

Invalidate stale results and abort where possible. Define cache and revalidation explicitly.

### 10 — Routing and explicit SSR

```eln
page Meeting at "/meetings/:id" {
  param id: UUID
  load meeting = getMeeting(id)
  ui {
    h1 meeting.title
    ParticipantList participants=meeting.participants
  }
}
```

Serialize authorized data. Sealed responses stay out of public HTML.

### 11 — Query authorization and projection

```eln
query getMeeting(id: UUID) -> MeetingView {
  access ctx => ctx.require("meeting:read", { meetingId: id })
  server(ctx) {
    const record = await ctx.services.meetings.get(id);
    return expose({
      id: record.id,
      title: record.title,
      participants: record.participants.map(p => ({ id: p.id, name: p.name }))
    });
  }
}
```

Run authorization on the server and restrict the serializable shape.

### 12 — Commands and typed invalidation

```eln
command closeMeeting(id: UUID) -> void {
  access ctx => ctx.require("meeting:close", { meetingId: id })
  server(ctx) {
    await ctx.services.meetings.close(id);
  }
  invalidate getMeeting(id)
}
```

Invalidate a typed query symbol. The external API still enforces authorization.

### 13 — Opt-in sealed transport

```eln
query accountBalance(id: UUID) -> BalanceView {
  transport sealed
  access ctx => ctx.require("account:read", { accountId: id })
  server(ctx) {
    const balance = await ctx.services.accounts.balance(id);
    return expose({ amount: balance.amount, currency: balance.currency });
  }
}
```

Fetch sealed responses in the browser. A separate RFC defines the protocol.

### 14 — Explicit effects and cleanup

```eln
watch (selectedMeetingId) {
  const stop = realtime.subscribe(selectedMeetingId, event => {
    updatePresence(event);
  });
  cleanup(stop);
}
```

Run after mount. Clean up before reinstalling and during unmount.

### 15 — Scoped shared state

```eln
// cart.context.ts: contrato y factoría TypeScript normales
// En el layout raíz de una sesión
use cart = CartContext
ui {
  CartSummary cart=cart
}
```

Create a context per tree or request to isolate SSR users.

### 16 — Classes, CSS, and themes

```eln
state compact = false
ui {
  section .panel class:compact=compact {
    button "Cambiar densidad" => compact = !compact
  }
}
style {
  .panel { padding: 24px; }
  .panel.compact { padding: 8px; }
}
```

CSS is locally scoped by default. Conditions toggle classes.

### 17 — DOM refs and accessibility

```eln
ref searchField: HTMLInputElement
state search = ""
ui {
  input "Buscar" ref=searchField <-> search
  button "Enfocar búsqueda" => searchField?.focus()
  button label="Delete" => removeSelected() {
    icon "trash"
  }
}
```

Refs are nullable outside mount. Icon buttons need accessible names.

### 18 — Standalone components and Studio fixtures

```eln
preview ParticipantCard {
  case "online" {
    props {
      participant: { id: "p1", name: "Andrea", online: true, role: "moderator" }
    }
  }
  case "offline" {
    props {
      participant: { id: "p2", name: "Mario", online: false, role: "attendee" }
    }
  }
}
```

Preview components on their own. Fixtures stay in development.

### 19 — Exhaustive domain states

```eln
ui {
  match invoice.status {
    "paid" { badge "Pagada" tone="success" }
    "pending" { badge "Pendiente" tone="warning" }
    "failed" { badge "Fallida" tone="danger" }
  }
}
```

Check every case of a closed union. Open types require a fallback.

### 20 — Activation on demand

```eln
ui {
  h1 "Resumen de ventas"
  RevenueChart data=series activate="visible"
  ActivityFeed events=activity activate="interaction"
}
```

Treat activation as compiler metadata. Interaction activation requires accessible capture and replay.

## Open questions

Verify complex attribute parsing, cross-file diagnostics and rename,
reactive mutation, typed form values, concurrent actions, exhaustive
matching, cleanup, deferred activation, and TypeScript interoperability.

Use the same user-administration scenario and fixtures across variants.
Evaluate source mapping, editor behavior, preview, formatting, browser CSP,
and independent developer tasks. Keep platform security, infrastructure,
and database policy in their existing layers.

See the [initial composition experiment](../spikes/003/RESULTS.md).
