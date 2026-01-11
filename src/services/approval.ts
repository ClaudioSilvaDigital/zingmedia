import { v4 as uuidv4 } from 'uuid';
import {
  Approval,
  ApprovalResponse,
  TenantContext,
  ValidationResult,
  ValidationError
} from '../types/index.js';
import { DatabasePool, DatabaseClient } from '../interfaces/database.js';

export class ApprovalService {
  private db: DatabasePool;

  constructor(db: DatabasePool) {
    this.db = db;
  }

  async requestApproval(
    workflowId: string,
    approvers: string[],
    tenantContext: TenantContext,
    requiredApprovals: number = 1
  ): Promise<Approval> {
    const approvalId = uuidv4();
    const now = new Date();

    const client = this.db.connect ? await this.db.connect() : this.db as any;
    try {
      if (client.query !== this.db.query) {
        // Only use transactions if we have a separate client
        await client.query('BEGIN');
      }

      // Verify workflow exists and belongs to tenant
      const workflowResult = await client.query(`
        SELECT id FROM workflows 
        WHERE id = ? AND tenant_id = ?
      `, [workflowId, tenantContext.tenantId]);

      if (workflowResult.rows.length === 0) {
        throw new Error('Workflow not found');
      }

      // Validate approvers exist and belong to tenant
      if (approvers.length === 0) {
        throw new Error('At least one approver must be specified');
      }

      // For SQLite, we need to check each approver individually
      for (const approverId of approvers) {
        const approverResult = await client.query(`
          SELECT id FROM users 
          WHERE id = ? AND tenant_id = ?
        `, [approverId, tenantContext.tenantId]);

        if (approverResult.rows.length === 0) {
          throw new Error(`Approver ${approverId} not found or does not belong to tenant`);
        }
      }

      // Validate required approvals count
      if (requiredApprovals < 1 || requiredApprovals > approvers.length) {
        throw new Error('Required approvals must be between 1 and the number of approvers');
      }

      // Create approval request
      await client.query(`
        INSERT INTO approvals (id, workflow_id, requested_by, approvers, required_approvals, status, requested_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [approvalId, workflowId, tenantContext.user.id, JSON.stringify(approvers), requiredApprovals, 'pending', now.toISOString()]);

      if (client.query !== this.db.query) {
        await client.query('COMMIT');
      }

      return {
        id: approvalId,
        workflowId,
        requestedBy: tenantContext.user.id,
        approvers,
        requiredApprovals,
        receivedApprovals: [],
        status: 'pending',
        requestedAt: now
      };
    } catch (error) {
      if (client.query !== this.db.query) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      if (client.release) {
        client.release();
      }
    }
  }

  async respondToApproval(
    approvalId: string,
    decision: 'approved' | 'rejected',
    tenantContext: TenantContext,
    comment?: string
  ): Promise<ApprovalResponse> {
    const responseId = uuidv4();
    const now = new Date();

    const client = this.db.connect ? await this.db.connect() : this.db as any;
    try {
      if (client.query !== this.db.query) {
        await client.query('BEGIN');
      }

      // Get approval details and verify user is an approver
      const approvalResult = await client.query(`
        SELECT a.id, a.workflow_id, a.approvers, a.required_approvals, a.status,
               w.tenant_id
        FROM approvals a
        JOIN workflows w ON a.workflow_id = w.id
        WHERE a.id = ? AND w.tenant_id = ?
      `, [approvalId, tenantContext.tenantId]);

      if (approvalResult.rows.length === 0) {
        throw new Error('Approval not found');
      }

      const approval = approvalResult.rows[0];
      const approvers = JSON.parse(approval.approvers);

      if (!approvers.includes(tenantContext.user.id)) {
        throw new Error('User is not authorized to respond to this approval');
      }

      if (approval.status !== 'pending') {
        throw new Error('Approval is no longer pending');
      }

      // Check if user has already responded
      const existingResponse = await client.query(`
        SELECT id FROM approval_responses 
        WHERE approval_id = ? AND user_id = ?
      `, [approvalId, tenantContext.user.id]);

      if (existingResponse.rows.length > 0) {
        throw new Error('User has already responded to this approval');
      }

      // Create approval response
      await client.query(`
        INSERT INTO approval_responses (id, approval_id, user_id, decision, comment, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [responseId, approvalId, tenantContext.user.id, decision, comment, now.toISOString()]);

      // Check if approval is now complete
      const responseCount = await client.query(`
        SELECT COUNT(*) as approved_count
        FROM approval_responses
        WHERE approval_id = ? AND decision = 'approved'
      `, [approvalId]);

      const approvedCount = parseInt(responseCount.rows[0].approved_count);
      const rejectedCount = await client.query(`
        SELECT COUNT(*) as rejected_count
        FROM approval_responses
        WHERE approval_id = ? AND decision = 'rejected'
      `, [approvalId]);

      const rejectedCountValue = parseInt(rejectedCount.rows[0].rejected_count);

      // Update approval status if complete
      let newStatus = 'pending';
      let completedAt: Date | null = null;

      if (approvedCount >= approval.required_approvals) {
        newStatus = 'approved';
        completedAt = now;
      } else if (rejectedCountValue > 0) {
        // Any rejection immediately rejects the approval
        newStatus = 'rejected';
        completedAt = now;
      }

      if (newStatus !== 'pending') {
        await client.query(`
          UPDATE approvals 
          SET status = ?, completed_at = ? 
          WHERE id = ?
        `, [newStatus, completedAt?.toISOString(), approvalId]);
      }

      if (client.query !== this.db.query) {
        await client.query('COMMIT');
      }

      return {
        id: responseId,
        approvalId,
        userId: tenantContext.user.id,
        decision,
        comment: comment || '',
        createdAt: now
      };
    } catch (error) {
      if (client.query !== this.db.query) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      if (client.release) {
        client.release();
      }
    }
  }

  async getApproval(approvalId: string, tenantContext: TenantContext): Promise<Approval | null> {
    const result = await this.db.query(`
      SELECT a.id, a.workflow_id, a.requested_by, a.approvers, a.required_approvals, 
             a.status, a.requested_at, a.completed_at,
             ar.id as response_id, ar.user_id as response_user_id, ar.decision, 
             ar.comment as response_comment, ar.created_at as response_created_at
      FROM approvals a
      JOIN workflows w ON a.workflow_id = w.id
      LEFT JOIN approval_responses ar ON a.id = ar.approval_id
      WHERE a.id = $1 AND w.tenant_id = $2
      ORDER BY ar.created_at ASC
    `, [approvalId, tenantContext.tenantId]);

    if (result.rows.length === 0) {
      return null;
    }

    const firstRow = result.rows[0];
    const responses: ApprovalResponse[] = [];

    for (const row of result.rows) {
      if (row.response_id) {
        responses.push({
          id: row.response_id,
          approvalId: row.id,
          userId: row.response_user_id,
          decision: row.decision,
          comment: row.response_comment,
          createdAt: row.response_created_at
        });
      }
    }

    return {
      id: firstRow.id,
      workflowId: firstRow.workflow_id,
      requestedBy: firstRow.requested_by,
      approvers: JSON.parse(firstRow.approvers),
      requiredApprovals: firstRow.required_approvals,
      receivedApprovals: responses,
      status: firstRow.status,
      requestedAt: firstRow.requested_at,
      completedAt: firstRow.completed_at
    };
  }

  async getWorkflowApprovals(workflowId: string, tenantContext: TenantContext): Promise<Approval[]> {
    const result = await this.db.query(`
      SELECT a.id, a.workflow_id, a.requested_by, a.approvers, a.required_approvals, 
             a.status, a.requested_at, a.completed_at,
             ar.id as response_id, ar.user_id as response_user_id, ar.decision, 
             ar.comment as response_comment, ar.created_at as response_created_at
      FROM approvals a
      JOIN workflows w ON a.workflow_id = w.id
      LEFT JOIN approval_responses ar ON a.id = ar.approval_id
      WHERE a.workflow_id = $1 AND w.tenant_id = $2
      ORDER BY a.requested_at ASC, ar.created_at ASC
    `, [workflowId, tenantContext.tenantId]);

    // Group responses by approval
    const approvalsMap = new Map<string, Approval>();

    for (const row of result.rows) {
      if (!approvalsMap.has(row.id)) {
        approvalsMap.set(row.id, {
          id: row.id,
          workflowId: row.workflow_id,
          requestedBy: row.requested_by,
          approvers: JSON.parse(row.approvers),
          requiredApprovals: row.required_approvals,
          receivedApprovals: [],
          status: row.status,
          requestedAt: row.requested_at,
          completedAt: row.completed_at
        });
      }

      if (row.response_id) {
        approvalsMap.get(row.id)!.receivedApprovals.push({
          id: row.response_id,
          approvalId: row.id,
          userId: row.response_user_id,
          decision: row.decision,
          comment: row.response_comment,
          createdAt: row.response_created_at
        });
      }
    }

    return Array.from(approvalsMap.values());
  }

  async validateApprovalRequirement(workflowId: string, tenantContext: TenantContext): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    const result = await this.db.query(`
      SELECT COUNT(*) as approved_count
      FROM approvals a
      JOIN approval_responses ar ON a.id = ar.approval_id
      JOIN workflows w ON a.workflow_id = w.id
      WHERE a.workflow_id = $1 
        AND w.tenant_id = $2
        AND a.status = 'approved'
        AND ar.decision = 'approved'
    `, [workflowId, tenantContext.tenantId]);

    const approvedCount = parseInt(result.rows[0].approved_count);

    if (approvedCount === 0) {
      errors.push({
        field: 'approval',
        message: 'At least one approval is required before publishing',
        code: 'APPROVAL_REQUIRED'
      });
    }

    return { isValid: errors.length === 0, errors };
  }

  async getPendingApprovals(userId: string, tenantContext: TenantContext): Promise<Approval[]> {
    const result = await this.db.query(`
      SELECT a.id, a.workflow_id, a.requested_by, a.approvers, a.required_approvals, 
             a.status, a.requested_at, a.completed_at,
             c.title as content_title, c.description as content_description
      FROM approvals a
      JOIN workflows w ON a.workflow_id = w.id
      JOIN content c ON w.content_id = c.id
      WHERE w.tenant_id = $1 
        AND a.status = 'pending'
        AND a.approvers::jsonb ? $2
        AND NOT EXISTS (
          SELECT 1 FROM approval_responses ar 
          WHERE ar.approval_id = a.id AND ar.user_id = $2
        )
      ORDER BY a.requested_at ASC
    `, [tenantContext.tenantId, userId]);

    return result.rows.map(row => ({
      id: row.id,
      workflowId: row.workflow_id,
      requestedBy: row.requested_by,
      approvers: JSON.parse(row.approvers),
      requiredApprovals: row.required_approvals,
      receivedApprovals: [],
      status: row.status,
      requestedAt: row.requested_at,
      completedAt: row.completed_at,
      // Additional context for pending approvals
      contentTitle: row.content_title,
      contentDescription: row.content_description
    }));
  }

  async createApprovalAuditLog(
    approvalId: string,
    action: string,
    tenantContext: TenantContext,
    details?: Record<string, any>
  ): Promise<void> {
    await this.db.query(`
      INSERT INTO audit_logs (id, tenant_id, user_id, action, resource, resource_id, details, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      uuidv4(),
      tenantContext.tenantId,
      tenantContext.user.id,
      action,
      'approval',
      approvalId,
      JSON.stringify(details || {}),
      new Date()
    ]);
  }
}