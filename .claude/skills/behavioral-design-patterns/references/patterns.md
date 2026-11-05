# Behavioral patterns

This reference is generated from the verified catalog. Use the intent and rejection criteria before
mapping participants to code. The verification bullets are the minimum evidence for claiming the
pattern is correctly implemented.

## Contents

- [Chain of Responsibility](#chain-of-responsibility)
- [Command](#command)
- [Iterator](#iterator)
- [Mediator](#mediator)
- [Memento](#memento)
- [Observer](#observer)
- [State](#state)
- [Strategy](#strategy)
- [Template Method](#template-method)
- [Visitor](#visitor)

## Chain of Responsibility {#chain-of-responsibility}

Source: [Refactoring.Guru](https://refactoring.guru/design-patterns/chain-of-responsibility)

**Intent.** Pass a request through an ordered sequence of handlers until one handles it or the chain ends.

**Use when**

- The handler is not known in advance.
- Multiple handlers may inspect or conditionally process a request.
- Handler order must be configurable.

**Avoid when**

- Exactly one stable receiver is known.
- Silent fall-through would make failures difficult to detect.

**Participants**

- Handler contract
- Base chaining behavior
- Concrete handlers
- Client assembling the chain

**Verification**

- Handling versus forwarding is explicit.
- Ordering and terminal unhandled behavior are tested.
- Handlers do not depend on concrete neighbors.

**Compare with.** `command`, `composite`, `decorator`.

## Command {#command}

Source: [Refactoring.Guru](https://refactoring.guru/design-patterns/command)

**Intent.** Represent a request as an object so invocation can be queued, logged, retried, composed, or undone independently of its receiver.

**Use when**

- Requests need scheduling, queuing, history, or retry.
- Invoker and receiver must be decoupled.
- Undo or transactional composition is required.

**Avoid when**

- A direct call is sufficient and requests have no lifecycle.
- Capturing receiver state would make commands stale or unsafe.

**Participants**

- Command contract
- Concrete commands
- Invoker
- Receiver
- Client

**Verification**

- The invoker depends on the command contract, not receivers.
- Command payload and execution semantics are explicit.
- Retry, idempotency, and undo behavior are tested when promised.

**Compare with.** `memento`, `chain-of-responsibility`, `strategy`.

## Iterator {#iterator}

Source: [Refactoring.Guru](https://refactoring.guru/design-patterns/iterator)

**Intent.** Traverse a collection through a stable cursor protocol without exposing its internal representation.

**Use when**

- Clients need uniform traversal across different collections.
- Traversal state should be independent from the collection.
- Multiple traversal strategies or concurrent cursors are needed.

**Avoid when**

- The language's built-in iteration protocol already solves the requirement.
- Mutation during traversal has no well-defined semantics.

**Participants**

- Iterator contract
- Concrete iterator
- Aggregate contract
- Concrete aggregate
- Client

**Verification**

- Traversal order and termination are defined.
- Collection internals remain hidden.
- Empty, exhausted, nested, and mutation cases are tested.

**Compare with.** `composite`, `visitor`, `memento`.

## Mediator {#mediator}

Source: [Refactoring.Guru](https://refactoring.guru/design-patterns/mediator)

**Intent.** Centralize a collaboration protocol so peer components communicate through a mediator instead of knowing one another.

**Use when**

- Many peers have tangled bidirectional dependencies.
- A collaboration changes independently of component internals.
- Components should be reusable outside the current orchestration.

**Avoid when**

- Only a few direct dependencies exist.
- Centralization would create a monolithic coordinator with unrelated rules.

**Participants**

- Mediator contract
- Concrete mediator
- Colleague components

**Verification**

- Colleagues do not reference concrete peers.
- The mediator owns interaction policy, not each colleague's intrinsic behavior.
- Collaboration scenarios are tested at mediator level.

**Compare with.** `observer`, `facade`, `command`.

## Memento {#memento}

Source: [Refactoring.Guru](https://refactoring.guru/design-patterns/memento)

**Intent.** Capture and later restore an object's internal state without exposing that state to the caretaker.

**Use when**

- Undo, snapshots, checkpoints, or rollback are required.
- Encapsulation forbids external reconstruction of internal state.
- A bounded state history is acceptable.

**Avoid when**

- Snapshots are too large or contain non-restorable external resources.
- Event replay or explicit state data is a better domain model.

**Participants**

- Originator
- Opaque memento
- Caretaker

**Verification**

- Only the originator interprets memento contents.
- Restore reproduces all relevant invariants.
- History size, sensitive data, versioning, and resource ownership are controlled.

**Compare with.** `command`, `prototype`, `iterator`.

## Observer {#observer}

Source: [Refactoring.Guru](https://refactoring.guru/design-patterns/observer)

**Intent.** Maintain a one-to-many subscription so dependents are notified when a subject emits a relevant change.

**Use when**

- The number or identity of dependents changes at runtime.
- A publisher must not depend on concrete subscribers.
- Several reactions follow the same event.

**Avoid when**

- A direct synchronous call is clearer and stable.
- Delivery order, failure, or consistency requirements cannot be left implicit.

**Participants**

- Subject or publisher
- Observer contract
- Concrete observers

**Verification**

- Subscribe and unsubscribe lifecycles cannot leak observers.
- Event payload, delivery order, reentrancy, and failure policy are defined.
- Publisher code has no concrete subscriber dependencies.

**Compare with.** `mediator`, `command`, `state`.

## State {#state}

Source: [Refactoring.Guru](https://refactoring.guru/design-patterns/state)

**Intent.** Move state-dependent behavior into state objects so an object changes behavior as its internal state transitions.

**Use when**

- Large conditionals dispatch behavior by lifecycle state.
- States have distinct allowed operations and transitions.
- New states are expected more often than new operations.

**Avoid when**

- There are only two simple stable states.
- Transitions must be globally visible and a formal state machine representation is more appropriate.

**Participants**

- Context
- State contract
- Concrete states

**Verification**

- State objects own state-specific behavior.
- Allowed transitions and invalid operations are tested.
- The context delegates instead of repeating state conditionals.

**Compare with.** `strategy`, `template-method`, `singleton`.

## Strategy {#strategy}

Source: [Refactoring.Guru](https://refactoring.guru/design-patterns/strategy)

**Intent.** Encapsulate interchangeable algorithms behind one contract and let a context select or receive one.

**Use when**

- Several algorithms solve the same task with different trade-offs.
- Branching selects behavior by policy, configuration, or runtime data.
- Algorithms should be tested independently.

**Avoid when**

- There is one small stable algorithm.
- Clients cannot make or delegate a meaningful strategy choice.

**Participants**

- Strategy contract
- Concrete strategies
- Context
- Composition root or client

**Verification**

- The context depends only on the strategy contract.
- Strategies honor equivalent input/output semantics.
- Selection policy is outside algorithm implementations.

**Compare with.** `state`, `template-method`, `bridge`, `command`.

## Template Method {#template-method}

Source: [Refactoring.Guru](https://refactoring.guru/design-patterns/template-method)

**Intent.** Define an algorithm skeleton in a base operation while allowing selected steps to vary through controlled overrides.

**Use when**

- Several workflows share a stable sequence but differ in a few steps.
- The framework must control ordering and extension points.
- Duplicate algorithms differ only in selected stages.

**Avoid when**

- Composition is preferable or inheritance is unavailable.
- Subclasses must replace most steps or violate the skeleton.

**Participants**

- Abstract base with template operation
- Required primitive operations
- Optional hooks
- Concrete subclasses

**Verification**

- The template operation fixes ordering and invariants.
- Extension points are narrow and documented.
- Subclasses do not duplicate or bypass the skeleton.

**Compare with.** `strategy`, `factory-method`.

## Visitor {#visitor}

Source: [Refactoring.Guru](https://refactoring.guru/design-patterns/visitor)

**Intent.** Add operations across a stable set of element types by dispatching each element to a visitor operation specialized for its concrete type.

**Use when**

- Many unrelated operations target a stable object structure.
- Operations need type-specific behavior across heterogeneous elements.
- Operation code should not pollute element classes.

**Avoid when**

- Element types change frequently.
- The language offers safer exhaustive pattern matching without intrusive double dispatch.

**Participants**

- Visitor contract
- Concrete visitors
- Element contract
- Concrete elements
- Object structure

**Verification**

- Every element type participates in dispatch.
- Adding an operation does not edit element classes.
- Adding an element forces all affected visitors to be updated or fail statically.

**Compare with.** `composite`, `iterator`, `command`.

