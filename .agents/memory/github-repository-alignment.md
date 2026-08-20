---
name: GitHub repository alignment
description: External repository history may not contain the current multi-service platform codebase.
---

Do not push feature work or open a pull request until the intended GitHub repository's default branch contains the same platform baseline as the local project.

**Why:** A repository can be writable yet still represent an older or different product history. Applying current service changes onto that baseline can create modify/delete conflicts and silently turn a focused feature branch into a migration of unrelated work.

**How to apply:** Before external GitHub automation, compare the local base with the remote default branch and trial-apply feature commits in an isolated worktree when histories diverge. Stop the external workflow and retain the local feature branch if the remote does not contain the required service baseline.