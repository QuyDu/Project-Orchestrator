---
applyTo: "**/*.py,**/*.pyi,**/pyproject.toml,**/requirements*.txt,**/Pipfile,**/Pipfile.lock,**/poetry.lock,**/uv.lock,**/pylock.toml"
description: "Python style, verified typing, isolated environments, packaging, exception handling, and safe resource use."
---

# Python Instructions

Reviewed: 2026-10-28

## Compatibility and Environment

- Respect `requires-python`, the selected interpreter, supported-version matrix, and existing environment/package manager. Use supported Python versions; do not introduce newer syntax or change minimums without compatibility approval.
- Isolate third-party dependencies in a project environment such as `.venv`; do not modify system Python or commit environments, credentials, or caches.
- Declare dependencies in the existing project format, retain reproducible application locks/constraints, and review package provenance, advisories, and licenses. Installing or upgrading tools is a separate action, not an automatic consequence of editing this guide.

## Language and Safety

- Follow PEP 8, descriptive `snake_case` names, four-space indentation, grouped imports, and the project's formatter. Preserve public APIs and local conventions; do not reformat unrelated code merely to match a sample.
- Derive public-boundary type annotations from verified code and supported interpreter behavior. Annotations do not perform runtime validation; avoid blanket `Any`, unchecked casts, or suppressions used to hide errors.
- Avoid mutable default arguments, wildcard imports, and accidental shared state. Compare `None` with `is` or `is not` when absence is the intended condition.
- Use context managers for owned resources. Catch specific exceptions, preserve causes with exception chaining, and do not swallow cancellation, `KeyboardInterrupt`, or `SystemExit`.
- Validate untrusted inputs and constrain paths. Do not deserialize untrusted pickle data, use dynamic evaluation, or pass untrusted shell strings; prefer structured arguments and parameterized queries.
- Use bounded network timeouts and concurrency. Keep blocking I/O off async event loops and release tasks, clients, and files deterministically.

## Verification

Run the repository's configured tests, formatter/linter, and type checker, using the selected environment. Tools such as Pylance/Pyright, mypy, Ruff, or Pylint are choices, not implied installed dependencies. Test failure paths and supported Python versions; report checks that were unavailable.

## References

- [Python PEP 8](https://peps.python.org/pep-0008/)
- [Python virtual environments and package installation](https://packaging.python.org/en/latest/guides/installing-using-pip-and-virtual-environments/)
