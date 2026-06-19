# FinOps Dashboard

A multi-cloud (AWS + GCP) cost monitoring and idle-resource-detection tool. This project is built as a portfolio showcase for MNC interviews, demonstrating cloud cost optimization, systems architecture, FastAPI backend development, database management, and UI reporting.

## Key Features
- **Multi-Cloud Data Aggregation**: Synthesizes and stores daily cost metrics for AWS and GCP resources.
- **Cost Control Guardrails**: Mocked AWS billing API calls (sourced from synthetic generator) to prevent real Cost Explorer charges ($0.01/call) while mimicking API shapes exactly.
- **Idle Resource Detection**: GCP Cloud Monitoring is used to analyze VM utilization and detect idle VMs (CPU < 5%) to identify wasted spend.
- **Modern Dashboard**: Responsive HTML/CSS/JS frontend utilizing Chart.js.
- **PowerBI Integration**: Analytics ready by connecting directly to the MySQL backend.

## Tech Stack
- **Backend**: FastAPI, SQLAlchemy, MySQL
- **Frontend**: Vanilla HTML/CSS/JS + Chart.js
- **Cloud**: AWS (IAM Access Control Patterns), GCP (BigQuery billing export, Cloud Monitoring, Compute Engine, VPC/Firewalls)

## Project Structure
```text
finops-dashboard/
├── backend/app/
│   ├── main.py, config.py, database.py, models.py, schemas.py
│   ├── routers/ (costs.py, alerts.py)
│   ├── services/ (gcp_billing.py, aws_billing.py, idle_detector.py)
│   └── scripts/ (generate_synthetic_costs.py, fetch_daily_costs.py)
├── frontend/ (index.html, css/style.css, js/dashboard.js)
├── powerbi/
├── docs/ (architecture.md, notes.md)
└── .gitignore, README.md
```
