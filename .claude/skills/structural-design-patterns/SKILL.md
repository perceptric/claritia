---
name: structural-design-patterns
description: "Select, implement, compare, teach, or review the seven classic structural design patterns: Adapter, Bridge, Composite, Decorator, Facade, Flyweight, and Proxy. Use when incompatible interfaces, independent dimensions, trees, stackable behavior, subsystem boundaries, shared memory, or controlled access is the central design pressure."
---

# Structural design patterns

Read `references/patterns.md` before making a recommendation or reviewing an implementation.

## Workflow

1. Draw the current dependency boundary and state what must remain transparent to the client.
2. Classify the pressure: translate, split dimensions, form a tree, stack behavior, simplify,
   share state, or control access.
3. Compare wrapper patterns explicitly; Adapter changes interface, Decorator adds stackable
   behavior, Facade simplifies a subsystem, and Proxy controls access behind the same interface.
4. Make ownership, identity, latency, mutability, and failure semantics visible.
5. Add contract tests at the boundary plus focused tests for ordering, recursion, caching, or
   access policy as relevant.
6. Reject the pattern if indirection costs more than the demonstrated change pressure.
