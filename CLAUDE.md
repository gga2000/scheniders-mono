# Project: scheniders-mono

## Knowledge Graph RAG (graphify-out)

A pre-built knowledge graph of this codebase lives at [graphify-out/](graphify-out/). Use it as a RAG system for discovery and reasoning about code structure before falling back to Glob/Grep sweeps.

**When to use it:**
- Locating where a concept lives ("where is lead conversion handled?")
- Understanding relationships between modules, components, or API routes
- Finding all files in a functional cluster (e.g. "admin leads", "storefront checkout")
- Getting a high-level map of a subsystem before editing

**Files and how to query them:**
- [graphify-out/GRAPH_REPORT.md](graphify-out/GRAPH_REPORT.md) — start here. Human-readable overview with 79 community hubs (e.g. "Admin Leads & Phone Normalization", "Storefront + Store Builder", "Admin API Routes"). Read relevant sections with Read.
- [graphify-out/graph.json](graphify-out/graph.json) — full graph: 4211 nodes, 19223 edges. Use Grep on it to find node names, edges, or symbol relationships. Nodes represent files/symbols; edges represent imports/calls/references.
- [graphify-out/manifest.json](graphify-out/manifest.json) — indexed file inventory with timestamps. Grep to confirm a file is covered.
- [graphify-out/index.scip](graphify-out/index.scip) — SCIP code index (binary). For symbol-level precision; only query if needed via scip CLI.
- [graphify-out/graph.html](graphify-out/graph.html) — visual graph (for the user, not for you).
- [graphify-out/cache/](graphify-out/cache/) — internal cache, ignore.

**Query workflow:**
1. Read GRAPH_REPORT.md communities to identify the relevant cluster.
2. Grep graph.json for specific node names / edge types to get exact file paths and relationships.
3. Read the resulting source files directly.

**Caveat:** the graph is a snapshot (dated 2026-04-14 in the report). If results mention files/symbols, verify they still exist in the current tree before acting on them — trust the live code over the graph when they conflict.
