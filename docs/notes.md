# Interview Preparation & Component Notes

This document contains brief summaries of each component in the FinOps Dashboard project, explaining the engineering rationale and design choices. Use this to prepare for interview questions.

---

## 1. Project Initialization & Structure
- **What it does**: Establishes the repository structure, including separate directories for backend, frontend, and PowerBI, along with a Git configuration and architecture documents.
- **Engineering Rationale**: Starting with a clean directory hierarchy and a strict `.gitignore` prevents secrets leak (such as GCP service accounts or DB credentials) from day one. Structuring documents early establishes the blueprint for multi-cloud integration, synthetic data strategies, and cost-control constraints.

## 2. IAM & Least-Privilege Security Setup
- **What it does**: Configured a GCP service account with project-level `BigQuery Job User` and `Monitoring Viewer` roles, and scoped `BigQuery Data Viewer` specifically to our billing dataset using dataset ACLs. Also created a reference read-only AWS IAM policy for the Cost Explorer API (`ce:GetCostAndUsage`).
- **Engineering Rationale**: Demonstrates the principle of least privilege in multi-cloud security. Scoping BigQuery access to the dataset level prevents the backend service account from accessing other project resources. Project-level Job User role is required because BigQuery queries run as jobs within the project boundary, not the dataset.

## 3. Database Schema & SQLAlchemy Models
- **What it does**: Implemented `daily_costs` and `idle_resource_alerts` tables in MySQL via SQLAlchemy, including indices on `provider` and `date`.
- **Engineering Rationale**: Creating a structured schema with indexing on query filters (like dates and providers) ensures fast lookup performance for cost trend dashboards and queries. Separating billing data from resource optimization alerts maintains a clean relational separation of concerns.

## 4. Synthetic Data Generation Engine
- **What it does**: Generates 90 days of daily cost records across AWS and GCP services with realistic spend patterns and random fluctuations, along with active idle GCE VM alerts.
- **Engineering Rationale**: Provides immediate, realistic trend data for local testing and visualization. Spikes in BigQuery costs and weekend backup increases for S3/RDS mimic real enterprise environments, making dashboard demonstrations highly compelling in interviews without generating any cloud provider costs.
