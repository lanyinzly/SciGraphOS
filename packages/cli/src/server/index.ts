import { resolvePgliteDir } from '@/src/utils';
import {
  type Character,
  DatabaseAdapter,
  type IAgentRuntime,
  type UUID,
  logger,
} from '@elizaos/core';
import { createDatabaseAdapter } from '@elizaos/plugin-sql';
import * as bodyParser from 'body-parser';
import cors from 'cors';
import express, { Request, Response } from 'express';
import * as fs from 'node:fs';
import http from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server as SocketIOServer } from 'socket.io';
import { createApiRouter, createPluginRouteHandler, setupSocketIO } from './api';
import { apiKeyAuthMiddleware } from './authMiddleware';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Represents a function that acts as a server middleware.
 * @param {express.Request} req - The request object.
 * @param {express.Response} res - The response object.
 * @param {express.NextFunction} next - The next function to be called in the middleware chain.
 * @returns {void}
 */
export type ServerMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => void;

/**
 * Interface for defining server configuration options.
 * @typedef {Object} ServerOptions
 * @property {ServerMiddleware[]} [middlewares] - Optional array of server middlewares.
 * @property {string} [dataDir] - Optional directory for storing server data.
 * @property {string} [postgresUrl] - Optional URL for connecting to a PostgreSQL database.
 */
export interface ServerOptions {
  middlewares?: ServerMiddleware[];
  dataDir?: string;
  postgresUrl?: string;
}
const AGENT_RUNTIME_URL =
  process.env.AGENT_RUNTIME_URL?.replace(/\/$/, '') || 'http://localhost:3000';

// Gallery HTML generation function
function generateGalleryHtml(charts: any[]): string {
  const chartCards = charts.map(chart => `
    <div class="chart-card">
      <div class="chart-header">
        <h3>${chart.title}</h3>
        <span class="chart-type ${chart.type}">${chart.type.toUpperCase()}</span>
      </div>
      <div class="chart-preview">
        <iframe src="${chart.url}" width="100%" height="300" frameborder="0"></iframe>
      </div>
      <div class="chart-footer">
        <span class="chart-date">${new Date(chart.created).toLocaleString()}</span>
        <a href="${chart.url}" target="_blank" class="view-btn">View Full Chart</a>
      </div>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chart Gallery - ElizaOS</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
            color: #333;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
        }
        .header h1 {
            color: #2c3e50;
            margin-bottom: 10px;
        }
        .header p {
            color: #7f8c8d;
            font-size: 16px;
        }
        .gallery {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
            gap: 20px;
            max-width: 1200px;
            margin: 0 auto;
        }
        .chart-card {
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
            transition: transform 0.2s ease;
        }
        .chart-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        }
        .chart-header {
            padding: 15px 20px;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .chart-header h3 {
            margin: 0;
            color: #2c3e50;
            font-size: 16px;
        }
        .chart-type {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .chart-type.bar {
            background: #3498db;
            color: white;
        }
        .chart-type.line {
            background: #e74c3c;
            color: white;
        }
        .chart-type.pie {
            background: #f39c12;
            color: white;
        }
        .chart-type.doughnut {
            background: #9b59b6;
            color: white;
        }
        .chart-preview {
            height: 300px;
            overflow: hidden;
        }
        .chart-footer {
            padding: 15px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #f8f9fa;
        }
        .chart-date {
            color: #7f8c8d;
            font-size: 14px;
        }
        .view-btn {
            background: #3498db;
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            text-decoration: none;
            font-size: 14px;
            transition: background 0.2s ease;
        }
        .view-btn:hover {
            background: #2980b9;
        }
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #7f8c8d;
        }
        .empty-state h2 {
            margin-bottom: 10px;
        }
        .stats {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            max-width: 600px;
            margin-left: auto;
            margin-right: auto;
        }
        .stats h2 {
            margin: 0 0 15px 0;
            color: #2c3e50;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 15px;
        }
        .stat-item {
            text-align: center;
        }
        .stat-number {
            font-size: 24px;
            font-weight: bold;
            color: #3498db;
        }
        .stat-label {
            font-size: 14px;
            color: #7f8c8d;
            margin-top: 5px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 Chart Gallery</h1>
        <p>AI-generated charts from your Excel data</p>
    </div>
    
    ${charts.length > 0 ? `
    <div class="stats">
        <h2>Gallery Statistics</h2>
        <div class="stats-grid">
            <div class="stat-item">
                <div class="stat-number">${charts.length}</div>
                <div class="stat-label">Total Charts</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">${[...new Set(charts.map(c => c.type))].length}</div>
                <div class="stat-label">Chart Types</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">${charts.filter(c => c.type === 'bar').length}</div>
                <div class="stat-label">Bar Charts</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">${charts.filter(c => c.type === 'line').length}</div>
                <div class="stat-label">Line Charts</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">${charts.filter(c => c.type === 'pie').length}</div>
                <div class="stat-label">Pie Charts</div>
            </div>
        </div>
    </div>
    
    <div class="gallery">
        ${chartCards}
    </div>
    ` : `
    <div class="empty-state">
        <h2>No Charts Yet</h2>
        <p>Upload an Excel file to generate your first chart!</p>
    </div>
    `}
</body>
</html>`;
}

/**
 * Class representing an agent server.
 */ /**
* Represents an agent server which handles agents, database, and server functionalities.
*/
export class AgentServer {
  public app: express.Application;
  private agents: Map<UUID, IAgentRuntime>;
  public server: http.Server;
  public socketIO: SocketIOServer;
  private serverPort: number = 3000; // Add property to store current port
  public isInitialized: boolean = false; // Flag to prevent double initialization

  public database: DatabaseAdapter;
  public startAgent!: (character: Character) => Promise<IAgentRuntime>;
  public stopAgent!: (runtime: IAgentRuntime) => void;
  public loadCharacterTryPath!: (characterPath: string) => Promise<Character>;
  public jsonToCharacter!: (character: unknown) => Promise<Character>;

  /**
   * Constructor for AgentServer class.
   *
   * @constructor
   */
  constructor() {
    try {
      logger.debug('Initializing AgentServer (constructor)...');
      this.agents = new Map();
      // Synchronous setup only.
      // Database adapter creation and initialization are moved to the async initialize() method.
    } catch (error) {
      logger.error('Failed to initialize AgentServer (constructor):', error);
      throw error;
    }
  }

  /**
   * Initializes the database and server.
   *
   * @param {ServerOptions} [options] - Optional server options.
   * @returns {Promise<void>} A promise that resolves when initialization is complete.
   */
  public async initialize(options?: ServerOptions): Promise<void> {
    if (this.isInitialized) {
      logger.warn('AgentServer is already initialized, skipping initialization');
      return;
    }

    try {
      logger.debug('Initializing AgentServer (async operations)...');

      // Resolve data directory (assuming resolvePgliteDir might be async or needs to be before DB creation)
      const dataDir = await resolvePgliteDir(options?.dataDir);

      // Create database adapter instance
      // Assuming createDatabaseAdapter itself is synchronous and returns an adapter instance
      this.database = createDatabaseAdapter(
        {
          dataDir,
          postgresUrl: options?.postgresUrl,
        },
        '00000000-0000-0000-0000-000000000002' // This UUID might need to be configurable or a named constant
      );

      // Initialize the database (which is an async operation on the adapter)
      await this.database.init();
      logger.success('Database initialized successfully');

      // Only continue with server initialization after database is ready
      await this.initializeServer(options);

      // wait 250 ms
      await new Promise((resolve) => setTimeout(resolve, 250));

      // Success message moved to start method
      this.isInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize AgentServer (async operations):', error);
      console.trace(error);
      throw error;
    }
  }

  /**
   * Initializes the server with the provided options.
   *
   * @param {ServerOptions} [options] - Optional server options.
   * @returns {Promise<void>} - A promise that resolves once the server is initialized.
   */
  private async initializeServer(options?: ServerOptions) {
    try {
      // Initialize middleware and database
      this.app = express();

      // Apply custom middlewares if provided
      if (options?.middlewares) {
        logger.debug('Applying custom middlewares...');
        for (const middleware of options.middlewares) {
          this.app.use(middleware);
        }
      }

      // Setup middleware for all requests
      logger.debug('Setting up standard middlewares...');
      this.app.use(cors()); // Enable CORS first
      this.app.use(bodyParser.json()); // Parse JSON bodies

      // Optional Authentication Middleware
      const serverAuthToken = process.env.ELIZA_SERVER_AUTH_TOKEN;
      if (serverAuthToken) {
        logger.info('Server authentication enabled. Requires X-API-KEY header for /api routes.');
        // Apply middleware only to /api paths
        this.app.use('/api', (req, res, next) => {
          apiKeyAuthMiddleware(req, res, next);
        });
      } else {
        logger.warn(
          'Server authentication is disabled. Set ELIZA_SERVER_AUTH_TOKEN environment variable to enable.'
        );
      }

      const uploadsBasePath = path.join(process.cwd(), 'data/uploads');
      const generatedBasePath = path.join(process.cwd(), 'data/generated');
      fs.mkdirSync(uploadsBasePath, { recursive: true });
      fs.mkdirSync(generatedBasePath, { recursive: true });

      // Agent-specific media serving - only serve files from agent-specific directories
      this.app.get(
        '/media/uploads/:agentId/:filename',
        // @ts-expect-error - WTF?????

        (req: Request, res: Response) => {
          const agentId = req.params.agentId;
          const filename = req.params.filename;

          // Validate agent ID format (UUID)
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(agentId)) {
            return res.status(400).json({ error: 'Invalid agent ID format' });
          }

          // Sanitize filename to prevent directory traversal
          const sanitizedFilename = path.basename(filename);
          const agentUploadsPath = path.join(uploadsBasePath, agentId);
          const filePath = path.join(agentUploadsPath, sanitizedFilename);

          // Ensure the file is within the agent's directory
          if (!filePath.startsWith(agentUploadsPath)) {
            return res.status(403).json({ error: 'Access denied' });
          }

          res.sendFile(filePath, (err) => {
            if (err) {
              res.status(404).json({ error: 'File not found' });
            }
          });
        }
      );

      this.app.get(
        '/media/generated/:agentId/:filename',
        // @ts-expect-error - WTF?????
        (req: Request, res: Response) => {
          const agentId = req.params.agentId;
          const filename = req.params.filename;

          // Validate agent ID format (UUID)
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(agentId)) {
            return res.status(400).json({ error: 'Invalid agent ID format' });
          }

          // Sanitize filename to prevent directory traversal
          const sanitizedFilename = path.basename(filename);
          const agentGeneratedPath = path.join(generatedBasePath, agentId);
          const filePath = path.join(agentGeneratedPath, sanitizedFilename);

          // Ensure the file is within the agent's directory
          if (!filePath.startsWith(agentGeneratedPath)) {
            return res.status(403).json({ error: 'Access denied' });
          }

          res.sendFile(filePath, (err) => {
            if (err) {
              res.status(404).json({ error: 'File not found' });
            }
          });
        }
      );

      // Add specific middleware to handle portal assets
      this.app.use((req, res, next) => {
        // Automatically detect and handle static assets based on file extension
        const ext = path.extname(req.path).toLowerCase();

        // Set correct content type based on file extension
        if (ext === '.js' || ext === '.mjs') {
          res.setHeader('Content-Type', 'application/javascript');
        } else if (ext === '.css') {
          res.setHeader('Content-Type', 'text/css');
        } else if (ext === '.svg') {
          res.setHeader('Content-Type', 'image/svg+xml');
        } else if (ext === '.png') {
          res.setHeader('Content-Type', 'image/png');
        } else if (ext === '.jpg' || ext === '.jpeg') {
          res.setHeader('Content-Type', 'image/jpeg');
        }

        // Continue processing
        next();
      });

      // Setup static file serving with proper MIME types
      const staticOptions = {
        etag: true,
        lastModified: true,
        setHeaders: (res: express.Response, filePath: string) => {
          // Set the correct content type for different file extensions
          const ext = path.extname(filePath).toLowerCase();
          if (ext === '.css') {
            res.setHeader('Content-Type', 'text/css');
          } else if (ext === '.js') {
            res.setHeader('Content-Type', 'application/javascript');
          } else if (ext === '.html') {
            res.setHeader('Content-Type', 'text/html');
          } else if (ext === '.png') {
            res.setHeader('Content-Type', 'image/png');
          } else if (ext === '.jpg' || ext === '.jpeg') {
            res.setHeader('Content-Type', 'image/jpeg');
          } else if (ext === '.svg') {
            res.setHeader('Content-Type', 'image/svg+xml');
          }
        },
      };

      // Serve static assets from the client dist path
      const clientPath = path.join(__dirname, '..', 'dist');
      this.app.use(express.static(clientPath, staticOptions));

      // *** NEW: Mount the plugin route handler BEFORE static serving ***
      const pluginRouteHandler = createPluginRouteHandler(this.agents);
      this.app.use(pluginRouteHandler);

      // Mount the core API router under /api
      // API Router setup
      const apiRouter = createApiRouter(this.agents, this);
      this.app.use(
        '/api',
        (req, res, next) => {
          if (req.path !== '/ping') {
            logger.debug(`API request: ${req.method} ${req.path}`);
          }
          next();
        },
        apiRouter,
        (err, req, res, next) => {
          logger.error(`API error: ${req.method} ${req.path}`, err);
          res.status(500).json({
            success: false,
            error: {
              message: err.message || 'Internal Server Error',
              code: err.code || 500,
            },
          });
        }
      );

      // Setup chart serving endpoint
      this.app.get('/api/charts/:chartId', (req: any, res: any) => {
        try {
          const { chartId } = req.params;
          const chartFile = path.join(process.cwd(), 'data', `${chartId}.html`);

          logger.debug(`[CHART API] Looking for chart file: ${chartFile}`);
          logger.debug(`[CHART API] Current working directory: ${process.cwd()}`);

          if (!fs.existsSync(chartFile)) {
            // Try alternative path
            const altChartFile = path.join(process.cwd(), 'packages', 'cli', 'data', `${chartId}.html`);
            logger.debug(`[CHART API] Trying alternative path: ${altChartFile}`);

            if (fs.existsSync(altChartFile)) {
              const chartHtml = fs.readFileSync(altChartFile, 'utf8');
              res.setHeader('Content-Type', 'text/html');
              return res.send(chartHtml);
            }

            return res.status(404).json({ error: 'Chart not found', path: chartFile, altPath: altChartFile });
          }

          const chartHtml = fs.readFileSync(chartFile, 'utf8');
          res.setHeader('Content-Type', 'text/html');
          res.send(chartHtml);
        } catch (error) {
          logger.error('Chart serving error:', error);
          res.status(500).json({ error: 'Failed to serve chart' });
        }
      });

      // Setup chart gallery endpoint
      this.app.get('/gallery', (req: any, res: any) => {
        try {
          const dataDir = path.join(process.cwd(), 'data');
          const altDataDir = path.join(process.cwd(), 'packages', 'cli', 'data');

          let chartsDir = dataDir;
          if (!fs.existsSync(dataDir) && fs.existsSync(altDataDir)) {
            chartsDir = altDataDir;
          }

          if (!fs.existsSync(chartsDir)) {
            return res.send(generateGalleryHtml([]));
          }

          const chartFiles = fs.readdirSync(chartsDir)
            .filter(file => file.startsWith('chart-') && file.endsWith('.html'))
            .map(file => {
              const chartId = file.replace('.html', '');
              const filePath = path.join(chartsDir, file);
              const stats = fs.statSync(filePath);

              // Extract title from HTML file
              const htmlContent = fs.readFileSync(filePath, 'utf8');
              const titleMatch = htmlContent.match(/<title>(.*?)<\/title>/);
              const title = titleMatch ? titleMatch[1] : chartId;

              // Extract chart type from HTML
              const typeMatch = htmlContent.match(/"type":"([^"]+)"/);
              const type = typeMatch ? typeMatch[1] : 'unknown';

              return {
                id: chartId,
                title: title,
                type: type,
                url: `/api/charts/${chartId}`,
                created: stats.mtime.toISOString()
              };
            })
            .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());

          const galleryHtml = generateGalleryHtml(chartFiles);
          res.setHeader('Content-Type', 'text/html');
          res.send(galleryHtml);
        } catch (error) {
          logger.error('Gallery error:', error);
          res.status(500).json({ error: 'Failed to load gallery' });
        }
      });

      logger.debug('Chart API and Gallery endpoints registered successfully');

      // Add a catch-all route for API 404s
      this.app.use((req, res, next) => {
        // Check if this is an API route that wasn't handled
        if (req.path.startsWith('/api/')) {
          // worms are going to hitting it all the time, use a reverse proxy if you need this type of logging
          //logger.warn(`API 404: ${req.method} ${req.path}`);
          res.status(404).json({
            success: false,
            error: {
              message: 'API endpoint not found',
              code: 404,
            },
          });
        } else {
          // Not an API route, continue to next middleware
          next();
        }
      });

      // Main fallback for the SPA - must be registered after all other routes
      // Use a final middleware that handles all unmatched routes
      (this.app as any).use(
        (req: express.Request, res: express.Response, next: express.NextFunction) => {
          // For JavaScript requests that weren't handled by static middleware,
          // return a JavaScript response instead of HTML
          if (
            req.path.endsWith('.js') ||
            req.path.includes('.js?') ||
            req.path.match(/\/[a-zA-Z0-9_-]+-[A-Za-z0-9]{8}\.js/)
          ) {
            res.setHeader('Content-Type', 'application/javascript');
            return res.status(404).send(`// JavaScript module not found: ${req.path}`);
          }

          // For all other routes, serve the SPA's index.html
          res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
        }
      );

      // Create HTTP server for Socket.io
      this.server = http.createServer(this.app);

      // Initialize Socket.io
      this.socketIO = setupSocketIO(this.server, this.agents);

      logger.success('AgentServer initialization complete');
    } catch (error) {
      logger.error('Failed to complete server initialization:', error);
      throw error;
    }
  }

  /**
   * Registers an agent with the provided runtime.
   *
   * @param {IAgentRuntime} runtime - The runtime object containing agent information.
   * @throws {Error} if the runtime is null/undefined, if agentId is missing, if character configuration is missing,
   * or if there are any errors during registration.
   */
  public registerAgent(runtime: IAgentRuntime) {
    try {
      if (!runtime) {
        throw new Error('Attempted to register null/undefined runtime');
      }
      if (!runtime.agentId) {
        throw new Error('Runtime missing agentId');
      }
      if (!runtime.character) {
        throw new Error('Runtime missing character configuration');
      }

      // Register the agent
      this.agents.set(runtime.agentId, runtime);
      logger.debug(`Agent ${runtime.character.name} (${runtime.agentId}) added to agents map`);

      // Register TEE plugin if present
      const teePlugin = runtime.plugins.find((p) => p.name === 'phala-tee-plugin');
      if (teePlugin) {
        logger.debug(`Found TEE plugin for agent ${runtime.agentId}`);
        for (const provider of teePlugin.providers) {
          runtime.registerProvider(provider);
          logger.debug(`Registered TEE provider: ${provider.name}`);
        }
        for (const action of teePlugin.actions) {
          runtime.registerAction(action);
          logger.debug(`Registered TEE action: ${action.name}`);
        }
      }

      // Register routes
      logger.debug(
        `Registering ${runtime.routes.length} custom routes for agent ${runtime.character.name} (${runtime.agentId})`
      );
      // for (const route of runtime.routes) { // Routes are now handled by createPluginRouteHandler
      //   const routePath = route.path;
      //   try {
      //     switch (route.type) {
      //       case 'STATIC':
      //         this.app.get(routePath, (req, res) => route.handler(req, res, runtime));
      //         break;
      //       case 'GET':
      //         this.app.get(routePath, (req, res) => route.handler(req, res, runtime));
      //         break;
      //       case 'POST':
      //         this.app.post(routePath, (req, res) => route.handler(req, res, runtime));
      //         break;
      //       case 'PUT':
      //         this.app.put(routePath, (req, res) => route.handler(req, res, runtime));
      //         break;
      //       case 'DELETE':
      //         this.app.delete(routePath, (req, res) => route.handler(req, res, runtime));
      //         break;
      //       default:
      //         logger.error(`Unknown route type: ${route.type} for path ${routePath}`);
      //         continue;
      //     }
      //     logger.debug(`Registered ${route.type} route: ${routePath}`);
      //   } catch (error) {
      //     logger.error(`Failed to register route ${route.type} ${routePath}:`, error);
      //     throw error;
      //   }
      // }

      logger.success(
        `Successfully registered agent ${runtime.character.name} (${runtime.agentId})`
      );
    } catch (error) {
      logger.error('Failed to register agent:', error);
      throw error;
    }
  }

  /**
   * Unregisters an agent from the system.
   *
   * @param {UUID} agentId - The unique identifier of the agent to unregister.
   * @returns {void}
   */
  public unregisterAgent(agentId: UUID) {
    if (!agentId) {
      logger.warn('[AGENT UNREGISTER] Attempted to unregister undefined or invalid agent runtime');
      return;
    }

    try {
      // Retrieve the agent before deleting it from the map
      const agent = this.agents.get(agentId);

      if (agent) {
        // Stop all services of the agent before unregistering it
        try {
          agent.stop().catch((stopError) => {
            logger.error(
              `[AGENT UNREGISTER] Error stopping agent services for ${agentId}:`,
              stopError
            );
          });
          logger.debug(`[AGENT UNREGISTER] Stopping services for agent ${agentId}`);
        } catch (stopError) {
          logger.error(`[AGENT UNREGISTER] Error initiating stop for agent ${agentId}:`, stopError);
        }
      }

      // Delete the agent from the map
      this.agents.delete(agentId);
      logger.debug(`Agent ${agentId} removed from agents map`);
    } catch (error) {
      logger.error(`Error removing agent ${agentId}:`, error);
    }
  }

  /**
   * Add middleware to the server's request handling pipeline
   * @param {ServerMiddleware} middleware - The middleware function to be registered
   */
  public registerMiddleware(middleware: ServerMiddleware) {
    this.app.use(middleware);
  }

  /**
   * Starts the server on the specified port.
   *
   * @param {number} port - The port number on which the server should listen.
   * @throws {Error} If the port is invalid or if there is an error while starting the server.
   */
  public start(port: number) {
    try {
      if (!port || typeof port !== 'number') {
        throw new Error(`Invalid port number: ${port}`);
      }

      this.serverPort = port; // Save the port

      logger.debug(`Starting server on port ${port}...`);
      logger.debug(`Current agents count: ${this.agents.size}`);
      logger.debug(`Environment: ${process.env.NODE_ENV}`);

      // Use http server instead of app.listen
      this.server.listen(port, () => {
        // Display the dashboard URL with the correct port after the server is actually listening
        console.log(
          `\x1b[32mStartup successful!\nGo to the dashboard at \x1b[1mhttp://localhost:${port}\x1b[22m\x1b[0m`
        );
        // Add log for test readiness
        console.log(`AgentServer is listening on port ${port}`);

        logger.success(
          `REST API bound to 0.0.0.0:${port}. If running locally, access it at http://localhost:${port}.`
        );
        logger.debug(`Active agents: ${this.agents.size}`);
        this.agents.forEach((agent, id) => {
          logger.debug(`- Agent ${id}: ${agent.character.name}`);
        });
      });

      // Enhanced graceful shutdown
      const gracefulShutdown = async () => {
        logger.info('Received shutdown signal, initiating graceful shutdown...');

        // Stop all agents first
        logger.debug('Stopping all agents...');
        for (const [id, agent] of this.agents.entries()) {
          try {
            agent.stop();
            logger.debug(`Stopped agent ${id}`);
          } catch (error) {
            logger.error(`Error stopping agent ${id}:`, error);
          }
        }

        // Close server
        this.server.close(() => {
          logger.success('Server closed successfully');
          process.exit(0);
        });

        // Force close after timeout
        setTimeout(() => {
          logger.error('Could not close connections in time, forcing shutdown');
          process.exit(1);
        }, 5000);
      };

      process.on('SIGTERM', gracefulShutdown);
      process.on('SIGINT', gracefulShutdown);

      logger.debug('Shutdown handlers registered');
    } catch (error) {
      logger.error('Failed to start server:', error);
      throw error;
    }
  }

  /**
   * Stops the server if it is running. Closes the server connection,
   * stops the database connection, and logs a success message.
   */
  public async stop() {
    if (this.server) {
      this.server.close(() => {
        this.database.close();
        logger.success('Server stopped');
      });
    }
  }
}
