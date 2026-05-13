/**
 * Database Seed Script
 *
 * Run with: npx prisma db seed
 * Or: npx ts-node prisma/seed.ts
 */

import { prisma } from '../src/infrastructure/auth/index.js';
import { auth } from '../src/infrastructure/auth/index.js';

async function main() {
  console.log('Starting database seed...');

  // Clean existing data - order matters for foreign key constraints
  await prisma.agentAuditLog.deleteMany();
  await prisma.agentLifecycleAuditLog.deleteMany();
  await prisma.agentDelegation.deleteMany();
  await prisma.taskDocumentLink.deleteMany();
  await prisma.projectDocument.deleteMany();
  await prisma.taskLog.deleteMany();
  await prisma.taskComment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.projectColumn.deleteMany();
  await prisma.projectUser.deleteMany();
  await prisma.apikey.deleteMany();
  await prisma.project.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.user.deleteMany();

  console.log('Cleaned existing data');

  // Create test users via Better Auth
  const user1 = await auth.api.signUpEmail({
    body: {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
    },
  });

  const user2 = await auth.api.signUpEmail({
    body: {
      email: 'demo@example.com',
      password: 'password123',
      name: 'Demo User',
    },
  });

  const adminUser = await auth.api.signUpEmail({
    body: {
      email: 'admin@example.com',
      password: 'password123',
      name: 'Admin User',
    },
  });

  console.log('Created users:', user1?.user.email, user2?.user.email, adminUser?.user.email);

  // Get user IDs (convert from string to number)
  const user1Id = parseInt(user1?.user.id as string, 10);
  const user2Id = parseInt(user2?.user.id as string, 10);
  const adminUserId = parseInt(adminUser?.user.id as string, 10);

  // Update admin user role
  await prisma.user.update({
    where: { id: adminUserId },
    data: { role: 'ADMIN' },
  });

  // ========== PROJECT 10 ==========
  // Create Project 10 with comprehensive data
  const project10 = await prisma.project.create({
    data: {
      name: 'Project 10 - Full Feature Demo',
      description: 'A comprehensive demo project showcasing all Kanban features including agents, knowledge base, and task relationships',
      prefix: 'P10',
      ownerId: user1Id,
      members: {
        create: [
          { userId: user1Id, role: 'Owner' },
          { userId: user2Id, role: 'Editor' },
          { userId: adminUserId, role: 'Maintainer' },
        ],
      },
      columns: {
        create: [
          { name: 'Backlog', order: 0, color: '#6b7280', type: 'backlog', description: 'Ideas and future work' },
          { name: 'To Do', order: 1, color: '#6366f1', type: 'todo', description: 'Ready to start' },
          { name: 'In Progress', order: 2, color: '#f59e0b', type: 'in_progress', description: 'Currently working' },
          { name: 'Review', order: 3, color: '#8b5cf6', type: 'review', description: 'Pending review' },
          { name: 'Done', order: 4, color: '#10b981', type: 'done', description: 'Completed tasks' },
          { name: 'Agent Review', order: 5, color: '#ec4899', type: 'agent_review', description: 'Tasks for agent review' },
        ],
      },
    },
    include: { columns: true },
  });

  console.log('Created Project 10:', project10.name);

  // Get column references
  const backlogCol = project10.columns.find(c => c.type === 'backlog');
  const todoCol = project10.columns.find(c => c.type === 'todo');
  const inProgressCol = project10.columns.find(c => c.type === 'in_progress');
  const reviewCol = project10.columns.find(c => c.type === 'review');
  const doneCol = project10.columns.find(c => c.type === 'done');
  const agentReviewCol = project10.columns.find(c => c.type === 'agent_review');

  // ========== AGENTS ==========
  // Create API keys for agents via Better Auth API key plugin
  const agentTypes = [
    { name: 'Task Analyzer', description: 'Analyzes tasks and suggests improvements', permissionLevel: 'VIEWER' },
    { name: 'Code Reviewer', description: 'Reviews code-related tasks', permissionLevel: 'VIEWER' },
    { name: 'Documentation Bot', description: 'Manages documentation tasks', permissionLevel: 'USER' },
    { name: 'Bug Hunter', description: 'Identifies and tracks bugs', permissionLevel: 'USER' },
    { name: 'Feature Planner', description: 'Plans and breaks down features', permissionLevel: 'USER' },
    { name: 'Test Automation', description: 'Manages testing tasks', permissionLevel: 'USER' },
    { name: 'Release Manager', description: 'Manages release tasks', permissionLevel: 'VIEWER' },
    { name: 'Performance Monitor', description: 'Monitors performance tasks', permissionLevel: 'VIEWER' },
  ];

  const createdAgents = [];
  for (const agentType of agentTypes) {
    try {
      // Create API key via Better Auth
      const apiKeyResult = await auth.api.createApiKey({
        body: {
          userId: user1Id.toString(),
          name: agentType.name,
          expiresIn: 60 * 60 * 24 * 365, // 1 year
        },
      });

      // Update API key with agent metadata
      await prisma.apikey.update({
        where: { id: apiKeyResult.id },
        data: {
          metadata: JSON.stringify({
            isAgent: true,
            description: agentType.description,
            createdBy: user1Id,
          }),
        },
      });

      // Create agent delegation to Project 10
      await prisma.agentDelegation.create({
        data: {
          apiKeyId: apiKeyResult.id,
          projectId: project10.id,
          permissionLevel: agentType.permissionLevel as any,
          delegatedById: user1Id,
          isActive: true,
          delegationMode: 'FULL',
        },
      });

      createdAgents.push({
        name: agentType.name,
        apiKeyId: apiKeyResult.id,
        key: apiKeyResult.key,
        permissionLevel: agentType.permissionLevel,
      });

      console.log(`Created agent: ${agentType.name} with ${agentType.permissionLevel} permissions`);
    } catch (error) {
      console.error(`Failed to create agent ${agentType.name}:`, error);
    }
  }

  // ========== KNOWLEDGE BASE DOCUMENTS ==========
  const documents = [
    {
      title: 'Project 10 Overview',
      content: '# Project 10 Overview\n\nThis is a comprehensive demo project showcasing all Kanban board features.\n\n## Features\n- Task management\n- Agent integrations\n- Knowledge base\n- Document linking\n\n## Getting Started\n1. Create tasks\n2. Assign agents\n3. Link documents',
      type: 'MARKDOWN',
      version: 1,
    },
    {
      title: 'Agent Integration Guide',
      content: '# Agent Integration Guide\n\n## Available Agents\n\n### Task Analyzer\n- **Purpose**: Analyzes tasks and suggests improvements\n- **Permission**: Viewer\n- **Usage**: Link to tasks for analysis\n\n### Code Reviewer\n- **Purpose**: Reviews code-related tasks\n- **Permission**: Viewer\n\n### Documentation Bot\n- **Purpose**: Manages documentation tasks\n- **Permission**: User\n\n### Bug Hunter\n- **Purpose**: Identifies and tracks bugs\n- **Permission**: User',
      type: 'MARKDOWN',
      version: 1,
    },
    {
      title: 'Development Workflow',
      content: '# Development Workflow\n\n## Process\n1. **Backlog** - Ideas and feature requests\n2. **To Do** - Prioritized work ready to start\n3. **In Progress** - Active development\n4. **Review** - Code review and testing\n5. **Done** - Completed and deployed\n\n## Best Practices\n- Keep tasks focused and small\n- Link related documents\n- Use agents for automation\n- Regular backlog grooming',
      type: 'MARKDOWN',
      version: 1,
    },
    {
      title: 'API Documentation',
      content: '# API Documentation\n\n## Authentication\nUse Bearer token for authentication.\n\n## Endpoints\n\n### Projects\n- `GET /api/projects` - List projects\n- `POST /api/projects` - Create project\n- `GET /api/projects/:id` - Get project details\n\n### Tasks\n- `GET /api/tasks` - List tasks\n- `POST /api/tasks` - Create task\n- `PATCH /api/tasks/:id` - Update task\n\n### Search\n- `GET /api/search?q=query` - Search tasks',
      type: 'MARKDOWN',
      version: 1,
    },
    {
      title: 'Testing Strategy',
      content: '# Testing Strategy\n\n## Unit Tests\n- Jest for backend\n- Vitest for frontend\n\n## E2E Tests\n- Playwright for browser testing\n\n## Coverage Goals\n- 80% code coverage minimum\n- Critical paths fully tested',
      type: 'MARKDOWN',
      version: 1,
    },
  ];

  const createdDocs = [];
  for (const doc of documents) {
    const document = await prisma.projectDocument.create({
      data: {
        title: doc.title,
        content: doc.content,
        type: doc.type as any,
        version: doc.version,
        projectId: project10.id,
        createdById: user1Id,
        isDraft: false,
      },
    });
    createdDocs.push(document);
    console.log('Created document:', document.title);
  }

  // ========== TASKS ==========
  // Create a variety of tasks in different columns

  // Backlog tasks
  if (backlogCol) {
    await prisma.task.create({
      data: {
        name: 'Implement dark mode',
        description: 'Add dark mode support across the application',
        projectId: project10.id,
        projectColumnId: backlogCol.id,
        createdById: user1Id,
        order: 0,
        identifier: 'P10-1',
        priority: 'medium',
      },
    });

    await prisma.task.create({
      data: {
        name: 'Mobile responsive design',
        description: 'Optimize UI for mobile devices',
        projectId: project10.id,
        projectColumnId: backlogCol.id,
        createdById: user2Id,
        order: 1,
        identifier: 'P10-2',
        priority: 'high',
      },
    });
  }

  // To Do tasks
  if (todoCol) {
    await prisma.task.create({
      data: {
        name: 'Set up CI/CD pipeline',
        description: 'Configure GitHub Actions for automated testing and deployment',
        projectId: project10.id,
        projectColumnId: todoCol.id,
        createdById: user1Id,
        assigneeId: adminUserId,
        order: 0,
        identifier: 'P10-3',
        priority: 'high',
      },
    });

    await prisma.task.create({
      data: {
        name: 'Write API documentation',
        description: 'Document all REST API endpoints with OpenAPI spec',
        projectId: project10.id,
        projectColumnId: todoCol.id,
        createdById: user1Id,
        assigneeId: user2Id,
        order: 1,
        identifier: 'P10-4',
        priority: 'medium',
      },
    });
  }

  // In Progress tasks
  if (inProgressCol) {
    const task5 = await prisma.task.create({
      data: {
        name: 'Implement task search',
        description: 'Add natural language search functionality for tasks',
        projectId: project10.id,
        projectColumnId: inProgressCol.id,
        createdById: user1Id,
        assigneeId: user1Id,
        order: 0,
        identifier: 'P10-5',
        priority: 'high',
      },
    });

    // Link document to task
    if (createdDocs[3]) {
      await prisma.taskDocumentLink.create({
        data: {
          projectId: project10.id,
          taskId: task5.id,
          documentId: createdDocs[3].id,
          role: 'REFERENCE',
        },
      });
    }
  }

  // Review tasks
  if (reviewCol) {
    const task6 = await prisma.task.create({
      data: {
        name: 'Refactor authentication',
        description: 'Migrate to Better Auth with API key support',
        projectId: project10.id,
        projectColumnId: reviewCol.id,
        createdById: user2Id,
        assigneeId: user1Id,
        order: 0,
        identifier: 'P10-6',
        priority: 'high',
      },
    });

    // Add comment
    await prisma.taskComment.create({
      data: {
        content: 'This looks great! The migration is complete and all tests pass.',
        taskId: task6.id,
        userId: adminUserId,
      },
    });
  }

  // Done tasks
  if (doneCol) {
    await prisma.task.create({
      data: {
        name: 'Initial project setup',
        description: 'Set up project structure with Express, Prisma, and Vue',
        projectId: project10.id,
        projectColumnId: doneCol.id,
        createdById: user1Id,
        assigneeId: user1Id,
        order: 0,
        identifier: 'P10-7',
        priority: 'high',
        status: 'done',
      },
    });

    await prisma.task.create({
      data: {
        name: 'Design database schema',
        description: 'Create Prisma schema for all entities',
        projectId: project10.id,
        projectColumnId: doneCol.id,
        createdById: user1Id,
        assigneeId: user2Id,
        order: 1,
        identifier: 'P10-8',
        priority: 'high',
        status: 'done',
      },
    });
  }

  // Agent Review tasks
  if (agentReviewCol) {
    const task9 = await prisma.task.create({
      data: {
        name: 'AI-generated feature proposal',
        description: 'Automated feature suggestion based on user feedback analysis',
        projectId: project10.id,
        projectColumnId: agentReviewCol.id,
        createdById: user1Id,
        order: 0,
        identifier: 'P10-9',
        priority: 'low',
      },
    });

    // Link overview document
    if (createdDocs[0]) {
      await prisma.taskDocumentLink.create({
        data: {
          projectId: project10.id,
          taskId: task9.id,
          documentId: createdDocs[0].id,
          role: 'REFERENCE',
        },
      });
    }
  }

  // Create additional demo project (original)
  const project = await prisma.project.create({
    data: {
      name: 'Kanban Demo Project',
      description: 'A sample project for testing',
      prefix: 'KAN',
      ownerId: user1Id,
      members: {
        create: [
          { userId: user1Id, role: 'Owner' },
          { userId: user2Id, role: 'Editor' },
        ],
      },
      columns: {
        create: [
          { name: 'To Do', order: 0, color: '#6366f1', type: 'todo' },
          { name: 'In Progress', order: 1, color: '#f59e0b', type: 'in_progress' },
          { name: 'Done', order: 2, color: '#10b981', type: 'done' },
        ],
      },
    },
    include: { columns: true },
  });

  console.log('Created project:', project.name);

  // Create sample tasks in demo project
  const demoTodoCol = project.columns.find(c => c.type === 'todo');
  const demoInProgressCol = project.columns.find(c => c.type === 'in_progress');

  if (demoTodoCol) {
    await prisma.task.create({
      data: {
        name: 'Welcome to Kanban',
        description: 'This is a sample task to get you started',
        projectId: project.id,
        projectColumnId: demoTodoCol.id,
        createdById: user1Id,
        order: 0,
        identifier: 'KAN-1',
      },
    });
  }

  if (demoInProgressCol) {
    await prisma.task.create({
      data: {
        name: 'Explore the board',
        description: 'Check out all the features',
        projectId: project.id,
        projectColumnId: demoInProgressCol.id,
        createdById: user2Id,
        assigneeId: user2Id,
        order: 0,
        identifier: 'KAN-2',
      },
    });
  }

  console.log('Created sample tasks');

  // Print summary
  console.log('\n========================================');
  console.log('Seed completed successfully!');
  console.log('========================================\n');

  console.log('Login credentials:');
  console.log('  test@example.com / password123 (Owner)');
  console.log('  demo@example.com / password123 (Editor)');
  console.log('  admin@example.com / password123 (Admin)\n');

  console.log('Project 10 created with:');
  console.log('  - 6 columns (Backlog, To Do, In Progress, Review, Done, Agent Review)');
  console.log('  - 9+ tasks across all columns');
  console.log('  - 8 agents with various permission levels');
  console.log('  - 5 knowledge base documents\n');

  if (createdAgents.length > 0) {
    console.log('Agent API Keys (save these - shown only once):');
    createdAgents.forEach(agent => {
      console.log(`  ${agent.name}: ${agent.key} (${agent.permissionLevel})`);
    });
  }
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
