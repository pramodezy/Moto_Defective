# Motorola Defective Returns CRM

An enterprise-grade reverse supply chain management application for Motorola Defective Returns logistics, unboxing verification, consignment tracking, and SLA monitoring.

---

## Architecture & Technology Stack

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS + Lucide React
- **Ingestion & Processing:** SheetJS (`xlsx`) for Defective Reports & Region Mapping
- **Database & Auth:** Supabase (PostgreSQL, Triggers, Functions, Row-Level Security)
- **Logistics Printing:** Built-in Manifest & Barcode Generator for BlueDart / Courier waybills
- **Dual-Mode Persistence:** 
  - **Live Mode:** Connects to Supabase when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are provided.
  - **Pre-seeded Enterprise Mode:** Runs out-of-the-box with 64 stations, 115 shipping orders, and 300 real line items parsed from `Dump.xlsx`.

---

## 1. Setting up Supabase Database

1. Go to [https://supabase.com](https://supabase.com) and create a new project.
2. In the Supabase Dashboard, navigate to the **SQL Editor** (left navigation bar).
3. Run the database migrations in order:
   - [`supabase/migrations/20260914_init_schema.sql`](./supabase/migrations/20260914_init_schema.sql) (Core tables & triggers)
   - [`supabase/migrations/20260914_profiles_and_auth.sql`](./supabase/migrations/20260914_profiles_and_auth.sql) (Auth & bcrypt login RPC)
   - [`supabase/migrations/20260914_enable_anon_access.sql`](./supabase/migrations/20260914_enable_anon_access.sql) (Anon access RLS policies)
   - [`supabase/migrations/20261007_user_and_cci_management.sql`](./supabase/migrations/20261007_user_and_cci_management.sql) (User & CCI Management, password reset, and triggers)
4. This will create:
   - `cci_master`: Service center registry & regional classifications
   - `profiles`: User roles (`ADMIN`, `CWH`, `CCI`)
   - `shipping_orders`: Consignments with SLA & value aggregation triggers
   - `defective_master`: Item-level composite-key vault (`srNumber_srPartNumber_newPartNumber`)
   - `awb_history`: Courier waybill history & cancellation tracking
   - `audit_logs`: Operations audit trail
   - Triggers: `set_item_region()`, `sync_shipping_order_metrics()`, and `sync_cci_to_profile()`
   - Complete Row-Level Security (RLS) policies and RPC functions (`verify_user_login`, `admin_reset_user_password`, `admin_create_user`).
5. In your Supabase project dashboard, navigate to **Project Settings** -> **API**:
   - Copy **Project URL**
   - Copy **Project API Key (anon / public)**
6. Create a `.env` file in the root directory:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

---

## 2. Pushing the Code to GitHub

Open your terminal in this repository folder and run:

```bash
# 1. Stage and commit the project
git add .
git commit -m "Initial commit: Motorola Defective Returns CRM with Supabase DDL and Ingestion Engines"

# 2. Rename branch to main
git branch -M main

# 3. Add your GitHub repository remote (replace with your GitHub repo URL)
git remote add origin https://github.com/<YOUR-GITHUB-USERNAME>/<YOUR-REPO-NAME>.git

# 4. Push to GitHub
git push -u origin main
```

---

## 3. Automated Deployment (GitHub Pages or Vercel)

### Option A: GitHub Pages (Pre-configured via GitHub Actions)
1. Go to your GitHub repository **Settings** -> **Pages**.
2. Under **Build and deployment** -> **Source**, choose **GitHub Actions**.
3. Any push to `main` will automatically build and publish the site.

### Option B: Vercel
1. Go to [vercel.com](https://vercel.com) and click **Add New** -> **Project**.
2. Import your GitHub repository.
3. In **Environment Variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Click **Deploy**.

---

## 4. Local Development

```bash
# Install dependencies
npm install

# Run Vite dev server
npm run dev

# Run production build
npm run build
```
