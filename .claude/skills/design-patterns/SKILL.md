---
name: design-patterns
description: Diagnose, select, compare, explain, implement, or review the 22 classic creational, structural, and behavioral design patterns. Use for architecture trade-offs, refactoring choices, pattern identification, pattern misuse, code-review evidence, or learning requests involving Factory Method, Abstract Factory, Builder, Prototype, Singleton, Adapter, Bridge, Composite, Decorator, Facade, Flyweight, Proxy, Chain of Responsibility, Command, Iterator, Mediator, Memento, Observer, State, Strategy, Template Method, or Visitor.
---

# Design pattern diagnosis

Treat a pattern as a response to a demonstrated design pressure, never as the starting requirement.

## Workflow

1. Inspect the current code, constraints, tests, and expected axis of change.
2. Describe the problem without pattern vocabulary.
3. Read `references/selection-guide.md`, then inspect the matching entry in
   `references/catalog.json`.
4. Load the relevant family skill:
   - object creation and lifetime: `$creational-design-patterns`;
   - object composition and boundaries: `$structural-design-patterns`;
   - algorithms, collaboration, events, or lifecycle: `$behavioral-design-patterns`.
5. Compare the leading candidate with at least one plausible alternative and the no-pattern option.
6. Map canonical roles to actual modules, types, functions, or services. Adapt the mechanics to the
   language instead of manufacturing inheritance.
7. Define the smallest behavioral test that proves the intended decoupling or variability.
8. When implementing, preserve behavior first, make one structural move at a time, and run the
   repository's normal checks.
9. Report evidence using `references/decision-record.md`.

## Truth rules

- Distinguish GoF family classification from architecture patterns, idioms, and principles.
- Do not call every factory function Factory Method.
- Do not call dependency injection Strategy without interchangeable algorithms.
- Do not call every wrapper Decorator; establish whether it translates, simplifies, controls, or
  stacks behavior.
- Do not call event delivery Observer until subscription lifecycle and delivery semantics exist.
- Reject Singleton when the real request is dependency access or shared mutable state.
- Say when the simplest correct answer is no pattern.

## Verification

For changes to this skill set, run:

```bash
bun run verify
```

When network access is allowed, also run:

```bash
bun run verify:all
```
