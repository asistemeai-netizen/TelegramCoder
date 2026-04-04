# Global Project Rules & Context

This project serves as the base template for all our team's development. It establishes the architectural boundaries and AI agent instructions to maintain consistency across the entire monorepo or standard project structures.

## 🤖 AI Directives

To ensure the highest code quality and adherence to the team's standards, all AI interactions MUST follow these rules:

> [!IMPORTANT]
> **Use the Knowledge Base:** Before implementing domain logic, the Agent MUST search the existing Knowledge Items (KIs) to maintain consistency with existing data models and practices.
> **Follow Pre-defined Skills and Check for New Ones:** Adhere strictly to the core skills (Airbnb Style Guide, React Component Architecture, Clean Code patterns) located in the `.agent/skill` directory. Furthermore, the Agent MUST proactively search the `.agent/skill` directory for any additional or newly added skills that match the user's current request before proceeding with code generation or analysis.
> **Use Context7 MCP for Research:** For any coding task involving external libraries, frameworks, or languages, you MUST use the `context7` MCP server (if available) to retrieve up-to-date documentation and code examples before generating complex implementations.

- **Stack Context:** Always leverage Next.js (Frontend), Hono (API/Backend), and Drizzle ORM (PostgreSQL Database).
- **Propose, Don't Guess:** If the architecture logic is not clear or a complex database schema change is required, the AI must ask the user for confirmation rather than guessing.

## 🏗️ Project Overview & Stack

- **Purpose:** Base template for scaffolding new applications, ERPs, CRMs, and internal tools.
- **Architecture:** Monorepo or Modular Fullstack application.
  - `Frontend`: Next.js (React) + Tailwind CSS + unified design system.
  - `Backend`: Hono API server.
  - `Database`: Drizzle ORM (PostgreSQL).
- **Core Tooling:** 
  - **Package Manager:** `pnpm` MUST be used for tracking, workspaces, and lockfiles. Do not use `npm` or `yarn`.
  - **Version Control:** `git` conventions must be followed. Every project must have a properly configured `.gitignore`.
  - **Containerization:** All projects MUST be containerized. They must include a `Dockerfile` and a `docker-compose.yml` for local development.
  - **Environment Variables:** Each project must ship with a `.env.example` defining required variables. Agents must remind users to set their `.env` files locally.

## 📜 Development Conventions

### Coding Standards
- **Immutability and Functional Patterns:** Strict adherence to functional programming paradigms inside React components and data transformation logic.
- **Error Handling:** APIs must fail gracefully and return standardized error objects.
- **Transactions:** Complex nested JSON payloads must use exact 'Cascading Relational Insert' patterns. 

### Database & Migrations
- Use Drizzle strictly. 
- Follow the manual migrations strategy or automated Drizzle workflows as dictated by the team's established pattern.

### UI / UX
- Prioritize visual excellence.
- Use standard design tokens, unified card utilities (`card-pastel`), and maintain premium and consistent layouts across the application.
