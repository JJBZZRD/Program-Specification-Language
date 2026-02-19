# Program Specification Language (PSL) Context

## Overview

Program Specification Language (PSL) is a declarative domain-specific language (DSL) for defining structured resistance training programs.

PSL is designed as a platform-agnostic specification standard for describing:

- Exercise programs
- Sessions
- Exercise prescriptions
- Set structures
- Progression models
- Autoregulation rules

The goal is to enable interoperable and reproducible program definitions that can be interpreted by different coaching tools, applications, and analysis systems.

## Core Goals

1. Provide a structured, machine-readable way to define training programs.
2. Support both powerlifting-style and bodybuilding-style programming.
3. Express advanced constructs including top sets, back-off sets, percentage loading, and RPE/RIR autoregulation.
4. Remain readable and writable by coaches without deep programming knowledge.
5. Stay extensible without frequent breaking changes.

## Design Philosophy

PSL is declarative first. Authors describe what a program is, not how an execution engine should run it.

Principles:

- Declarative core with limited imperative shorthand
- Human-readable syntax and machine-precise semantics
- Domain correctness over implementation convenience
- Platform independence

## Scope

PSL currently focuses on:

- Program metadata and structure (phases, weeks, sessions)
- Exercise prescriptions (sets, reps, intensity, rest)
- Progression model representation (currently set-level increment rules with configurable cadence)
- Versioned schema evolution

Out of scope for v0.1:

- UI layout concerns
- Workout logging schemas
- Device integration
- Athlete management workflows

## Architectural Model

1. Source representation: human-authored YAML + shorthand.
2. Canonical representation: normalized AST.
3. Compilation output: app-consumable session plans.

This separation allows coach-friendly authoring and deterministic interpretation.
