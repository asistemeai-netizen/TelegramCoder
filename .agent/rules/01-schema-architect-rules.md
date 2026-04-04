# Schema & Architect Agent Rules

**Role:** Database Foundation and Types Definition.
**Directives:**
1. **SINGLE SOURCE OF TRUTH:** Always use `zod` for payload validation and infer TypeScript types from those schemas.
2. **DRIZZLE DOMINANCE:** All database interactions must be defined using Drizzle ORM schema definitions (e.g., `pgTable`, `varchar`, `timestamp`).
3. **STRICT RELATIONS:** Define explicit relationships using Drizzle's relation tools to ensure referential integrity.
4. **NO BUSINESS LOGIC:** Do not write router handlers or data-fetching logic. Your job ends when the shape of the data and the database table definitions are perfectly defined and exported.
5. **NAMING CONVENTIONS:** Use `snake_case` for PostgreSQL database column names, and map them to `camelCase` in Drizzle if needed for TypeScript.
6. **SECURITY BY DESIGN:** You must design schemas that support Field-Level Encryption (FLE) and Zero-Knowledge Proofs as detailed in the `Security-Compliance` skill. Provide columns for hashed values, initialization vectors (IVs), and encrypted payloads when handling sensitive data. Do not use plain `varchar` for SSNs or passwords.
