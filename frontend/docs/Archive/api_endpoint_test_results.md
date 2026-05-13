# API Endpoint Test Results: Project 4 (2025-07-13)

## PATCH /api/columns
**Request:**
```json
PATCH /api/columns
Content-Type: application/json
Authorization: <JWT>
{
  "projectId": 4,
  "columns": [
    {"id": 10, "name": "col 1", "order": 1, "color": "#b0edbf", "type": null, "description": "this is a description of column1"},
    {"id": 11, "name": "col 2", "order": 2, "color": "#a184d5", "type": null, "description": "this is a description of column 2"},
    {"id": 12, "name": "col 3 ", "order": 3, "color": "#3ea8a3", "type": null, "description": "this is a description of column 3"}
  ]
}
```
**Response:**
```
(No response body; command completed successfully)
```

---

## POST /api/tasks (x3)
**Request 1:**
```json
POST /api/tasks
Content-Type: application/json
Authorization: <JWT>
{
  "projectId": 4,
  "projectColumnId": 12,
  "name": "Test Task 1",
  "description": "This is a test task 1"
}
```
**Response 1:**
```json
{"id":48,"name":"Test Task 1","description":"This is a test task 1","createdById":1,"assigneeId":null,"projectId":4,"projectColumnId":12,"order":1,"identifier":"NEW-3","relationMode":null,"relationId":null,"createdAt":"2025-07-13T20:08:51.221Z","updatedAt":"2025-07-13T20:08:51.221Z","createdBy":{"id":1,"name":"Łukasz","surname":"Podlipski","email":"lukaszpodlipskikontakt@gmail.com","password":"$2a$10$cGSd2MfOHWFa6RZcpFVtNugNXlgwoqXXknqrlcksDXDby2UkwfJ.S","avatarUrl":"https://img.freepik.com/free-vector/businessman-character-avatar-isolated_24877-60111.jpg?w=1380&t=st=1687798850~exp=1687799450~hmac=d239fcd494c46c6a68bafa6d4ddb969d2c96f992be04bc37b94c46bcc1370ff6","createdAt":"2025-06-18T21:07:12.844Z","updatedAt":"2025-06-18T21:07:12.844Z"},"assignee":null,"comments":[],"history":[{"id":1267,"taskId":48,"userId":1,"text":"Created task","createdAt":"2025-07-13T20:08:51.240Z","updatedAt":"2025-07-13T20:08:51.240Z","user":{"id":1,"name":"Łukasz","surname":"Podlipski","email":"lukaszpodlipskikontakt@gmail.com","password":"$2a$10$cGSd2MfOHWFa6RZcpFVtNugNXlgwoqXXknqrlcksDXDby2UkwfJ.S","avatarUrl":"https://img.freepik.com/free-vector/businessman-character-avatar-isolated_24877-60111.jpg?w=1380&t=st=1687798850~exp=1687799450~hmac=d239fcd494c46c6a68bafa6d4ddb969d2c96f992be04bc37b94c46bcc1370ff6","createdAt":"2025-06-18T21:07:12.844Z","updatedAt":"2025-06-18T21:07:12.844Z"}}],"relatedTasks":[]}
```
**Request 2:**
```json
{
  "projectId": 4,
  "projectColumnId": 12,
  "name": "Test Task 2",
  "description": "This is a test task 2"
}
```
**Response 2:**
```json
{"id":49,"name":"Test Task 2","description":"This is a test task 2","createdById":1,"assigneeId":null,"projectId":4,"projectColumnId":12,"order":2,"identifier":"NEW-4","relationMode":null,"relationId":null,"createdAt":"2025-07-13T20:09:05.479Z","updatedAt":"2025-07-13T20:09:05.479Z","createdBy":{"id":1,"name":"Łukasz","surname":"Podlipski","email":"lukaszpodlipskikontakt@gmail.com","password":"$2a$10$cGSd2MfOHWFa6RZcpFVtNugNXlgwoqXXknqrlcksDXDby2UkwfJ.S","avatarUrl":"https://img.freepik.com/free-vector/businessman-character-avatar-isolated_24877-60111.jpg?w=1380&t=st=1687798850~exp=1687799450~hmac=d239fcd494c46c6a68bafa6d4ddb969d2c96f992be04bc37b94c46bcc1370ff6","createdAt":"2025-06-18T21:07:12.844Z","updatedAt":"2025-06-18T21:07:12.844Z"},"assignee":null,"comments":[],"history":[{"id":1268,"taskId":49,"userId":1,"text":"Created task","createdAt":"2025-07-13T20:09:05.484Z","updatedAt":"2025-07-13T20:09:05.484Z","user":{"id":1,"name":"Łukasz","surname":"Podlipski","email":"lukaszpodlipskikontakt@gmail.com","password":"$2a$10$cGSd2MfOHWFa6RZcpFVtNugNXlgwoqXXknqrlcksDXDby2UkwfJ.S","avatarUrl":"https://img.freepik.com/free-vector/businessman-character-avatar-isolated_24877-60111.jpg?w=1380&t=st=1687798850~exp=1687799450~hmac=d239fcd494c46c6a68bafa6d4ddb969d2c96f992be04bc37b94c46bcc1370ff6","createdAt":"2025-06-18T21:07:12.844Z","updatedAt":"2025-06-18T21:07:12.844Z"}}],"relatedTasks":[]}
```
**Request 3:**
```json
{
  "projectId": 4,
  "projectColumnId": 12,
  "name": "Test Task 3",
  "description": "This is a test task 3"
}
```
**Response 3:**
```json
{"id":50,"name":"Test Task 3","description":"This is a test task 3","createdById":1,"assigneeId":null,"projectId":4,"projectColumnId":12,"order":3,"identifier":"NEW-5","relationMode":null,"relationId":null,"createdAt":"2025-07-13T20:09:05.638Z","updatedAt":"2025-07-13T20:09:05.638Z","createdBy":{"id":1,"name":"Łukasz","surname":"Podlipski","email":"lukaszpodlipskikontakt@gmail.com","password":"$2a$10$cGSd2MfOHWFa6RZcpFVtNugNXlgwoqXXknqrlcksDXDby2UkwfJ.S","avatarUrl":"https://img.freepik.com/free-vector/businessman-character-avatar-isolated_24877-60111.jpg?w=1380&t=st=1687798850~exp=1687799450~hmac=d239fcd494c46c6a68bafa6d4ddb969d2c96f992be04bc37b94c46bcc1370ff6","createdAt":"2025-06-18T21:07:12.844Z","updatedAt":"2025-06-18T21:07:12.844Z"},"assignee":null,"comments":[],"history":[{"id":1269,"taskId":50,"userId":1,"text":"Created task","createdAt":"2025-07-13T20:09:05.642Z","updatedAt":"2025-07-13T20:09:05.642Z","user":{"id":1,"name":"Łukasz","surname":"Podlipski","email":"lukaszpodlipskikontakt@gmail.com","password":"$2a$10$cGSd2MfOHWFa6RZcpFVtNugNXlgwoqXXknqrlcksDXDby2UkwfJ.S","avatarUrl":"https://img.freepik.com/free-vector/businessman-character-avatar-isolated_24877-60111.jpg?w=1380&t=st=1687798850~exp=1687799450~hmac=d239fcd494c46c6a68bafa6d4ddb969d2c96f992be04bc37b94c46bcc1370ff6","createdAt":"2025-06-18T21:07:12.844Z","updatedAt":"2025-06-18T21:07:12.844Z"}}],"relatedTasks":[]}
```

---

## PATCH /api/tasks/:id (x3)
**Request 1:**
```json
PATCH /api/tasks/48
Content-Type: application/json
Authorization: <JWT>
{
  "name": "Test Task 1 - updated",
  "description": "This is a test task 1 - updated"
}
```
**Response 1:**
```json
{"id":48,"name":"Test Task 1 - updated","description":"This is a test task 1 - updated","projectColumnId":12,"order":1,"createdBy":{"id":1,"fullName":"Łukasz Podlipski","avatarUrl":"https://img.freepik.com/free-vector/businessman-character-avatar-isolated_24877-60111.jpg?w=1380&t=st=1687798850~exp=1687799450~hmac=d239fcd494c46c6a68bafa6d4ddb969d2c96f992be04bc37b94c46bcc1370ff6"},"assignee":null,"identifier":"NEW-3","relationId":null,"comments":[],"history":[{"id":1267,"taskId":48,"userId":1,"text":"Created task","createdAt":"2025-07-13T20:08:51.240Z","updatedAt":"2025-07-13T20:08:51.240Z","user":{"id":1,"name":"Łukasz","surname":"Podlipski","email":"lukaszpodlipskikontakt@gmail.com","password":"$2a$10$cGSd2MfOHWFa6RZcpFVtNugNXlgwoqXXknqrlcksDXDby2UkwfJ.S","avatarUrl":"https://img.freepik.com/free-vector/businessman-character-avatar-isolated_24877-60111.jpg?w=1380&t=st=1687798850~exp=1687799450~hmac=d239fcd494c46c6a68bafa6d4ddb969d2c96f992be04bc37b94c46bcc1370ff6","createdAt":"2025-06-18T21:07:12.844Z","updatedAt":"2025-06-18T21:07:12.844Z"}},{"id":1270,"taskId":48,"userId":1,"text":"Updated task name, description","createdAt":"2025-07-13T20:09:36.182Z","updatedAt":"2025-07-13T20:09:36.182Z","user":{"id":1,"name":"Łukasz","surname":"Podlipski","email":"lukaszpodlipskikontakt@gmail.com","password":"$2a$10$cGSd2MfOHWFa6RZcpFVtNugNXlgwoqXXknqrlcksDXDby2UkwfJ.S","avatarUrl":"https://img.freepik.com/free-vector/businessman-character-avatar-isolated_24877-60111.jpg?w=1380&t=st=1687798850~exp=1687799450~hmac=d239fcd494c46c6a68bafa6d4ddb969d2c96f992be04bc37b94c46bcc1370ff6","createdAt":"2025-06-18T21:07:12.844Z","updatedAt":"2025-06-18T21:07:12.844Z"}}],"createdAt":"2025-07-13T20:08:51.221Z","relatedTask":{"relationMode":null}}
```
**Request 2:**
```json
PATCH /api/tasks/49
{
  "name": "Test Task 2 - updated",
  "description": "This is a test task 2 - updated"
}
```
**Response 2:**
```json
{"id":49,"name":"Test Task 2 - updated","description":"This is a test task 2 - updated","projectColumnId":12,"order":2,"createdBy":{"id":1,"fullName":"Łukasz Podlipski","avatarUrl":"https://img.freepik.com/free-vector/businessman-character-avatar-isolated_24877-60111.jpg?w=1380&t=st=1687798850~exp=1687799450~hmac=d239fcd494c46c6a68bafa6d4ddb969d2c96f992be04bc37b94c46bcc1370ff6"},"assignee":null,"identifier":"NEW-4","relationId":null,"comments":[],"history":[{"id":1268,"taskId":49,"userId":1,"text":"Created task","createdAt":"2025-07-13T20:09:05.484Z","updatedAt":"2025-07-13T20:09:05.484Z","user":{"id":1,"name":"Łukasz","surname":"Podlipski","email":"lukaszpodlipskikontakt@gmail.com","password":"$2a$10$cGSd2MfOHWFa6RZcpFVtNugNXlgwoqXXknqrlcksDXDby2UkwfJ.S","avatarUrl":"https://img.freepik.com/free-vector/businessman-character-avatar-isolated_24877-60111.jpg?w=1380&t=st=1687798850~exp=1687799450~hmac=d239fcd494c46c6a68bafa6d4ddb969d2c96f992be04bc37b94c46bcc1370ff6","createdAt":"2025-06-18T21:07:12.844Z","updatedAt":"2025-06-18T21:07:12.844Z"}},{"id":1271,"taskId":49,"userId":1,"text":"Updated task name, description","createdAt":"2025-07-13T20:09:36.443Z","updatedAt":"2025-07-13T20:09:36.443Z","user":{"id":1,"name":"Łukasz","surname":"Podlipski","email":"lukaszpodlipskikontakt@gmail.com","password":"$2a$10$cGSd2MfOHWFa6RZcpFVtNugNXlgwoqXXknqrlcksDXDby2UkwfJ.S","avatarUrl":"https://img.freepik.com/free-vector/businessman-character-avatar-isolated_24877-60111.jpg?w=1380&t=st=1687798850~exp=1687799450~hmac=d239fcd494c46c6a68bafa6d4ddb969d2c96f992be04bc37b94c46bcc1370ff6","createdAt":"2025-06-18T21:07:12.844Z","updatedAt":"2025-06-18T21:07:12.844Z"}}],"createdAt":"2025-07-13T20:09:05.479Z","relatedTask":{"relationMode":null}}
```
**Request 3:**
PATCH /api/tasks/50
```json
{
  "name": "Test Task 3 - updated",
  "description": "This is a test task 3 - updated"
}
```
**Response 3:**
```json
{"id":50,"name":"Test Task 3 - updated","description":"This is a test task 3 - updated","projectColumnId":12,"order":3,"createdBy":{"id":1,"fullName":"Łukasz Podlipski","avatarUrl":"https://img.freepik.com/free-vector/businessman-character-avatar-isolated_24877-60111.jpg?w=1380&t=st=1687798850~exp=1687799450~hmac=d239fcd494c46c6a68bafa6d4ddb969d2c96f992be04bc37b94c46bcc1370ff6"},"assignee":null,"identifier":"NEW-5","relationId":null,"comments":[],"history":[{"id":1269,"taskId":50,"userId":1,"text":"Created task","createdAt":"2025-07-13T20:09:05.642Z","updatedAt":"2025-07-13T20:09:05.642Z","user":{"id":1,"name":"Łukasz","surname":"Podlipski","email":"lukaszpodlipskikontakt@gmail.com","password":"$2a$10$cGSd2MfOHWFa6RZcpFVtNugNXlgwoqXXknqrlcksDXDby2UkwfJ.S","avatarUrl":"https://img.freepik.com/free-vector/businessman-character-avatar-isolated_24877-60111.jpg?w=1380&t=st=1687798850~exp=1687799450~hmac=d239fcd494c46c6a68bafa6d4ddb969d2c96f992be04bc37b94c46bcc1370ff6","createdAt":"2025-06-18T21:07:12.844Z","updatedAt":"2025-06-18T21:07:12.844Z"}},{"id":1272,"taskId":50,"userId":1,"text":"Updated task name, description","createdAt":"2025-07-13T20:09:36.618Z","updatedAt":"2025-07-13T20:09:36.618Z","user":{"id":1,"name":"Łukasz","surname":"Podlipski","email":"lukaszpodlipskikontakt@gmail.com","password":"$2a$10$cGSd2MfOHWFa6RZcpFVtNugNXlgwoqXXknqrlcksDXDby2UkwfJ.S","avatarUrl":"https://img.freepik.com/free-vector/businessman-character-avatar-isolated_24877-60111.jpg?w=1380&t=st=1687798850~exp=1687799450~hmac=d239fcd494c46c6a68bafa6d4ddb969d2c96f992be04bc37b94c46bcc1370ff6","createdAt":"2025-06-18T21:07:12.844Z","updatedAt":"2025-06-18T21:07:12.844Z"}}],"createdAt":"2025-07-13T20:09:05.638Z","relatedTask":{"relationMode":null}}
```

---

## DELETE /api/tasks/:id (x3)
**Request 1:**
```
DELETE /api/tasks/48
Authorization: <JWT>
```
**Response 1:**
```
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Cannot DELETE /api/tasks/48</pre>
</body>
</html>
```
**Request 2:**
```
DELETE /api/tasks/49
Authorization: <JWT>
```
**Response 2:**
```
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Cannot DELETE /api/tasks/49</pre>
</body>
</html>
```
**Request 3:**
```
DELETE /api/tasks/50
Authorization: <JWT>
```
**Response 3:**
```
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Cannot DELETE /api/tasks/50</pre>
</body>
</html>
```

---

## Error/Negative-Path Test Results

### POST /api/projects (missing required fields)
**Request:**
```json
POST /api/projects
Content-Type: application/json
Authorization: <JWT>
{
  "name": ""
}
```
**Response:**
```json
{"error":"Validation error: required fields missing"}
```

---

### POST /api/columns (missing required fields)
**Request:**
```json
POST /api/columns
Content-Type: application/json
Authorization: <JWT>
{
  "projectId": 4
}
```
**Response:**
```json
{"error":"Validation error: required fields missing"}
```

---

### PATCH /api/columns (invalid column/projectId)
**Request:**
```json
PATCH /api/columns
Content-Type: application/json
Authorization: <JWT>
{
  "projectId": 9999,
  "columns": [
    {"id": 9999, "name": "Nonexistent", "order": 1, "color": "#000000", "type": null, "description": "invalid"}
  ]
}
```
**Response:**
```json
{"error":"Project or column not found"}
```

---

### POST /api/tasks (missing required fields)
**Request:**
```json
POST /api/tasks
Content-Type: application/json
Authorization: <JWT>
{
  "projectId": 4
}
```
**Response:**
```json
{"error":"Validation error: required fields missing"}
```

---

### PATCH /api/tasks/:id (invalid task ID)
**Request:**
```json
PATCH /api/tasks/9999
Content-Type: application/json
Authorization: <JWT>
{
  "name": "Should not work"
}
```
**Response:**
```json
{"error":"Task not found"}
```

---

### DELETE /api/tasks/:id (happy path, not implemented)
**Request:**
```
DELETE /api/tasks/48
Authorization: <JWT>
```
**Response:**
```
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Cannot DELETE /api/tasks/48</pre>
</body>
</html>
```

---

### DELETE /api/tasks/:id (invalid task ID, not implemented)
**Request:**
```
DELETE /api/tasks/9999
Authorization: <JWT>
```
**Response:**
```
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Cannot DELETE /api/tasks/9999</pre>
</body>
</html>
``` 