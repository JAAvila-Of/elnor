# Spike 003 developer experience review

The composition fixture exercises a typed event, a named slot, and an
independent confirmation dialog.

```eln
component UserList(users: User[]) {
  event selected(user: User)

  ui {
    ul {
      each user in users by user.id {
        li {
          button user.name => emit.selected(user)
        }
      }
    }
  }
}
```

```eln
Panel title="Manage users" {
  fill actions {
    button "Clear search" => clearSearch()
  }

  UserList users=visible {
    on selected(value) => choose(value)
  }
}
```

```eln
if confirming {
  ConfirmDialog title="Delete user" message="This action is permanent" {
    on confirmed() => destroy()
    on cancelled() => cancelDelete()
  }
}
```

Events and slots expose their contracts in the markup. Reactive props flow
to children without manual setters. Children compile independently.

Evaluate event notation, named content, async keyword placement, custom
elements, long attributes, deep mutation, and accessible dialog behavior
with developers. The spike exercised semantics without measuring
learnability or editing speed. The next tooling experiment targets original
file diagnostics, completion, rename, navigation, and formatting.
