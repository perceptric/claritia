# Structural patterns

This reference is generated from the verified catalog. Use the intent and rejection criteria before
mapping participants to code. The verification bullets are the minimum evidence for claiming the
pattern is correctly implemented.

## Contents

- [Adapter](#adapter)
- [Bridge](#bridge)
- [Composite](#composite)
- [Decorator](#decorator)
- [Facade](#facade)
- [Flyweight](#flyweight)
- [Proxy](#proxy)

## Adapter {#adapter}

Source: [Refactoring.Guru](https://refactoring.guru/design-patterns/adapter)

**Intent.** Translate an existing interface into the interface a client expects without changing either side's core responsibility.

**Use when**

- A useful component has an incompatible interface or data shape.
- A legacy or third-party API must fit a local port.
- Translation should be isolated at a boundary.

**Avoid when**

- Both interfaces are under control and can be aligned directly.
- The wrapper primarily adds behavior rather than translates an interface.

**Participants**

- Target interface
- Client
- Adaptee
- Adapter

**Verification**

- The client depends only on the target interface.
- Translation is centralized in the adapter.
- Domain concepts do not leak from the adaptee across the boundary.

**Compare with.** `bridge`, `decorator`, `facade`, `proxy`.

## Bridge {#bridge}

Source: [Refactoring.Guru](https://refactoring.guru/design-patterns/bridge)

**Intent.** Split an abstraction from an independently varying implementation and connect them through composition.

**Use when**

- Two dimensions vary independently and inheritance creates a Cartesian product.
- Implementations must switch at runtime.
- Platform details should not infect the high-level abstraction.

**Avoid when**

- Only one stable dimension exists.
- The extra indirection would not prevent real subclass multiplication.

**Participants**

- Abstraction
- Refined abstractions
- Implementation interface
- Concrete implementations

**Verification**

- Each dimension can gain a variant without modifying the other.
- The abstraction delegates platform work through an implementation interface.
- No subclass exists solely for every pair of dimensions.

**Compare with.** `adapter`, `strategy`, `abstract-factory`.

## Composite {#composite}

Source: [Refactoring.Guru](https://refactoring.guru/design-patterns/composite)

**Intent.** Represent part-whole trees so clients can treat individual leaves and nested groups through the same component contract.

**Use when**

- The domain is naturally hierarchical.
- Operations should recurse uniformly over leaves and containers.
- Clients should not branch on scalar versus group.

**Avoid when**

- Leaf and container operations have little meaningful overlap.
- Uniformity would expose invalid operations on leaves.

**Participants**

- Component contract
- Leaves
- Composites
- Client

**Verification**

- Recursive operations terminate and preserve tree invariants.
- Clients use the component contract for both leaves and groups.
- Ownership, cycles, and child mutation rules are explicit.

**Compare with.** `decorator`, `iterator`, `visitor`, `chain-of-responsibility`.

## Decorator {#decorator}

Source: [Refactoring.Guru](https://refactoring.guru/design-patterns/decorator)

**Intent.** Add stackable behavior to an object by wrapping it behind the same interface.

**Use when**

- Responsibilities must be combined dynamically.
- Subclass combinations would explode.
- Added behavior should remain transparent to clients.

**Avoid when**

- Identity or exact concrete type is observable by clients.
- Order-dependent wrappers would make behavior too hard to reason about.

**Participants**

- Component contract
- Concrete component
- Base decorator
- Concrete decorators

**Verification**

- A decorator implements and delegates the component contract.
- Each wrapper adds one focused responsibility.
- Composition order is tested where it affects behavior.

**Compare with.** `adapter`, `composite`, `proxy`, `chain-of-responsibility`.

## Facade {#facade}

Source: [Refactoring.Guru](https://refactoring.guru/design-patterns/facade)

**Intent.** Expose a small task-oriented entry point over a complex subsystem without pretending the subsystem no longer exists.

**Use when**

- Most clients need a common simplified workflow.
- Layer boundaries need a stable entry point.
- Subsystem setup and ordering are repeated across callers.

**Avoid when**

- Clients need most subsystem capabilities directly.
- The facade would become an unrelated god object.

**Participants**

- Facade
- Subsystem components
- Client

**Verification**

- Common workflows cross the boundary through the facade.
- The facade delegates rather than reimplements subsystem logic.
- Advanced clients can still reach necessary lower-level APIs by policy.

**Compare with.** `adapter`, `mediator`, `singleton`.

## Flyweight {#flyweight}

Source: [Refactoring.Guru](https://refactoring.guru/design-patterns/flyweight)

**Intent.** Share immutable intrinsic state across many logical objects while supplying context-dependent extrinsic state from outside.

**Use when**

- Measured memory pressure comes from many repeated object states.
- Repeated state can be made immutable and shared.
- Object identity is not required for the shared portion.

**Avoid when**

- Memory savings are unmeasured or negligible.
- Intrinsic and extrinsic state cannot be separated safely.

**Participants**

- Flyweight
- Concrete shared flyweights
- Flyweight factory or cache
- Context holding extrinsic state

**Verification**

- Profiling demonstrates reduced allocation or memory.
- Shared intrinsic state is immutable.
- Extrinsic state is passed per operation and cannot leak between contexts.

**Compare with.** `composite`, `factory-method`, `singleton`.

## Proxy {#proxy}

Source: [Refactoring.Guru](https://refactoring.guru/design-patterns/proxy)

**Intent.** Stand in for a subject behind the same interface to control access, lifecycle, location, caching, or instrumentation.

**Use when**

- Access needs authorization, lazy loading, caching, or remote transport.
- The client should not know whether the real subject is local or initialized.
- Cross-cutting access policy belongs at one boundary.

**Avoid when**

- The wrapper's purpose is only to add composable domain behavior; consider Decorator.
- Hidden I/O or latency would violate the apparent contract.

**Participants**

- Subject interface
- Real subject
- Proxy
- Client

**Verification**

- The proxy preserves the subject's observable contract.
- Access policy is explicit and tested, including failure paths.
- Latency, caching, and consistency semantics are visible in documentation or types.

**Compare with.** `decorator`, `adapter`, `facade`.

