/**
 * Members API Routes
 * 
 * Implements the members endpoints from the API contract:
 * - GET /api/members?projectId - Get project members
 * - GET /api/members/:id - Get a member by user ID
 * - POST /api/members/invite - Invite a member
 * - PATCH /api/members/:id - Update member role
 * - DELETE /api/members/:id - Remove member
 */

import { Router } from 'express';
import { prisma } from '../../infrastructure/auth/index.js';
import { requireAuth } from '../../infrastructure/http/middleware/auth.js';
import { validateBody, validateQuery, validateParams, getValidatedQuery, getValidatedParams, getValidatedBody } from '../../infrastructure/http/validation.js';
import { 
  batchInviteMembersSchema,
  updateMemberRoleSchema, 
  checkEmailQuerySchema,
  projectIdQuerySchema,
  memberIdParamSchema
} from '../../validation/schemas/index.js';
import { 
  asyncHandler,
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  ConflictError
} from '../../infrastructure/http/middleware/error-handler.js';

const router = Router();

// GET /api/members?projectId - Get project members
router.get('/', requireAuth, validateQuery(projectIdQuerySchema), asyncHandler(async (req, res) => {
  const user = req.user!;

  const validatedQuery = getValidatedQuery<{ projectId: number }>(req);
  if (!validatedQuery) {
    throw new BadRequestError('Missing or invalid query parameters');
  }
  const { projectId } = validatedQuery;

  // Check membership
  const membership = await prisma.projectUser.findFirst({
    where: {
      projectId,
      userId: user.id,
    },
  });

  if (!membership) {
    throw new ForbiddenError('Access denied');
  }

  const members = await prisma.projectUser.findMany({
    where: { projectId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          surname: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  res.json(members.map(member => ({
    id: member.id,
    userId: member.userId,
    email: member.user.email,
    name: `${member.user.name} ${member.user.surname || ''}`.trim(),
    avatarUrl: member.user.avatarUrl,
    role: member.role,
    createdAt: member.createdAt.toISOString(),
  })));
}));

// GET /api/members/check_email - Check if user exists
// Check if already a member
router.get('/check_email', requireAuth, validateQuery(checkEmailQuerySchema), asyncHandler(async (req, res) => {
  const user = req.user!;

  const validatedQuery = getValidatedQuery<{ projectId: number; email: string }>(req);
  if (!validatedQuery) {
    throw new BadRequestError('Missing or invalid query parameters');
  }
  const { projectId, email } = validatedQuery;

  // Check membership - only owner/maintainer can invite
  const membership = await prisma.projectUser.findFirst({
    where: {
      projectId,
      userId: user.id,
    },
  });

  if (!membership || !['Owner', 'Maintainer'].includes(membership.role)) {
    throw new ForbiddenError('Access denied');
  }

  // Find user by email
  const targetUser = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      surname: true,
      avatarUrl: true,
    },
  });

  if (!targetUser) {
    throw new NotFoundError('User');
  }

  // Check if already a member
  const existingMember = await prisma.projectUser.findFirst({
    where: {
      projectId,
      userId: targetUser.id,
    },
  });

  if (existingMember) {
    throw new ConflictError('User already belongs to this project');
  }

  res.json({
    email: targetUser.email,
    id: targetUser.id,
    avatarUrl: targetUser.avatarUrl,
  });
}));

// GET /api/members/:id - Get a member by user ID
router.get('/:id', requireAuth, validateParams(memberIdParamSchema), validateQuery(projectIdQuerySchema), asyncHandler(async (req, res) => {
  const user = req.user!;

  const validatedParams = getValidatedParams<{ id: number }>(req);
  const validatedQuery = getValidatedQuery<{ projectId: number }>(req);
  if (!validatedParams || !validatedQuery) {
    throw new BadRequestError('Missing or invalid parameters');
  }
  const { id: memberId } = validatedParams;
  const { projectId } = validatedQuery;

  if (!projectId) {
    throw new BadRequestError('projectId is required');
  }

  // Check if requester is a member
  const requesterMembership = await prisma.projectUser.findFirst({
    where: { projectId, userId: user.id },
  });

  if (!requesterMembership) {
    throw new ForbiddenError('Access denied');
  }

  // Get the target member
  const targetMembership = await prisma.projectUser.findFirst({
    where: { projectId, userId: memberId },
    include: {
      user: { select: { id: true, name: true, surname: true, email: true, avatarUrl: true } },
    },
  });

  if (!targetMembership) {
    throw new NotFoundError('Member');
  }

  res.json({
    id: targetMembership.user.id,
    userId: targetMembership.user.id,
    name: targetMembership.user.name,
    surname: targetMembership.user.surname,
    email: targetMembership.user.email,
    avatarUrl: targetMembership.user.avatarUrl,
    role: targetMembership.role,
    createdAt: targetMembership.createdAt.toISOString(),
  });
}));

// POST /api/members/invite - Invite members to project
router.post('/invite', requireAuth, validateBody(batchInviteMembersSchema), asyncHandler(async (req, res) => {
  const user = req.user!;

  const body = getValidatedBody<{ projectId: number; users: Array<{ id: number; role: string }> }>(req);
  if (!body) {
    throw new BadRequestError('Missing or invalid body');
  }
  const { projectId, users } = body;

  if (!projectId || !users || !Array.isArray(users)) {
    throw new BadRequestError('projectId and users array are required');
  }

  // Check membership - only owner/maintainer can invite
  const membership = await prisma.projectUser.findFirst({
    where: { projectId, userId: user.id },
  });

  if (!membership || !['Owner', 'Maintainer'].includes(membership.role)) {
    throw new ForbiddenError('Access denied');
  }

  // Add members
  for (const u of users) {
    await prisma.projectUser.create({
      data: {
        projectId,
        userId: u.id,
        role: u.role,
      },
    });
  }

  res.status(200).json({});
}));

// PATCH /api/members/:id - Update member role
router.patch('/:id', requireAuth, validateParams(memberIdParamSchema), validateBody(updateMemberRoleSchema), asyncHandler(async (req, res) => {
  const user = req.user!;

  const params = getValidatedParams<{ id: number }>(req);
  if (!params) {
    throw new BadRequestError('Missing or invalid parameters');
  }
  const memberId = params.id;
  const body = getValidatedBody<{ role: string; projectId: number }>(req);
  if (!body) {
    throw new BadRequestError('Missing or invalid body');
  }
  const { role: newRole, projectId } = body;

  if (!newRole || !projectId) {
    throw new BadRequestError('role and projectId are required');
  }

  // Check if current user is owner
  const currentMembership = await prisma.projectUser.findFirst({
    where: { projectId, userId: user.id },
  });

  if (!currentMembership || currentMembership.role !== 'Owner') {
    throw new ForbiddenError('Only owner can update member roles');
  }

  // Get the target member by projectId and memberId (userId)
  const targetMembership = await prisma.projectUser.findFirst({
    where: { 
      projectId, 
      userId: memberId 
    },
  });

  if (!targetMembership) {
    throw new NotFoundError('Member');
  }

  // Prevent changing owner role
  if (targetMembership.role === 'Owner' && newRole !== 'Owner') {
    throw new BadRequestError('Cannot change owner role');
  }

  // Update member role
  const updatedMember = await prisma.projectUser.update({
    where: { id: targetMembership.id },
    data: { role: newRole },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          surname: true,
          avatarUrl: true,
        },
      },
    },
  });

  res.json({
    id: updatedMember.id,
    userId: updatedMember.userId,
    email: updatedMember.user.email,
    name: `${updatedMember.user.name} ${updatedMember.user.surname || ''}`.trim(),
    avatarUrl: updatedMember.user.avatarUrl,
    role: updatedMember.role,
    createdAt: updatedMember.createdAt.toISOString(),
  });
}));

// DELETE /api/members/:id - Remove member
router.delete('/:id', requireAuth, validateParams(memberIdParamSchema), asyncHandler(async (req, res) => {
  const user = req.user!;

  const params = getValidatedParams<{ id: number }>(req);
  if (!params) {
    throw new BadRequestError('Missing or invalid parameters');
  }
  const memberId = params.id;

  // Get projectId from query
  const projectId = parseInt(req.query.projectId as string);
  if (!projectId) {
    throw new BadRequestError('projectId query parameter is required');
  }

  // Get member to find projectUser record
  const member = await prisma.projectUser.findFirst({
    where: { 
      userId: memberId,
      projectId: projectId,
    },
    include: { user: true },
  });

  if (!member) {
    throw new NotFoundError('Member');
  }

  // Check membership and permissions
  const userMembership = await prisma.projectUser.findFirst({
    where: {
      projectId: projectId,
      userId: user.id,
    },
  });

  // Can only remove if: user is owner, or user is removing themselves
  const isRemovingSelf = member.userId === user.id;
  if (!userMembership || (userMembership.role !== 'Owner' && !isRemovingSelf)) {
    throw new ForbiddenError('Access denied');
  }

  // Prevent removing owner
  if (member.role === 'Owner') {
    throw new ForbiddenError('Cannot remove project owner');
  }

  // Remove member
  await prisma.projectUser.delete({
    where: { id: member.id },
  });

  // Return removed member info
  res.json({
    id: member.user.id,
    userId: member.user.id,
    name: member.user.name,
    surname: member.user.surname,
    email: member.user.email,
    avatarUrl: member.user.avatarUrl,
    role: member.role,
  });
}));

export default router;