// src/server.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { env } from './env';
import { eventLoopMonitor } from './utils/event-loop-monitor';

// Plugins
import supabasePlugin from './plugins/supabase';
import jobQueuePlugin from './utils/queue/job-queue';

// Routes
import authRoutes from './modules/auth/routes';
import repositoriesRoutes from './modules/repositories/routes';
import scansRoutes from './modules/scans/routes';
import vulnerabilitiesRoutes from './modules/vulnerability/routes';
import integrationsRoutes from './modules/integrations/routes';
import onboardingRoutes from './modules/onboarding/routes';
import dashboardRoutes from './modules/dashboard/routes';
import githubIssuesRoutes from './modules/github-issues/routes';
import webhooksRoutes from './modules/webhook/route';
import entitlementsRoutes from './modules/entitlements/routes';
import teamsRoutes from './modules/teams/routes';
import workspacesRoutes from './modules/workspaces/routes';

// Workers
import { processScanJob } from './modules/scans/worker';
import type { ScanJobPayload } from './utils/queue/job-queue';

export function buildServer() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: { colorize: true },
            }
          : undefined,
    },
  });

  // Register core plugins
  app.register(cors, {
    origin: env.NEXT_PUBLIC_FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  });

  app.register(sensible);
  app.register(supabasePlugin);
  app.register(jobQueuePlugin);

  // Initialize scan queue and worker after plugins are loaded
  app.addHook('onReady', async () => {
    // START EVENT LOOP MONITORING TO DETECT BLOCKING (dev/staging)
    if (env.NODE_ENV !== 'production') {
      eventLoopMonitor.startMonitoring(app, 5000);
      app.log.info('✓ Event loop monitoring enabled (development mode)');
    }

    // Create scan queue
    app.jobQueue.createQueue<ScanJobPayload>({
      name: 'scans',
      connection: app.jobQueue['getDefaultConnection'](),
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: false, // Keep failed jobs for debugging
      },
    });

    // Create scan worker
    app.jobQueue.createWorker<ScanJobPayload>(
      'scans',
      async (job) => {
        await processScanJob(app, job);
      },
      {
        concurrency: 3, // Process up to 3 scans concurrently
      }
    );

    // Create queue events listener
    app.jobQueue.createQueueEvents('scans');

    app.log.info('Scan queue and workers initialized');

    // ✅ PRODUCTION FIX: Start stalled scan detector
    const { runScanHealthCheck } = await import('./jobs/stalled-scan-detector');
    
    // Run immediately on startup
    runScanHealthCheck(app).catch(err => 
      app.log.error({ err }, 'Initial scan health check failed')
    );
    
    // Run every 5 minutes
    setInterval(() => {
      runScanHealthCheck(app).catch(err => 
        app.log.error({ err }, 'Scan health check failed')
      );
    }, 5 * 60 * 1000);
    
    app.log.info('✅ Stalled scan detector started (runs every 5 minutes)');
  });

  // Health check
  app.get('/health', async () => {
    const queueMetrics = await app.jobQueue.getQueueMetrics('scans').catch(() => null);
    
    // Include event loop metrics to detect blocking
    const eventLoopMetrics = eventLoopMonitor.getMetrics();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
      queue: queueMetrics || { status: 'unavailable' },
      eventLoop: eventLoopMetrics,
    };
  });

  // Metrics endpoint (for monitoring event loop health during scans)
  app.get('/metrics/event-loop', async () => {
    return eventLoopMonitor.getMetrics();
  });

  // Register route modules
  app.register(authRoutes, { prefix: '/api/auth' });
  app.register(onboardingRoutes, { prefix: '/api/onboarding' });
  app.register(repositoriesRoutes, { prefix: '/api/repositories' });
  app.register(scansRoutes, { prefix: '/api/scans' });
  app.register(vulnerabilitiesRoutes, { prefix: '/api/vulnerabilities' });
  app.register(integrationsRoutes, { prefix: '/api/integrations' });
  app.register(dashboardRoutes, { prefix: '/api/dashboard' });
  app.register(githubIssuesRoutes, { prefix: '/api/github-issues' });
  app.register(webhooksRoutes, { prefix: '/api/webhooks' })
  app.register(entitlementsRoutes, { prefix: '/api/me' });
  app.register(teamsRoutes, { prefix: '/api/teams' });
  app.register(workspacesRoutes, { prefix: '/api/workspaces' });


  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    const statusCode = (error as any).statusCode ?? 500;
    const message = error instanceof Error ? error.message : 'Internal Server Error';

    reply.status(statusCode).send({
      error: message,
      statusCode,
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}

// Start server
if (env.NODE_ENV !== 'test') {
  const app = buildServer();
  const port = Number(env.PORT);

  app.listen({ port, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      app.log.error(err);
      process.exit(1);
    }

    app.log.info(`🚀 CodeSentinel API listening at ${address}`);
    app.log.info(`📊 Health check: ${address}/health`);
  });

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

  signals.forEach((signal) => {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, closing gracefully...`);
      await app.close();
      process.exit(0);
    });
  });
}
