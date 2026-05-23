/**
 * Authentication Integration Tests
 * 
 * Tests the authentication endpoints with real database connections:
 * - POST /api/login - User login
 * - GET /api/session - Session validation
 * - POST /api/logout - User logout
 * - POST /api/register - User registration
 * 
 * Uses existing test data:
 * - User: lukaszpodlipskikontakt@gmail.com / admin1234
 * 
 * All created test data is cleaned up after each test.
 */

import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { testApp } from './setup/test-server.js';
import { testPrisma } from './setup/test-db.js';
import {
  authenticateUser,
  authenticateExistingUser,
  validateSession,
  logoutUser,
  cleanupTestData,
  EXISTING_USER,
  createTestUserData,
} from '../helpers/integration-helpers.js';

describe('Authentication Integration Tests', () => {
  describe('POST /api/login', () => {
    it('should login successfully with existing user credentials', async () => {
      // Arrange
      const { email, password } = EXISTING_USER;

      // Act
      const response = await request(testApp)
        .post('/api/login')
        .send({ email, password });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('email', email);
      expect(response.body.user).toHaveProperty('name');
      expect(typeof response.body.token).toBe('string');
      expect(response.body.token.length).toBeGreaterThan(0);
    });

    it('should return 401 for invalid password', async () => {
      // Arrange
      const { email } = EXISTING_USER;
      const wrongPassword = 'wrongpassword123';

      // Act
      const response = await request(testApp)
        .post('/api/login')
        .send({ email, password: wrongPassword });

      // Assert
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 for non-existent user', async () => {
      // Arrange
      const nonExistentEmail = 'nonexistent@example.com';
      const password = 'somepassword123';

      // Act
      const response = await request(testApp)
        .post('/api/login')
        .send({ email: nonExistentEmail, password });

      // Assert
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 for missing email', async () => {
      // Act
      const response = await request(testApp)
        .post('/api/login')
        .send({ password: 'somepassword123' });

      // Assert
      expect(response.status).toBe(400);
    });

    it('should return 400 for missing password', async () => {
      // Act
      const response = await request(testApp)
        .post('/api/login')
        .send({ email: 'test@example.com' });

      // Assert
      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/session', () => {
    it('should return user data for valid session token', async () => {
      // Arrange
      const { token, user: loginUser } = await authenticateExistingUser();

      // Act
      const response = await request(testApp)
        .get('/api/session')
        .set('Authorization', `Bearer ${token}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id', loginUser.id);
      expect(response.body.user).toHaveProperty('email', loginUser.email);
    });

    it('should return 401 for missing authorization header', async () => {
      // Act
      const response = await request(testApp)
        .get('/api/session');

      // Assert
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 for invalid token', async () => {
      // Act
      const response = await request(testApp)
        .get('/api/session')
        .set('Authorization', 'Bearer invalid-token-12345');

      // Assert
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 after logout', async () => {
      // Arrange
      const { token } = await authenticateExistingUser();
      
      // Logout first
      await logoutUser(token);

      // Act - Try to use the same token after logout
      const response = await request(testApp)
        .get('/api/session')
        .set('Authorization', `Bearer ${token}`);

      // Assert
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/logout', () => {
    it('should logout successfully with valid token', async () => {
      // Arrange
      const { token } = await authenticateExistingUser();

      // Act
      const response = await request(testApp)
        .post('/api/logout')
        .set('Authorization', `Bearer ${token}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should return success even without token', async () => {
      // Act - Logout without token should still succeed
      // (client should clear token regardless)
      const response = await request(testApp)
        .post('/api/logout');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should invalidate session after logout', async () => {
      // Arrange
      const { token } = await authenticateExistingUser();

      // Act - Logout
      await request(testApp)
        .post('/api/logout')
        .set('Authorization', `Bearer ${token}`);

      // Try to validate session
      const sessionResponse = await request(testApp)
        .get('/api/session')
        .set('Authorization', `Bearer ${token}`);

      // Assert
      expect(sessionResponse.status).toBe(401);
    });
  });

  describe('POST /api/register', () => {
    afterEach(async () => {
      // Clean up any users created during tests
      await cleanupTestData();
    });

    it('should register a new user successfully', async () => {
      // Arrange
      const userData = createTestUserData();

      // Act
      const response = await request(testApp)
        .post('/api/register')
        .send(userData);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('email', userData.email);
      expect(response.body.user).toHaveProperty('name', userData.name);
      
      // Verify user was created in database
      const dbUser = await testPrisma.user.findUnique({
        where: { email: userData.email },
      });
      expect(dbUser).not.toBeNull();
      expect(dbUser?.email).toBe(userData.email);
    });

    it('should return 422 for duplicate email', async () => {
      // Arrange - Create first user
      const userData = createTestUserData();
      await request(testApp)
        .post('/api/register')
        .send(userData);

      // Act - Try to register with same email
      const response = await request(testApp)
        .post('/api/register')
        .send(userData);

      // Assert
      expect(response.status).toBe(422);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 for invalid email format', async () => {
      // Arrange
      const userData = {
        ...createTestUserData(),
        email: 'invalid-email',
      };

      // Act
      const response = await request(testApp)
        .post('/api/register')
        .send(userData);

      // Assert
      expect(response.status).toBe(400);
    });

    it('should return 400 for short password', async () => {
      // Arrange
      const userData = {
        ...createTestUserData(),
        password: 'short',
      };

      // Act
      const response = await request(testApp)
        .post('/api/register')
        .send(userData);

      // Assert
      expect(response.status).toBe(400);
    });

    it('should auto-login after registration', async () => {
      // Arrange
      const userData = createTestUserData();

      // Act
      const response = await request(testApp)
        .post('/api/register')
        .send(userData);

      // Assert - Token should work for session validation
      const { token } = response.body;
      const sessionResponse = await request(testApp)
        .get('/api/session')
        .set('Authorization', `Bearer ${token}`);

      expect(sessionResponse.status).toBe(200);
      expect(sessionResponse.body.user.email).toBe(userData.email);
    });
  });

  describe('POST /api/signin (login alias)', () => {
    it('should work as an alias for /api/login', async () => {
      // Arrange
      const { email, password } = EXISTING_USER;

      // Act
      const response = await request(testApp)
        .post('/api/signin')
        .send({ email, password });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
    });
  });

  describe('POST /api/signup (register alias)', () => {
    afterEach(async () => {
      await cleanupTestData();
    });

    it('should work as an alias for /api/register', async () => {
      // Arrange
      const userData = createTestUserData();

      // Act
      const response = await request(testApp)
        .post('/api/signup')
        .send(userData);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(userData.email);
    });
  });

  describe('Authentication Helper Functions', () => {
    it('authenticateUser should return token and user', async () => {
      // Act
      const result = await authenticateUser(EXISTING_USER.email, EXISTING_USER.password);

      // Assert
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('user');
      expect(result.user.email).toBe(EXISTING_USER.email);
    });

    it('authenticateExistingUser should work without parameters', async () => {
      // Act
      const result = await authenticateExistingUser();

      // Assert
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('user');
      expect(result.user.email).toBe(EXISTING_USER.email);
    });

    it('validateSession should return user for valid token', async () => {
      // Arrange
      const { token, user } = await authenticateExistingUser();

      // Act
      const sessionUser = await validateSession(token);

      // Assert
      expect(sessionUser.id).toBe(user.id);
      expect(sessionUser.email).toBe(user.email);
    });

    it('logoutUser should invalidate session', async () => {
      // Arrange
      const { token } = await authenticateExistingUser();

      // Act
      const result = await logoutUser(token);

      // Assert
      expect(result).toBe(true);

      // Verify session is invalidated
      await expect(validateSession(token)).rejects.toThrow();
    });
  });
});
