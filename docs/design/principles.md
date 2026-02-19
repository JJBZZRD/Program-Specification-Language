# Design Principles

## Declarative Core

PSL canonical semantics are declarative. The AST must encode intent and structure without execution-order dependency.

## Imperative Shorthand

Author-facing shorthand may look imperative (for readability), but must compile deterministically into canonical declarative structures.

## Progressive Disclosure

Simple programs should stay simple. Advanced constructs should be opt-in and additive.

## Versioned Evolution

Language changes should be introduced through explicit version notes and backwards-compatible transformations where possible.
