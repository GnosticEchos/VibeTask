# Kanban Frontend API Endpoints

## Summary Table

| Resource   | Method | Endpoint Pattern              | Description / Notes                      |
|------------|--------|------------------------------|------------------------------------------|
| Auth       | POST   | /login                       | User login                               |
| Projects   | GET    | /projects                    | List all projects                        |
| Projects   | GET    | /projects/:id                | Get full project details                 |
| Projects   | GET    | /projects/:id/summary        | Get project summary                      |
| Projects   | POST   | /projects                    | Create new project                       |
| Projects   | PATCH  | /projects/:id                | Update project fields                    |
| Board      | GET    | /projects/:id/board          | Get board structure (columns, tasks)     |
| Columns    | GET    | /columns                     | List columns (by projectId param)        |
| Columns    | PATCH  | /columns                     | Bulk update columns                      |
| Columns    | PATCH  | /columns/:id                 | Update single column                     |
| Columns    | DELETE | /columns/:id                 | Delete column                            |
| Tasks      | GET    | /tasks                       | List tasks (by projectId, filters)       |
| Tasks      | PATCH  | /tasks/:id                   | Update single task                       |
| Tasks      | PATCH  | /tasks                       | Bulk update tasks                        |
| Tasks      | DELETE | /tasks/:id                   | Delete task                              |
| Members    | GET    | /members/check_email         | Validate member email                    |
| Members    | POST   | /members/invite              | Invite users to project                  |
| Other      | PATCH  | /:endpoint/:action/:id       | Custom/bulk actions                      |

---

## Auth

### POST /login
- **Description:** User login
- **Request Example:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```
- **Response Example:**
```json
{
  "token": "jwt-token-string",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "User Name"
  }
}
```
- **Error Codes:**
  - 401 Unauthorized: Invalid credentials
  - 400 Bad Request: Missing fields
- **Auth Required:** No

---

## Projects

### GET /projects
- **Description:** List all projects
- **Response Example:**
```json
[
  { "id": 1, "name": "Project 1", "description": "Desc", "prefix": "P1" },
  { "id": 2, "name": "Project 2", "description": "Desc", "prefix": "P2" }
]
```
- **Error Codes:**
  - 401 Unauthorized: Not logged in
- **Auth Required:** Yes

### GET /projects/:id
- **Description:** Get full project details
- **Response Example:**
```json
{
  "id": 1,
  "name": "Project 1",
  "description": "Desc",
  "prefix": "P1",
  "columns": [ ... ],
  "tasks": [ ... ],
  "members": [ ... ]
}
```
- **Error Codes:**
  - 404 Not Found: Project does not exist
  - 401 Unauthorized: Not logged in
- **Auth Required:** Yes

### GET /projects/:id/summary
- **Description:** Get project summary (lightweight)
- **Response Example:**
```json
{
  "id": 1,
  "name": "Project 1",
  "prefix": "P1"
}
```
- **Error Codes:**
  - 404 Not Found
  - 401 Unauthorized
- **Auth Required:** Yes

### POST /projects
- **Description:** Create new project
- **Request Example:**
```json
{
  "name": "New Project",
  "description": "Desc",
  "prefix": "NP"
}
```
- **Response Example:**
```json
{
  "id": 3,
  "name": "New Project",
  "description": "Desc",
  "prefix": "NP"
}
```
- **Error Codes:**
  - 400 Bad Request: Missing/invalid fields
  - 401 Unauthorized
- **Auth Required:** Yes

### PATCH /projects/:id
- **Description:** Update project fields
- **Request Example:**
```json
{
  "name": "Updated Name"
}
```
- **Response Example:**
```json
{
  "id": 1,
  "name": "Updated Name",
  "description": "Desc",
  "prefix": "P1"
}
```
- **Error Codes:**
  - 404 Not Found
  - 400 Bad Request
  - 401 Unauthorized
- **Auth Required:** Yes

---

## Board

### GET /projects/:id/board
- **Description:** Get board structure (columns, tasks)
- **Response Example:**
```json
{
  "columns": [
    { "id": 1, "name": "To Do", "order": 1, "tasks": [ ... ] },
    { "id": 2, "name": "Done", "order": 2, "tasks": [ ... ] }
  ]
}
```
- **Error Codes:**
  - 404 Not Found
  - 401 Unauthorized
- **Auth Required:** Yes

---

## Columns

### GET /columns?projectId=1
- **Description:** List columns for a project
- **Response Example:**
```json
[
  { "id": 1, "name": "To Do", "order": 1 },
  { "id": 2, "name": "Done", "order": 2 }
]
```
- **Error Codes:**
  - 400 Bad Request: Missing projectId
  - 401 Unauthorized
- **Auth Required:** Yes

### PATCH /columns
- **Description:** Bulk update columns
- **Request Example:**
```json
{
  "columns": [
    { "id": 1, "name": "To Do", "order": 1 },
    { "id": 2, "name": "Done", "order": 2 }
  ]
}
```
- **Response Example:**
```json
{
  "success": true
}
```
- **Error Codes:**
  - 400 Bad Request
  - 401 Unauthorized
- **Auth Required:** Yes

### PATCH /columns/:id
- **Description:** Update single column
- **Request Example:**
```json
{
  "name": "In Progress"
}
```
- **Response Example:**
```json
{
  "id": 1, "name": "In Progress", "order": 1
}
```
- **Error Codes:**
  - 404 Not Found
  - 400 Bad Request
  - 401 Unauthorized
- **Auth Required:** Yes

### DELETE /columns/:id
- **Description:** Delete column
- **Response Example:**
```json
{
  "success": true
}
```
- **Error Codes:**
  - 404 Not Found
  - 401 Unauthorized
- **Auth Required:** Yes

---

## Tasks

### GET /tasks?projectId=1
- **Description:** List tasks for a project
- **Response Example:**
```json
[
  { "id": 1, "name": "Task 1", "status": "To Do", "columnId": 1 },
  { "id": 2, "name": "Task 2", "status": "Done", "columnId": 2 }
]
```
- **Error Codes:**
  - 400 Bad Request: Missing projectId
  - 401 Unauthorized
- **Auth Required:** Yes

### PATCH /tasks
- **Description:** Bulk update tasks
- **Request Example:**
```json
{
  "tasks": [
    { "id": 1, "status": "Done" },
    { "id": 2, "status": "To Do" }
  ]
}
```
- **Response Example:**
```json
{
  "success": true
}
```
- **Error Codes:**
  - 400 Bad Request
  - 401 Unauthorized
- **Auth Required:** Yes

### PATCH /tasks/:id
- **Description:** Update single task
- **Request Example:**
```json
{
  "status": "Done"
}
```
- **Response Example:**
```json
{
  "id": 1, "name": "Task 1", "status": "Done", "columnId": 2
}
```
- **Error Codes:**
  - 404 Not Found
  - 400 Bad Request
  - 401 Unauthorized
- **Auth Required:** Yes

### DELETE /tasks/:id
- **Description:** Delete task
- **Response Example:**
```json
{
  "success": true
}
```
- **Error Codes:**
  - 404 Not Found
  - 401 Unauthorized
- **Auth Required:** Yes

---

## Members

### GET /members/check_email?email=...&projectId=...
- **Description:** Validate member email
- **Response Example:**
```json
{
  "valid": true,
  "user": { "id": 5, "email": "invitee@example.com" }
}
```
- **Error Codes:**
  - 400 Bad Request: Missing/invalid params
  - 401 Unauthorized
- **Auth Required:** Yes

### POST /members/invite
- **Description:** Invite users to project
- **Request Example:**
```json
{
  "users": [ { "id": 5, "role": "Editor" } ],
  "projectId": 1
}
```
- **Response Example:**
```json
{
  "success": true,
  "invited": [ { "id": 5, "email": "invitee@example.com" } ]
}
```
- **Error Codes:**
  - 400 Bad Request
  - 401 Unauthorized
- **Auth Required:** Yes

---

## Other / Custom Actions

### PATCH /:endpoint/:action/:id
- **Description:** Custom/bulk actions (e.g., reorder, archive)
- **Request/Response:** Varies by action
- **Error Codes:**
  - 400 Bad Request
  - 401 Unauthorized
  - 404 Not Found
- **Auth Required:** Yes

---

## Notes
- All endpoints (except /login) require authentication.
- Error codes are based on frontend error handling and common HTTP codes.
- Endpoints used directly in components (not just via wrappers) are marked in the summary table. 