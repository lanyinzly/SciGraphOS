import type { Content, IAgentRuntime, Memory, UUID } from '@elizaos/core';
import { ChannelType, createUniqueUuid, logger, validateUuid } from '@elizaos/core';
import { SOCKET_MESSAGE_TYPE } from '@elizaos/core';
import type { Server as SocketIOServer } from 'socket.io';
import type { RemoteSocket, Socket } from 'socket.io';
import type { DefaultEventsMap } from 'socket.io/dist/typed-events';

export class SocketIORouter {
  private agents: Map<UUID, IAgentRuntime>;
  private connections: Map<string, UUID>;
  private logStreamConnections: Map<string, { agentName?: string; level?: string }>;

  constructor(agents: Map<UUID, IAgentRuntime>) {
    this.agents = agents;
    this.connections = new Map();
    this.logStreamConnections = new Map();
    logger.debug(`[SocketIO] Router initialized with ${this.agents.size} agents`);
  }

  setupListeners(io: SocketIOServer) {
    logger.debug(`[SocketIO] Setting up Socket.IO event listeners`);

    // Log registered message types for debugging
    const messageTypes = Object.keys(SOCKET_MESSAGE_TYPE).map(
      (key) => `${key}: ${SOCKET_MESSAGE_TYPE[key as keyof typeof SOCKET_MESSAGE_TYPE]}`
    );
    logger.debug(`[SocketIO] Registered message types: ${messageTypes.join(', ')}`);

    io.on('connection', (socket: Socket) => {
      this.handleNewConnection(socket, io);
    });
  }

  private handleNewConnection(socket: Socket, io: SocketIOServer) {
    logger.debug(`[SocketIO] New connection: ${socket.id}`);

    // Log registered rooms for debugging
    const rooms = io.sockets.adapter.rooms;
    logger.debug(`[SocketIO] Current rooms: ${Array.from(rooms.keys()).join(', ')}`);

    // Set up direct event handlers
    socket.on(String(SOCKET_MESSAGE_TYPE.ROOM_JOINING), (payload) => {
      logger.debug(`[SocketIO] Room joining event received: ${JSON.stringify(payload)}`);
      this.handleRoomJoining(socket, payload);
    });

    socket.on(String(SOCKET_MESSAGE_TYPE.SEND_MESSAGE), (payload) => {
      const messagePreview =
        payload.message?.substring(0, 50) + (payload.message?.length > 50 ? '...' : '');
      logger.debug(
        `[SocketIO] Message event received: ${JSON.stringify({
          senderId: payload.senderId,
          roomId: payload.roomId,
          messagePreview,
        })}`
      );
      this.handleBroadcastMessage(socket, payload);
    });

    // Handle generic 'message' event with type-based routing
    socket.on('message', (data) => {
      this.handleGenericMessage(socket, data);
    });

    // Handle log streaming events
    socket.on('subscribe_logs', () => this.handleLogSubscription(socket));
    socket.on('unsubscribe_logs', () => this.handleLogUnsubscription(socket));
    socket.on('update_log_filters', (filters) => this.handleLogFilterUpdate(socket, filters));

    // Handle other events
    socket.on('disconnect', () => this.handleDisconnect(socket));
    socket.on('error', (error) => {
      logger.error(`[SocketIO] Socket error: ${error}`);
    });

    if (process.env.NODE_ENV === 'development') {
      // Log all events for debugging
      socket.onAny((event, ...args) => {
        logger.debug(`[SocketIO] Received event '${event}' with args: ${JSON.stringify(args)}`);
      });
    }

    // Confirm connection to client
    socket.emit('connection_established', {
      message: 'Connected to Eliza Socket.IO server',
      socketId: socket.id,
    });
  }

  private handleGenericMessage(socket: Socket, data: any) {
    logger.debug(`[SocketIO] Generic 'message' event received. Type: ${data?.type || 'unknown'}`);

    try {
      if (!(data && typeof data === 'object' && 'type' in data && 'payload' in data)) {
        logger.warn(`[SocketIO] Malformed 'message' event data. Keys: ${Object.keys(data || {}).join(', ')}`);
        return;
      }

      const { type, payload } = data;

      switch (type) {
        case SOCKET_MESSAGE_TYPE.ROOM_JOINING:
          logger.debug(`[SocketIO] Handling room joining via 'message' event`);
          this.handleRoomJoining(socket, payload);
          break;

        case SOCKET_MESSAGE_TYPE.SEND_MESSAGE:
          logger.debug(`[SocketIO] Handling message sending via 'message' event`);
          this.handleBroadcastMessage(socket, payload);
          break;

        default:
          logger.warn(`[SocketIO] Unknown message type received: ${type}`);
          break;
      }
    } catch (error) {
      logger.error(`[SocketIO] Error processing 'message' event: ${error.message}`);
    }
  }

  private handleRoomJoining(socket: Socket, payload: any) {
    const { roomId, agentId } = payload;

    if (!roomId || !agentId) {
      this.sendErrorResponse(socket, `agentId and roomId are required`);
      return;
    }

    const agentUuid = validateUuid(agentId);

    this.connections.set(socket.id, agentUuid);
    socket.join(roomId);

    // Log connection state for debugging
    logger.debug(
      `[SocketIO] Current connections: ${Array.from(this.connections.entries())
        .map(([socketId, agId]) => `${socketId} -> ${agId}`)
        .join(', ')}`
    );
    logger.debug(`[SocketIO] Available agents: ${Array.from(this.agents.keys()).join(', ')}`);

    const successMessage = `Agent ${agentUuid} joined room ${roomId}.`;
    const responsePayload = {
      message: successMessage,
      roomId,
      agentId: agentUuid,
    };

    // Send response in both formats for compatibility
    socket.emit('message', {
      type: 'room_joined',
      payload: responsePayload,
    });
    socket.emit('room_joined', responsePayload);

    logger.debug(`[SocketIO] ${successMessage}`);
  }

  private async handleBroadcastMessage(socket: Socket, payload: any) {
    const { senderId, senderName, message, roomId, worldId, source } = payload;

    logger.debug(`[SocketIO] Processing message in room ${roomId} from ${senderName || senderId}`);

    if (!roomId) {
      this.sendErrorResponse(socket, `roomId is required`);
      return;
    }

    try {
      const socketsInRoom = await socket.to(roomId).fetchSockets();
      logger.debug(`[SocketIO] Found ${socketsInRoom.length} sockets in room ${roomId}`);

      if (socketsInRoom.length === 0) {
        this.sendErrorResponse(socket, `No agents found in room ${roomId}`);
        return;
      }

      // Find a valid runtime to create UUIDs
      let runtime: IAgentRuntime | undefined;
      for (const [agentId, agentRuntime] of this.agents.entries()) {
        runtime = agentRuntime;
        break;
      }

      if (!runtime) {
        this.sendErrorResponse(socket, `No agent runtime available`);
        return;
      }

      // Create a properly typed room UUID for use in processing
      const typedRoomId = createUniqueUuid(runtime, roomId);

      await this.processMessageForRecipients(socket, socketsInRoom, {
        senderId,
        senderName,
        message,
        roomId: typedRoomId,
        worldId,
        source,
      });

      // Broadcast to room using the original roomId for socket.io
      this.broadcastMessageToRoom(socket, roomId, payload);
    } catch (error) {
      logger.error(`[SocketIO] Error processing broadcast: ${error.message}`, error);
      this.sendErrorResponse(socket, `[SocketIO] Error fetching sockets in room: ${error.message}`);
    }
  }

  private async processMessageForRecipients(
    socket: Socket,
    socketsInRoom: RemoteSocket<DefaultEventsMap, any>[],
    messageData: {
      senderId: string;
      senderName?: string;
      message: string;
      roomId: UUID;
      worldId?: string;
      source?: string;
    }
  ) {
    const { senderId, senderName, message, roomId, worldId, source } = messageData;

    for (const clientSocket of socketsInRoom) {
      const agentId = this.connections.get(clientSocket.id);
      logger.debug(
        `[SocketIO] Processing message for agent ${agentId} in socket ${clientSocket.id}`
      );

      if (!agentId) {
        logger.warn(`[SocketIO] No agent ID found for socket ${clientSocket.id}`);
        continue;
      }

      const senderUuid = validateUuid(senderId);
      if (agentId === senderUuid) {
        logger.debug(`[SocketIO] Skipping sender's own socket ${clientSocket.id}`);
        continue;
      }

      await this.createMessageInAgentMemory(socket, {
        senderId,
        senderName,
        agentId,
        message,
        roomId,
        worldId,
        source,
      });
    }
  }

  private async createMessageInAgentMemory(
    socket: Socket,
    data: {
      senderId: string;
      senderName?: string;
      agentId: UUID;
      message: string;
      roomId: UUID;
      worldId?: string;
      source?: string;
    }
  ) {
    const { senderId, senderName, agentId, message, roomId, worldId, source } = data;

    logger.debug(`[SocketIO] Creating new message for agent ${agentId}`);

    // Find the appropriate runtime
    const runtime = this.agents.get(agentId) || this.agents.get(senderId as UUID);
    if (!runtime) {
      this.sendErrorResponse(socket, `[SocketIO] No runtime found.`);
      return;
    }

    const text = message?.trim();
    if (!text) {
      this.sendErrorResponse(socket, `[SocketIO] No text found.`);
      return;
    }

    try {
      // Generate proper UUIDs
      const uniqueRoomId = createUniqueUuid(runtime, roomId);
      const entityId = createUniqueUuid(runtime, senderId);

      // Ensure connection for entity
      try {
        logger.debug(
          `[SocketIO] Ensuring connection for entity ${entityId} in room ${uniqueRoomId}`
        );
        await runtime.ensureConnection({
          entityId,
          roomId: uniqueRoomId,
          userName: senderName,
          name: senderName,
          source,
          type: ChannelType.API,
          worldId: (worldId as UUID) || createUniqueUuid(runtime, 'client-chat'),
        });
        logger.debug(`[SocketIO] Connection ensured successfully`);
      } catch (error) {
        logger.error(`[SocketIO] Error in ensureConnection: ${error.message}`);
      }

      // Create or update relationship
      try {
        await this.ensureRelationship(runtime, entityId);
      } catch (error) {
        logger.error(`[SocketIO] Error handling relationship: ${error.message}`);
      }

      // Create memory for message
      await this.createMemoryForMessage(runtime, {
        text,
        source,
        entityId,
        roomId: uniqueRoomId,
      });
    } catch (error) {
      logger.error(`[SocketIO] Error processing message: ${error.message}`, error);
      this.sendErrorResponse(socket, `[SocketIO] Error processing message: ${error.message}`);
    }
  }

  private async ensureRelationship(runtime: IAgentRuntime, entityId: UUID) {
    const existingRelationship = await runtime.getRelationship({
      sourceEntityId: entityId,
      targetEntityId: runtime.agentId,
    });

    if (!existingRelationship && entityId !== runtime.agentId) {
      logger.debug(
        `[SocketIO] Creating new relationship between ${entityId} and ${runtime.agentId}`
      );
      await runtime.createRelationship({
        sourceEntityId: entityId,
        targetEntityId: runtime.agentId,
        tags: ['message_interaction'],
        metadata: {
          lastInteraction: Date.now(),
          channel: 'socketio',
        },
      });
      logger.debug(`[SocketIO] Relationship created successfully`);
    }
  }

  private async createMemoryForMessage(
    runtime: IAgentRuntime,
    data: {
      text: string;
      source?: string;
      entityId: UUID;
      roomId: UUID;
    }
  ) {
    const { text, source, entityId, roomId } = data;

    // Generate a message ID
    const timestamp = Date.now().toString();
    const messageId = createUniqueUuid(runtime, timestamp);

    const content: Content = {
      text,
      attachments: [],
      source,
      inReplyTo: undefined,
      channelType: ChannelType.API,
    };

    const memory: Memory = {
      id: createUniqueUuid(runtime, messageId),
      agentId: runtime.agentId,
      entityId,
      roomId,
      content,
      createdAt: Date.now(),
    };

    logger.debug(`[SocketIO] Adding embedding to memory for message ${memory.id}`);
    await runtime.addEmbeddingToMemory(memory);

    logger.debug(`[SocketIO] Creating memory for message ${memory.id}`);
    await runtime.createMemory(memory, 'messages');
    logger.debug(`[SocketIO] Created memory successfully`);
  }

  private broadcastMessageToRoom(socket: Socket, roomId: string, payload: any) {
    logger.debug(`[SocketIO] Broadcasting message to room ${roomId}`);

    // Send using both formats for compatibility
    socket.to(roomId).emit(String(SOCKET_MESSAGE_TYPE.SEND_MESSAGE), payload);
    socket.to(roomId).emit('message', {
      type: SOCKET_MESSAGE_TYPE.SEND_MESSAGE,
      payload,
    });

    // Send acknowledgment to sender
    socket.emit('message', {
      type: 'message_received',
      payload: {
        status: 'success',
        messageId: Date.now().toString(),
        roomId,
      },
    });

    logger.debug(`[SocketIO] Broadcasted message from ${payload.senderId} to Room ${roomId}`);
  }

  private sendErrorResponse(socket: Socket, errorMessage: string) {
    logger.error(`[SocketIO] ${errorMessage}`);
    socket.emit('message', {
      type: 'error',
      payload: { error: errorMessage },
    });
  }

  private handleLogSubscription(socket: Socket) {
    this.logStreamConnections.set(socket.id, {});
    logger.debug(`[SocketIO] Client ${socket.id} subscribed to log stream`);
    socket.emit('log_subscription_confirmed', {
      subscribed: true,
      message: 'Successfully subscribed to log stream',
    });
  }

  private handleLogUnsubscription(socket: Socket) {
    this.logStreamConnections.delete(socket.id);
    logger.debug(`[SocketIO] Client ${socket.id} unsubscribed from log stream`);
    socket.emit('log_subscription_confirmed', {
      subscribed: false,
      message: 'Successfully unsubscribed from log stream',
    });
  }

  private handleLogFilterUpdate(socket: Socket, filters: { agentName?: string; level?: string }) {
    const existingFilters = this.logStreamConnections.get(socket.id);
    if (existingFilters !== undefined) {
      this.logStreamConnections.set(socket.id, { ...existingFilters, ...filters });
      logger.debug(`[SocketIO] Updated log filters for client ${socket.id}:`, filters);
      socket.emit('log_filters_updated', {
        success: true,
        filters: this.logStreamConnections.get(socket.id),
      });
    } else {
      logger.warn(
        `[SocketIO] Cannot update filters for client ${socket.id}: not subscribed to log stream`
      );
      socket.emit('log_filters_updated', {
        success: false,
        error: 'Not subscribed to log stream',
      });
    }
  }

  public broadcastLog(io: SocketIOServer, logEntry: any) {
    if (this.logStreamConnections.size === 0) return;

    const logData = {
      type: 'log_entry',
      payload: logEntry,
    };

    this.logStreamConnections.forEach((filters, socketId) => {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        // Apply server-side filtering if filters are set
        let shouldBroadcast = true;

        if (filters.agentName && filters.agentName !== 'all') {
          shouldBroadcast = shouldBroadcast && logEntry.agentName === filters.agentName;
        }

        if (filters.level && filters.level !== 'all') {
          shouldBroadcast = shouldBroadcast && logEntry.level === filters.level;
        }

        if (shouldBroadcast) {
          socket.emit('log_stream', logData);
        }
      }
    });
  }

  private handleDisconnect(socket: Socket) {
    const agentId = this.connections.get(socket.id);
    this.connections.delete(socket.id);
    this.logStreamConnections.delete(socket.id);

    if (agentId) {
      logger.debug(`[SocketIO] Agent ${agentId} disconnected.`);
    } else {
      logger.debug(`[SocketIO] Client ${socket.id} disconnected.`);
    }
  }
}
