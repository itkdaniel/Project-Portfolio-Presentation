---
name: GitHub repository alignment
description: External repository history may not contain the current multi-service platform codebase.
---

Do not push feature work or open a pull request until the intended GitHub repository's default branch contains the same platform baseline as the local project.

**Why:** A repository can be writable yet still represent an older or different product history. Applying current service changes onto that baseline can create modify/delete conflicts and silently turn a focused feature branch into a migration of unrelated work.

**How to apply:** Before external GitHub automation, compare the local base with the remote default branch and trial-apply feature commits in an isolated worktree when histories diverge. Stop the external workflow and retain the local feature branch if the remote does not contain the required service baseline.

GitHub Git Data API tree creation can return a generic `404 Not Found` when a tree writes files under `.github/workflows/` but the authorization lacks workflow-write permission. Ordinary paths in the same tree may still succeed.

**Why:** The generic response can look like eventual-consistency or missing-object failure even when the base tree and every referenced blob exist.

**How to apply:** Isolate workflow paths when diagnosing tree-creation 404s. If only workflow paths fail, use authorization that can write repository contents and workflow files; retrying or re-uploading blobs will not fix the permission failure.