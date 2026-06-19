// GCP Live Resource Monitor Application Logic
const API_BASE = "http://127.0.0.1:8000/api";

// Global chart references
let cpuTrendsChartInstance = null;
let costBreakdownChartInstance = null;

// Initialize Dashboard
document.addEventListener("DOMContentLoaded", () => {
    refreshDashboard();
});

// Helper: Format numbers as USD currency
function formatCurrency(value, decimalDigits = 2) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: decimalDigits
    }).format(value);
}

// Force Refresh all components
function refreshDashboard() {
    loadSummary();
    loadCostTrends();
    loadServiceBreakdown();
    loadAlerts();
}

// 1. Load Live Summary Burn Rate KPIs
async function loadSummary() {
    try {
        const response = await fetch(`${API_BASE}/costs/summary`);
        if (!response.ok) throw new Error("Failed to fetch summary.");
        const data = await response.json();

        // format hourly burn rate with 4 decimals to make e2-micro cost visible ($0.0101)
        document.getElementById("kpi-hourly-burn").innerText = formatCurrency(data.gcp_hourly_burn_rate, 4);
        document.getElementById("kpi-daily-burn").innerText = formatCurrency(data.gcp_daily_burn_rate, 2);
        document.getElementById("kpi-wasted-spend").innerText = formatCurrency(data.total_wasted_monthly, 2);
        document.getElementById("active-alerts-count").innerText = data.active_alerts_count;
    } catch (error) {
        console.error("Error loading summary KPIs:", error);
    }
}

// 2. Load and Render GCE VM Live CPU Utilization History Line Chart
async function loadCostTrends() {
    try {
        const response = await fetch(`${API_BASE}/costs/trends`);
        if (!response.ok) throw new Error("Failed to fetch CPU trends.");
        const trends = await response.json();

        const labels = trends.map(t => t.time);
        const cpuData = trends.map(t => t.cpu);

        // Update top-right live value indicator
        if (cpuData.length > 0) {
            const latestCpu = cpuData[cpuData.length - 1];
            document.getElementById("live-cpu-val").innerText = `${latestCpu.toFixed(1)}% CPU`;
        }

        const ctx = document.getElementById("costTrendsChart").getContext("2d");

        if (cpuTrendsChartInstance) {
            cpuTrendsChartInstance.destroy();
        }

        cpuTrendsChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'GCE VM CPU Utilization (%)',
                        data: cpuData,
                        borderColor: '#10b981', // green for CPU performance
                        backgroundColor: 'rgba(16, 185, 129, 0.05)',
                        fill: true,
                        tension: 0.3,
                        borderWidth: 2,
                        pointRadius: 3,
                        pointBackgroundColor: '#10b981'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: '#161d2d',
                        titleColor: '#fff',
                        bodyColor: '#f3f4f6',
                        borderColor: 'rgba(255, 255, 255, 0.08)',
                        borderWidth: 1,
                        bodyFont: { family: 'Outfit' },
                        callbacks: {
                            label: function(context) {
                                return ` CPU: ${context.raw.toFixed(2)}%`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.03)' },
                        ticks: { color: '#9ca3af', font: { family: 'Outfit', size: 11 }, maxTicksLimit: 12 }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        suggestedMin: 0,
                        suggestedMax: 100,
                        ticks: {
                            color: '#9ca3af',
                            font: { family: 'Outfit', size: 11 },
                            callback: (value) => value + '%'
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error("Error loading CPU trends chart:", error);
    }
}

// 3. Load and Render GCE VM Live Daily Cost Distribution Chart
async function loadServiceBreakdown() {
    try {
        const response = await fetch(`${API_BASE}/costs/breakdown`);
        if (!response.ok) throw new Error("Failed to fetch cost breakdown.");
        const breakdown = await response.json();

        const labels = breakdown.map(b => b.service);
        const costs = breakdown.map(b => b.cost);

        const ctx = document.getElementById("serviceBreakdownChart").getContext("2d");

        if (costBreakdownChartInstance) {
            costBreakdownChartInstance.destroy();
        }

        const colorPalette = [
            '#3b82f6', // GCP Blue
            '#6366f1', // Indigo
            '#8b5cf6', // Violet
            '#10b981', // Emerald
            '#f59e0b', // Yellow
            '#ef4444'  // Red
        ];

        costBreakdownChartInstance = new Chart(ctx, {
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
                        position: 'bottom',
                        labels: {
                            color: '#9ca3af',
                            font: { family: 'Outfit', size: 10 },
                            boxWidth: 8,
                            padding: 10
                        }
                    },
                    tooltip: {
                        backgroundColor: '#161d2d',
                        bodyFont: { family: 'Outfit' },
                        callbacks: {
                            label: function(context) {
                                return ` Daily: ${formatCurrency(context.raw)}`;
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error("Error loading daily cost distribution chart:", error);
    }
}

// 4. Load Live GCE VM Inventory Table
async function loadAlerts() {
    const tbody = document.getElementById("alerts-table-body");
    try {
        const response = await fetch(`${API_BASE}/costs/instances`);
        if (!response.ok) throw new Error("Failed to fetch live instances.");
        const instances = await response.json();

        tbody.innerHTML = "";

        if (instances.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="loading-row">⚠️ No Compute Engine VM instances found in zone asia-south1-a.</td></tr>`;
            return;
        }

        instances.forEach(vm => {
            const row = document.createElement("tr");
            row.setAttribute("id", `alert-row-${vm.instance_id}`);

            // Status Badge
            let statusBadge = "";
            if (vm.status === "RUNNING") {
                statusBadge = `<span class="status-badge online" style="padding: 0.1rem 0.4rem; font-size: 0.75rem;">RUNNING</span>`;
            } else {
                statusBadge = `<span class="badge" style="background-color: rgba(107, 114, 128, 0.15); color: #9ca3af; font-size: 0.75rem; padding: 0.1rem 0.4rem;">${vm.status}</span>`;
            }

            // Recommendation Badge
            let recBadge = "";
            let actionBtn = "";

            if (vm.recommendation === "Terminate (Idle)") {
                recBadge = `<span class="badge" style="background-color: rgba(239, 68, 68, 0.15); color: #f87171;">🔴 Terminate (Idle)</span>`;
                actionBtn = `<button class="btn-dismiss" onclick="dismissLiveVM('${vm.instance_id}')">Dismiss</button>`;
            } else if (vm.recommendation === "Downsize (Overprovisioned)") {
                recBadge = `<span class="badge" style="background-color: rgba(245, 158, 11, 0.15); color: #fbbf24;">🟡 Downsize</span>`;
                actionBtn = `<button class="btn-dismiss" onclick="dismissLiveVM('${vm.instance_id}')">Dismiss</button>`;
            } else if (vm.recommendation === "Optimized (Dismissed)") {
                recBadge = `<span class="badge" style="background-color: rgba(59, 130, 246, 0.15); color: #60a5fa;">🔵 Optimized (Dismissed)</span>`;
                actionBtn = `<span style="color: var(--text-muted); font-size: 0.8rem;">Dismissed</span>`;
            } else {
                recBadge = `<span class="badge" style="background-color: rgba(16, 185, 129, 0.15); color: #34d399;">🟢 Optimized</span>`;
                actionBtn = `<span style="color: var(--text-muted); font-size: 0.85rem;">✅ Optimal</span>`;
            }

            row.innerHTML = `
                <td style="font-weight: 600;">${vm.name}</td>
                <td style="font-family: monospace; font-size: 0.85rem;">${vm.machine_type}</td>
                <td style="color: var(--text-secondary); font-family: monospace; font-size: 0.85rem;">${vm.zone}</td>
                <td>${statusBadge}</td>
                <td style="font-weight: 600; color: ${vm.cpu_utilization < 15.0 ? '#f87171' : '#34d399'};">${vm.cpu_utilization}%</td>
                <td>${formatCurrency(vm.daily_cost)}</td>
                <td>${recBadge}</td>
                <td>${actionBtn}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="8" class="loading-row" style="color: #ef4444;">⚠️ Error polling active GCE instances. Please verify server connectivity.</td></tr>`;
        console.error("Error loading instances table:", error);
    }
}

// 5. Dismiss recommendation alert for a specific VM
async function dismissLiveVM(instanceId) {
    const row = document.getElementById(`alert-row-${instanceId}`);
    try {
        // Find if this alert ID is in the DB first by querying /alerts. 
        // Or we can just send the PUT request to updates/create a dismissed record in MySQL.
        // We call a PUT endpoint to updates our local alert table.
        // Since we are referencing by instanceId, we fetch alerts to locate the DB ID.
        const alertsResponse = await fetch(`${API_BASE}/alerts`);
        if (!alertsResponse.ok) throw new Error("Failed to fetch alerts list.");
        const alertsList = await alertsResponse.json();
        
        const activeAlert = alertsList.find(a => a.resource_id === instanceId);
        
        if (!activeAlert) {
            alert("This VM alert is already resolved or not active in the database.");
            return;
        }

        const response = await fetch(`${API_BASE}/alerts/${activeAlert.id}/status`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ status: "Dismissed" })
        });

        if (!response.ok) throw new Error("Failed to update status on server.");

        // Add class to animate slide out
        if (row) {
            row.classList.add("fade-out");
            
            // Re-render table and cards after animation completes
            setTimeout(() => {
                refreshDashboard();
            }, 500);
        }

    } catch (error) {
        alert("Could not dismiss GCE VM alert. Please check your backend connection.");
        console.error("Error dismissing alert:", error);
    }
}
