# Analyzer fixtures

These four tiny projects exist so the Python, Go, Rust, and Java adapters can be
tested against a known symbol graph. Every file is hand-written for this
repository, is MIT-licensed like the rest of Sóþspell, and contains no code from
another project. The fixtures are read-only inputs: analysis never writes to
them, and nothing in the analyzer executes their code.

Each fixture is small on purpose. A fixture is a contract: the tests name the
symbols, imports, entry points, and manifest facts they expect, so a grammar
upgrade that changes the parse is a visible, reviewed change rather than a
silent drift.

| Fixture  | Build file       | Entry point               | Notes                                  |
| -------- | ---------------- | ------------------------- | -------------------------------------- |
| `python` | `pyproject.toml` | `src/fixture/__main__.py` | relative and absolute imports          |
| `go`     | `go.mod`         | `cmd/fixture/main.go`     | `package main` with `func main`        |
| `rust`   | `Cargo.toml`     | `src/main.rs`             | `mod` files, traits, impl blocks       |
| `java`   | `pom.xml`        | `.../fixture/Main.java`   | packages, interfaces, Maven dependency |
