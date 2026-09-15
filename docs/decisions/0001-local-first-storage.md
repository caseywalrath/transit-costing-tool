# Decision 0001: Local-First Storage

- Status: Accepted
- Date: 2026-09-10

## Context

The initial application is a single-user planning tool deployed through GitHub Pages. It does not require shared editing, authentication, or central administration.

## Decision

Use IndexedDB as the authoritative working store through a typed persistence layer. Do not add a backend in the initial architecture.

Provide versioned JSON export and import for complete backup and restore. Provide CSV separately for tabular exchange.

## Consequences

- The application can operate as a static site and continue working without a server after loading.
- User data remains in one browser profile on one device.
- GitHub Pages deployment does not back up or synchronize project data.
- Clearing site data or changing browser profiles may remove access to locally stored projects.
- Database migrations and reliable backup/restore are required before the tool is considered usable for substantive work.
- Future cloud synchronization will require a new decision and repository implementation, but domain entities should not require replacement.

## Rejected alternatives

- Local storage: insufficient for structured datasets and migrations.
- File-only persistence: creates excessive save prompts and weak recovery behavior.
- Immediate backend: adds authentication, hosting, security, and maintenance requirements before they are needed.
