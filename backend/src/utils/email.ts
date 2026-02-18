// =====================================================
// utils/email.ts
// Email service for team invitations and notifications
// =====================================================
import { env } from '../env';

interface EmailConfig {
  from: string;
  fromName: string;
  replyTo?: string;
}

const EMAIL_CONFIG: EmailConfig = {
  from: env.EMAIL_FROM || 'noreply@codesentinel.com',
  fromName: 'CodeSentinel',
  replyTo: env.EMAIL_REPLY_TO || 'support@codesentinel.com',
};

/**
 * Send workspace invitation email
 * 
 * @param email - Recipient email address
 * @param token - Unique invitation token
 * @param workspaceId - Workspace ID for context
 * @param workspaceName - Workspace name for email content
 * @param inviterName - Name of the person who sent the invite
 * @param role - Role being assigned to the invitee
 */
export async function sendWorkspaceInvitationEmail(
  email: string,
  token: string,
  workspaceId: string,
  workspaceName: string,
  inviterName?: string,
  role?: string
): Promise<void> {
  const inviteUrl = `${env.NEXT_PUBLIC_FRONTEND_URL}/accept-invite?token=${token}`;
  
  // Log invitation details in development mode
  if (env.NODE_ENV === 'development') {
    console.log('\n==============================================');
    console.log('📧 WORKSPACE INVITATION EMAIL');
    console.log('==============================================');
    console.log(`To: ${email}`);
    console.log(`Workspace: ${workspaceName} (${workspaceId})`);
    console.log(`Invited by: ${inviterName || 'Unknown'}`);
    console.log(`Role: ${role || 'member'}`);
    console.log(`Invitation Link: ${inviteUrl}`);
    console.log(`Token: ${token}`);
    console.log('==============================================');
    console.log('📤 Attempting to send email...');
  }

  // Send email in both development and production
  try {
    await sendEmail({
      to: email,
      subject: `You've been invited to join ${workspaceName} on CodeSentinel`,
      html: getWorkspaceInvitationEmailHTML(inviteUrl, email, workspaceName, inviterName, role),
      text: getWorkspaceInvitationEmailText(inviteUrl, workspaceName, inviterName, role),
    });

    if (env.NODE_ENV === 'development') {
      console.log('✅ Email sent successfully!');
      console.log('==============================================\n');
    }
  } catch (error) {
    console.error('❌ Failed to send invitation email:', error);
    if (env.NODE_ENV === 'development') {
      console.log('==============================================\n');
    }
    throw error; // Re-throw to let caller handle
  }
}

/**
 * Send team invitation email (DEPRECATED - use sendWorkspaceInvitationEmail)
 * 
 * @param email - Recipient email address
 * @param token - Unique invitation token
 * @param teamId - Team ID for context
 */
export async function sendTeamInvitationEmail(
  email: string,
  token: string,
  teamId: string
): Promise<void> {
  const inviteUrl = `${env.NEXT_PUBLIC_FRONTEND_URL}/teams/invite/${token}`;
  
  // For development: Just log the invitation
  if (env.NODE_ENV === 'development') {
    console.log('\n==============================================');
    console.log('📧 TEAM INVITATION EMAIL (DEPRECATED)');
    console.log('==============================================');
    console.log(`To: ${email}`);
    console.log(`Team ID: ${teamId}`);
    console.log(`Invitation Link: ${inviteUrl}`);
    console.log(`Token: ${token}`);
    console.log('==============================================\n');
    return;
  }

  // For production: Send via email service (Resend, SendGrid, etc.)
  await sendEmail({
    to: email,
    subject: `You've been invited to join a team on CodeSentinel`,
    html: getTeamInvitationEmailHTML(inviteUrl, email),
    text: getTeamInvitationEmailText(inviteUrl),
  });
}

/**
 * Send email using configured email service
 * 
 * Tries providers in order:
 * 1. Resend (recommended, if API key provided)
 * 2. SendGrid (fallback, if API key provided)
 */
async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const errors: Array<{ provider: string; error: any }> = [];

  // Try Resend first (recommended provider)
  if (env.RESEND_API_KEY && env.RESEND_API_KEY !== 'your-resend-api-key' && !env.RESEND_API_KEY.startsWith('re_test')) {
    try {
      console.log(`[Email] Attempting to send via Resend to ${params.to}...`);
      await sendViaResend(params);
      console.log(`[Email] ✅ Successfully sent via Resend`);
      return;
    } catch (error) {
      console.warn(`[Email] ⚠️  Resend failed:`, error);
      errors.push({ provider: 'Resend', error });
    }
  }

  // Try SendGrid as fallback
  if (env.SENDGRID_API_KEY && env.SENDGRID_API_KEY !== 'your-sendgrid-api-key' && !env.SENDGRID_API_KEY.startsWith('SG.test')) {
    try {
      console.log(`[Email] Attempting to send via SendGrid to ${params.to}...`);
      await sendViaSendGrid(params);
      console.log(`[Email] ✅ Successfully sent via SendGrid`);
      return;
    } catch (error) {
      console.warn(`[Email] ⚠️  SendGrid failed:`, error);
      errors.push({ provider: 'SendGrid', error });
    }
  }

  // No valid providers configured or all failed
  if (errors.length === 0) {
    const errorMsg = 'No email service configured. Please set RESEND_API_KEY or SENDGRID_API_KEY in environment variables.';
    console.error(`❌ ${errorMsg}`);
    console.error('Email details:', {
      to: params.to,
      subject: params.subject,
    });
    throw new Error(errorMsg);
  }

  // All providers failed
  console.error('❌ All email providers failed:', errors);
  console.error('Email details:', {
    to: params.to,
    subject: params.subject,
    providers_tried: errors.map(e => e.provider).join(', ')
  });
  
  throw new Error(
    `Failed to send email after trying ${errors.length} provider(s): ${errors.map(e => e.provider).join(', ')}`
  );
}

/**
 * Send email via Resend
 */
async function sendViaResend(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${EMAIL_CONFIG.fromName} <${EMAIL_CONFIG.from}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      reply_to: EMAIL_CONFIG.replyTo,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error('Resend API error:', error);
    throw new Error(`Failed to send email: ${response.statusText}`);
  }
}

/**
 * Send email via SendGrid
 */
async function sendViaSendGrid(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: params.to }] }],
      from: { 
        email: EMAIL_CONFIG.from, 
        name: EMAIL_CONFIG.fromName 
      },
      reply_to: { email: EMAIL_CONFIG.replyTo },
      subject: params.subject,
      content: [
        { type: 'text/plain', value: params.text },
        { type: 'text/html', value: params.html },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error('SendGrid API error:', error);
    throw new Error(`Failed to send email: ${response.statusText}`);
  }
}

/**
 * Generate HTML email template for workspace invitation
 */
function getWorkspaceInvitationEmailHTML(
  inviteUrl: string, 
  email: string, 
  workspaceName: string,
  inviterName?: string,
  role?: string
): string {
  const roleDisplay = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Member';
  const inviterText = inviterName 
    ? `<strong>${inviterName}</strong> has invited` 
    : 'You have been invited to';
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Workspace Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <!-- Email Container -->
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; border-bottom: 1px solid #e5e7eb;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #111827;">
                🛡️ CodeSentinel
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; font-size: 20px; font-weight: 600; color: #111827;">
                You've been invited to join ${workspaceName}
              </h2>
              
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 24px; color: #6b7280;">
                ${inviterText} <strong style="color: #111827;">${email}</strong> to collaborate on the <strong>${workspaceName}</strong> workspace on CodeSentinel as a <strong>${roleDisplay}</strong>.
              </p>

              <p style="margin: 0 0 30px; font-size: 16px; line-height: 24px; color: #6b7280;">
                Click the button below to accept the invitation and join the workspace. This link will expire in 7 days.
              </p>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 0;">
                    <a href="${inviteUrl}" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; background-color: #2563eb; text-decoration: none; border-radius: 6px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0; font-size: 14px; line-height: 20px; color: #9ca3af;">
                Or copy and paste this URL into your browser:<br>
                <a href="${inviteUrl}" style="color: #2563eb; text-decoration: none; word-break: break-all;">
                  ${inviteUrl}
                </a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0 0 10px; font-size: 14px; color: #9ca3af;">
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
              <p style="margin: 0; font-size: 14px; color: #9ca3af;">
                © ${new Date().getFullYear()} CodeSentinel. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text email for workspace invitation
 */
function getWorkspaceInvitationEmailText(
  inviteUrl: string, 
  workspaceName: string,
  inviterName?: string,
  role?: string
): string {
  const roleDisplay = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Member';
  const inviterText = inviterName 
    ? `${inviterName} has invited you` 
    : 'You have been invited';
  
  return `
You've been invited to join ${workspaceName} on CodeSentinel

${inviterText} to collaborate on the ${workspaceName} workspace on CodeSentinel as a ${roleDisplay}.

To accept the invitation, visit this link:
${inviteUrl}

This link will expire in 7 days.

If you didn't expect this invitation, you can safely ignore this email.

---
© ${new Date().getFullYear()} CodeSentinel. All rights reserved.
  `.trim();
}

/**
 * Generate HTML email template for team invitation
 */
function getTeamInvitationEmailHTML(inviteUrl: string, email: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Team Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <!-- Email Container -->
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; border-bottom: 1px solid #e5e7eb;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #111827;">
                🛡️ CodeSentinel
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; font-size: 20px; font-weight: 600; color: #111827;">
                You've been invited to join a team
              </h2>
              
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 24px; color: #6b7280;">
                Someone has invited <strong style="color: #111827;">${email}</strong> to collaborate on CodeSentinel.
              </p>

              <p style="margin: 0 0 30px; font-size: 16px; line-height: 24px; color: #6b7280;">
                Click the button below to accept the invitation and join the team. This link will expire in 7 days.
              </p>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 0;">
                    <a href="${inviteUrl}" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; background-color: #2563eb; text-decoration: none; border-radius: 6px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0; font-size: 14px; line-height: 20px; color: #9ca3af;">
                Or copy and paste this URL into your browser:<br>
                <a href="${inviteUrl}" style="color: #2563eb; text-decoration: none; word-break: break-all;">
                  ${inviteUrl}
                </a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0 0 10px; font-size: 14px; color: #9ca3af;">
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
              <p style="margin: 0; font-size: 14px; color: #9ca3af;">
                © ${new Date().getFullYear()} CodeSentinel. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text email for team invitation
 */
function getTeamInvitationEmailText(inviteUrl: string): string {
  return `
You've been invited to join a team on CodeSentinel

Someone has invited you to collaborate on CodeSentinel, a security scanning platform for developers.

To accept the invitation, visit this link:
${inviteUrl}

This link will expire in 7 days.

If you didn't expect this invitation, you can safely ignore this email.

---
© ${new Date().getFullYear()} CodeSentinel. All rights reserved.
  `.trim();
}

// =====================================================
// Additional Team Email Templates
// =====================================================

/**
 * Send email when a member is removed from team
 */
export async function sendMemberRemovedEmail(
  email: string,
  teamName: string,
  removedBy: string
): Promise<void> {
  if (env.NODE_ENV === 'development') {
    console.log('\n==============================================');
    console.log('📧 MEMBER REMOVED EMAIL');
    console.log('==============================================');
    console.log(`To: ${email}`);
    console.log(`Team: ${teamName}`);
    console.log(`Removed by: ${removedBy}`);
    console.log('==============================================\n');
    return;
  }

  await sendEmail({
    to: email,
    subject: `You've been removed from ${teamName} on CodeSentinel`,
    html: getMemberRemovedEmailHTML(teamName, removedBy),
    text: getMemberRemovedEmailText(teamName, removedBy),
  });
}

function getMemberRemovedEmailHTML(teamName: string, removedBy: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px;">
    <tr>
      <td style="padding: 40px;">
        <h2 style="margin: 0 0 20px; font-size: 20px; color: #111827;">
          Team Access Removed
        </h2>
        <p style="margin: 0 0 20px; font-size: 16px; line-height: 24px; color: #6b7280;">
          You have been removed from the <strong>${teamName}</strong> team on CodeSentinel by ${removedBy}.
        </p>
        <p style="margin: 0; font-size: 16px; line-height: 24px; color: #6b7280;">
          You no longer have access to this team's repositories and scans. If you believe this was done in error, please contact your team administrator.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function getMemberRemovedEmailText(teamName: string, removedBy: string): string {
  return `
Team Access Removed

You have been removed from the ${teamName} team on CodeSentinel by ${removedBy}.

You no longer have access to this team's repositories and scans. If you believe this was done in error, please contact your team administrator.

---
© ${new Date().getFullYear()} CodeSentinel. All rights reserved.
  `.trim();
}

/**
 * Send email when member role is changed
 */
export async function sendRoleChangedEmail(
  email: string,
  teamName: string,
  oldRole: string,
  newRole: string
): Promise<void> {
  if (env.NODE_ENV === 'development') {
    console.log('\n==============================================');
    console.log('📧 ROLE CHANGED EMAIL');
    console.log('==============================================');
    console.log(`To: ${email}`);
    console.log(`Team: ${teamName}`);
    console.log(`Role: ${oldRole} → ${newRole}`);
    console.log('==============================================\n');
    return;
  }

  await sendEmail({
    to: email,
    subject: `Your role has been updated in ${teamName}`,
    html: getRoleChangedEmailHTML(teamName, oldRole, newRole),
    text: getRoleChangedEmailText(teamName, oldRole, newRole),
  });
}

function getRoleChangedEmailHTML(teamName: string, oldRole: string, newRole: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px;">
    <tr>
      <td style="padding: 40px;">
        <h2 style="margin: 0 0 20px; font-size: 20px; color: #111827;">
          Role Updated
        </h2>
        <p style="margin: 0 0 20px; font-size: 16px; line-height: 24px; color: #6b7280;">
          Your role in the <strong>${teamName}</strong> team has been changed from <strong>${oldRole}</strong> to <strong>${newRole}</strong>.
        </p>
        <p style="margin: 0; font-size: 16px; line-height: 24px; color: #6b7280;">
          Your new permissions are now active. Visit your team dashboard to see what you can do.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function getRoleChangedEmailText(teamName: string, oldRole: string, newRole: string): string {
  return `
Role Updated

Your role in the ${teamName} team has been changed from ${oldRole} to ${newRole}.

Your new permissions are now active. Visit your team dashboard to see what you can do.

---
© ${new Date().getFullYear()} CodeSentinel. All rights reserved.
  `.trim();
}