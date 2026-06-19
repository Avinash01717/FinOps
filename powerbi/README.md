# PowerBI Connection Guide

This guide explains how to connect **PowerBI Desktop** directly to your local MySQL database to build analytical cost reports.

## Prerequisites
1. **PowerBI Desktop** installed on your Windows machine.
2. **MySQL Connector/NET** installed (required by PowerBI to talk to MySQL).
   - If PowerBI shows an error saying *"This connector requires one or more additional components to be installed"*, download and install the **MySQL Connector/NET** from [dev.mysql.com/downloads/connector/net](https://dev.mysql.com/downloads/connector/net/).

---

## Connection Steps

### Step 1: Initiate MySQL Connection in PowerBI
1. Open **PowerBI Desktop**.
2. On the **Home** ribbon, click **Get Data** ➡️ **More...**
3. Select **Database** ➡️ **MySQL Database**, then click **Connect**.

### Step 2: Configure Connection Parameters
1. In the **Server** field, enter:
   ```text
   127.0.0.1:3306
   ```
2. In the **Database** field, enter:
   ```text
   finops
   ```
3. Click **OK**.

### Step 3: Enter Database Credentials
1. In the credentials dialog, select the **Database** tab on the left.
2. Enter the credentials:
   - **User name**: `root`
   - **Password**: *(Leave blank)*
3. Click **Connect**.
4. If PowerBI warns about an unencrypted connection, click **OK / Run** (this is normal for local development).

### Step 4: Load Tables
1. In the **Navigator** window, you will see the tables listed:
   - `daily_costs` (historical daily cost entries)
   - `idle_resource_alerts` (optimization recommendations list)
2. Check the boxes next to both tables.
3. Click **Load** to import them into your report model!

---

## Suggested Report Visualizations
Once the tables are loaded, you can design a portfolio report with:
1. **Daily Cost Burn Rate (Line Chart)**: `date` on the X-Axis, and `cost` on the Y-Axis.
2. **Service Cost Breakdown (Treemap / Pie Chart)**: `service` as the Category, and `cost` as the Value.
3. **Monthly Savings Summary (Card KPI)**: Sum of `potential_savings` from `idle_resource_alerts` where `status = "Active"`.
