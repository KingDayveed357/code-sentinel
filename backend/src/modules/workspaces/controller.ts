// =====================================================
// modules/workspaces/controller.ts
// Workspace controllers
// =====================================================
import type { FastifyRequest, FastifyReply } from 'fastify';
import { WorkspaceService } from './service';
import { BillingService } from '../billing/service';
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
  private billingService: BillingService;

  constructor(private service: WorkspaceService) {
    this.billingService = new BillingService(service.fastify);
  }

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
    const { name, type, plan } = req.body;

    // Check for existing pending workspace if creating a team workspace
    if (type === 'team') {
      const pendingWorkspace = await this.service.hasPendingWorkspace(userId);
      if (pendingWorkspace) {
        // Return existing pending workspace with checkout URL (re-create session or return instructions)
        // For simplicity, we block creation and ask user to complete previous one or wait for cleanup.
        // Or we could redirect them to the existing one.
        // Requirement: "Only allow ONE pending workspace per user."
        throw req.server.httpErrors.conflict('You already have a pending team workspace. Please complete the setup or wait for it to expire.');
      }
    }

    const workspace = await this.service.createWorkspace(userId, req.body);

    if (type === 'team') {
      // Step 2: Call PaymentProvider.createCheckoutSession
      try {
        // We need user email for checkout
        const { email } = req.user! as any; // Assuming user object has email
        const checkoutSession = await this.billingService.createCheckoutSession(workspace.id, email);
        
        // Step 4: User redirected to onboarding (instruction says "User redirected to onboarding" after success)
        // Using "Step 2: System calls PaymentProvider.createCheckoutSession(workspaceId)"
        // "Step 3: On success: Provider activates workspace" - this likely happens via webhook or immediate in dev.
        // The controller should return the checkout URL so frontend can redirect.
        
        return reply.status(201).send({
          workspace,
          checkoutUrl: checkoutSession.url,
          action: 'redirect_to_checkout'
        });
      } catch (error) {
        req.log.error({ error, workspaceId: workspace.id }, 'Failed to create checkout session');
        // Delete the pending workspace if checkout creation fails to avoid ghost pending state? 
        // Or just leave it for cleanup job. Leave it for cleanup.
        throw req.server.httpErrors.internalServerError('Failed to initiate billing session');
      }
    }

    return reply.status(201).send({ workspace });
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


  async previewInvitation(
    req: FastifyRequest<{ Params: { token: string } }>,
    reply: FastifyReply
  ) {
    const { token } = req.params;
    const result = await this.service.previewInvitation(token);
    return reply.send(result);
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

  async initiateCheckout(
    req: FastifyRequest<{ Params: { workspaceId: string } }>,
    reply: FastifyReply
  ) {
    const { workspaceId } = req.params;
    const userId = req.user!.id;

    // Verify workspace access and status
    const workspace = await this.service.getWorkspaceWithRole(workspaceId, userId);

    if (workspace.role !== 'owner') {
      throw req.server.httpErrors.forbidden('Only workspace owner can initiate checkout');
    }

    if (workspace.billing_status === 'active') {
      throw req.server.httpErrors.conflict('Workspace is already active');
    }

    // Create checkout session
    try {
      const { email } = req.user! as any;
      const checkoutSession = await this.billingService.createCheckoutSession(workspaceId, email);
      
      return reply.send({
        checkoutUrl: checkoutSession.url,
        action: 'redirect_to_checkout'
      });
    } catch (error) {
       req.log.error({ error, workspaceId }, 'Failed to create checkout session');
       throw req.server.httpErrors.internalServerError('Failed to initiate billing session');
    }
  }
}
