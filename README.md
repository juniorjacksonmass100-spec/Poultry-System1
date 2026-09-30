# KINGDOM GROUP POULTRY MANAGEMENT - SUPABASE SETUP INSTRUCTIONS
Developed by CEO Junior Jackson Massawe

This project connects to a standard Supabase PostgreSQL backend with authentication and Row Level Security (RLS).

---

## 1. Environment Variables Configuration (Vercel, Android & Local)

### For Vercel:
Add the following in your **Vercel Project Dashboard** -> **Settings** -> **Environment Variables**:

1. `VITE_SUPABASE_URL`
   - Example: `https://xyzabcdefghijklmnop.supabase.co`
   - Location: Found in your Supabase Dashboard -> **Project Settings** -> **API** -> **Project URL**

2. `VITE_SUPABASE_ANON_KEY`
   - Example: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - Location: Found in your Supabase Dashboard -> **Project Settings** -> **API** -> **Project API keys** -> **anon / public**

### For Local Development:
Copy `.env.example` to `.env.local` or `.env`:
```bash
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key-here"
```

---

## 2. Setting Up the Database Schema (PostgreSQL)

You have two copies of the complete SQL schema in this repository:
1. `public/schema.sql` (also downloadable directly at `/schema.sql` on your deployed site)
2. `src/sql/schema.sql`

### How to apply:
1. Go to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Select your project.
3. In the left navigation menu, click **SQL Editor**.
4. Click **New query**.
5. Copy all the contents of `public/schema.sql` (or `src/sql/schema.sql`) and paste them into the editor.
6. Click **Run** (or `Cmd/Ctrl + Enter`).

All tables (`profiles`, `poultry`, `egg_records`, `brooding`, `hatch_records`, `expenses`, `expense_categories`, `sales`), security policies, and user triggers will be created.

---

## 3. Administrator Account (CEO Junior Jackson)
When `junior.jacksonmass100@gmail.com` signs up or logs in through Supabase Auth, the database trigger automatically assigns the role:
- `role = 'admin'`
- `full_name = 'Junior Jackson'`

All other users will register as normal farm staff (`role = 'user'`).
