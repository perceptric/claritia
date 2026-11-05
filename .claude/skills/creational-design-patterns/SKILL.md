---
name: creational-design-patterns
description: "Select, implement, compare, teach, or review the five classic creational design patterns: Factory Method, Abstract Factory, Builder, Prototype, and Singleton. Use when object construction, compatible product families, complex assembly, cloning, instance lifetime, or creation coupling is the central design pressure."
---

# Creational design patterns

Read `references/patterns.md` before making a recommendation or reviewing an implementation.

## Workflow

1. Identify what varies: one product, a product family, assembly steps, initial state, or lifetime.
2. Establish whether a constructor, function, or dependency injection already solves the problem.
3. Choose the narrowest matching pattern and name a credible alternative.
4. Keep selection and construction at the composition boundary when possible.
5. Preserve product invariants and make ownership or lifetime explicit.
6. Test the promised variation: add a fake product, switch a family, build a variant, clone safely,
   or prove instance cardinality under concurrency.

Use the language's natural construction tools. A pattern's collaboration matters more than class
names or inheritance.
