/**
 * Express BFF server for Network Firewall Studio.
 *
 * Architecture:
 *   Browser → THIS Express BFF → FastAPI Backend → MongoDB
 *
 * Responsibilities:
 *   - SSO/LDAP authentication (production)
 *   - Session management
 *   - API proxy to FastAPI with user identity headers
 *   - Dashboard aggregation
 *   - Serve built React app (production)
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { authMiddleware } from './middleware/auth.js';
import { proxyToBackend } from './middleware/proxy.js';
import apiRoutes from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Body parsing
app.use(express.json({ limit: '10mb' }));

// CORS — dev only (production serves the React build from Express)
if (config.nodeEnv === 'development') {
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
}

// Auth middleware — extract user identity
app.use(authMiddleware);

// BFF-specific aggregation routes
app.use('/bff', apiRoutes);

// Proxy all other /bff/api/* calls to FastAPI
app.all('/bff/api/*', proxyToBackend);

// Health check
app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

// In production, serve the built React app
if (config.nodeEnv === 'production') {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(config.port, () => {
  console.log(`BFF server running on http://localhost:${config.port}`);
  console.log(`Backend: ${config.fastapiUrl}`);
  console.log(`Mode: ${config.nodeEnv}`);
});
