/**
 * Express BFF configuration loaded from environment variables.
 */

export const config = {
  /** Port the BFF listens on */
  port: parseInt(process.env.BFF_PORT || '3000', 10),

  /** FastAPI backend URL */
  fastapiUrl: process.env.FASTAPI_URL || 'http://localhost:8000',

  /** Session secret for cookie signing */
  sessionSecret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',

  /** CORS origin for dev mode */
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  /** Node environment */
  nodeEnv: process.env.NODE_ENV || 'development',
};
