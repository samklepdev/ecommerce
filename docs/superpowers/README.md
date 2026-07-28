# Plans and specs — a dated record, not current documentation

Everything under `plans/` and `specs/` is a point-in-time artifact: what
was designed or planned on the date in its filename. They are kept because
the reasoning is often worth revisiting, not because they describe how the
system works now.

**They are not updated when the code moves on, and they shouldn't be.**
Rewriting a dated plan to match today's code destroys the only thing it's
good for — showing what was known and intended at the time.

So expect them to be wrong about the present. Several still discuss product
variants, for instance, which no longer exist anywhere in the system.

For how things actually work today:

- `docs/features.md` — what a customer or admin can do
- `CLAUDE.md` — architecture rules, payment invariants, conventions
- `PROJECT_STRUCTURE.md` — directory layout
- `docs/deployment.md` — environment and deploy steps
