# MCP Server for AI Agent Delegation

## Overview

This document specifies an MCP (Model Context Protocol) server that enables AI agents to interact with the Kanban system via user delegation. Agents can perform actions on behalf of users using the user's existing authentication.

---

## Architecture

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   AI Agent      │──────▶│   MCP Server     │──────▶│  Kanban API     │
│ (Claude/GPT/    │       │ (This Server)   │       │ (Existing)      │
│  etc)           │       │                  │       │                 │
└─────────────────┘       └────────┬─────────┘      └────────┬─────────┘
                                    │                        │
                              ┌──────▼──────┐          ┌──────▼────────┐
                              │ Better Auth │          │ WebSocket     │
                              │ (API Keys)  │          │ (Real-time)   │
                              └─────────────┘          └───────────────┘
```

---

## Authentication (User Delegation)

### Using Better Auth API Keys

Better Auth supports API keys for server-to-server and agent authentication:

```typescript
// Agent authenticates using user's API key
const apiKey = process.env.KANBAN_API_KEY;

// MCP server validates the key and extracts user context
import { betterAuth } from 'better-auth';

export const auth = betterAuth({
  plugins: [apiKey()], // Enables API key authentication
});

// Agent request includes API key
const response = await fetch('http://localhost:3000/api/tasks', {
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'X-User-Id': userId, // Agent acts on behalf of this user
  }
});
```

### Alternative: Session Token Delegation

Agents can also use user's session token:

```typescript
// User generates delegation token (limited permissions)
const delegationToken = await auth.api.createApiKey({
  userId: user.id,
  name: 'Agent: Task Manager',
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
});

// Agent uses delegation token
const response = await fetch('http://localhost:3000/api/tasks', {
  headers: {
    'Authorization': `Bearer ${delegationToken.key}`,
  }
});
```

---

## MCP Tools Specification

### Tool: create_task

Create a new task in a project.

```typescript
{
  name: 'create_task',
  description: 'Create a new task in a Kanban project',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'Target project ID' },
      name: { type: 'string', description: 'Task title' },
      description: { type: 'string', description: 'Task description' },
      assigneeId: { type: 'number', description: 'Assignee user ID' },
      projectColumnId: { type: 'number', description: 'Column ID' },
    },
    required: ['projectId', 'name'],
  },
}
```

**Response:**
```json
{
  "id": 42,
  "name": "Task Name",
  "identifier": "PIE-42",
  "status": "created"
}
```

### Tool: get_task

Read task details including comments and history.

```typescript
{
  name: 'get_task',
  description: 'Get detailed information about a task',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'number', description: 'Task ID' },
      projectId: { type: 'number', description: 'Project ID for context' },
    },
    required: ['taskId'],
  },
}
```

**Response:**
```json
{
  "id": 42,
  "name": "Task Name",
  "description": "Task description",
  "identifier": "PIE-42",
  "status": "in_progress",
  "assignee": { "id": 1, "fullName": "John Doe" },
  "comments": [
    { "id": 1, "content": "Started working", "createdAt": "2024-01-01" }
  ],
  "history": [
    { "id": 1, "text": "Created task", "createdAt": "2024-01-01" }
  ]
}
```

### Tool: list_tasks

List tasks with optional filters.

```typescript
{
  name: 'list_tasks',
  description: 'List tasks in a project with optional filters',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'number', description: 'Project ID' },
      status: { type: 'string', description: 'Filter by column/status' },
      assigneeId: { type: 'number', description: 'Filter by assignee' },
      query: { type: 'string', description: 'Search in name/description' },
      limit: { type: 'number', description: 'Max results', default: 50 },
    },
    required: ['projectId'],
  },
}
```

### Tool: add_comment

Add a comment to an existing task.

```typescript
{
  name: 'add_comment',
  description: 'Add a comment to a task',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'number', description: 'Task ID' },
      content: { type: 'string', description: 'Comment text' },
    },
    required: ['taskId', 'content'],
  },
}
```

### Tool: update_task_status

Move task to different column/status.

```typescript
{
  name: 'update_task_status',
  description: 'Update task status by moving to a different column',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'number', description: 'Task ID' },
      projectId: { type: 'number', description: 'Project ID' },
      targetColumnId: { type: 'number', description: 'Target column ID' },
      targetIndex: { type: 'number', description: 'Position in column' },
    },
    required: ['taskId', 'projectId', 'targetColumnId'],
  },
}
```

### Tool: update_task

Update task fields (name, description, assignee, etc.).

```typescript
{
  name: 'update_task',
  description: 'Update task details',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'number', description: 'Task ID' },
      projectId: { type: 'number', description: 'Project ID' },
      name: { type: 'string', description: 'New task name' },
      description: { type: 'string', description: 'New description' },
      assigneeId: { type: 'number', description: 'New assignee ID' },
      projectColumnId: { type: 'number', description: 'New column ID' },
    },
    required: ['taskId'],
  },
}
```

### Tool: list_projects

List available projects for the authenticated user.

```typescript
{
  name: 'list_projects',
  description: 'List projects the user has access to',
  inputSchema: {
    type: 'object',
    properties: {},
  },
}
```

---

## WebSocket Integration (Real-time)

For agents that need real-time updates:

```typescript
import { io } from 'socket.io-client';

class KanbanAgentWS {
  constructor(apiKey: string) {
    this.socket = io('ws://localhost:8080', {
      auth: { token: apiKey },
      transports: ['websocket'],
    });
  }

  subscribeToTask(taskId: number, callback: (event) => void) {
    this.socket.emit('subscribe', {
      channel: 'TaskIndexChannel',
      params: { taskId }
    });
    this.socket.on('task:updated', callback);
  }

  subscribeToProject(projectId: number, callback: (event) => void) {
    this.socket.emit('subscribe', {
      channel: 'TasksIndexChannel',
      params: { projectId }
    });
    this.socket.on('task:created', callback);
    this.socket.on('task:updated', callback);
    this.socket.on('task:deleted', callback);
  }
}
```

---

## MCP Server Implementation

### Project Structure

```
kanban-mcp-server/
├── src/
│   ├── index.ts          # MCP server entry
│   ├── tools/            # Tool definitions
│   │   ├── tasks.ts
│   │   ├── projects.ts
│   │   └── comments.ts
│   ├── auth/             # Authentication
│   │   └── delegate.ts
│   ├── api/              # Kanban API client
│   │   └── client.ts
│   └── ws/               # WebSocket client
│       └── client.ts
├── package.json
└── tsconfig.json
```

### Dependencies

```json
{
  "@modelcontextprotocol/server": "latest",
  "@modelcontextprotocol/sdk": "latest",
  "socket.io-client": "latest",
  "axios": "latest"
}
```

### Basic Implementation

```typescript
// src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createTask, getTask, updateTask, addComment, listProjects } from './tools/tasks.js';

const server = new Server(
  { name: 'kanban-mcp-server', version: '1.0.0' },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      createTask,
      getTask,
      updateTask,
      addComment,
      listProjects,
      // ... more tools
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  switch (name) {
    case 'create_task':
      return await createTask.handler(args);
    case 'get_task':
      return await getTask.handler(args);
    // ... more cases
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## Security Considerations

1. **API Key Scoping**: Limit agent permissions to specific projects/actions
2. **Rate Limiting**: Prevent abuse with per-key rate limits
3. **Audit Logging**: Log all agent actions for accountability
4. **Token Expiration**: Use short-lived delegation tokens
5. **IP Allowlisting**: Restrict API keys to known agent IPs (optional)

---

## Usage Examples

### Claude Desktop

```json
{
  "mcpServers": {
    "kanban": {
      "command": "node",
      "args": ["/path/to/kanban-mcp-server/dist/index.js"],
      "env": {
        "KANBAN_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Agent Query Example

```
Agent: "Create a task for James to review the API documentation"

MCP Server:
1. Validates API key
2. Calls POST /api/tasks with { projectId: 1, name: "Review API docs", assigneeId: james }
3. Returns task ID and identifier

Agent: "What's the status of task PIE-42?"

MCP Server:
1. Calls GET /api/tasks/42
2. Returns task details including column/status

Agent: "Move that task to Done"

MCP Server:
1. Calls PATCH /api/tasks/42 with { projectColumnId: doneColumnId }
2. Returns updated task
```