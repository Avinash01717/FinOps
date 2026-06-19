// GCP FinOps Dashboard Application Logic
const API_BASE = "http://127.0.0.1:8000/api";

// Global chart references
let trendsChartInstance = null;
let breakdownChartInstance = null;

// Initialize Dashboard
document.addEventListener("DOMContentLoaded", () => {
    loadSummary();
    loadCostTrends();
    loadServiceBreakdown();
    loadAlerts();
});

// Helper: Format numbers as USD currency
function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    }).format(value);
}

// 1. Load GCP Summary KPI Cards
async function loadSummary() {
    try {
        const response = await fetch(`${API_BASE}/costs/summary`);
        if (!response.ok) throw new Error("Failed to fetch cost summary.");
        const data = await response.json();

        document.getElementById("kpi-gcp-90d").innerText = formatCurrency(data.gcp_total_cost_90d);
        document.getElementById("kpi-gcp-30d").innerText = formatCurrency(data.gcp_total_cost_30d);
        document.getElementById("kpi-wasted-spend").innerText = formatCurrency(data.total_wasted_monthly);
        document.getElementById("active-alerts-count").innerText = data.active_alerts_count;
    } catch (error) {
        console.error("Error loading summary KPIs:", error);
    }
}

// 2. Load and Render GCP Daily Cost Trends Line Chart
async function loadCostTrends() {
    const days = document.getElementById("trends-lookback").value;
    try {
        const response = await fetch(`${API_BASE}/costs/trends?days=${days}`);
        if (!response.ok) throw new Error("Failed to fetch cost trends.");
        const trends = await response.json();

        const labels = trends.map(t => t.date);
        const costs = trends.map(t => t.cost);

        const ctx = document.getElementById("costTrendsChart").getContext("2d");

        if (trendsChartInstance) {
            trendsChartInstance.destroy();
        }

        trendsChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'GCP Spend',
                        data: costs,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        tension: 0.3,
                        borderWidth: 3,
                        pointRadius: 2,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false // Only 1 dataset, legend is redundant
                    },
                    tooltip: {
                        backgroundColor: '#161d2d',
                        titleColor: '#fff',
                        bodyColor: '#f3f4f6',
                        borderColor: 'rgba(255, 255, 255, 0.08)',
                        borderWidth: 1,
                        bodyFont: { family: 'Outfit' }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#9ca3af', font: { family: 'Outfit' }, maxTicksLimit: 8 }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: {
                            color: '#9ca3af',
                            font: { family: 'Outfit' },
                            callback: (value) => '$' + value
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error("Error loading cost trends chart:", error);
    }
}

// 3. Load and Render GCP Service Spend Breakdown Doughnut Chart
async function loadServiceBreakdown() {
    const days = document.getElementById("breakdown-days").value;
    try {
        const response = await fetch(`${API_BASE}/costs/breakdown?days=${days}`);
        if (!response.ok) throw new Error("Failed to fetch service breakdown.");
        const breakdown = await response.json();

        const labels = breakdown.map(b => b.service);
        const costs = breakdown.map(b => b.cost);

        const ctx = document.getElementById("serviceBreakdownChart").getContext("2d");

        if (breakdownChartInstance) {
            breakdownChartInstance.destroy();
        }

        const colorPalette = [
            '#4f46e5', // Indigo
            '#3b82f6', // GCP Blue
            '#10b981', // GCP Green
            '#f59e0b', // GCP Yellow
            '#ef4444', // GCP Red
            '#8b5cf6', // Purple
            '#06b6d4'  // Cyan
        ];

        breakdownChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: costs,
                    backgroundColor: colorPalette,
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: '#9ca3af',
                            font: { family: 'Outfit', size: 11 },
                            boxWidth: 12
                        }
                    },
                    tooltip: {
                        backgroundColor: '#161d2d',
                        bodyFont: { family: 'Outfit' },
                        callbacks: {
                            label: function(context) {
                                return ` ${context.label}: ${formatCurrency(context.raw)}`;
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error("Error loading service breakdown chart:", error);
    }
}

// 4. Load Active GCE VM Idle and Right-Sizing Alerts
async function loadAlerts() {
    const tbody = document.getElementById("alerts-table-body");
    try {
        const response = await fetch(`${API_BASE}/alerts?status=Active`);
        if (!response.ok) throw new Error("Failed to fetch alerts.");
        const alerts = await response.json();

        tbody.innerHTML = "";

        if (alerts.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="loading-row">🟢 Zero optimization targets detected. Your GCP VM environment is fully optimized!</td></tr>`;
            return;
        }

        alerts.forEach(alert => {
            const row = document.createElement("tr");
            row.setAttribute("id", `alert-row-${alert.id}`);

            // Determine display recommendations and color badges
            let recBadge = "";
            if (alert.resource_type.includes("Terminate")) {
                recBadge = `<span class="badge" style="background-color: rgba(239, 68, 68, 0.15); color: #f87171;">🔴 Terminate (Idle)</span>`;
            } else {
                recBadge = `<span class="badge" style="background-color: rgba(245, 158, 11, 0.15); color: #fbbf24;">🟡 Downsize (Overprovisioned)</span>`;
            }

            row.innerHTML = `
                <td style="font-weight: 600;">${alert.resource_name}</td>
                <td>${recBadge}</td>
                <td style="color: var(--text-secondary); font-family: monospace;">${alert.region}</td>
                <td style="font-weight: 600; color: #f87171;">${alert.average_cpu}%</td>
                <td>${formatCurrency(alert.monthly_cost)}</td>
                <td style="font-weight: 700; color: #10b981;">${formatCurrency(alert.potential_savings)}</td>
                <td>
                    <button class="btn-dismiss" onclick="dismissAlert(${alert.id})">Dismiss</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading-row" style="color: #ef4444;">⚠️ Error loading recommendations from API server.</td></tr>`;
        console.error("Error loading alerts table:", error);
    }
}

// 5. Dismiss Alert (Status Update)
async function dismissAlert(id) {
    const row = document.getElementById(`alert-row-${id}`);
    try {
        const response = await fetch(`${API_BASE}/alerts/${id}/status`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ status: "Dismissed" })
        });

        if (!response.ok) throw new Error("Failed to update status on server.");

        if (row) {
            row.classList.add("fade-out");
            
            setTimeout(() => {
                row.remove();
                
                const tbody = document.getElementById("alerts-table-body");
                if (tbody.children.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="7" class="loading-row">🟢 Zero optimization targets detected. Your GCP VM environment is fully optimized!</td></tr>`;
                }
            }, 500);
        }

        // Refresh stats card counts
        loadSummary();

    } catch (error) {
        alert("Could not dismiss the alert. Please verify the backend API server is running.");
        console.error("Error dismissing alert:", error);
    }
}
