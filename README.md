# Firewall Studio — Frontend

React + Express BFF for Network Firewall Studio. The Express BFF handles authentication, API aggregation, and proxies requests to the FastAPI backend.

## Architecture

```
Browser → React (Vite) → Express BFF (:3000) → FastAPI Backend (:8000) → MongoDB
```

In production, Express serves the built React app and proxies `/bff/api/*` to FastAPI.

## Quick Start

```bash
# Prerequisites: Node.js 20+, FastAPI backend running on :8000

npm install

# Development (two processes)
npm run dev        # Vite dev server on :5173
npm run dev:bff    # Express BFF on :3000

# Or start both at once
npm run dev:all

# Production build
npm run build       # React → dist/
npm run build:bff   # Express → dist-server/
npm start           # Serve from Express on :3000
```

## Environment Variables

Copy `.env.example` to `.env`:

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `/bff` | API base URL (browser-side) |
| `BFF_PORT` | `3000` | Express BFF port |
| `FASTAPI_URL` | `http://localhost:8000` | Backend FastAPI URL |
| `SESSION_SECRET` | dev default | Cookie signing secret |

## Project Structure

```
├── server/                   # Express BFF
│   ├── index.ts              # BFF entry point
│   ├── config.ts             # Configuration
│   ├── middleware/
│   │   ├── auth.ts           # SSO/LDAP user identity
│   │   └── proxy.ts          # FastAPI proxy with user headers
│   └── routes/
│       └── api.ts            # Aggregation endpoints (dashboard)
│
├── src/                      # React frontend
│   ├── App.tsx               # Router config
│   ├── pages/
│   │   ├── HomePage.tsx      # Landing page with module cards
│   │   ├── DesignStudioPage.tsx
│   │   ├── RequestTrackingPage.tsx  # NEW: Dedicated request tracking tab
│   │   ├── AuditTrailPage.tsx       # NEW: Full audit trail viewer
│   │   ├── MigrationStudioPage.tsx
│   │   ├── FirewallManagementPage.tsx
│   │   ├── LifecycleDashboardPage.tsx
│   │   ├── ReviewPage.tsx
│   │   └── SettingsPage.tsx
│   ├── components/
│   │   ├── layout/ModuleLayout.tsx   # Header + nav per module
│   │   ├── design-studio/            # Rule builder, compiler, panels
│   │   └── shared/                   # Reusable UI components
│   ├── lib/
│   │   └── api.ts            # API client (calls /bff/api/*)
│   ├── types/                # TypeScript interfaces
│   └── contexts/             # React contexts (TeamContext)
│
├── vite.config.ts            # Vite + dev proxy config
├── package.json
└── Dockerfile                # Multi-stage: build React + BFF, serve from Express
```

## Key Changes from Original Repo

1. **Express BFF layer** — authentication, API proxy, aggregation
2. **Request Tracking page** — dedicated `/request-tracking` route (removed from Design Studio inline)
3. **Audit Trail page** — `/audit-trail` with before/after snapshots
4. **API calls route through BFF** — `VITE_API_URL=/bff` instead of direct FastAPI
5. **Environment-scoped filtering** — all views support Production/Non-Production/Pre-Production
