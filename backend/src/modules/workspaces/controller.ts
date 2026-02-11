// =====================================================
// modules/workspaces/controller.ts
// Workspace controllers
// =====================================================
import type { FastifyRequest, FastifyReply } from 'fastify';
import { WorkspaceService } from './service';
import type { WorkspaceRole } from './types';

interface CreateWorkspaceBody {
  name: string;
  type: 'personal' | 'team';
  plan?: string;
}

interface UpdateWorkspaceBody {
  name?: string;
  settings?: Record<string, any>;
}

interface InviteMemberBody {
  email: string;
  role: WorkspaceRole;
}

interface UpdateMemberRoleBody {
  role: WorkspaceRole;
}

interface AcceptInvitationParams {
  token: string;
}

export class WorkspaceController {
  constructor(private service: WorkspaceService) {}

  async listWorkspaces(req: FastifyRequest, reply: FastifyReply) {
    const userId = req.user!.id;
    const workspaces = await this.service.getUserWorkspaces(userId);
    return reply.send(workspaces);
  }

  async getWorkspace(req: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) {
    const { workspaceId } = req.params;
    const userId = req.user!.id;
    const workspace = await this.service.getWorkspaceWithRole(workspaceId, userId);
    return reply.send(workspace);
  }

  async createWorkspace(
    req: FastifyRequest<{ Body: CreateWorkspaceBody }>,
    reply: FastifyReply
  ) {
    const userId = req.user!.id;
    const workspace = await this.service.createWorkspace(userId, req.body);
    return reply.status(201).send(workspace);
  }

  async updateWorkspace(
    req: FastifyRequest<{
      Params: { workspaceId: string };
      Body: UpdateWorkspaceBody;
    }>,
    reply: FastifyReply
  ) {
    const { workspaceId } = req.params;
    const userId = req.user!.id;
    const workspace = await this.service.updateWorkspace(
      workspaceId,
      userId,
      req.body
    );
    return reply.send(workspace);
  }

  async deleteWorkspace(
    req: FastifyRequest<{ Params: { workspaceId: string } }>,
    reply: FastifyReply
  ) {
    const { workspaceId } = req.params;
    const userId = req.user!.id;
    await this.service.deleteWorkspace(workspaceId, userId);
    return reply.status(204).send();
  }

  async getMembers(
    req: FastifyRequest<{ Params: { workspaceId: string } }>,
    reply: FastifyReply
  ) {
    const { workspaceId } = req.params;
    const members = await this.service.getMembers(workspaceId);
    return reply.send(members);
  }

  async inviteMember(
    req: FastifyRequest<{
      Params: { workspaceId: string };
      Body: InviteMemberBody;
    }>,
    reply: FastifyReply
  ) {
    const { workspaceId } = req.params;
    const { email, role } = req.body;
    const userId = req.user!.id;
    const invitation = await this.service.inviteMember(
      workspaceId,
      email,
      role,
      userId
    );
    return reply.status(201).send(invitation);
  }

  async acceptInvitation(
    req: FastifyRequest<{ Params: AcceptInvitationParams }>,
    reply: FastifyReply
  ) {
    const { token } = req.params;
    const userId = req.user!.id;
    const result = await this.service.acceptInvitation(token, userId);
    return reply.send(result);
  }

  async removeMember(
    req: FastifyRequest<{
      Params: { workspaceId: string; memberId: string };
    }>,
    reply: FastifyReply
  ) {
    const { workspaceId, memberId } = req.params;
    const userId = req.user!.id;
    await this.service.removeMember(workspaceId, memberId, userId);
    return reply.status(204).send();
  }

  async updateMemberRole(
    req: FastifyRequest<{
      Params: { workspaceId: string; memberId: string };
      Body: UpdateMemberRoleBody;
    }>,
    reply: FastifyReply
  ) {
    const { workspaceId, memberId } = req.params;
    const { role } = req.body;
    const userId = req.user!.id;
    const member = await this.service.updateMemberRole(
      workspaceId,
      memberId,
      role,
      userId
    );
    return reply.send(member);
  }

  async getActivity(
    req: FastifyRequest<{
      Params: { workspaceId: string };
      Querystring: { limit?: string; offset?: string };
    }>,
    reply: FastifyReply
  ) {
    const { workspaceId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset) : undefined;
    const activity = await this.service.getActivity(workspaceId, {
      limit,
      offset,
    });
    return reply.send(activity);
  }

  async getInvitations(
    req: FastifyRequest<{ Params: { workspaceId: string } }>,
    reply: FastifyReply
  ) {
    const { workspaceId } = req.params;
    const invitations = await this.service.getInvitations(workspaceId);
    return reply.send(invitations);
  }

  async cancelInvitation(
    req: FastifyRequest<{
      Params: { workspaceId: string; invitationId: string };
    }>,
    reply: FastifyReply
  ) {
    const { workspaceId, invitationId } = req.params;
    const userId = req.user!.id;
    await this.service.cancelInvitation(workspaceId, invitationId, userId);
    return reply.status(204).send();
  }
}
