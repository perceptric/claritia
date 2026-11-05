---
name: behavioral-design-patterns
description: "Select, implement, compare, teach, or review the ten classic behavioral design patterns: Chain of Responsibility, Command, Iterator, Mediator, Memento, Observer, State, Strategy, Template Method, and Visitor. Use when request routing, request objects, traversal, peer collaboration, snapshots, events, lifecycle behavior, algorithms, workflow skeletons, or operations over stable object types is the central design pressure."
---

# Behavioral design patterns

Read `references/patterns.md` before making a recommendation or reviewing an implementation.

## Workflow

1. Describe who owns the behavior, who initiates it, and which dimension is expected to vary.
2. Classify the pressure: route, reify, traverse, coordinate, restore, notify, transition, select an
   algorithm, fix a skeleton, or add operations over stable types.
3. Specify ordering, failure, cancellation, concurrency, reentrancy, and lifecycle semantics where
   the chosen pattern can hide them.
4. Compare close alternatives explicitly, especially State versus Strategy, Observer versus
   Mediator, Strategy versus Template Method, and Command versus Chain of Responsibility.
5. Test the collaboration rather than canonical class names.
6. Keep orchestration separate from intrinsic component behavior and reject the pattern when a
   direct call or built-in language protocol is clearer.
