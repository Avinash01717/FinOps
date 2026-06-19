# Interview Preparation & Component Notes

This document contains brief summaries of each component in the FinOps Dashboard project, explaining the engineering rationale and design choices. Use this to prepare for interview questions.

---

## 1. Project Initialization & Structure
- **What it does**: Establishes the repository structure, including separate directories for backend, frontend, and PowerBI, along with a Git configuration and architecture documents.
- **Engineering Rationale**: Starting with a clean directory hierarchy and a strict `.gitignore` prevents secrets leak (such as GCP service accounts or DB credentials) from day one. Structuring documents early establishes the blueprint for multi-cloud integration, synthetic data strategies, and cost-control constraints.
