// FinOps Dashboard Application Logic
const API_BASE = "http://127.0.0.1:8000/api";

// Global chart references to allow clean redraws on filter changes
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

// 1. Load Summary Card KPIs
async function loadSummary() {
    try {
        const response = await fetch(`${API_BASE}/costs/summary`);
        if (!response.ok) throw new Error("Failed to fetch cost summary.");
        const data = await response.json();

        const combined = data.aws_total_cost_90d + data.gcp_total_cost_90d;

        document.getElementById("kpi-combined-spend").innerText = formatCurrency(combined);
        document.getElementById("kpi-aws-spend").innerText = formatCurrency(data.aws_total_cost_90d);
        document.getElementById("kpi-gcp-spend").innerText = formatCurrency(data.gcp_total_cost_90d);
        document.getElementById("kpi-wasted-spend").innerText = formatCurrency(data.total_wasted_monthly);
        document.getElementById("active-alerts-count").innerText = data.active_alerts_count;
    } catch (error) {
        console.error("Error loading summary KPIs:", error);
    }
}

// 2. Load and Render Daily Cost Trends Line Chart
async function loadCostTrends() {
    const days = document.getElementById("trends-lookback").value;
    try {
        const response = await fetch(`${API_BASE}/costs/trends?days=${days}`);
        if (!response.ok) throw new Error("Failed to fetch cost trends.");
        const trends = await response.json();

        // Extract dates and provider-specific costs
        const labels = trends.map(t => t.date);
        const awsCosts = trends.map(t => t.AWS);
        const gcpCosts = trends.map(t => t.GCP);

        const ctx = document.getElementById("costTrendsChart").getContext("2d");

        // Destroy previous instance to avoid visual glitch overlays
        if (trendsChartInstance) {
            trendsChartInstance.destroy();
        }

        trendsChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Google Cloud (GCP)',
                        data: gcpCosts,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        tension: 0.3,
                        borderWidth: 3,
                        pointRadius: 2,
                    },
                    {
                        label: 'Amazon Web Services (AWS)',
                        data: awsCosts,
                        borderColor: '#ff9900',
                        backgroundColor: 'rgba(255, 153, 0, 0.1)',
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
                        labels: {
                            color: '#9ca3af',
                            font: { family: 'Outfit', size: 12 }
                        }
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

// 3. Load and Render Service Spend Doughnut Chart
async function loadServiceBreakdown() {
    const provider = document.getElementById("breakdown-provider").value;
    try {
        const response = await fetch(`${API_BASE}/costs/breakdown?provider=${provider}&days=90`);
        if (!response.ok) throw new Error("Failed to fetch service breakdown.");
        const breakdown = await response.json();

        const labels = breakdown.map(b => b.service);
        const costs = breakdown.map(b => b.cost);

        const ctx = document.getElementById("serviceBreakdownChart").getContext("2d");

        if (breakdownChartInstance) {
            breakdownChartInstance.destroy();
        }

        // Distinct, professional color palette for cloud services
        const colorPalette = [
            '#6366f1', // Indigo
            '#3b82f6', // Blue
            '#f59e0b', // Amber/Orange
            '#10b981', // Emerald
            '#ec4899', // Pink
            '#8b5cf6', // Violet
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

// 4. Load Active GCE VM Recommendations Table
async function loadAlerts() {
    const tbody = document.getElementById("alerts-table-body");
    try {
        const response = await fetch(`${API_BASE}/alerts?status=Active`);
        if (!response.ok) throw new Error("Failed to fetch alerts.");
        const alerts = await response.json();

        tbody.innerHTML = ""; // Clear loader row

        if (alerts.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="loading-row">🟢 Zero idle VMs detected. Your cloud environment is fully optimized!</td></tr>`;
            return;
        }

        alerts.forEach(alert => {
            const row = document.createElement("tr");
            row.setAttribute("id", `alert-row-${alert.id}`);

            row.innerHTML = `
                <td style="font-weight: 600;">${alert.resource_name}</td>
                <td><span class="badge" style="background-color: rgba(59, 130, 246, 0.1); color: #3b82f6;">${alert.provider}</span></td>
                <td style="color: var(--text-secondary); font-family: monospace;">${alert.region}</td>
                <td style="font-weight: 600; color: #f87171;">${alert.average_cpu}%</td>
                <td>${formatCurrency(alert.monthly_cost)}</td>
                <td style="font-weight: 700; color: #f87171;">${formatCurrency(alert.potential_savings)}</td>
                <td>
                    <button class="btn-dismiss" onclick="dismissAlert(${alert.id})">Dismiss</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading-row" style="color: #ef4444;">⚠️ Error loading alerts from API server.</td></tr>`;
        console.error("Error loading alerts table:", error);
    }
}

// 5. Dismiss Alert (Interactive Status Update)
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

        // Add CSS class to trigger fade-out and slide animation
        if (row) {
            row.classList.add("fade-out");
            
            // Wait for animation duration (500ms) before removing from DOM
            setTimeout(() => {
                row.remove();
                
                // If table is now empty, display empty status message
                const tbody = document.getElementById("alerts-table-body");
                if (tbody.children.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="7" class="loading-row">🟢 Zero idle VMs detected. Your cloud environment is fully optimized!</td></tr>`;
                }
            }, 500);
        }

        // Re-load high-level summary stats in real time (recalculates wasted cost immediately)
        loadSummary();

    } catch (error) {
        alert("Could not dismiss the alert. Please verify the backend API server is running.");
        console.error("Error dismissing alert:", error);
    }
}
