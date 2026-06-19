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

## 5. Multi-Cloud Billing Integration Services
- **What it does**: Implemented `aws_billing.py` to mock the AWS Cost Explorer API structure, and `gcp_billing.py` to run real SQL aggregation queries on GCP's BigQuery billing dataset.
- **Engineering Rationale**: Using a mockup for AWS is a cost-control guardrail (avoiding the $0.01/call AWS charge). The GCP billing integration uses a production fallback pattern: if the BigQuery tables haven't been exported yet (which has a 24h delay), it falls back to a synthetic generator automatically. This ensures high availability and a seamless developer setup experience.

## 6. GCP Cloud Monitoring Idle VM Detector
- **What it does**: Queries the real GCP Cloud Monitoring API for GCE CPU utilization metrics (`cpu/utilization`) over a 7-day lookback window, flagging any instance with an average CPU under 5% as idle in MySQL.
- **Engineering Rationale**: Out-of-the-box system metrics (like CPU) are free to query in GCP Monitoring. By extracting VM metadata directly from the metric time series labels, we avoid having to call additional compute APIs, streamlining the credential scopes.

## 7. Automated Cost Ingestion Pipeline
- **What it does**: Orchestrates the daily pipeline through `fetch_daily_costs.py` by pulling cost datasets from AWS (mock) and GCP (BigQuery), resolving duplicate records via SQL upserts, and executing the VM idle resource scan.
- **Engineering Rationale**: Combining cost aggregation and optimization detection into a single scheduled script mirrors enterprise cron setups (e.g. Airflow or Cloud Scheduler). Upsert logic (checking for existing rows before inserting) makes the pipeline idempotent, meaning it can be re-run safely for any date range without duplicating database rows.

## 8. FastAPI API Layer & Routers
- **What it does**: Exposes summary KPIs, daily cost trends (AWS vs. GCP), service spending breakdowns, and VM idle optimization alerts through RESTful API endpoints. Configures Cross-Origin Resource Sharing (CORS) middleware to allow browser calls from local hosts.
- **Engineering Rationale**: The API layer serves as a decoupled bridge between the MySQL storage and the presentation frontend. Utilizing Pydantic schemas enforces strict type safety and request/response validation, while the CORS configuration is necessary to prevent local development origins (like a frontend running on port 5500 or double-clicked `index.html`) from being blocked by browser security policies.

## 9. Premium Frontend Web Dashboard
- **What it does**: A fully responsive dark-mode portal displaying combined spend, AWS vs. GCP daily cost trends using a Chart.js Line chart, service distribution using a Doughnut chart, and active idle VM optimization recommendations.
- **Engineering Rationale**: Designed with Outfit typography and CSS glassmorphism, the interface provides a premium, production-ready aesthetic for portfolio reviews. Integrating a reactive update pattern (clicking "Dismiss" sends a PUT request to update the MySQL alert state, triggers a smooth CSS row translation slide out, and immediately re-queries high-level KPI cards to update metrics without reloading the page) delivers a highly responsive user experience.

## 10. GCP GCE VM Live Provisioning & Real-Time Monitoring
- **What it does**: Provisioned a live GCP `e2-micro` VM instance (`gcp-monitored-vm`) and updated the ingestion pipeline to query its real-time CPU utilization metrics from the GCP Cloud Monitoring API. Upgraded the detection logic to run right-sizing analysis (flagging CPU < 5% as Terminate, and 5% <= CPU < 15% as Downsize).
- **Engineering Rationale**: Transitioning to a dedicated, live GCP architecture provides a high-fidelity showcase of real-time cloud data gathering. Integrating right-sizing thresholds mimics enterprise FinOps workflows (e.g. AWS Compute Optimizer or GCP Active Assist), demonstrating that the system not only flags wasted resources but recommends a concrete, actionable resizing target (saving 50% vs. 100% of cost).

