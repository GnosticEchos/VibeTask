# Kanban Backend Rewrite

A clean rewrite of the Kanban backend using modern technologies:
- **Better Auth** - Authentication with OAuth support
- **Socket.IO** - Real-time WebSocket communication
- **Prisma** - Database ORM
- **Express** - HTTP server

## Project Structure

```
src/
├── index.ts              # Entry point
├── infrastructure/       # External services
│   ├── http/            # Express server
│   ├── websocket/       # Socket.IO server
│   └── auth/           # Better Auth config
├── domain/              # Business logic
│   ├── entities/        # Data models
│   ├── services/        # Business services
│   └── repositories/    # Data access
├── api/                 # Controllers
│   └── controllers/     # Route handlers
└── config/              # Configuration
```

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Generate Prisma client
npm run db:generate

# Start development server
npm run dev
```

## Frontend Compatibility

This rewrite maintains full API compatibility with the existing frontend. See:
- [`../Kanban-backend/REWRITEPLAN/API_CONTRACT.md`](../Kanban-backend/REWRITEPLAN/API_CONTRACT.md)
- [`../Kanban-backend/REWRITEPLAN/WEBSOCKET_CONTRACT.md`](../Kanban-backend/REWRITEPLAN/WEBSOCKET_CONTRACT.md)

## Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js |
| Language | TypeScript |
| HTTP | Express.js |
| WebSocket | Socket.IO |
| Auth | Better Auth |
| Database | PostgreSQL + Prisma |
| Validation | Zod |

## API Endpoints

All endpoints maintain backward compatibility with the existing frontend:

- `POST /api/login` - Authenticate
- `GET /api/projects` - List projects
- `POST /api/projects` - Create project
- `GET /api/projects/:id` - Get project
- `PATCH /api/projects/:id` - Update project
- `GET /api/tasks` - List tasks
- `POST /api/tasks` - Create task
- `PATCH /api/tasks/:id` - Update task
- `PATCH /api/tasks/comment/:id` - Add comment
- ... see API_CONTRACT.md for full list

## WebSocket Channels

Real-time channels (matching frontend expectations):

- `TasksIndexChannel` - Task list updates
- `TaskIndexChannel` - Single task updates
- `ColumnsIndexChannel` - Column updates
- `MembersIndexChannel` - Member updates
- `ProjectIndexChannel` - Project updates
- `UserProjectsIndexChannel` - User's projects

## Environment Variables

| Variable | Description |
|----------|-------------|
| PORT | HTTP server port (default: 3000) |
| WS_PORT | WebSocket port (default: 8080) |
| DATABASE_URL | PostgreSQL connection string |
| AUTH_SECRET | Better Auth secret key |
| CORS_ORIGIN | Allowed CORS origins |

## Next Steps

1. [ ] Install dependencies (`npm install`)
2. [ ] Set up PostgreSQL database
3. [ ] Configure `.env` file
4. [ ] Generate Prisma schema
5. [ ] Implement authentication
6. [ ] Implement API controllers
7. [ ] Implement WebSocket channels
8. [ ] Test against frontend