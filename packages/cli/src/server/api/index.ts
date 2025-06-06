import type { IAgentRuntime, UUID } from '@elizaos/core';
import {
  AgentRuntime,
  ChannelType,
  createUniqueUuid,
  EventType,
  logger as Logger,
  logger,
  SOCKET_MESSAGE_TYPE,
  validateUuid,
} from '@elizaos/core';
import type { Tracer } from '@opentelemetry/api';
import { SpanStatusCode } from '@opentelemetry/api';
import * as bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import crypto from 'node:crypto';
import http from 'node:http';
import { match, MatchFunction } from 'path-to-regexp';
import { Server as SocketIOServer } from 'socket.io';
import type { AgentServer } from '..';
import { agentRouter } from './agent';
import { envRouter } from './env';
import { teeRouter } from './tee';
import { worldRouter } from './world';
import { SocketIORouter } from '../socketio';
import fs from 'fs';
import path from 'path';

// Custom levels from @elizaos/core logger
const LOG_LEVELS = {
  ...Logger.levels.values,
} as const;

/**
 * Defines a type `LogLevel` as the keys of the `LOG_LEVELS` object.
 */
type LogLevel = keyof typeof LOG_LEVELS;

/**
 * Represents a log entry with specific properties.
 * @typedef {Object} LogEntry
 * @property {number} level - The level of the log entry.
 * @property {number} time - The time the log entry was created.
 * @property {string} msg - The message of the log entry.
 * @property {string | number | boolean | null | undefined} [key] - Additional key-value pairs for the log entry.
 */
interface LogEntry {
  level: number;
  time: number;
  msg: string;
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Processes attachments to convert localhost URLs to base64 data URIs
 * @param attachments - Array of attachment objects
 * @param agentId - The agent ID for logging purposes
 * @returns Promise<any[]> - Processed attachments with base64 data URIs
 */
async function processAttachments(attachments: any[], agentId?: string): Promise<any[]> {
  if (!attachments || attachments.length === 0) {
    return attachments;
  }

  logger.info(`[SOCKET] Processing ${attachments.length} attachment(s)`);
  logger.info(`[SOCKET] Current working directory: ${process.cwd()}`);
  logger.info(`[SOCKET] Raw attachments:`, JSON.stringify(attachments, null, 2));

  return Promise.all(
    attachments.map(async (attachment: any) => {
      // Skip if not a localhost URL
      if (!attachment.url || !attachment.url.includes('localhost')) {
        return attachment;
      }

      logger.info(`[SOCKET] Processing localhost URL: ${attachment.url}`);

      try {
        // Extract file path from URL
        // URL format: http://localhost:3000/media/uploads/{agentId}/{filename}
        const urlParts = attachment.url.split('/');
        const uploadsIndex = urlParts.indexOf('uploads');

        if (uploadsIndex === -1 || uploadsIndex >= urlParts.length - 2) {
          logger.warn(`[SOCKET] Invalid URL format: ${attachment.url}`);
          return attachment;
        }

        const agentIdFromUrl = urlParts[uploadsIndex + 1];
        const filename = urlParts[uploadsIndex + 2];

        // Try multiple possible paths based on where the server might be running from
        const possiblePaths = [
          path.join(process.cwd(), 'data', 'uploads', agentIdFromUrl, filename),
          path.join(process.cwd(), 'uploads', agentIdFromUrl, filename),
          path.join(
            process.cwd(),
            'packages',
            'project-starter',
            'data',
            'uploads',
            agentIdFromUrl,
            filename
          ),
        ];

        let filePath = null;
        for (const testPath of possiblePaths) {
          if (fs.existsSync(testPath)) {
            filePath = testPath;
            break;
          }
        }

        if (!filePath) {
          logger.warn(`[SOCKET] File not found in any of the expected paths`);
          logger.warn(`[SOCKET] Tried paths:`, possiblePaths);
          return attachment;
        }

        logger.info(`[SOCKET] Reading file from: ${filePath}`);

        // Check if this is an Excel file
        const ext = path.extname(filename).toLowerCase();
        const isExcelFile = ext === '.xlsx' || ext === '.xls';

        if (isExcelFile) {
          logger.info(`[SOCKET] Processing Excel file: ${filename}`);

          try {
            // Import Excel service for processing
            const { ExcelService } = await import('@elizaos/plugin-excel');
            const excelService = new ExcelService(null as any);

            // Generate AI-friendly summary instead of Base64 data
            const aiSummary = await excelService.generateAIFriendlySummary(filePath);
            const fileInfo = await excelService.getExcelInfo(filePath);

            logger.info(`[SOCKET] Excel processing complete. Summary length: ${aiSummary.length} chars`);

            // Return Excel attachment with processed summary
            return {
              ...attachment,
              type: 'excel',
              mimeType: ext === '.xlsx'
                ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                : 'application/vnd.ms-excel',
              filename: filename,
              fileSize: fileInfo.fileSize,
              sheetCount: fileInfo.sheetCount,
              sheetNames: fileInfo.sheetNames,
              summary: aiSummary,
              // Keep original URL for chart generation
              originalUrl: attachment.url,
              // Don't include Base64 data for Excel files
              processedForAI: true
            };

          } catch (excelError) {
            logger.error(`[SOCKET] Error processing Excel file:`, excelError);
            // Fallback to basic attachment info without Base64
            return {
              ...attachment,
              type: 'excel',
              filename: filename,
              error: 'Excel processing failed, file available for download',
              processedForAI: false
            };
          }
        }

        // For non-Excel files, continue with existing Base64 processing
        const fileBuffer = fs.readFileSync(filePath);
        const base64Data = fileBuffer.toString('base64');

        // Determine MIME type from file extension or content
        let mimeType = attachment.contentType || 'application/octet-stream';

        // If contentType is generic or missing, try to determine from file extension
        if (
          !attachment.contentType ||
          attachment.contentType === 'image' ||
          attachment.contentType === 'application/octet-stream'
        ) {
          const mimeTypes: { [key: string]: string } = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
            '.bmp': 'image/bmp',
            '.ico': 'image/x-icon',
            '.tiff': 'image/tiff',
            '.tif': 'image/tiff',
          };

          if (mimeTypes[ext]) {
            mimeType = mimeTypes[ext];
          } else {
            // Try to detect from file content (magic bytes)
            if (fileBuffer.length >= 4) {
              const header = fileBuffer.toString('hex', 0, 4).toUpperCase();

              if (header.startsWith('FFD8FF')) {
                mimeType = 'image/jpeg';
              } else if (header === '89504E47') {
                mimeType = 'image/png';
              } else if (header === '47494638') {
                mimeType = 'image/gif';
              } else if (header.startsWith('424D')) {
                mimeType = 'image/bmp';
              } else if (
                fileBuffer.toString('utf8', 0, 5) === '<?xml' ||
                fileBuffer.toString('utf8', 0, 4) === '<svg'
              ) {
                mimeType = 'image/svg+xml';
              }
            }
          }
        }

        const dataUri = `data:${mimeType};base64,${base64Data}`;

        logger.info(`[SOCKET] Successfully converted to base64 data URI`);
        logger.info(`[SOCKET] File size: ${fileBuffer.length} bytes`);
        logger.info(`[SOCKET] MIME type: ${mimeType}`);
        logger.info(`[SOCKET] Base64 preview: ${base64Data.substring(0, 50)}...`);

        return {
          ...attachment,
          url: dataUri,
          originalUrl: attachment.url,
          detectedMimeType: mimeType,
        };
      } catch (error) {
        logger.error(`[SOCKET] Error processing attachment:`, error);
        return attachment;
      }
    })
  );
}

/**
 * Processes an incoming socket message, handling agent logic and potential instrumentation.
 */
async function processSocketMessage(
  runtime: IAgentRuntime,
  payload: any,
  socketId: string,
  socketRoomId: string,
  io: SocketIOServer,
  tracer?: Tracer
) {
  const agentId = runtime.agentId;
  const senderId = payload.senderId;

  // Ensure the sender and recipient are different agents
  if (senderId === agentId) {
    logger.debug(`Message sender and recipient are the same agent (${agentId}), ignoring.`);
    return;
  }

  if (!payload.message || !payload.message.length) {
    logger.warn(`no message found for agent ${agentId}`);
    return;
  }

  const entityId = createUniqueUuid(runtime, senderId);
  const uniqueRoomId = createUniqueUuid(runtime, socketRoomId);
  const source = payload.source;
  const worldId = payload.worldId;

  const executeLogic = async () => {
    // Ensure connection between entity and room
    await runtime.ensureConnection({
      entityId: entityId,
      roomId: uniqueRoomId,
      userName: payload.senderName || 'User',
      name: payload.senderName || 'User',
      source: 'client_chat',
      channelId: uniqueRoomId,
      serverId: 'client-chat',
      type: ChannelType.DM,
      worldId: worldId || createUniqueUuid(runtime, 'client-chat'),
    });

    // Create unique message ID
    const messageId = crypto.randomUUID() as UUID;

    // Process attachments to convert localhost URLs to base64
    let processedAttachments = payload.attachments;
    if (payload.attachments && payload.attachments.length > 0) {
      processedAttachments = await processAttachments(payload.attachments, agentId);
    }

    // Create message object for the agent
    const newMessage = {
      id: messageId,
      entityId: entityId,
      agentId: runtime.agentId,
      roomId: uniqueRoomId,
      content: {
        text: payload.message,
        source: `${source}:${payload.senderName}`,
        attachments: processedAttachments || undefined,
      },
      metadata: {
        entityName: payload.senderName,
      },
      createdAt: Date.now(),
    };

    // Define callback for agent responses
    const callback = async (content) => {
      // NOTE: This callback runs *after* the main span might have ended.
      // If detailed tracing of the callback is needed, a new linked span could be created here.
      try {
        logger.debug('Callback received content:', {
          contentType: typeof content,
          contentKeys: content ? Object.keys(content) : 'null',
        });
        if (messageId && !content.inReplyTo) content.inReplyTo = messageId;

        const broadcastData: Record<string, any> = {
          senderId: runtime.agentId,
          senderName: runtime.character.name,
          text: content.text || '',
          roomId: socketRoomId,
          createdAt: Date.now(),
          source,
        };

        // Check if the response is simple, has a message, AND has no actions or only a REPLY action
        const isSimple = content.simple === true || content.simple === 'true';
        const hasMessage = !!content.message;
        const actions = content.actions || [];
        const isReplyOnlyAction =
          actions.length === 0 || (actions.length === 1 && actions[0] === 'REPLY');

        if (isSimple && hasMessage && isReplyOnlyAction) {
          broadcastData.text = content.message;
        }

        if (content.thought) broadcastData.thought = content.thought;
        if (content.actions) broadcastData.actions = content.actions;

        logger.debug(`Broadcasting message to room ${socketRoomId}`, {
          room: socketRoomId,
        });
        io.to(socketRoomId).emit('messageBroadcast', broadcastData);
        io.emit('messageBroadcast', broadcastData);

        // Save agent's response as memory with provider information
        const memory = {
          id: crypto.randomUUID() as UUID,
          entityId: runtime.agentId,
          agentId: runtime.agentId,
          content: {
            ...content,
            inReplyTo: messageId,
            channelType: ChannelType.DM,
            source: `${source}:agent`,
            ...(content.providers &&
              content.providers.length > 0 && {
              providers: content.providers,
            }),
          },
          roomId: uniqueRoomId,
          createdAt: Date.now(),
        };
        logger.debug('Memory object for response:', memory);
        await runtime.createMemory(memory, 'messages');
        return [content];
      } catch (error) {
        logger.error('Error in socket message callback:', error);
        return [];
      }
    };

    logger.debug('Emitting MESSAGE_RECEIVED', { messageId: newMessage.id });

    // Emit message received event to trigger agent's message handler
    runtime.emitEvent(EventType.MESSAGE_RECEIVED, {
      runtime: runtime,
      message: newMessage,
      callback,
      onComplete: () => {
        // Emit completion event (client might use this for UI like stopping loading indicators)
        io.to(socketRoomId).emit('messageComplete', {
          roomId: socketRoomId,
          agentId,
          senderId,
        });
        // Also explicitly send control message to re-enable input
        io.to(socketRoomId).emit('controlMessage', {
          action: 'enable_input',
          roomId: socketRoomId,
        });
        logger.debug('[SOCKET] Sent messageComplete and enable_input controlMessage', {
          roomId: socketRoomId,
          agentId,
          senderId,
        });
      },
    });
  };

  // Handle instrumentation if tracer is provided and enabled
  if (tracer && (runtime as AgentRuntime).instrumentationService?.isEnabled?.()) {
    logger.debug('[SOCKET MESSAGE] Instrumentation enabled. Starting span.', {
      agentId,
      entityId,
      roomId: uniqueRoomId,
    });
    await tracer.startActiveSpan('socket.message.received', async (span) => {
      span.setAttributes({
        'eliza.agent.id': agentId,
        'eliza.room.id': uniqueRoomId,
        'eliza.entity.id': entityId,
        'eliza.channel.type': ChannelType.DM,
        'eliza.message.source': source,
        'eliza.socket.id': socketId,
      });

      try {
        await executeLogic();
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        logger.error('Error processing instrumented socket message:', error);
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        throw error;
      } finally {
        span.end();
        logger.debug('[SOCKET MESSAGE] Ending instrumentation span.', {
          agentId,
          entityId,
          roomId: uniqueRoomId,
        });
      }
    });
  } else {
    // Execute logic without instrumentation
    logger.debug('[SOCKET MESSAGE] Instrumentation disabled or unavailable, skipping span.', {
      agentId,
      entityId,
      roomId: uniqueRoomId,
    });
    try {
      await executeLogic();
    } catch (error) {
      logger.error('Error processing socket message (no instrumentation):', error);
    }
  }
}

/**
 * Sets up Socket.io server for real-time messaging
 * @param server HTTP Server instance
 * @param agents Map of agent runtimes
 */
// Global reference to SocketIO router for log streaming
let socketIORouter: SocketIORouter | null = null;

export function setupSocketIO(
  server: http.Server,
  agents: Map<UUID, IAgentRuntime>
): SocketIOServer {
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Setup the new SocketIO router
  socketIORouter = new SocketIORouter(agents);
  socketIORouter.setupListeners(io);

  // Setup log streaming integration
  setupLogStreaming(io, socketIORouter);

  // Fallback to old behavior for compatibility
  // Map to track which agents are in which rooms
  const roomParticipants: Map<string, Set<UUID>> = new Map();

  // Handle socket connections with existing logic as fallback
  io.on('connection', (socket) => {
    const { agentId, roomId } = socket.handshake.query as { agentId: string; roomId: string };

    logger.debug('Socket connected', { agentId, roomId, socketId: socket.id });

    // Join the specified room
    if (roomId) {
      socket.join(roomId);
      logger.debug(`Socket ${socket.id} joined room ${roomId}`);
    }

    // Handle messages from clients
    socket.on('message', async (messageData) => {
      logger.debug('Socket message received', { messageData, socketId: socket.id });

      if (messageData.type === SOCKET_MESSAGE_TYPE.SEND_MESSAGE) {
        const payload = messageData.payload;
        const socketRoomId = payload.roomId;
        const senderId = payload.senderId;

        // Get all agents associated with this room (using roomParticipants map)
        const agentsInRoom = roomParticipants.get(socketRoomId) || new Set([socketRoomId as UUID]);

        for (const agentId of agentsInRoom) {
          const agentRuntime = agents.get(agentId);

          if (!agentRuntime) {
            logger.warn(`Agent runtime not found for ${agentId} in room ${socketRoomId}`);
            continue;
          }

          // Extract tracer if instrumentation is available
          const concreteRuntime = agentRuntime as AgentRuntime;
          const tracer =
            concreteRuntime.instrumentationService?.isEnabled?.() && concreteRuntime.tracer
              ? concreteRuntime.tracer
              : undefined;

          // Call the unified processing function
          await processSocketMessage(agentRuntime, payload, socket.id, socketRoomId, io, tracer);
        }
      } else if (messageData.type === SOCKET_MESSAGE_TYPE.ROOM_JOINING) {
        const payload = messageData.payload;
        const roomId = payload.roomId;
        const agentIds = payload.agentIds;

        roomParticipants.set(roomId, new Set());

        agentIds?.forEach((agentId: UUID) => {
          if (agents.has(agentId as UUID)) {
            // Add agent to room participants
            roomParticipants.get(roomId)!.add(agentId as UUID);
            logger.debug(`Agent ${agentId} joined room ${roomId}`);
          }
        });
        logger.debug('roomParticipants', roomParticipants);

        logger.debug(`Client ${socket.id} joining room ${roomId}`);
      }
    });

    // Handle disconnections
    socket.on('disconnect', () => {
      logger.debug('Socket disconnected', { socketId: socket.id });
      // Note: We're not removing agents from rooms on disconnect
      // as they should remain participants even when not connected
    });
  });

  return io;
}

// Setup log streaming integration with the logger
function setupLogStreaming(io: SocketIOServer, router: SocketIORouter) {
  // Access the logger's destination to hook into log events
  const loggerInstance = logger as any;
  const destination = loggerInstance[Symbol.for('pino-destination')];

  if (destination && typeof destination.write === 'function') {
    // Store original write method
    const originalWrite = destination.write.bind(destination);

    // Override write method to broadcast logs via WebSocket
    destination.write = function (data: string | any) {
      // Call original write first
      originalWrite(data);

      // Parse and broadcast log entry
      try {
        let logEntry;
        if (typeof data === 'string') {
          logEntry = JSON.parse(data);
        } else {
          logEntry = data;
        }

        // Add timestamp if not present
        if (!logEntry.time) {
          logEntry.time = Date.now();
        }

        // Broadcast to WebSocket clients
        router.broadcastLog(io, logEntry);
      } catch (error) {
        // Ignore JSON parse errors for non-log data
      }
    };
  }
}

// Extracted function to handle plugin routes
export function createPluginRouteHandler(agents: Map<UUID, IAgentRuntime>): express.RequestHandler {
  return (req, res, next) => {
    logger.debug('Handling plugin request in the plugin route handler', {
      path: req.path,
      method: req.method,
      query: req.query,
    });

    // Debug output for JavaScript requests
    if (
      req.path.endsWith('.js') ||
      req.path.includes('.js?') ||
      req.path.match(/index-[A-Za-z0-9]{8}\.js/) // Escaped dot for regex
    ) {
      logger.debug(`JavaScript request in plugin handler: ${req.method} ${req.path}`);
      res.setHeader('Content-Type', 'application/javascript');
    }

    if (agents.size === 0) {
      logger.debug('No agents available, skipping plugin route handling.');
      return next();
    }

    let handled = false;
    const agentIdFromQuery = req.query.agentId as UUID | undefined;
    const reqPath = req.path; // Path to match against plugin routes (e.g., /hello2)

    if (agentIdFromQuery && validateUuid(agentIdFromQuery)) {
      const runtime = agents.get(agentIdFromQuery);
      if (runtime) {
        logger.debug(
          `Agent-scoped request for Agent ID: ${agentIdFromQuery} from query. Path: ${reqPath}`
        );
        for (const route of runtime.routes) {
          if (handled) break;

          const methodMatches = req.method.toLowerCase() === route.type.toLowerCase();
          if (!methodMatches) continue;

          const routePath = route.path.startsWith('/') ? route.path : `/${route.path}`;

          if (routePath.endsWith('/*')) {
            const baseRoute = routePath.slice(0, -1);
            if (reqPath.startsWith(baseRoute)) {
              logger.debug(
                `Agent ${agentIdFromQuery} plugin wildcard route: [${route.type.toUpperCase()}] ${routePath} for request: ${reqPath}`
              );
              try {
                route.handler(req, res, runtime);
                handled = true;
              } catch (error) {
                logger.error(
                  `Error handling plugin wildcard route for agent ${agentIdFromQuery}: ${routePath}`,
                  {
                    error,
                    path: reqPath,
                    agent: agentIdFromQuery,
                  }
                );
                if (!res.headersSent) {
                  const status =
                    error.code === 'ENOENT' || error.message?.includes('not found') ? 404 : 500;
                  res
                    .status(status)
                    .json({ error: error.message || 'Error processing wildcard route' });
                }
                handled = true;
              }
            }
          } else {
            logger.debug(
              `Agent ${agentIdFromQuery} attempting plugin route match: [${route.type.toUpperCase()}] ${routePath} vs request path: ${reqPath}`
            );
            let matcher: MatchFunction<object>;
            try {
              matcher = match(routePath, { decode: decodeURIComponent });
            } catch (err) {
              logger.error(
                `Invalid plugin route path syntax for agent ${agentIdFromQuery}: "${routePath}"`,
                err
              );
              continue;
            }

            const matched = matcher(reqPath);

            if (matched) {
              logger.debug(
                `Agent ${agentIdFromQuery} plugin route matched: [${route.type.toUpperCase()}] ${routePath} vs request path: ${reqPath}`
              );
              req.params = { ...(matched.params || {}) };
              try {
                route.handler(req, res, runtime);
                handled = true;
              } catch (error) {
                logger.error(
                  `Error handling plugin route for agent ${agentIdFromQuery}: ${routePath}`,
                  {
                    error,
                    path: reqPath,
                    agent: agentIdFromQuery,
                    params: req.params,
                  }
                );
                if (!res.headersSent) {
                  const status =
                    error.code === 'ENOENT' || error.message?.includes('not found') ? 404 : 500;
                  res.status(status).json({ error: error.message || 'Error processing route' });
                }
                handled = true;
              }
            }
          }
        } // End route loop
      } else {
        logger.warn(
          `Agent ID ${agentIdFromQuery} provided in query, but agent runtime not found. Path: ${reqPath}. Passing to next middleware.`
        );
      }
    } else if (agentIdFromQuery && !validateUuid(agentIdFromQuery)) {
      logger.warn(
        `Invalid Agent ID format in query: ${agentIdFromQuery}. Path: ${reqPath}. Passing to next middleware.`
      );
    } else {
      // No agentId in query, or it was invalid. Try matching globally for any agent that might have this route.
      // This allows for non-agent-specific plugin routes if any plugin defines them.
      logger.debug(`No valid agentId in query. Trying global match for path: ${reqPath}`);
      for (const [_, runtime] of agents) {
        // Iterate over all agents
        if (handled) break; // If handled by a previous agent's route (e.g. specific match)

        for (const route of runtime.routes) {
          if (handled) break;

          const methodMatches = req.method.toLowerCase() === route.type.toLowerCase();
          if (!methodMatches) continue;

          const routePath = route.path.startsWith('/') ? route.path : `/${route.path}`;

          // Do not allow agent-specific routes (containing placeholders like :id) to be matched globally
          if (routePath.includes(':')) {
            continue;
          }

          if (routePath.endsWith('/*')) {
            const baseRoute = routePath.slice(0, -1);
            if (reqPath.startsWith(baseRoute)) {
              logger.debug(
                `Global plugin wildcard route: [${route.type.toUpperCase()}] ${routePath} (Agent: ${runtime.agentId}) for request: ${reqPath}`
              );
              try {
                route.handler(req, res, runtime);
                handled = true;
              } catch (error) {
                logger.error(
                  `Error handling global plugin wildcard route ${routePath} (Agent: ${runtime.agentId})`,
                  { error, path: reqPath }
                );
                if (!res.headersSent) {
                  const status =
                    error.code === 'ENOENT' || error.message?.includes('not found') ? 404 : 500;
                  res
                    .status(status)
                    .json({ error: error.message || 'Error processing wildcard route' });
                }
                handled = true;
              }
            }
          } else if (reqPath === routePath) {
            // Exact match for global routes
            logger.debug(
              `Global plugin route matched: [${route.type.toUpperCase()}] ${routePath} (Agent: ${runtime.agentId}) for request: ${reqPath}`
            );
            try {
              route.handler(req, res, runtime);
              handled = true;
            } catch (error) {
              logger.error(
                `Error handling global plugin route ${routePath} (Agent: ${runtime.agentId})`,
                { error, path: reqPath }
              );
              if (!res.headersSent) {
                const status =
                  error.code === 'ENOENT' || error.message?.includes('not found') ? 404 : 500;
                res.status(status).json({ error: error.message || 'Error processing route' });
              }
              handled = true;
            }
          }
        } // End route loop for global matching
      } // End agent loop for global matching
    }

    if (handled) {
      return;
    }

    logger.debug(`No plugin route handled ${req.method} ${req.path}, passing to next middleware.`);
    next();
  };
}

/**
 * Creates an API router with various endpoints and middleware.
 * @param {Map<UUID, IAgentRuntime>} agents - Map of agents with UUID as key and IAgentRuntime as value.
 * @param {AgentServer} [server] - Optional AgentServer instance.
 * @returns {express.Router} The configured API router.
 */
export function createApiRouter(
  agents: Map<UUID, IAgentRuntime>,
  server?: AgentServer
): express.Router {
  const router = express.Router();

  // Setup middleware
  router.use(cors());
  router.use(bodyParser.json());
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(
    express.json({
      limit: process.env.EXPRESS_MAX_PAYLOAD || '100kb',
    })
  );

  // Explicitly define the hello endpoint with strict JSON response
  router.get('/hello', (_req, res) => {
    logger.info('Hello endpoint hit');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({ message: 'Hello World!' }));
  });

  // Add a basic API test endpoint that returns the agent count
  router.get('/status', (_req, res) => {
    logger.info('Status endpoint hit');
    res.setHeader('Content-Type', 'application/json');
    res.send(
      JSON.stringify({
        status: 'ok',
        agentCount: agents.size,
        timestamp: new Date().toISOString(),
      })
    );
  });

  // Check if the server is running
  router.get('/ping', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(
      JSON.stringify({
        pong: true,
        timestamp: Date.now(),
      })
    );
  });

  // Mount specific sub-routers FIRST
  router.use('/agents', agentRouter(agents, server));
  router.use('/world', worldRouter(server));
  router.use('/envs', envRouter());
  router.use('/tee', teeRouter(agents));

  // Add the plugin routes middleware AFTER specific routers
  router.use(createPluginRouteHandler(agents));

  router.get('/stop', (_req, res) => {
    server?.stop(); // Use optional chaining in case server is undefined
    logger.log(
      {
        apiRoute: '/stop',
      },
      'Server stopping...'
    );
    res.json({ message: 'Server stopping...' });
  });

  // Logs endpoint
  const logsHandler = (req, res) => {
    const since = req.query.since ? Number(req.query.since) : Date.now() - 3600000; // Default 1 hour
    const requestedLevel = (req.query.level?.toString().toLowerCase() || 'all') as LogLevel;
    const requestedAgentName = req.query.agentName?.toString() || 'all';
    const requestedAgentId = req.query.agentId?.toString() || 'all'; // Add support for agentId parameter
    const limit = Math.min(Number(req.query.limit) || 100, 1000); // Max 1000 entries

    // Access the underlying logger instance
    const destination = (logger as any)[Symbol.for('pino-destination')];

    if (!destination?.recentLogs) {
      return res.status(500).json({
        error: 'Logger destination not available',
        message: 'The logger is not configured to maintain recent logs',
      });
    }

    try {
      // Get logs from the destination's buffer
      const recentLogs: LogEntry[] = destination.recentLogs();
      const requestedLevelValue = LOG_LEVELS[requestedLevel] || LOG_LEVELS.info;

      const filtered = recentLogs
        .filter((log) => {
          // Filter by time always
          const timeMatch = log.time >= since;

          // Filter by level - return all logs if requestedLevel is 'all'
          let levelMatch = true;
          if (requestedLevel && requestedLevel !== 'all') {
            levelMatch = log.level === requestedLevelValue;
          }

          // Filter by agentName if provided - return all if 'all'
          const agentNameMatch =
            !requestedAgentName || requestedAgentName === 'all'
              ? true
              : log.agentName === requestedAgentName;

          // Filter by agentId if provided - return all if 'all'
          const agentIdMatch =
            !requestedAgentId || requestedAgentId === 'all'
              ? true
              : log.agentId === requestedAgentId;

          return timeMatch && levelMatch && agentNameMatch && agentIdMatch;
        })
        .slice(-limit);

      // Add debug log to help troubleshoot
      logger.debug('Logs request processed', {
        requestedLevel,
        requestedLevelValue,
        requestedAgentName,
        requestedAgentId,
        filteredCount: filtered.length,
        totalLogs: recentLogs.length,
        sampleLogAgentNames: recentLogs.slice(0, 5).map((log) => log.agentName),
        uniqueAgentNamesInLogs: [...new Set(recentLogs.map((log) => log.agentName))].filter(
          Boolean
        ),
        agentNameMatches: recentLogs.filter((log) => log.agentName === requestedAgentName).length,
      });

      res.json({
        logs: filtered,
        count: filtered.length,
        total: recentLogs.length,
        requestedLevel: requestedLevel,
        agentName: requestedAgentName,
        agentId: requestedAgentId,
        levels: Object.keys(LOG_LEVELS),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to retrieve logs',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  router.get('/logs', logsHandler);
  router.post('/logs', logsHandler);

  // Handler for clearing logs
  const logsClearHandler = (_req, res) => {
    try {
      // Access the underlying logger instance
      const destination = (logger as any)[Symbol.for('pino-destination')];

      if (!destination?.clear) {
        return res.status(500).json({
          error: 'Logger clear method not available',
          message: 'The logger is not configured to clear logs',
        });
      }

      // Clear the logs
      destination.clear();

      logger.debug('Logs cleared via API endpoint');
      res.json({ status: 'success', message: 'Logs cleared successfully' });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to clear logs',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  // Add DELETE endpoint for clearing logs
  router.delete('/logs', logsClearHandler);

  // Health check endpoints
  router.get('/health', (_req, res) => {
    logger.log({ apiRoute: '/health' }, 'Health check route hit');
    const healthcheck = {
      status: 'OK',
      version: process.env.APP_VERSION || 'unknown',
      timestamp: new Date().toISOString(),
      dependencies: {
        agents: agents.size > 0 ? 'healthy' : 'no_agents',
      },
    };

    const statusCode = healthcheck.dependencies.agents === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthcheck);
  });

  return router;
}
