/**
 * Authentication Routes — Organization Login & JWT Issuance
 *
 * Issues signed JWTs carrying `{ sub, name, email, role, managerId, projectIds }`
 * for role-based CRM hierarchy enforcement and authenticated CRDT/API access.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { OrgRole } from '../auth/jwt.js';

export interface OrgDirectoryUser {
  id: string;
  name: string;
  email: string;
  role: OrgRole;
  title: string;
  department: string;
  managerId: string | null;
  color: string;
}

export const DEFAULT_PROJECT_UUID = '11111111-1111-4111-8111-111111111111';
export const DEFAULT_PROJECT_SLUG = 'proj-alpha-multiplayer';

export const ORG_DIRECTORY: OrgDirectoryUser[] = [
  {
    id: 'user_victoria',
    name: 'Victoria Vance',
    email: 'victoria@minge.ai',
    role: 'admin',
    title: 'VP of AI Engineering',
    department: 'Executive',
    managerId: null,
    color: '#000000',
  },
  {
    id: 'user_alice',
    name: 'Alice Chen',
    email: 'alice@minge.ai',
    role: 'manager',
    title: 'Engineering Manager',
    department: 'Prompt Systems',
    managerId: 'user_victoria',
    color: '#EB1000',
  },
  {
    id: 'user_marcus',
    name: 'Marcus Reid',
    email: 'marcus@minge.ai',
    role: 'manager',
    title: 'Canvas Operations Manager',
    department: 'AI Canvas',
    managerId: 'user_victoria',
    color: '#1A1A1A',
  },
  {
    id: 'user_bob',
    name: 'Bob Patel',
    email: 'bob@minge.ai',
    role: 'employee',
    title: 'Senior Prompt Engineer',
    department: 'Prompt Systems',
    managerId: 'user_alice',
    color: '#4D4D4D',
  },
  {
    id: 'user_carol',
    name: 'Carol Lin',
    email: 'carol@minge.ai',
    role: 'employee',
    title: 'AI Canvas Specialist',
    department: 'Prompt Systems',
    managerId: 'user_alice',
    color: '#666666',
  },
  {
    id: 'user_dana',
    name: 'Dana Kim',
    email: 'dana@minge.ai',
    role: 'employee',
    title: 'Evaluation Analyst',
    department: 'AI Canvas',
    managerId: 'user_marcus',
    color: '#333333',
  },
];

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4).optional(),
  name: z.string().min(1).max(150).optional(),
  role: z.enum(['admin', 'manager', 'employee']).optional(),
  projectId: z.string().min(1).optional(),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Public directory of organization demo roles for Login Page quick-sign-in
  app.get('/api/auth/directory', async (_request, reply) => {
    return reply.send({ data: ORG_DIRECTORY });
  });

  // Authenticate and issue a signed JWT with organizational role claims
  app.post('/api/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const normalizedEmail = body.email.trim().toLowerCase();

    const matched = ORG_DIRECTORY.find((u) => u.email.toLowerCase() === normalizedEmail);
    const targetProject = body.projectId?.trim() || DEFAULT_PROJECT_SLUG;
    const projectIds = Array.from(
      new Set([targetProject, DEFAULT_PROJECT_SLUG, DEFAULT_PROJECT_UUID])
    );

    const user: OrgDirectoryUser = matched ?? {
      id: `user_${normalizedEmail.split('@')[0].replace(/[^a-z0-9]/g, '_')}`,
      name:
        body.name?.trim() ||
        normalizedEmail
          .split('@')[0]
          .replace(/[._-]+/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase()),
      email: normalizedEmail,
      role: body.role ?? 'employee',
      title:
        body.role === 'admin'
          ? 'Workspace Admin'
          : body.role === 'manager'
          ? 'Team Manager'
          : 'Contributor',
      department: 'Engineering',
      managerId: body.role === 'admin' ? null : body.role === 'manager' ? 'user_victoria' : 'user_alice',
      color: body.role === 'manager' ? '#EB1000' : body.role === 'admin' ? '#000000' : '#4D4D4D',
    };

    const token = app.jwt.sign({
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      managerId: user.managerId,
      projectIds,
    });

    return reply.send({
      data: {
        token,
        user,
        projectId: targetProject,
      },
    });
  });

  // Verify current session token
  app.get('/api/auth/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    return reply.send({ data: request.user });
  });
}
