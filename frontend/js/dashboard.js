// GCP Live Resource Monitor Application Logic
const API_BASE = "/api";

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
    const kpiPeriod = document.getElementById("kpi-period") ? document.getElementById("kpi-period").value : "live";
    const cpuPeriod = document.getElementById("cpu-period") ? document.getElementById("cpu-period").value : "live";
    const breakdownPeriod = document.getElementById("breakdown-period") ? document.getElementById("breakdown-period").value : "live";
    const vmPeriod = document.getElementById("vm-period") ? document.getElementById("vm-period").value : "live";
    const vpcPeriod = document.getElementById("vpc-period") ? document.getElementById("vpc-period").value : "live";
    const iamPeriod = document.getElementById("iam-period") ? document.getElementById("iam-period").value : "live";
    const bucketPeriod = document.getElementById("bucket-period") ? document.getElementById("bucket-period").value : "live";

    loadSummary(kpiPeriod);
    loadCostTrends(cpuPeriod);
    loadServiceBreakdown(breakdownPeriod);
    loadAlerts(vmPeriod);
    loadVPCs(vpcPeriod);
    loadIAM(iamPeriod);
    loadBuckets(bucketPeriod);
}

// 1. Load Live Summary Burn Rate KPIs or Historical Spend
async function loadSummary(period = "live") {
    const hourlyLabel = document.getElementById("kpi-hourly-label");
    const dailyLabel = document.getElementById("kpi-daily-label");
    const wastedLabel = document.getElementById("kpi-wasted-label");

    try {
        if (period === "live") {
            if (hourlyLabel) hourlyLabel.innerText = "Hourly Burn Rate";
            if (dailyLabel) dailyLabel.innerText = "Daily Burn Rate";
            if (wastedLabel) wastedLabel.innerText = "Est. Wasted (Monthly)";

            const response = await fetch(`${API_BASE}/costs/summary?t=${Date.now()}`);
            if (!response.ok) throw new Error("Failed to fetch summary.");
            const data = await response.json();

            document.getElementById("kpi-hourly-burn").innerText = formatCurrency(data.gcp_hourly_burn_rate, 4);
            document.getElementById("kpi-daily-burn").innerText = formatCurrency(data.gcp_daily_burn_rate, 2);
            document.getElementById("kpi-wasted-spend").innerText = formatCurrency(data.total_wasted_monthly, 2);
            document.getElementById("active-alerts-count").innerText = data.active_alerts_count;
        } else {
            if (hourlyLabel) hourlyLabel.innerText = "Total Period Spend";
            if (dailyLabel) dailyLabel.innerText = "Avg Daily Spend";
            if (wastedLabel) wastedLabel.innerText = "Wasted Spend";

            const response = await fetch(`${API_BASE}/costs/history?period=${period}&t=${Date.now()}`);
            if (!response.ok) throw new Error("Failed to fetch summary history.");
            const data = await response.json();

            document.getElementById("kpi-hourly-burn").innerText = formatCurrency(data.total_cost, 2);
            document.getElementById("kpi-daily-burn").innerText = formatCurrency(data.total_cost / (data.period_days || 1), 2);
            document.getElementById("kpi-wasted-spend").innerText = formatCurrency(data.wasted_spend, 2);
            document.getElementById("active-alerts-count").innerText = data.alerts_count;
        }
    } catch (error) {
        console.error("Error loading summary KPIs:", error);
    }
}

// 2. Load and Render GCE VM Live CPU Utilization History or Cost Trend Line Chart
async function loadCostTrends(period = "live") {
    try {
        const titleEl = document.getElementById("cpu-chart-title");
        const valEl = document.getElementById("live-cpu-val");
        
        let labels = [];
        let data = [];
        let datasetLabel = "";
        let borderColor = "";
        let backgroundColor = "";
        let pointColor = "";
        let ySuggestedMax = 100;
        let yTickCallback = (value) => value + '%';
        let tooltipCallback = function(context) {
            return ` CPU: ${context.raw.toFixed(2)}%`;
        };

        if (period === "live") {
            if (titleEl) titleEl.innerText = "Live VM CPU History (Last 2 Hours)";
            
            const response = await fetch(`${API_BASE}/costs/trends?t=${Date.now()}`);
            if (!response.ok) throw new Error("Failed to fetch CPU trends.");
            const trends = await response.json();

            labels = trends.map(t => t.time);
            data = trends.map(t => t.cpu);
            
            if (data.length > 0) {
                const latestCpu = data[data.length - 1];
                if (valEl) valEl.innerText = `${latestCpu.toFixed(1)}% CPU`;
            } else {
                if (valEl) valEl.innerText = "0.0% CPU";
            }
            
            datasetLabel = 'GCE VM CPU Utilization (%)';
            borderColor = '#10b981';
            backgroundColor = 'rgba(16, 185, 129, 0.05)';
            pointColor = '#10b981';
            ySuggestedMax = 100;
            yTickCallback = (value) => value + '%';
            tooltipCallback = function(context) {
                return ` CPU: ${context.raw.toFixed(2)}%`;
            };
        } else {
            const response = await fetch(`${API_BASE}/costs/history?period=${period}&t=${Date.now()}`);
            if (!response.ok) throw new Error("Failed to fetch cost history.");
            const history = await response.json();

            if (titleEl) titleEl.innerText = `Cost Trend (${history.period_label})`;
            if (valEl) valEl.innerText = `Total: ${formatCurrency(history.total_cost)}`;

            labels = history.daily_trend.map(t => t.date);
            data = history.daily_trend.map(t => t.cost);
            
            datasetLabel = 'Daily Cost ($ USD)';
            borderColor = '#3b82f6';
            backgroundColor = 'rgba(59, 130, 246, 0.05)';
            pointColor = '#3b82f6';
            ySuggestedMax = null; // scale automatically
            yTickCallback = (value) => '$' + value;
            tooltipCallback = function(context) {
                return ` Cost: ${formatCurrency(context.raw)}`;
            };
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
                        label: datasetLabel,
                        data: data,
                        borderColor: borderColor,
                        backgroundColor: backgroundColor,
                        fill: true,
                        tension: 0.3,
                        borderWidth: 2,
                        pointRadius: 3,
                        pointBackgroundColor: pointColor
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
                            label: tooltipCallback
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
                        suggestedMax: ySuggestedMax,
                        ticks: {
                            color: '#9ca3af',
                            font: { family: 'Outfit', size: 11 },
                            callback: yTickCallback
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error("Error loading CPU trends/cost trends chart:", error);
    }
}

// 3. Load and Render GCE VM Live Daily Cost Distribution Chart
async function loadServiceBreakdown(period = "live") {
    try {
        const titleEl = document.getElementById("breakdown-chart-title");
        let labels = [];
        let costs = [];

        if (period === "live") {
            if (titleEl) titleEl.innerText = "Daily Cost Distribution";
            const response = await fetch(`${API_BASE}/costs/breakdown?t=${Date.now()}`);
            if (!response.ok) throw new Error("Failed to fetch cost breakdown.");
            const breakdown = await response.json();

            labels = breakdown.map(b => b.service);
            costs = breakdown.map(b => b.cost);
        } else {
            const response = await fetch(`${API_BASE}/costs/history?period=${period}&t=${Date.now()}`);
            if (!response.ok) throw new Error("Failed to fetch service history breakdown.");
            const history = await response.json();

            if (titleEl) titleEl.innerText = `Cost Distribution (${history.period_label})`;
            labels = history.service_breakdown.map(b => b.service);
            costs = history.service_breakdown.map(b => b.cost);
        }

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
                                return ` Cost: ${formatCurrency(context.raw)}`;
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
async function loadAlerts(period = "live") {
    const tbody = document.getElementById("alerts-table-body");
    const costHeader = document.getElementById("vm-cost-col-header");
    
    // Update header label and multiplier based on selected period
    let multiplier = 1;
    if (costHeader) {
        if (period === "live") {
            costHeader.innerText = "Daily Cost";
        } else if (period === "yesterday") {
            costHeader.innerText = "Cost (Yesterday)";
        } else if (period === "1week") {
            costHeader.innerText = "Weekly Cost (Est)";
            multiplier = 7;
        } else if (period === "10days") {
            costHeader.innerText = "10-Day Cost (Est)";
            multiplier = 10;
        } else if (period === "1month") {
            costHeader.innerText = "Monthly Cost (Est)";
            multiplier = 30;
        }
    }

    try {
        const response = await fetch(`${API_BASE}/costs/instances?t=${Date.now()}`);
        if (!response.ok) throw new Error("Failed to fetch live instances.");
        const instances = await response.json();

        tbody.innerHTML = "";

        if (instances.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="loading-row">⚠️ No Compute Engine VM instances found.</td></tr>`;
            return;
        }

        instances.forEach(vm => {
            const row = document.createElement("tr");
            row.setAttribute("id", `alert-row-${vm.instance_id}`);

            // Status Badge
            let statusBadge = "";
            let lifecycleButtons = "";

            if (vm.status === "RUNNING") {
                statusBadge = `<span class="status-badge online" style="padding: 0.1rem 0.4rem; font-size: 0.75rem;">RUNNING</span>`;
                lifecycleButtons = `
                    <button class="btn-dismiss btn-stop" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; margin-right: 0.25rem;" onclick="controlVM('${vm.name}', '${vm.zone}', 'stop')">Stop</button>
                    <button class="btn-dismiss btn-delete" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; margin-right: 0.25rem;" onclick="controlVM('${vm.name}', '${vm.zone}', 'delete')">Delete</button>
                `;
            } else {
                statusBadge = `<span class="badge" style="background-color: rgba(107, 114, 128, 0.15); color: #9ca3af; font-size: 0.75rem; padding: 0.1rem 0.4rem;">${vm.status}</span>`;
                lifecycleButtons = `
                    <button class="btn-dismiss btn-start" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; margin-right: 0.25rem;" onclick="controlVM('${vm.name}', '${vm.zone}', 'start')">Start</button>
                    <button class="btn-dismiss btn-delete" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; margin-right: 0.25rem;" onclick="controlVM('${vm.name}', '${vm.zone}', 'delete')">Delete</button>
                `;
            }

            // Recommendation Badge
            let recBadge = "";
            let dismissBtn = "";

            if (vm.recommendation === "Terminate (Idle)") {
                recBadge = `<span class="badge" style="background-color: rgba(239, 68, 68, 0.15); color: #f87171;">🔴 Terminate (Idle)</span>`;
                dismissBtn = `<button class="btn-dismiss" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="dismissLiveVM('${vm.instance_id}')">Dismiss</button>`;
            } else if (vm.recommendation === "Downsize (Overprovisioned)") {
                recBadge = `<span class="badge" style="background-color: rgba(245, 158, 11, 0.15); color: #fbbf24;">🟡 Downsize</span>`;
                dismissBtn = `<button class="btn-dismiss" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="dismissLiveVM('${vm.instance_id}')">Dismiss</button>`;
            } else if (vm.recommendation === "Optimized (Dismissed)") {
                recBadge = `<span class="badge" style="background-color: rgba(59, 130, 246, 0.15); color: #60a5fa;">🔵 Optimized (Dismissed)</span>`;
                dismissBtn = `<span style="color: var(--text-muted); font-size: 0.75rem;">Dismissed</span>`;
            } else {
                recBadge = `<span class="badge" style="background-color: rgba(16, 185, 129, 0.15); color: #34d399;">🟢 Optimized</span>`;
                dismissBtn = `<span style="color: var(--text-muted); font-size: 0.75rem;">✅ Optimal</span>`;
            }

            row.innerHTML = `
                <td style="font-weight: 600;">${vm.name}</td>
                <td style="font-family: monospace; font-size: 0.85rem;">${vm.machine_type}</td>
                <td style="color: var(--text-secondary); font-family: monospace; font-size: 0.85rem;">${vm.zone}</td>
                <td>${statusBadge}</td>
                <td style="font-weight: 600; color: ${vm.cpu_utilization < 15.0 ? '#f87171' : '#34d399'};">${vm.cpu_utilization}%</td>
                <td>${formatCurrency(vm.daily_cost * multiplier)}</td>
                <td>${recBadge}</td>
                <td>
                    <div style="display: flex; align-items: center; justify-content: flex-start;">
                        ${lifecycleButtons}
                        ${dismissBtn}
                    </div>
                </td>
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
        const alertsResponse = await fetch(`/api/alerts?t=${Date.now()}`);
        if (!alertsResponse.ok) throw new Error("Failed to fetch alerts list.");
        const alertsList = await alertsResponse.json();
        
        const activeAlert = alertsList.find(a => a.resource_id === instanceId);
        
        if (!activeAlert) {
            alert("This VM alert is already resolved or not active in the database.");
            return;
        }

        const response = await fetch(`/api/alerts/${activeAlert.id}/status`, {
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
                refreshDashboard();
            }, 500);
        }

    } catch (error) {
        alert("Could not dismiss GCE VM alert. Please check your backend connection.");
        console.error("Error dismissing alert:", error);
    }
}

// 6. GCE VM Lifecycle management actions
async function controlVM(name, zone, action) {
    // Require explicit confirmation for both Stop and Delete
    if (action === 'stop') {
        const ok = confirm(`Stop VM '${name}'?\n\nThe VM will be shut down and stop incurring compute charges.\nYou can restart it later.`);
        if (!ok) return;
    } else if (action === 'delete') {
        const ok = confirm(`Delete VM '${name}'?\n\n⚠️ This cannot be undone. The instance and its boot disk will be permanently destroyed.`);
        if (!ok) return;
    }

    // Show loading state
    const tbody = document.getElementById("alerts-table-body");
    const row = Array.from(tbody.querySelectorAll("tr")).find(r => r.cells[0].innerText === name);
    let originalHtml = "";
    if (row) {
        originalHtml = row.innerHTML;
        row.innerHTML = `<td colspan="8" style="text-align: center; color: #60a5fa; padding: 0.8rem; font-size: 0.9rem;">⏳ Sending '${action}' command to GCP for "${name}"... This can take up to 20 seconds.</td>`;
    }

    try {
        let response;
        if (action === 'delete') {
            // Backend requires ?confirm=true to execute destructive action
            response = await fetch(`/api/gcp/vms?name=${name}&zone=${zone}&confirm=true`, { method: 'DELETE' });
        } else {
            response = await fetch(`/api/gcp/vms/${action}?name=${name}&zone=${zone}`, { method: 'POST' });
        }

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || `Failed to perform '${action}' on VM.`);
        }

        alert(`VM "${name}" successfully ${action}ed!`);
        refreshDashboard();
    } catch (error) {
        alert(`Error executing GCP command: ${error.message}`);
        console.error(error);
        if (row && originalHtml) {
            row.innerHTML = originalHtml;
        }
    }
}

// 7. Provision new GCE VM instance
async function submitCreateVM() {
    const nameInput = document.getElementById("new-vm-name");
    const zoneSelect = document.getElementById("new-vm-zone");
    const typeSelect = document.getElementById("new-vm-type");

    const name = nameInput.value.trim();
    const zone = zoneSelect.value;
    const machine_type = typeSelect.value;

    if (!name) {
        alert("Please enter a name for the VM.");
        return;
    }

    // Basic GCP VM name validation: lowercase alphanumeric and hyphens, start with letter
    if (!/^[a-z][a-z0-9-]{0,62}$/.test(name)) {
        alert("GCP VM names must start with a lowercase letter, followed by up to 62 lowercase letters, numbers, or hyphens.");
        return;
    }

    const submitBtn = document.querySelector("#vm-create-form button");
    const originalText = submitBtn.innerText;
    submitBtn.disabled = true;
    submitBtn.innerText = "Provisioning...";

    try {
        const response = await fetch("/api/gcp/vms/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, zone, machine_type })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Failed to create VM.");
        }

        alert(`GCP VM Instance "${name}" is being provisioned!`);
        nameInput.value = "";
        toggleForm("vm-create-form");
        refreshDashboard();
    } catch (error) {
        alert(`Error provisioning VM: ${error.message}`);
        console.error(error);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
    }
}

// 8. Load VPC Networks
async function loadVPCs(period = "live") {
    const tbody = document.getElementById("vpcs-table-body");
    const subtitle = document.querySelector("#vpcs .table-subtitle");
    
    if (subtitle) {
        if (period === "live") {
            subtitle.innerText = "Virtual Private Cloud networks and subnets configured in the project.";
        } else {
            const periodText = period === "yesterday" ? "Yesterday" : 
                               period === "1week" ? "Last 7 Days" : 
                               period === "10days" ? "Last 10 Days" : "Last 30 Days";
            subtitle.innerText = `Virtual Private Cloud networks active during the selected period (${periodText}).`;
        }
    }

    try {
        const response = await fetch(`/api/gcp/vpcs?t=${Date.now()}`);
        if (!response.ok) throw new Error("Failed to fetch VPC networks.");
        const vpcs = await response.json();

        tbody.innerHTML = "";

        if (vpcs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="loading-row">⚠️ No VPC networks found in the project.</td></tr>`;
            return;
        }

        vpcs.forEach(vpc => {
            const row = document.createElement("tr");
            
            let subnetsDisplay = vpc.subnetworks.length > 0
                ? vpc.subnetworks.slice(0, 3).join(", ") + (vpc.subnetworks.length > 3 ? "..." : "")
                : "None";

            row.innerHTML = `
                <td style="font-weight: 600;">${vpc.name}</td>
                <td style="font-family: monospace; font-size: 0.8rem; color: var(--text-secondary);">${vpc.id || 'N/A'}</td>
                <td style="font-family: monospace; font-size: 0.85rem;">${vpc.routing_config}</td>
                <td><span class="badge" style="background-color: ${vpc.auto_create_subnetworks ? 'rgba(16, 185, 129, 0.15); color: #34d399;' : 'rgba(245, 158, 11, 0.15); color: #fbbf24;'}">${vpc.auto_create_subnetworks ? 'AUTO' : 'CUSTOM'}</span></td>
                <td style="color: var(--text-secondary); font-size: 0.85rem;" title="${vpc.subnetworks.join('\n')}">${vpc.subnetworks.length} subnets (${subnetsDisplay})</td>
                <td>
                    <button class="btn-dismiss" style="background-color: #dc2626; padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="deleteVPC('${vpc.name}')">Delete</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6" class="loading-row" style="color: #ef4444;">⚠️ Error loading VPCs: ${error.message}</td></tr>`;
        console.error(error);
    }
}
// 9. Create Custom VPC Network
async function submitCreateVPC() {
    const nameInput = document.getElementById("new-vpc-name");
    const autoCheckbox = document.getElementById("vpc-auto-subnets");
    const name = nameInput.value.trim();
    const auto_create_subnetworks = autoCheckbox.checked;

    if (!name) {
        alert("Please enter a VPC network name.");
        return;
    }

    if (!/^[a-z][a-z0-9-]{0,62}$/.test(name)) {
        alert("VPC network names must start with a lowercase letter, followed by up to 62 lowercase letters, numbers, or hyphens.");
        return;
    }

    const submitBtn = document.querySelector("#vpc-create-form button");
    const originalText = submitBtn.innerText;
    submitBtn.disabled = true;
    submitBtn.innerText = "Creating...";

    try {
        const response = await fetch("/api/gcp/vpcs/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, auto_create_subnetworks })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Failed to create VPC.");
        }

        alert(`VPC network "${name}" is being created!`);
        nameInput.value = "";
        toggleForm("vpc-create-form");
        loadVPCs();
    } catch (error) {
        alert(`Error creating VPC: ${error.message}`);
        console.error(error);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
    }
}

// 10. Delete VPC Network
async function deleteVPC(name) {
    const ok = confirm(`Delete VPC Network '${name}'?\n\n⚠️ This cannot be undone. All subnets, firewall rules, and routes within this network will be permanently deleted.`);
    if (!ok) return;

    try {
        // Backend requires ?confirm=true to execute destructive action
        const response = await fetch(`/api/gcp/vpcs/${name}?confirm=true`, { method: "DELETE" });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Failed to delete VPC.");
        }
        alert(`Successfully deleted VPC network "${name}".`);
        loadVPCs();
    } catch (error) {
        alert(`Error deleting VPC: ${error.message}`);
        console.error(error);
    }
}

// 11. Load IAM Service Accounts
async function loadIAM(period = "live") {
    const tbody = document.getElementById("iam-table-body");
    const subtitle = document.querySelector("#iam .table-subtitle");
    
    if (subtitle) {
        if (period === "live") {
            subtitle.innerText = "Service account identities for resource delegation and application access.";
        } else {
            const periodText = period === "yesterday" ? "Yesterday" : 
                               period === "1week" ? "Last 7 Days" : 
                               period === "10days" ? "Last 10 Days" : "Last 30 Days";
            subtitle.innerText = `Service account identities active during the selected period (${periodText}).`;
        }
    }

    try {
        const response = await fetch(`/api/gcp/iam?t=${Date.now()}`);
        if (!response.ok) throw new Error("Failed to fetch IAM accounts.");
        const accounts = await response.json();

        tbody.innerHTML = "";

        if (accounts.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="loading-row">⚠️ No service accounts found in the project.</td></tr>`;
            return;
        }

        accounts.forEach(acc => {
            const row = document.createElement("tr");

            const isSystemSa = acc.email.includes("gserviceaccount.com") && 
                               (acc.email.includes("compute@developer") || acc.email.includes("service-agent") || acc.email.includes("gcp-sa"));
            const deleteBtn = isSystemSa 
                ? `<span style="color: var(--text-muted); font-size: 0.75rem;">System Managed</span>`
                : `<button class="btn-dismiss" style="background-color: #dc2626; padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="deleteIAM('${acc.email}')">Delete</button>`;

            row.innerHTML = `
                <td style="font-weight: 600;">${acc.name}</td>
                <td style="font-family: monospace; font-size: 0.8rem; color: var(--accent-blue);">${acc.email}</td>
                <td style="font-family: monospace; font-size: 0.8rem; color: var(--text-secondary);">${acc.unique_id}</td>
                <td><span class="status-badge online" style="padding: 0.1rem 0.4rem; font-size: 0.75rem; background-color: ${acc.disabled ? 'rgba(239, 68, 68, 0.15); color: #f87171;' : 'rgba(16, 185, 129, 0.15); color: #34d399;'}">${acc.disabled ? 'DISABLED' : 'ACTIVE'}</span></td>
                <td>${deleteBtn}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" class="loading-row" style="color: #ef4444;">⚠️ Error loading service accounts: ${error.message}</td></tr>`;
        console.error(error);
    }
}

// 12. Create IAM Service Account
async function submitCreateIAM() {
    const idInput = document.getElementById("new-sa-id");
    const displayInput = document.getElementById("new-sa-display");
    const account_id = idInput.value.trim();
    const display_name = displayInput.value.trim();

    if (!account_id || !display_name) {
        alert("Please enter both Service Account ID and Display Name.");
        return;
    }

    if (!/^[a-z][a-z0-9-]{5,29}$/.test(account_id)) {
        alert("Service Account IDs must start with a lowercase letter, followed by up to 29 lowercase letters, numbers, or hyphens (min 6 characters).");
        return;
    }

    const submitBtn = document.querySelector("#iam-create-form button");
    const originalText = submitBtn.innerText;
    submitBtn.disabled = true;
    submitBtn.innerText = "Creating...";

    try {
        const response = await fetch("/api/gcp/iam/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_id, display_name })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Failed to create Service Account.");
        }

        alert(`Successfully created Service Account "${account_id}"!`);
        idInput.value = "";
        displayInput.value = "";
        toggleForm("iam-create-form");
        loadIAM();
    } catch (error) {
        alert(`Error creating Service Account: ${error.message}`);
        console.error(error);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
    }
}

// 13. Delete IAM Service Account
async function deleteIAM(email) {
    const ok = confirm(`Delete Service Account '${email}'?\n\n⚠️ This cannot be undone. Any workloads or applications using this service account will immediately lose access.`);
    if (!ok) return;

    try {
        // Backend requires ?confirm=true to execute destructive action
        const response = await fetch(`/api/gcp/iam/${encodeURIComponent(email)}?confirm=true`, { method: "DELETE" });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Failed to delete Service Account.");
        }
        alert(`Successfully deleted Service Account "${email}".`);
        loadIAM();
    } catch (error) {
        alert(`Error deleting Service Account: ${error.message}`);
        console.error(error);
    }
}

// Helper to show/hide creation forms
function toggleForm(formId) {
    const form = document.getElementById(formId);
    if (form.style.display === "none") {
        form.style.display = "block";
    } else {
        form.style.display = "none";
    }
}

// 14. Load Cloud Storage Buckets
async function loadBuckets(period = "live") {
    const tbody = document.getElementById("buckets-table-body");
    const subtitle = document.querySelector("#buckets .table-subtitle");
    
    if (subtitle) {
        if (period === "live") {
            subtitle.innerText = "Google Cloud Storage buckets configured in the project.";
        } else {
            const periodText = period === "yesterday" ? "Yesterday" : 
                               period === "1week" ? "Last 7 Days" : 
                               period === "10days" ? "Last 10 Days" : "Last 30 Days";
            subtitle.innerText = `Google Cloud Storage buckets active during the selected period (${periodText}).`;
        }
    }

    try {
        const response = await fetch(`/api/gcp/buckets?t=${Date.now()}`);
        if (!response.ok) throw new Error("Failed to fetch storage buckets.");
        const buckets = await response.json();

        tbody.innerHTML = "";

        if (buckets.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="loading-row">⚠️ No storage buckets found in the project.</td></tr>`;
            return;
        }

        buckets.forEach(bucket => {
            const row = document.createElement("tr");

            // Format date nicely
            let dateStr = "N/A";
            if (bucket.created_at && bucket.created_at !== "N/A") {
                dateStr = new Date(bucket.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
            }

            row.innerHTML = `
                <td style="font-weight: 600; color: var(--accent-orange);">${bucket.name}</td>
                <td style="font-family: monospace; font-size: 0.85rem;">${bucket.location}</td>
                <td style="font-family: monospace; font-size: 0.85rem;">${bucket.storage_class}</td>
                <td style="color: var(--text-secondary); font-size: 0.85rem;">${dateStr}</td>
                <td>
                    <button class="btn-dismiss" style="background-color: #dc2626; border-color: rgba(220, 38, 38, 0.25); color: #fff; padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="deleteBucket('${bucket.name}')">Delete</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" class="loading-row" style="color: #ef4444;">⚠️ Error loading storage buckets: ${error.message}</td></tr>`;
        console.error(error);
    }
}

// 15. Delete Cloud Storage Bucket
async function deleteBucket(name) {
    const ok = confirm(`Delete Storage Bucket '${name}'?\n\n⚠️ This cannot be undone. All objects stored in this bucket will be permanently and irreversibly deleted.`);
    if (!ok) return;

    try {
        // Backend requires ?confirm=true to execute destructive action
        const response = await fetch(`/api/gcp/buckets/${name}?confirm=true`, { method: "DELETE" });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Failed to delete storage bucket.");
        }
        alert(`Successfully deleted Storage Bucket "${name}".`);
        loadBuckets();
    } catch (error) {
        alert(`Error deleting Storage Bucket: ${error.message}`);
        console.error(error);
    }
}

// 16. Period Dropdown Change Callbacks
function onKpiPeriodChange(value) {
    loadSummary(value);
}

function onCpuPeriodChange(value) {
    loadCostTrends(value);
}

function onBreakdownPeriodChange(value) {
    loadServiceBreakdown(value);
}

function onVmPeriodChange(value) {
    loadAlerts(value);
}

function onVpcPeriodChange(value) {
    loadVPCs(value);
}

function onIamPeriodChange(value) {
    loadIAM(value);
}

function onBucketPeriodChange(value) {
    loadBuckets(value);
}

// 17. Global Period Change Callback
function onGlobalPeriodChange(value) {
    const selectors = [
        "kpi-period",
        "cpu-period",
        "breakdown-period",
        "vm-period",
        "vpc-period",
        "iam-period",
        "bucket-period"
    ];
    selectors.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.value = value;
        }
    });
    refreshDashboard();
}



