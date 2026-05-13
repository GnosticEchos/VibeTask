# API Contract Documentation

## Overview
This document specifies the complete REST API contract that must be maintained for frontend compatibility.

**Base URL**: `http://localhost:3000/api`  
**Authentication**: Bearer token in `Authorization` header

---

## Authentication

### POST /login
Authenticate user and receive JWT token.

**Request:**
```json
{
  "email": "string (required)",
  "password": "string (required)"
}
```

**Response 200:**
```json
{
  "token": "string (JWT)",
  "user": {
    "id": "number",
    "name": "string",
    "fullName": "string",
    "email": "string",
    "avatarUrl": "string | null"
  }
}
```

**Response 401:**
```json
{
  "error": "Invalid email or password"
}
```

---

## Projects

### GET /projects
Get list of user's projects.

**Headers:** `Authorization: <token>`

**Response 200:**
```json
[
  {
    "id": "number",
    "name": "string",
    "description": "string | null",
    "prefix": "string (3 chars)",
    "ownerId": "number",
    "columns": [
      {
        "id": "number",
        "name": "string",
        "order": "number",
        "color": "string",
        "type": "'start' | 'end' | null",
        "description": "string | null",
        "tasks": ["Task[]"]
      }
    ],
    "isMember": "boolean"
  }
]
```

### POST /projects
Create a new project.

**Headers:** `Authorization: <token>`

**Request:**
```json
{
  "name": "string (required)",
  "prefix": "string (3 chars, required)",
  "description": "string | null",
  "members": [
    {
      "id": "number",
      "role": "'Owner' | 'Maintainer' | 'Editor' | 'Viewer'"
    }
  ] | null,
  "columns": [
    {
      "name": "string",
      "description": "string | null",
      "color": "string",
      "order": "number"
    }
  ] | null
}
```

**Response 201:**
```json
{
  "id": "number",
  "name": "string",
  "description": "string | null",
  "prefix": "string",
  "ownerId": "number",
  "createdAt": "string",
  "updatedAt": "string"
}
```

### GET /projects/:id
Get project data with columns and tasks.

**Headers:** `Authorization: <token>`

**Response 200:**
```json
{
  "id": "number",
  "name": "string",
  "description": "string | null",
  "prefix": "string",
  "role": "string",
  "userId": "number",
  "members": [
    {
      "id": "number",
      "email": "string"
    }
  ],
  "columns": [
    {
      "id": "number",
      "name": "string",
      "order": "number",
      "color": "string",
      "type": "string | null",
      "description": "string | null",
      "tasks": ["Task[]"]
    }
  ]
}
```

### GET /projects/:id/summary
Get project summary with task counts per column.

**Headers:** `Authorization: <token>`

**Response 200:**
```json
{
  "projectName": "string",
  "projectDescription": "string | null",
  "members": ["User[]"],
  "columnSummary": [
    {
      "columnName": "string",
      "totalTasks": "number"
    }
  ]
}
```

### PATCH /projects/:id
Update project data.

**Headers:** `Authorization: <token>`

**Request:**
```json
{
  "name": "string | undefined",
  "description": "string | undefined"
}
```

**Response 200:** Empty body

### DELETE /projects/:id
Delete a project (Owner only).

**Headers:** `Authorization: <token>`

**Response 200:** Empty body

---

## Columns

### GET /columns?projectId=:id
Get all columns for a project.

**Headers:** `Authorization: <token>`

**Query:** `projectId: string (required)`

**Response 200:**
```json
[
  {
    "id": "number",
    "name": "string",
    "order": "number",
    "color": "string",
    "type": "'start' | 'end' | null",
    "description": "string | null",
    "projectId": "number",
    "tasks": ["Task[]"]
  }
]
```

### POST /columns?projectId=:id
Create a new column.

**Headers:** `Authorization: <token>`

**Query:** `projectId: string (required)`

**Request:**
```json
{
  "name": "string (required)",
  "order": "number (optional, auto-assigned if omitted)",
  "color": "string (optional)",
  "type": "'start' | 'end' | null",
  "description": "string | null"
}
```

**Response 201:** Column object

### PATCH /columns
Batch update/create/delete columns.

**Headers:** `Authorization: <token>`

**Request:**
```json
{
  "projectId": "number",
  "columns": [
    {
      "id": "number | null (omit for create)",
      "name": "string",
      "order": "number",
      "color": "string",
      "type": "'start' | 'end' | null",
      "description": "string | null",
      "toDelete": "boolean (optional)"
    }
  ]
}
```

**Response 200:** Empty body

---

## Tasks

### GET /tasks?projectId=:id
Get tasks for a project.

**Headers:** `Authorization: <token>`

**Query:**
- `projectId`: string (required)
- `unassigned`: boolean (optional, backlog tasks only)
- `assigneeIds`: string[] (optional, filter by assignees)
- `query`: string (optional, search in name/description)

**Response 200:**
```json
[
  {
    "id": "number",
    "name": "string",
    "description": "string | null",
    "order": "number",
    "identifier": "string (e.g., 'PIE-1')",
    "projectId": "number",
    "projectColumnId": "number | null",
    "assigneeId": "number | null",
    "createdById": "number",
    "relationMode": "string | null",
    "relationId": "number | null",
    "createdAt": "string",
    "updatedAt": "string"
  }
]
```

### GET /tasks/:id
Get single task details.

**Headers:** `Authorization: <token>`

**Response 200:**
```json
{
  "id": "number",
  "name": "string",
  "description": "string | null",
  "order": "number",
  "identifier": "string",
  "projectId": "number",
  "projectColumnId": "number | null",
  "assigneeId": "number | null",
  "createdById": "number",
  "relationMode": "string | null",
  "relationId": "number | null",
  "createdBy": {
    "id": "number",
    "fullName": "string"
  },
  "assignee": {
    "id": "number",
    "fullName": "string"
  } | null,
  "comments": [
    {
      "id": "number",
      "content": "string",
      "userId": "number",
      "createdAt": "string"
    }
  ],
  "history": [
    {
      "id": "number",
      "text": "string",
      "userId": "number",
      "createdAt": "string"
    }
  ]
}
```

### POST /tasks
Create a new task.

**Headers:** `Authorization: <token>`

**Request:**
```json
{
  "projectId": "number (required)",
  "name": "string (required)",
  "description": "string | null",
  "assigneeId": "number | null",
  "projectColumnId": "number | null",
  "relationMode": "string | null",
  "relationId": "number | null"
}
```

**Response 200:** Task object with includes

### PATCH /tasks/:id
Update a task.

**Headers:** `Authorization: <token>`

**Request:**
```json
{
  "name": "string | undefined",
  "description": "string | undefined",
  "assigneeId": "number | null | undefined",
  "projectColumnId": "number | null | undefined",
  "relationMode": "string | null | undefined",
  "relationId": "number | null | undefined"
}
```

**Response 200:** Updated task object

### POST /tasks/:id/move
Move task to different column/position.

**Headers:** `Authorization: <token>`

**Request:**
```json
{
  "targetColumnId": "number (required)",
  "targetIndex": "number (required, 0-based)"
}
```

**Response 200:** Empty body

### POST /tasks/:id/comments
Add comment to task.

**Headers:** `Authorization: <token>`

**Request:**
```json
{
  "content": "string (required)"
}
```

**Response 200:** Empty body

### PATCH /tasks/comment/:id
Add comment to task (alternative endpoint used by frontend).

**Headers:** `Authorization: <token>`

**Request:**
```json
{
  "content": "string (required)"
}
```

**Response 200:** Task object with updated comments

---

## Members

### GET /members?projectId=:id
Get project members.

**Headers:** `Authorization: <token>`

**Query:** `projectId: string (required)`

**Response 200:**
```json
[
  {
    "id": "number",
    "userId": "number",
    "name": "string",
    "surname": "string",
    "email": "string",
    "avatarUrl": "string | null",
    "role": "'Owner' | 'Maintainer' | 'Editor' | 'Viewer'",
    "createdAt": "string"
  }
]
```

### GET /members/:id?projectId=:id
Get specific member details.

**Headers:** `Authorization: <token>`

**Response 200:** Member object

### PATCH /members/:id
Update member role.

**Headers:** `Authorization: <token>`

**Request:**
```json
{
  "role": "'Owner' | 'Maintainer' | 'Editor' | 'Viewer' (required)",
  "projectId": "number (required)"
}
```

**Response 200:** Member object

### DELETE /members/:id
Remove member from project.

**Headers:** `Authorization: <token>`

**Response 200:** Member object

### GET /members/check_email?projectId=:id&email=:email
Check if user exists and can be invited.

**Headers:** `Authorization: <token>`

**Query:**
- `projectId`: string (required)
- `email`: string (required)

**Response 200:**
```json
{
  "email": "string",
  "id": "number",
  "avatarUrl": "string | null"
}
```

**Response 403:**
```json
{
  "error": "You already belong to this project"
}
```

**Response 404:**
```json
{
  "error": "User not found"
}
```

### POST /members/invite
Invite members to project.

**Headers:** `Authorization: <token>`

**Request:**
```json
{
  "projectId": "number (required)",
  "users": [
    {
      "id": "number",
      "role": "'Owner' | 'Maintainer' | 'Editor' | 'Viewer'"
    }
  ]
}
```

**Response 200:** Empty body

---

## Board

### GET /projects/:id/board
Get complete board data (project + columns + tasks + members).

**Headers:** `Authorization: <token>`

**Response 200:**
```json
{
  "board": {
    "id": "number",
    "name": "string",
    "description": "string | null"
  },
  "columns": [
    {
      "id": "number",
      "name": "string",
      "order": "number",
      "color": "string",
      "type": "'start' | 'end' | null",
      "description": "string | null",
      "tasks": [
        {
          "id": "number",
          "name": "string",
          "description": "string | null",
          "order": "number",
          "identifier": "string",
          "assignee": {
            "id": "number",
            "name": "string",
            "avatarUrl": "string"
          } | null,
          "createdAt": "string",
          "updatedAt": "string"
        }
      ]
    }
  ],
  "members": [
    {
      "id": "number",
      "name": "string",
      "avatarUrl": "string | null",
      "role": "string"
    }
  ],
  "tags": [],
  "permissions": {
    "canEdit": "boolean",
    "canAddColumn": "boolean",
    "canMoveTask": "boolean"
  }
}
```

---

## Error Response Format

All errors follow this format:

```json
{
  "error": "string (human-readable message)"
}
```

**Status Codes:**
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

---

## Data Types Reference

### User
```json
{
  "id": "number",
  "name": "string",
  "surname": "string",
  "email": "string",
  "avatarUrl": "string | null",
  "createdAt": "string",
  "updatedAt": "string"
}
```

### Task
```json
{
  "id": "number",
  "name": "string",
  "description": "string | null",
  "order": "number",
  "identifier": "string",
  "projectId": "number",
  "projectColumnId": "number | null",
  "assigneeId": "number | null",
  "createdById": "number",
  "relationMode": "'Blocked by' | 'Blocks' | 'Relates to' | 'Duplicate of' | 'Duplicated by' | null",
  "relationId": "number | null",
  "createdAt": "string",
  "updatedAt": "string"
}
```

### Relation Types
- `Blocked by` / `Blocks`
- `Relates to` (self-referential)
- `Duplicate of` / `Duplicated by`

Opposite relations are automatically maintained by the backend.