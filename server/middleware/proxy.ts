/**
 * API proxy middleware — forwards /bff/api/* requests to FastAPI backend.
 *
 * Adds user identity headers from the authenticated session.
 */

import type { Request, Response } from 'express';
import { config } from '../config.js';
import { v4 as uuidv4 } from 'uuid';

export async function proxyToBackend(req: Request, res: Response): Promise<void> {
  try {
    // Strip /bff prefix — backend expects /api/...
    const backendPath = req.originalUrl.replace(/^\/bff/, '');
    const url = `${config.fastapiUrl}${backendPath}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-User-Id': req.user?.userId || 'anonymous',
      'X-User-Email': req.user?.userEmail || '',
      'X-User-Team': req.user?.userTeam || '',
      'X-Request-Id': uuidv4(),
    };

    const fetchOptions: RequestInit = {
      method: req.method,
      headers,
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const backendRes = await fetch(url, fetchOptions);
    const data = await backendRes.json();

    res.status(backendRes.status).json(data);
  } catch (err) {
    console.error('Backend proxy error:', err);
    res.status(502).json({ error: 'Backend unavailable' });
  }
}
