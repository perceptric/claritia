# Selection guide

Start from the pressure, then open the matching family reference.

| Pressure | Leading candidate | First alternative to challenge it with |
| --- | --- | --- |
| One product type varies inside a stable workflow | Factory Method | injected factory function |
| Whole compatible product family varies | Abstract Factory | configuration plus direct construction |
| Complex ordered or optional assembly | Builder | named constructor or options object |
| Runtime object acts as a template | Prototype | factory or serialization |
| Exactly one process-lifetime instance | Singleton | composition-root lifetime management |
| Existing interface must fit a local contract | Adapter | change the controlled interface directly |
| Two dimensions vary independently | Bridge | Strategy or simple composition |
| Leaves and groups need uniform recursive operations | Composite | explicit tree traversal |
| Responsibilities must stack transparently | Decorator | middleware or direct composition |
| Common entry point hides subsystem choreography | Facade | expose subsystem services |
| Measured repeated state dominates memory | Flyweight | interning or compact data representation |
| Access to a subject needs control or indirection | Proxy | Decorator or Adapter |
| Ordered handlers may accept or forward a request | Chain of Responsibility | explicit pipeline |
| A request needs its own lifecycle | Command | direct method or closure |
| Traversal must hide collection representation | Iterator | built-in iteration protocol |
| Peer interactions are tangled | Mediator | direct dependencies or events |
| Encapsulated state needs snapshot and restore | Memento | explicit state or event sourcing |
| Dynamic subscribers react to publication | Observer | direct calls or Mediator |
| Behavior changes with lifecycle state | State | Strategy or a small conditional |
| Interchangeable algorithms solve one task | Strategy | function parameter or Template Method |
| Stable algorithm order has overridable steps | Template Method | Strategy composition |
| New operations target stable element types | Visitor | pattern matching or methods on elements |

## Fast rejection checks

- No demonstrated axis of change: keep the direct design.
- One branch with two stable cases: keep the conditional.
- A built-in iterator, event stream, closure, module cache, or dependency container already carries
  the required semantics: prefer the language facility.
- The proposed abstraction has one implementation and no credible second variation: defer it.
- The pattern hides I/O, ordering, mutation, or failures that callers need to see: redesign the
  contract before applying the pattern.
