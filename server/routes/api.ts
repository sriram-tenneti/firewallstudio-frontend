/**
 * BFF API routes.
 *
 * Some endpoints aggregate multiple backend calls (e.g., dashboard).
 * Everything else is proxied directly to FastAPI.
 */

import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';

const router = Router();

/**
 * Dashboard aggregation — fetches multiple counters in one round-trip.
 */
router.get('/api/dashboard', async (req: Request, res: Response) => {
  try {
    const headers: Record<string, string> = {
      'X-User-Id': req.user?.userId || '',
      'X-User-Email': req.user?.userEmail || '',
      'X-User-Team': req.user?.userTeam || '',
    };

    const environment = req.query.environment as string || '';
    const envQs = environment ? `?environment=${encodeURIComponent(environment)}` : '';

    const [rulesRes, requestsRes] = await Promise.all([
      fetch(`${config.fastapiUrl}/api/rules/requests${envQs}`, { headers }),
      fetch(`${config.fastapiUrl}/api/requests/history?limit=20`, { headers }),
    ]);

    const [rules, recentHistory] = await Promise.all([
      rulesRes.json(),
      requestsRes.json(),
    ]);

    // Count by status
    const statusCounts: Record<string, number> = {};
    if (Array.isArray(rules)) {
      for (const r of rules) {
        const status = r.status || 'Unknown';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      }
    }

    res.json({
      total_rules: Array.isArray(rules) ? rules.length : 0,
      status_counts: statusCounts,
      recent_transitions: Array.isArray(recentHistory) ? recentHistory.slice(0, 10) : [],
    });
  } catch (err) {
    console.error('Dashboard aggregation error:', err);
    res.status(502).json({ error: 'Backend unavailable' });
  }
});

export default router;
