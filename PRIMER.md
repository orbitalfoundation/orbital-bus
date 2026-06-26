# A Primer on the Bus

*On late binding, message passing, and the long history behind one small `resolve()`*

*Written by Claude Fable - grounded in the orbital-bus source and SPEC.*

This is the companion to [SPEC.md](SPEC.md). The SPEC states the precise, load-bearing rules of how
the bus behaves. This document covers the *why*: where the ideas come from, who developed them, what
their formal names are, and where the design makes tradeoffs worth examining critically.

Read on its own, the bus can look like a set of personal preferences. It isn't. Nearly every
decision in it has a name, a date, and an argument behind it that predates JavaScript. The aim here
is to supply that vocabulary and then use it to ask whether the design is meaningful and durable, or
whether it misses something.

---

## 0. Layers

A creative-programming framework, taken in one go, is more than one person can hold in their head.
Alan Kay spent a career on the idea that systems should be built the way biology builds: small
cells, late-bound, messaging each other, with no central authority. Describing all of that at once
produces mush. The bus does not try. It carves out **one substrate at the bottom** and aims to get
that right, on the theory that if the bottom is clean, the layers above it — entities, components,
manifests, persistence, networking — have somewhere solid to stand.

Much of the apparent muddiness in discussions of pub/sub comes from describing two layers at once.
The discipline this document follows is to **name the layer**. The bus is the message substrate. ECS
is a layer above it. Manifests are an authoring convention above that. A database, if one ever
exists, is a listener that happens to remember things.

---

## 1. Two ways to wire a program

Pub/sub is often contrasted with "forward imperative programming." The term points at something
real, but it is two distinct distinctions wearing one coat. Pulling them apart is the clearest way
to say what the bus actually changes.

### Distinction A — *who names whom* (coupling)

In ordinary imperative code, module A `import`s module B and calls `B.doThing()`. For that line to
compile, A must know that B exists, what it is called, and the exact shape of its interface. Coupling
is "objects know objects." The call graph is a directed graph of names, and its shape is visible only
by tracing the imports. This is all "bureaucracy". Unrelated to the actual execution there are hidden costs. A compiler is required, iteration latency is introduced. Yes type safety and function argument marshaling prevents a class of errors, but the weight of early binding slows down development, reduces playfulness. There are less visible impacts on everything downstream.

On the bus, A publishes `{ thing: ... }` and B has registered interest in events with a `thing` key.
Neither names the other. What they share instead is a *vocabulary* — the word `thing`. Coupling moves
from "objects know objects" to "objects know a vocabulary." This is the real inversion, and it has a
consequence: **the vocabulary becomes the most important artifact in the system.** That is why the
bus has a [schema reservation mechanism](packages/bus/src/schema.js). The schema registry is not a
peripheral feature — it is the type system of the shared vocabulary, the one place otherwise-anonymous
parties agree on what words mean.

### Distinction B — *when the graph is fixed* (binding time)

This is Alan Kay's axis: **late binding** versus early binding. In a compiled, import-wired program
the call graph is fixed at author time and frozen at compile time. In the bus, the graph of
who-talks-to-whom is assembled at runtime from whatever listeners have registered by the time an
event is dispatched. A module loaded an hour into the run can immediately talk to services that
registered an hour earlier, with no edit to any existing file. Kay called the extreme form of this
"extreme late binding of all things," and considered it more central to "object-oriented" than
inheritance or classes.

The two axes are independent. Late binding without decoupling exists (a plugin that still calls named
APIs); decoupling without late binding exists (statically wired message queues). The bus takes the
far corner of both: nobody names anybody, and nothing is bound until runtime.

### The weight that comes off

The "bulk and weight of compilation" has a precise version. Early binding buys a guarantee: the
compiler proves, before the program runs, that every call has a target of the right shape. That proof
is the weight — the build step, the type graph, the ceremony of declaring interfaces so they can be
checked. Late binding gives that proof up deliberately. The bus has no build step, and the kernel runs
unchanged in Node and the browser, precisely because it refuses to know ahead of time who is connected
to what. This is a trade, not a free lunch: a compile-time correctness proof exchanged for runtime
flexibility. Whether the trade is wise is the subject of §5.

| | Forward / imperative | The bus |
|---|---|---|
| Who names whom | A imports and calls B | neither; both name a vocabulary |
| When the graph is fixed | author/compile time | runtime, per dispatch |
| What is checked ahead of time | call targets and types | nothing (advisory schema only) |
| What is traded away | flexibility, hot-loading | a compile-time correctness proof |
| The shared artifact | interfaces | the message vocabulary (schema) |

---

## 2. How JavaScript got here

The bus is a JavaScript object, and JavaScript's own relationship with events is a contingent
history. It is worth knowing because the bus is in dialogue with this lineage — reacting against
specific scars — whether or not it announces it.

**HyperCard, 1987 → JavaScript, 1995.** When Brendan Eich wrote the first JavaScript at Netscape
(famously in about ten days, under the name Mocha), the event model he reached for drew on Apple's
HyperCard and its scripting language HyperTalk. HyperCard had *stacks of cards* with buttons; a script
on a button reacted to a click, and if it didn't handle the click, the message passed *up* a
structural hierarchy (button → card → background → stack). That idea — a message travels through a
hierarchy until something handles it — is the deep ancestor of two things at once: the DOM event model,
and the first-responder rule the bus uses for queries (§4). The browser ran the event loop; scripts
reacted. JavaScript was event-driven from its first day, but primitively: `onclick="doSomething()"`
strings in HTML attributes.

**The event war, late 1990s.** Inline handlers couldn't bind multiple functions to one event or cope
with nested elements, so Netscape and Microsoft built two incompatible models. Netscape said an event
should start at the top and **capture** downward to the target; Microsoft said it should fire at the
target and **bubble** upward. The W3C, rather than picking a winner, combined both: every DOM event
travels *capture → target → bubble*, which is why `addEventListener(type, listener, useCapture)` has
that third argument. The lesson the bus inherits, mostly by avoiding it: propagation order is a real
design decision, and getting it wrong leaves a compromise that ships forever. The bus has exactly one
order (registration order, adjusted by `before`/`after`), and §5.8 examines whether even that is too
much.

**jQuery and the application event, 2006.** John Resig's jQuery papered over the browser differences
with `.bind()`/`.trigger()`, and in doing so let developers fire events that had nothing to do with
the DOM — a `cart:updated` event with no element behind it. That is the hinge of the story: the moment
events stopped meaning "the user did something" and started meaning "the application's state changed."
Once that is possible, events want a home that isn't the DOM tree — and the event bus is invented.

**The `this` wars, 2005–2009.** A side-quest that explains a JavaScript quirk. Because JS binds `this`
dynamically, passing `obj.method` as a callback strips its connection to `obj`. Two camps fixed it
differently. Sam Stephenson's **Prototype.js** added `.bind()` onto `Function.prototype` —
enriching the language, Ruby-style — years before ES5 standardized exactly that. Douglas Crockford's
**YUI** camp refused, calling prototype modification pollution that would collide with future
browsers, and used standalone wrapper functions instead. ES5 eventually blessed Stephenson's `bind`.
The bus sidesteps the fight by having listeners be plain blobs whose `resolve` is called as
`listener.resolve(event, bus)` — the object is passed in, so there is no lost-`this` problem to bind
around. (The bus's own listeners use `this` inside `resolve`, e.g. the counter in the README; that
works only because they are invoked as methods on the blob.)

**Dojo, 2004 — the closest direct ancestor.** Alex Russell and Dylan Schiemann's Dojo Toolkit shipped
`dojo.publish`/`dojo.subscribe` and `dojo.connect`. Russell's framing is nearly the bus's: treat the
execution of any method as an interceptable event, so distant unrelated modules can react without
anyone wiring them together. (Russell later coined both "Comet" for server push and "Progressive Web
App.") The single closest historical relative of `bus.resolve()` is `dojo.publish`.

**Zakas, 2010 — the bus as architecture, not convenience.** Nicholas Zakas's talk *Scalable JavaScript
Application Architecture* argued that pub/sub is a **containment boundary**: modules forbidden from
knowing about each other, talking only through a central core, mean a crashing module is isolated and
the rest keeps listening. That is the argument behind the bus's "kernel has no special cases" stance
(§6) — the core stays small and neutral so that everything dangerous lives in sandboxable listeners.

**Osmani → Redux/Vuex.** Addy Osmani's *Learning JavaScript Design Patterns* supplied clean
boilerplate for Mediator and Observer, and the line runs from there into Flux, Redux, and Vuex —
single-store, dispatch-an-action, reducers-react architectures that are pub/sub with a
state-management layer. The bus sits upstream of those: it provides the dispatch channel and
deliberately does not provide the single store (§5.6), its most distinctive and most arguable choice.

A worthwhile counterweight is Gary Bernhardt's talk
[*The Birth and Death of JavaScript*](https://www.destroyallsoftware.com/talks/the-birth-and-death-of-javascript)
— satire that is serious about how contingent and strange the whole substrate is.

---

## 3. The deeper computer science: a catalog of the patterns

The JavaScript story is a local accident. The ideas under the bus are older and were named elsewhere,
mostly in two canonical collections plus a handful of foundational papers. Each is listed below with
where the bus sits relative to it.

### From *Design Patterns* (Gamma, Helm, Johnson, Vlissides — the "Gang of Four," 1994)

- **Observer.** A subject keeps a list of dependents and notifies them on change. This is the skeleton
  of `bus.resolvers` + `resolve()`. `addEventListener` and Node's `EventEmitter` are the same pattern.
  The bus's variation is that subject and observer are the same shape (a blob), which Observer does not
  require.
- **Mediator.** Objects refer to one mediator that coordinates them, rather than to each other. The
  bus is a mediator — the "one channel" of SPEC §1.1 is the textbook Mediator scaled up to be the whole
  application's nervous system.
- **Chain of Responsibility.** A request passes along a chain of handlers until one handles it and
  stops the chain. The bus's first-responder query (§4) is this pattern. Naming it matters: it is a
  decades-old pattern with documented properties, so its failure modes — handler order matters,
  "handled" and "stop" are conflated — are already known. See §5.2.
- **Command.** A request packaged as an object that can be stored, queued, logged, and replayed. Every
  bus event is a Command object in this sense, which is what makes the "replay the packets"
  event-sourcing idea (§5.5) thinkable at all.

### From *POSA Volume 2* (Schmidt, Stal, Rohnert, Buschmann, 2000)

This book concerns events at operating-system scale — tens of thousands of sockets — and it is where
the machinery under Node itself was named.

- **Reactor.** A single-threaded event loop waits for sources to become ready and synchronously
  dispatches each ready event to a handler. This is Node's libuv, Python's asyncio, Java's Netty — and
  the shape of the bus's synchronous, no-queue dispatch (SPEC §3.3). The bus is a small
  application-level Reactor.
- **Proactor.** The inverse: initiate an async operation and a completion handler fires when the OS
  finishes it (Windows IOCP, POSIX `aio`). The bus is Reactor-shaped, not Proactor-shaped, which is a
  real constraint — see the backpressure discussion in §5.4.
- **Acceptor-Connector.** Decouples establishing a connection from the logic that uses it. The
  WebSocket bridge that carries the bus across the network (SPEC §1.5) is this pattern at the
  application layer.

### The foundational papers the pattern books stand on

- **Tuple spaces / Linda (David Gelernter, ~1985).** A shared associative space where processes `out`
  (write) tuples and `in`/`rd` (read by pattern-match) them, fully decoupled in space and time. This is
  the closest formal relative of the bus's data model: a bus event is a tuple, a filter is an
  associative pattern-match (`key in event`), and listeners that catch and hold state if they choose are
  processes reading the space. The design choice of no database at the bottom — observers hold only what
  they care about — is the tuple-space approach, with a 40-year pedigree; the orbital-sys readme cites
  Gelernter directly.
- **Blackboard systems (Hearsay-II speech recognition, 1970s; formalized in POSA vol. 1).** Independent
  "knowledge sources" watch a shared, *mutable* data structure (the blackboard) and each contributes
  when it sees something it can act on. This is the bus's live-uncloned-state, decorate-as-you-go model
  (SPEC §1.3): an event that listeners read and mutate in place, each adding a property, is a blackboard.
  It is also where ECS comes from in spirit — an entity is a blob on the blackboard, components are
  properties other knowledge sources decorate it with.
- **The Actor model (Carl Hewitt, 1973).** Isolated actors with no shared state, communicating only by
  asynchronous messages, each with a mailbox, processing one message at a time, able to create more
  actors. The bus shares the "message, not method call" worldview and the location transparency that
  lets it span a WebSocket, but breaks the actor model on two counts: actors never share state (the bus
  shares it deliberately), and actors have asynchronous mailboxes (the bus dispatches synchronously, no
  queue). Those two breaks are the bus's two largest bets; §5 is mostly about them.
- **CSP (Tony Hoare, 1978) → Go channels, Clojure core.async.** Processes pass messages through
  synchronized channels instead of registering callbacks. A different decoupling philosophy, worth
  knowing as the road not taken: CSP couples sender and receiver in time (a rendezvous) while decoupling
  them in identity; pub/sub decouples in both. Neither is more correct.
- **Reactive streams / Rx (Erik Meijer, Microsoft, ~2009).** Events as first-class *streams* that can
  be mapped, filtered, merged, and composed. This is a road the bus has not taken: it delivers one event
  at a time and leaves composition to listener code, where Rx makes the event flow itself a manipulable
  value. See §5.7.
- **Smalltalk (Kay, Ingalls, et al., 1970s).** Everything is an object; computation is objects sending
  messages; binding is as late as possible. The bus is a small, flat, untyped version of the same idea:
  one message shape, one dispatch verb, extreme late binding. It drops Smalltalk's class hierarchy and
  image and keeps the messaging core.

---

## 4. Where the bus sits — a decision-by-decision map

For each load-bearing decision in the SPEC, the formal pattern it instantiates and a note.

| Bus decision (SPEC §) | The pattern it is | Note |
|---|---|---|
| One channel, nobody imports anybody (§1.1) | **Mediator** + extreme late binding | Core mechanism. |
| A blob is a listener *or* an event by its shape (§1.2) | Uniform message representation (Smalltalk/Linda flavor) | Uncommon; see §6. |
| Live, uncloned, mutated-in-place events (§1.3) | **Blackboard** system | Powerful, with risks; §5.3. |
| First-responder: first non-`undefined` wins (§3.2) | **Chain of Responsibility** | Known pattern, known footgun; §5.2. |
| Filters match on key *presence* (§3.5) | Content-based subscription (vs topic-based) | Over-matches by design; §5.1. |
| Immediate nested resolve, no queue (§3.3) | **Reactor**, synchronous dispatch | Breaks the Actor mailbox; §5.4. |
| Manifests are executable `.js` (§1.4, §5) | Code-as-data / IoC container config | See §6. |
| `{ registered: true }` on join (§3.4) | Lifecycle / init hook | Routine. |
| `before` / `after` ordering (§3.7) | Topological constraint solving | See §5.8. |
| Same bus across a WebSocket (§1.5) | Location transparency (Actor) | Earns the env-neutrality rule. |
| No global singleton (§2) | Dependency injection | A break from orbital-sys's `globalThis.sys`. |
| Built-ins are ordinary listeners (§4) | "No special cases" / reflective kernel | See §6. |

Almost nothing here lacks a named precedent. The design reassembles the blackboard pattern, the
mediator, chain of responsibility, tuple spaces, and extreme late binding into one small object. The
parts are durable. The open question is whether the combination is coherent, or whether some of the
parts work against each other. Some do — the next section examines which.

---

## 5. A critical reading

A design can be sound and still carry unpaid debts. This section makes them explicit.

### 5.1 Presence-not-value filters over-match

`{ tick: true }` matches `{ tick: 0 }` and `{ tick: false }` alike — it tests `key in event`, not the
value. This is the cheapest possible content-based subscription, and it holds up as long as the
vocabulary is namespaced by key. The risk is the day two unrelated subsystems both use a generic key
like `id` or `position` and start hearing each other's traffic. The schema registry (§1) is the
defense, but it is advisory — it warns, it does not enforce. The safety of the bus rests on naming
discipline that nothing mechanically enforces; that should be documented as load-bearing, which the
SPEC half-does in §6.

### 5.2 First-responder conflates "I have an answer" with "stop the chain"

This is Chain of Responsibility, and it inherits that pattern's classic defect. Returning a value means
two things at once — *here is the answer* and *no one downstream runs*. Three consequences:

1. **The accidental-query footgun** (SPEC flags this in §6): a fan-out listener that returns something
   by mistake silently halts everyone after it. The bug is invisible — nothing errors; events simply
   stop reaching part of their audience.
2. **Query results depend on listener order.** Because the first responder wins, the answer to
   `{ spatial_query: ... }` depends on who registered first or sorted earliest. Query semantics inherit
   the fragility of ordering (§5.8). A query reads as a question about the world; in fact it is "ask
   everyone in a particular order and take the first reply," which is a more fragile thing.
3. **No partial answer.** A responder either stops the chain or contributes nothing to the return.
   There is no built-in way for several listeners to collaborate on one answer without mutating the
   event — back to the blackboard, §5.3.

The mechanism is economical, but it does two jobs at once, and the SPEC's own §9 open questions
("error channel," "done semantics") are symptoms of the same overloading. Whether query and publish
should be visibly distinct verbs, even sharing an implementation, is worth considering.

### 5.3 Live mutation is the hardest thing in the system to reason about

Shared mutable state, written by parties that do not know about each other, in an order that is only
partly defined, is close to the textbook definition of the hardest debugging problem in computing. The
bus chooses it deliberately, for speed and for decorate-as-you-go ECS ergonomics, and the blackboard
pedigree (§3) means it can be made to work. The cost is concrete: properties of "easy to reason about"
that decoupling buys in §1 are spent back here. Two listeners that both write `event.result` race; the
winner is determined by sort order; nothing warns. This is the right default for a game/sim substrate
where speed matters and one author controls all listeners, and the wrong default the moment third-party
or networked listeners join — which the WebSocket bridge (§1.5) explicitly invites. The tension is real
and currently unowned.

### 5.4 Synchronous, no-queue dispatch breaks the mailbox — and backpressure with it

"A nested `resolve()` runs immediately to completion before the parent continues" (SPEC §3.3) is simple
to reason about locally and is defensible. It also means:

- **Unbounded re-entrancy.** A → emits → B → emits → A is a synchronous call stack. Deep or cyclic
  cascades grow the JS stack and can overflow it; the orbital-sys readme already admits "infinite loops
  remain possible." There is no queue to break the cycle and no depth guard.
- **No backpressure.** An Actor system or a reactive stream can signal "overwhelmed, slow down."
  Synchronous fan-out cannot; a slow listener blocks the entire dispatch (everything is `await`ed in
  series). Fine at hundreds of listeners (the SPEC's stated scale), a wall at thousands or under network
  load.
- **The distribution seam.** "Same bus across a WebSocket" cannot preserve the immediate-completion
  guarantee across a network hop — remote delivery is necessarily queued and async. The bus is therefore
  two dispatch semantics under one name: synchronous locally, asynchronous across the bridge. That seam
  is where surprises will live.

This is the right call for a single-process sim kernel and an explicit compromise for the
networked-application ambition. The SPEC should state outright that cross-bridge dispatch is a different
animal.

### 5.5 The two event-sourcings are in genuine tension

SPEC §6 separates "replay dispatch" from "replay stored state," which is correct as far as it goes. But
event sourcing's power comes from events being *immutable facts*, and the bus's events are *mutable*
(§5.3). A log of events that listeners rewrote as they passed through cannot be faithfully replayed —
the log records the event as published, not as mutated, so a replay diverges from the original run the
instant any listener mutates. The bus can replay dispatch order but cannot, by construction, be a sound
event-sourced *state* store. The design wants both live mutation (§1.3) and replayability; both may not
be possible at this layer. This is the most consequential tension in the design. The likely resolution:
mutation is a within-tick convenience, and persistence is a separate listener that snapshots immutable
facts at tick boundaries. The documentation currently implies replay comes for free; it does not.

### 5.6 "No database at the bottom" trades away a single source of truth

Letting any observer hold the state it cares about is the tuple-space/blackboard approach. The cost is
that there is no authoritative state. A query (§5.2) is "ask around and take the first answer," which
holds until two observers hold divergent copies of the same fact. That is the oldest problem in
distributed systems — consistency — re-encountered at application scale. The bus does not solve it; it
dissolves it by declaring there is no canonical state, which works until two listeners need to agree. As
a substrate choice this is correct and powerful. But a single source of truth, when one is eventually
wanted, has to be built as a listener above the bus, and the bus offers no help keeping the others
consistent with it. Redux/Vuex (§2) exist precisely because that need recurs.

### 5.7 The road not taken: streams

The bus delivers one event at a time. Rx-style reactive streams make the flow itself a value that can be
mapped, filtered, debounced, merged. Much of what listeners hand-roll — "do X every Nth tick," "react to
A then B within 100ms," "coalesce a burst" — is a one-liner in a stream library and bespoke listener code
here. This is a scope boundary, not a flaw, but it is the boundary the bus is most likely to bump into as
applications grow, and it merits a line in the SPEC's non-goals so that reaching for it reads as leaving
the kernel rather than patching it.

### 5.8 The `before`/`after` sort is the tell

The bus's pitch is decoupling and order-independence — listeners do not know about each other. Yet it
ships `resolve.before` and `resolve.after`, an ordering-constraint solver, so a listener can depend on
running relative to another listener *named by id* (SPEC §3.7). That is coupling by name, reintroduced
through the back door — the very thing §1.1 says the bus abolishes. Its existence is an admission that
real systems built on the bus do have hidden ordering dependencies and need an escape hatch. This is not
necessarily wrong (DOM capture/bubble, §2, exists for the same reason — order is real), but it is where
the clean story leaks. Manifests that sprout many `before`/`after` constraints are a signal that the
decoupling is notional and the real architecture is a dependency graph that is not being drawn.

### Bottom line

The design is sound: a re-synthesis of durable patterns, with several integration choices (the single
blob, manifests-as-macros, the no-special-case kernel) that go beyond assembling known parts. It is
durable in that it is built from ideas that have survived decades.

It misses something in one structural way: live mutation (§5.3) and faithful replay (§5.5) cannot both
hold at this layer, and the documentation currently promises both. The other tradeoffs above are bounded
and can be neutralized by documenting them. That one is a contradiction to resolve.

---

## 6. What is novel in the integration

The primitives are inherited. The integration is distinctive in a few specific places.

- **The single blob.** Registering a listener and publishing an event are the same operation on the same
  data shape, distinguished only by whether a `resolve` function is present (SPEC §1.2). Observer keeps
  subjects and observers as different types; Linda keeps tuples and processes distinct. Collapsing them is
  a simplification not found in the source patterns, and it is what makes a manifest "full of listeners"
  and "a stream of events" the same stuff.
- **Manifests as macros.** Declarative-shape authoring that is real JavaScript — "twelve agents at
  incrementing positions" is a `for` loop, not a thousand lines of JSON (SPEC §1.4). This is the Lisp
  "code is data" idea applied with restraint to app configuration: data-shaped, executed once, at load.
- **The no-special-case kernel.** The manifest loader, the tick driver, and the schema registry are
  ordinary listeners registered onto a bare bus, with no privileged code paths (SPEC §4). This mirrors
  "everything is an object" (Smalltalk) and "everything is a file" (Unix). If the kernel's own machinery
  can be expressed in the kernel's own vocabulary, the vocabulary is at least complete enough to build on.
- **Register-during-dispatch snapshot semantics.** A listener that registers mid-dispatch sees
  `{ registered: true }`, not the in-flight event, via a snapshot of the resolver list (SPEC §3.3–3.4).
  This is a subtle, correct call that hand-rolled event buses frequently get wrong — they either skip the
  new listener inconsistently or let mutation-during-iteration corrupt the walk.

These are design judgments rather than new primitives.

---

## 7. What sits above the bus

The bus is deliberately the bottom layer; several ideas one level up build on it, kept separate per the
layering discipline of §0.

- **ECS** rides on §1.3 (live decoration). An entity is a blob; components are properties listeners add;
  "filter on components" is the presence-filter (§3.5) used as an organizing principle. The bus is below
  ECS and does not know the word "component."
- **Manifests** are an authoring convention above dispatch (§5) — declarative state descriptions of a
  whole app, which is the orbital project's larger bet on data-driven design.
- **No bottom database** is the §5.6 stance, kept deliberately. Persistence, if it comes, is a listener.
- **Directly wiring emitters to receivers** (not yet built) would be an optimization of the mediator:
  when exactly one listener ever matches a key, the walk could be bypassed and the listener called
  directly. This trades late binding for speed on a per-edge basis — it is a cache of the dispatch
  decision, and like all caches its hard part is invalidation when a new listener registers. It pushes
  back toward early binding precisely where it is used.

---

## 8. References & further reading

**The pattern collections**
- Gamma, Helm, Johnson, Vlissides — *Design Patterns: Elements of Reusable Object-Oriented Software*
  (1994). Observer, Mediator, Chain of Responsibility, Command.
- Schmidt, Stal, Rohnert, Buschmann — *Pattern-Oriented Software Architecture, Vol. 2: Patterns for
  Concurrent and Networked Objects* (2000). Reactor, Proactor, Acceptor-Connector.
- Buschmann et al. — *POSA Vol. 1* (1996) for the Blackboard pattern.

**The foundational papers**
- David Gelernter — "Generative Communication in Linda" (1985). Tuple spaces.
- Carl Hewitt — Actor model (1973 onward).
- C.A.R. Hoare — "Communicating Sequential Processes" (1978).
- Alan Kay — the OOPSLA talks and the "extreme late binding" framing; Smalltalk history.
- Erik Meijer et al. — ReactiveX / Rx, for the streams road not taken.

**The JavaScript story**
- Wirfs-Brock & Eich — *JavaScript: The First 20 Years* (2020). The HyperCard/HyperTalk origin and the
  ten-days account, from the source.
- Nicholas Zakas — *Scalable JavaScript Application Architecture* (2010 talk).
- Addy Osmani — *Learning JavaScript Design Patterns*. Mediator/Observer boilerplate; the road to
  Flux/Redux/Vuex.
- Gary Bernhardt — *[The Birth and Death of JavaScript](https://www.destroyallsoftware.com/talks/the-birth-and-death-of-javascript)*.

**This project's own lineage**
- [orbital-sys readme](https://github.com/orbitalfoundation/orbital-sys/blob/main/readme.md) — the earlier
  thinking and its own critiques (debugging difficulty, nondeterministic order, no cloning, infinite
  loops), which §5 picks up.
- [SPEC.md](SPEC.md) — the contract this primer explains.
- [packages/bus/src/bus.js](packages/bus/src/bus.js) — the implementation, ~190 lines; small enough to
  read in full.
