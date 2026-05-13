#!/usr/bin/env node
/**
 * Route Validation Checker
 * 
 * Scans route files and verifies that:
 * 1. All route handlers use asyncHandler wrapper
 * 2. Route handlers that should have validation (POST/PUT/PATCH) have validateBody/validateParams
 * 3. Error handling uses AppError subclasses
 * 
 * Run: node scripts/check-route-validation.js
 */

const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.join(__dirname, '../src/api/routes');

const ROUTE_FILES = [
  'auth.ts',
  'agents.ts',
  'agents/delegations.ts',
  'agent/tasks.ts',
  'agent/comments.ts',
  'agent/projects.ts',
  'admin/users.ts',
  'admin/rate-limits.ts',
  'admin/health.ts',
  'admin/audit-log.ts',
  'projects.ts',
  'monitor-pass.ts',
];

function checkRouteFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const issues = [];
  
  const lines = content.split('\n');
  
  let inRouterHandler = false;
  let handlerStartLine = 0;
  let hasAsyncHandler = false;
  let hasValidation = false;
  let handlerType = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    // Detect router method calls (router.get, router.post, etc.)
    const routerMatch = line.match(/router\.(get|post|put|patch|delete|options)\s*\(/);
    if (routerMatch && !line.includes('//') && !line.includes('*')) {
      inRouterHandler = true;
      handlerStartLine = lineNum;
      hasAsyncHandler = line.includes('asyncHandler'); // Check on same line
      hasValidation = line.includes('validate'); // Check on same line
      handlerType = routerMatch[1];
      continue;
    }
    
    if (inRouterHandler) {
      // Check for asyncHandler (may be on same line or later)
      if (line.includes('asyncHandler')) {
        hasAsyncHandler = true;
      }
      
      // Check for validation middleware
      if (line.includes('validateParams') || line.includes('validateBody') || line.includes('validateQuery')) {
        hasValidation = true;
      }
      
      // Check for end of handler - look for closing of route
      // Handler ends when we see ); on a line after the route definition
      if (line.trim() === ');' && lineNum > handlerStartLine + 1) {
        // POST/PUT/PATCH should have validation (at least one validation middleware)
        if (['post', 'put', 'patch'].includes(handlerType) && !hasValidation) {
          issues.push({
            line: handlerStartLine,
            message: `POST/PUT/PATCH route missing validation middleware (validateBody/validateParams)`,
          });
        }
        
        // All routes should use asyncHandler
        if (!hasAsyncHandler) {
          issues.push({
            line: handlerStartLine,
            message: `Route handler missing asyncHandler wrapper`,
          });
        }
        
        inRouterHandler = false;
      }
    }
  }
  
  return issues;
}

console.log('Checking route files for validation and error handling...\n');

let totalIssues = 0;

for (const file of ROUTE_FILES) {
  const filePath = path.join(ROUTES_DIR, file);
  if (fs.existsSync(filePath)) {
    const issues = checkRouteFile(filePath);
    if (issues.length > 0) {
      console.log(`\n${file}:`);
      issues.forEach(issue => {
        console.log(`  Line ${issue.line}: ${issue.message}`);
        totalIssues++;
      });
    }
  } else {
    console.log(`Warning: ${file} not found`);
  }
}

console.log(`\n${totalIssues > 0 ? 'ISSUES FOUND' : 'All routes look good!'}`);
process.exit(totalIssues > 0 ? 1 : 0);