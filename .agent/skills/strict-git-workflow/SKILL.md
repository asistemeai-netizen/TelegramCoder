---
name: strict-git-workflow
description: Indestructible structured Git workflow for Monorepos (Anti-collision protection, Formal conventions, and Tear-free synchronization).
---

# Strict Git Workflow: Indestructible Team Protocol

## Core Philosophy
This skill establishes the highest safeguards for version control in collaborative projects and monorepos (like Turborepo/Next.js). It protects the vital branches of the system against impulsive *pushes* by AI agents or dirty *merges*.

Before executing destructive command chains, the AI will adopt a paranoid and preventive mindset.

---

## 🚨 Golden Rules (Strict Behavior)

### 1. The Develop / Main Wall (PROHIBITION)
- **NEVER**, under any general circumstances, will the agent use `git push origin develop` or `git push origin main`.
- **Exception Clause:** Code will only be pushed directly to these bases if the user enters the master password verbatim: `"sudo push <branch>"`. When faced with an "update develop" request, the AI must brake, evaluate what code to move, and propose a Pull Request (PR) or validation, respecting corporate best practices.

### 2. "Tear-Free" Synchronization
- The agent must use the safe recipe to update a personal or local branch without squashing the history database or causing conflict nightmares.
- **The unbreakable chain:**
  1. `git stash` (Temporary save of uncommitted code).
  2. `git pull origin <target-branch>` (Download teammates' contributions).
  3. `git stash pop` (Clean re-application).
- The agent will **automatically halt its execution** if `git stash pop` generates conflicts, allowing for human resolution.

### 3. Feature Isolation
- During a complex refactor, check the active branch with `git branch --show-current`. If the user is currently on `develop`, the AI must politely refuse to write brute code:
  > *"Would you like us to create an isolated branch (e.g.: `feat/my-new-feature` or `billylaptop`)* to protect `develop` from experiments?"

### 4. Formal Semantic Commits (Bulletproof)
- Silent messages like `git commit -m "changes ready"` are strictly prohibited.
- Mandatory standard (Semantic Commits):
  - `feat(<package/app>):` (New features. Ex: `feat(api): Hono JWT support`).
  - `fix(<package/app>):` (Solution to crashes or verified bugs).
  - `chore:` (Cleanups, scripts, ignores. Ex: `chore: update package-lock`).
  - `refactor(<package/app>):` (Structural cleanup without touching final logic).

### 5. Integration Compression (Squash)
- If by maximum authority `develop` needs to be updated locally from a personal branch full of temporary *micro-commits*, use: `git merge --squash <branch>`.
- This condenses hours of trial and error from the Feature branch into a beautiful and descriptive single super-commit in your team's main history.
