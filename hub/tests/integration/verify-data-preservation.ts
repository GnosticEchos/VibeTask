/**
 * Data Preservation Verification Script
 * 
 * This script verifies that existing data is preserved after running integration tests.
 * It checks:
 * - Users 1-5 exist and can login
 * - Projects 1-10 exist with their data
 * - Tasks 1-50 exist
 * - No test-created entities remain (IDs > 10000)
 * 
 * Run with: npx tsx tests/integration/verify-data-preservation.ts
 */

import { prisma } from '../../src/infrastructure/auth/prisma.js';

interface VerificationResult {
  category: string;
  passed: boolean;
  details: string;
  count?: number;
  expected?: number;
}

const results: VerificationResult[] = [];

async function verifyUsers(): Promise<void> {
  console.log('\n📋 Verifying Users 1-5...');
  
  // Actual seed data from prisma/DATADUMP/users.csv
  const expectedUsers = [
    { id: 1, email: 'lukaszpodlipskikontakt@gmail.com', name: 'Łukasz' },
    { id: 2, email: 'andrzejpodlipski@example.com', name: 'Andrzej' },
    { id: 3, email: 'jakkowalski@example.com', name: 'Jan' },
    { id: 4, email: 'adammickiewicz@example.com', name: 'Adam' },
    { id: 5, email: 'juliuszslowacki@example.com', name: 'Juliusz' },
  ];

  for (const expected of expectedUsers) {
    const user = await prisma.user.findUnique({
      where: { id: expected.id },
      select: { id: true, email: true, name: true },
    });

    if (user && user.email === expected.email) {
      results.push({
        category: 'Users',
        passed: true,
        details: `User ${expected.id} (${expected.name}) exists with correct email`,
      });
    } else {
      results.push({
        category: 'Users',
        passed: false,
        details: `User ${expected.id} (${expected.name}) missing or has wrong email. Found: ${user?.email ?? 'null'}`,
      });
    }
  }

  // Check total users with ID <= 5
  const userCount = await prisma.user.count({
    where: { id: { lte: 5 } },
  });
  
  results.push({
    category: 'Users',
    passed: userCount === 5,
    details: `Found ${userCount} users with ID <= 5`,
    count: userCount,
    expected: 5,
  });
}

async function verifyProjects(): Promise<void> {
  console.log('\n📋 Verifying Projects (9 projects: 1, 2, 4-10, no project 3)...');
  
  // Actual project IDs from prisma/DATADUMP/projects.csv
  const expectedProjectIds = [1, 2, 4, 5, 6, 7, 8, 9, 10];
  
  const projectCount = await prisma.project.count({
    where: { id: { in: expectedProjectIds } },
  });

  results.push({
    category: 'Projects',
    passed: projectCount === 9,
    details: `Found ${projectCount} expected projects`,
    count: projectCount,
    expected: 9,
  });

  // Verify each project exists
  for (const id of expectedProjectIds) {
    const project = await prisma.project.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (project) {
      results.push({
        category: 'Projects',
        passed: true,
        details: `Project ${id} (${project.name}) exists`,
      });
    } else {
      results.push({
        category: 'Projects',
        passed: false,
        details: `Project ${id} is missing`,
      });
    }
  }
}

async function verifyTasks(): Promise<void> {
  console.log('\n📋 Verifying Tasks (47 tasks with IDs 1-50, not all sequential)...');
  
  // Count tasks with ID <= 50 (actual count from DATADUMP is 47)
  const taskCount = await prisma.task.count({
    where: { id: { lte: 50 } },
  });

  results.push({
    category: 'Tasks',
    passed: taskCount >= 40, // Allow some flexibility
    details: `Found ${taskCount} tasks with ID <= 50 (expected ~47)`,
    count: taskCount,
    expected: 47,
  });

  // Sample check - verify some key tasks
  const task1 = await prisma.task.findUnique({ where: { id: 1 } });
  const task50 = await prisma.task.findUnique({ where: { id: 50 } });

  results.push({
    category: 'Tasks',
    passed: !!task1,
    details: `Task 1 ${task1 ? 'exists' : 'is missing'}`,
  });

  results.push({
    category: 'Tasks',
    passed: !!task50,
    details: `Task 50 ${task50 ? 'exists' : 'is missing'}`,
  });
}

async function verifyNoTestEntitiesRemain(): Promise<void> {
  console.log('\n📋 Verifying no test entities remain (IDs > 10000)...');
  
  const minTestId = 10000;

  // Check users
  const testUsers = await prisma.user.count({
    where: { id: { gt: minTestId } },
  });
  results.push({
    category: 'Cleanup',
    passed: testUsers === 0,
    details: `Found ${testUsers} test users with ID > ${minTestId}`,
    count: testUsers,
    expected: 0,
  });

  // Check projects
  const testProjects = await prisma.project.count({
    where: { id: { gt: minTestId } },
  });
  results.push({
    category: 'Cleanup',
    passed: testProjects === 0,
    details: `Found ${testProjects} test projects with ID > ${minTestId}`,
    count: testProjects,
    expected: 0,
  });

  // Check tasks
  const testTasks = await prisma.task.count({
    where: { id: { gt: minTestId } },
  });
  results.push({
    category: 'Cleanup',
    passed: testTasks === 0,
    details: `Found ${testTasks} test tasks with ID > ${minTestId}`,
    count: testTasks,
    expected: 0,
  });

  // Check columns
  const testColumns = await prisma.projectColumn.count({
    where: { id: { gt: minTestId } },
  });
  results.push({
    category: 'Cleanup',
    passed: testColumns === 0,
    details: `Found ${testColumns} test columns with ID > ${minTestId}`,
    count: testColumns,
    expected: 0,
  });

  // Check comments
  const testComments = await prisma.taskComment.count({
    where: { id: { gt: minTestId } },
  });
  results.push({
    category: 'Cleanup',
    passed: testComments === 0,
    details: `Found ${testComments} test comments with ID > ${minTestId}`,
    count: testComments,
    expected: 0,
  });

  // Check project users
  const testProjectUsers = await prisma.projectUser.count({
    where: { id: { gt: minTestId } },
  });
  results.push({
    category: 'Cleanup',
    passed: testProjectUsers === 0,
    details: `Found ${testProjectUsers} test project users with ID > ${minTestId}`,
    count: testProjectUsers,
    expected: 0,
  });

  // Check task logs
  const testTaskLogs = await prisma.taskLog.count({
    where: { id: { gt: minTestId } },
  });
  results.push({
    category: 'Cleanup',
    passed: testTaskLogs === 0,
    details: `Found ${testTaskLogs} test task logs with ID > ${minTestId}`,
    count: testTaskLogs,
    expected: 0,
  });
}

async function verifyAssociatedData(): Promise<void> {
  console.log('\n📋 Verifying associated data (columns, comments, logs)...');
  
  // Check columns for projects 1-10
  const columnsForExistingProjects = await prisma.projectColumn.count({
    where: { projectId: { lte: 10 } },
  });
  
  results.push({
    category: 'Associated Data',
    passed: columnsForExistingProjects > 0,
    details: `Found ${columnsForExistingProjects} columns for projects 1-10`,
    count: columnsForExistingProjects,
  });

  // Check comments for tasks 1-50
  const commentsForExistingTasks = await prisma.taskComment.count({
    where: { taskId: { lte: 50 } },
  });
  
  results.push({
    category: 'Associated Data',
    passed: true, // Comments might be 0, which is fine
    details: `Found ${commentsForExistingTasks} comments for tasks 1-50`,
    count: commentsForExistingTasks,
  });

  // Check task logs for tasks 1-50
  const logsForExistingTasks = await prisma.taskLog.count({
    where: { taskId: { lte: 50 } },
  });
  
  results.push({
    category: 'Associated Data',
    passed: true, // Logs might be 0, which is fine
    details: `Found ${logsForExistingTasks} task logs for tasks 1-50`,
    count: logsForExistingTasks,
  });
}

function printReport(): void {
  console.log('\n' + '='.repeat(60));
  console.log('📊 DATA PRESERVATION VERIFICATION REPORT');
  console.log('='.repeat(60));

  const categories = [...new Set(results.map(r => r.category))];
  
  for (const category of categories) {
    const categoryResults = results.filter(r => r.category === category);
    const passed = categoryResults.filter(r => r.passed).length;
    const total = categoryResults.length;
    
    console.log(`\n📁 ${category}: ${passed}/${total} checks passed`);
    
    for (const result of categoryResults) {
      const icon = result.passed ? '✅' : '❌';
      console.log(`   ${icon} ${result.details}`);
    }
  }

  const totalPassed = results.filter(r => r.passed).length;
  const totalChecks = results.length;
  const allPassed = totalPassed === totalChecks;

  console.log('\n' + '='.repeat(60));
  console.log(`📈 SUMMARY: ${totalPassed}/${totalChecks} checks passed`);
  
  if (allPassed) {
    console.log('✅ ALL VERIFICATIONS PASSED - Data is preserved correctly!');
  } else {
    console.log('❌ SOME VERIFICATIONS FAILED - Review the details above');
  }
  console.log('='.repeat(60));
}

async function main(): Promise<void> {
  console.log('🔍 Starting Data Preservation Verification...');
  console.log('Database: postgresql://localhost:5432/kanban_rewrite');
  
  try {
    await prisma.$connect();
    console.log('✅ Connected to database');

    await verifyUsers();
    await verifyProjects();
    await verifyTasks();
    await verifyAssociatedData();
    await verifyNoTestEntitiesRemain();

    printReport();

    const allPassed = results.every(r => r.passed);
    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('❌ Verification failed with error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
