# Creational patterns

This reference is generated from the verified catalog. Use the intent and rejection criteria before
mapping participants to code. The verification bullets are the minimum evidence for claiming the
pattern is correctly implemented.

## Contents

- [Factory Method](#factory-method)
- [Abstract Factory](#abstract-factory)
- [Builder](#builder)
- [Prototype](#prototype)
- [Singleton](#singleton)

## Factory Method {#factory-method}

Source: [Refactoring.Guru](https://refactoring.guru/design-patterns/factory-method)

**Intent.** Defer the choice of a concrete product to an overridable creation operation while client logic depends on a product abstraction.

**Use when**

- A framework owns a workflow but extensions must choose one product type.
- Client logic is stable while the instantiated implementation varies.
- Construction must be replaceable without branching throughout the client.

**Avoid when**

- A parameter or injected constructor is sufficient.
- Several related products must vary together; consider Abstract Factory.

**Participants**

- Product abstraction
- Concrete products
- Creator with factory method
- Concrete creators

**Verification**

- Client workflow refers to the product abstraction.
- Concrete selection is localized in creator implementations.
- Adding a product does not edit the stable client workflow.

**Compare with.** `abstract-factory`, `template-method`, `prototype`.

## Abstract Factory {#abstract-factory}

Source: [Refactoring.Guru](https://refactoring.guru/design-patterns/abstract-factory)

**Intent.** Create coherent families of related products through one family-level interface without exposing their concrete classes.

**Use when**

- Products must be used in compatible families.
- The application must switch an entire platform, theme, or provider.
- Construction details should remain outside business code.

**Avoid when**

- Only one independently varying product exists.
- Product families change shape frequently, making the factory interface unstable.

**Participants**

- Abstract factory
- Concrete family factories
- Abstract products
- Concrete family products
- Client

**Verification**

- A client receives one factory and never mixes family construction.
- Each concrete factory produces a complete compatible family.
- Switching families requires changing composition, not client logic.

**Compare with.** `factory-method`, `builder`, `prototype`.

## Builder {#builder}

Source: [Refactoring.Guru](https://refactoring.guru/design-patterns/builder)

**Intent.** Construct a complex object step by step so the same process can produce different representations or optional configurations.

**Use when**

- Construction has many optional or ordered steps.
- Telescoping constructors obscure valid combinations.
- The same construction process should yield different representations.

**Avoid when**

- The object has a small stable constructor.
- The builder permits invalid partially built states without a final validation boundary.

**Participants**

- Builder interface
- Concrete builders
- Optional director
- Product

**Verification**

- Construction steps have clear ordering or independent options.
- Finalization enforces product invariants.
- Client code no longer manages representation-specific assembly details.

**Compare with.** `abstract-factory`, `composite`, `factory-method`.

## Prototype {#prototype}

Source: [Refactoring.Guru](https://refactoring.guru/design-patterns/prototype)

**Intent.** Create new objects by copying an existing prototype while keeping client code independent of concrete classes.

**Use when**

- Initialization is expensive or configuration-rich.
- Runtime objects are better templates than class constructors.
- Clients must copy objects through a common abstraction.

**Avoid when**

- Object graphs contain unclear ownership or non-copyable resources.
- A normal constructor or factory is simpler and cheap.

**Participants**

- Prototype contract
- Concrete prototypes
- Client or prototype registry

**Verification**

- Copy semantics explicitly distinguish deep, shallow, and shared state.
- A clone can evolve without mutating its prototype.
- External resources and identity fields have documented copy rules.

**Compare with.** `factory-method`, `abstract-factory`, `memento`.

## Singleton {#singleton}

Source: [Refactoring.Guru](https://refactoring.guru/design-patterns/singleton)

**Intent.** Guarantee one accessible instance for a process-scoped responsibility while controlling its construction.

**Use when**

- Exactly one instance is a verified domain or infrastructure invariant.
- Concurrent creation must be coordinated.
- The lifetime is explicitly process-wide.

**Avoid when**

- It is used as convenient global state.
- Tests, tenants, requests, or isolated lifetimes need separate instances.

**Participants**

- Singleton type
- Private construction boundary
- Instance access point

**Verification**

- Concurrent access cannot create multiple instances.
- Mutable global state is absent or tightly controlled.
- Tests can isolate or reset the dependency without order dependence.

**Compare with.** `facade`, `abstract-factory`.

