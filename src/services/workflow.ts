import { v4 as uuidv4 } from 'uuid';
import {
  Workflow,
  WorkflowState,
  WorkflowEvent,
  Comment,
  Approval,
  ApprovalResponse,
  WorkflowTransition,
  ValidationResult,
  ValidationError,
  TenantContext
} from '../types/index.js';
import { ApprovalService } from './approval.js';
import { DatabasePool, DatabaseClient } from '../interfaces/database.js';

export class WorkflowEngine {
  private db: DatabasePool;
  private transitions: Map<string, WorkflowTransition[]>;
  private approvalService: ApprovalService;

  constructor(db: DatabasePool) {
    this.db = db;
    this.transitions = new Map();
    this.approvalService = new ApprovalService(db);
    this.initializeTransitions();
  }

  private initializeTransitions(): void {
    // Define valid state transitions with their requirements
    const transitionRules: WorkflowTransition[] = [
      // From RESEARCH
      { from: WorkflowState.RESEARCH, to: WorkflowState.PLANNING, requiredPermissions: ['workflow:transition'] },
      
      // From PLANNING
      { from: WorkflowState.PLANNING, to: WorkflowState.RESEARCH, requiredPermissions: ['workflow:transition'] },
      { from: WorkflowState.PLANNING, to: WorkflowState.CONTENT, requiredPermissions: ['workflow:transition'] },
      
      // From CONTENT
      { from: WorkflowState.CONTENT, to: WorkflowState.PLANNING, requiredPermissions: ['workflow:transition'] },
      { from: WorkflowState.CONTENT, to: WorkflowState.CREATIVE, requiredPermissions: ['workflow:transition'] },
      
      // From CREATIVE
      { from: WorkflowState.CREATIVE, to: WorkflowState.CONTENT, requiredPermissions: ['workflow:transition'] },
      { from: WorkflowState.CREATIVE, to: WorkflowState.BRAND_APPLY, requiredPermissions: ['workflow:transition'] },
      
      // From BRAND_APPLY
      { from: WorkflowState.BRAND_APPLY, to: WorkflowState.CREATIVE, requiredPermissions: ['workflow:transition'] },
      { from: WorkflowState.BRAND_APPLY, to: WorkflowState.COMPLIANCE_CHECK, requiredPermissions: ['workflow:transition'] },
      
      // From COMPLIANCE_CHECK
      { from: WorkflowState.COMPLIANCE_CHECK, to: WorkflowState.BRAND_APPLY, requiredPermissions: ['workflow:transition'] },
      { from: WorkflowState.COMPLIANCE_CHECK, to: WorkflowState.APPROVAL, requiredPermissions: ['workflow:transition'] },
      
      // From APPROVAL
      { from: WorkflowState.APPROVAL, to: WorkflowState.COMPLIANCE_CHECK, requiredPermissions: ['workflow:transition'] },
      { from: WorkflowState.APPROVAL, to: WorkflowState.PUBLISH, requiredPermissions: ['workflow:publish'], requiredApprovals: 1 },
      
      // From PUBLISH
      { from: WorkflowState.PUBLISH, to: WorkflowState.MONITOR, requiredPermissions: ['workflow:transition'] },
      
      // From MONITOR - can go back to any previous state for revisions
      { from: WorkflowState.MONITOR, to: WorkflowState.RESEARCH, requiredPermissions: ['workflow:transition'] },
      { from: WorkflowState.MONITOR, to: WorkflowState.PLANNING, requiredPermissions: ['workflow:transition'] },
      { from: WorkflowState.MONITOR, to: WorkflowState.CONTENT, requiredPermissions: ['workflow:transition'] },
    ];

    // Group transitions by from state
    for (const transition of transitionRules) {
      const key = transition.from;
      if (!this.transitions.has(key)) {
        this.transitions.set(key, []);
      }
      this.transitions.get(key)!.push(transition);
    }
  }

  async createWorkflow(contentId: string, tenantContext: TenantContext): Promise<Workflow> {
    const workflowId = uuidv4();
    const now = new Date();

    const client = this.db.connect ? await this.db.connect() : this.db as DatabaseClient;
    try {
      if (client.query !== this.db.query) {
        // Only use transactions if we have a separate client
        await client.query('BEGIN');
      }

      // Create workflow record
      await client.query(`
        INSERT INTO workflows (id, content_id, current_state, tenant_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [workflowId, contentId, WorkflowState.RESEARCH, tenantContext.tenantId, now.toISOString(), now.toISOString()]);

      // Create initial workflow event
      const eventId = uuidv4();
      await client.query(`
        INSERT INTO workflow_events (id, workflow_id, to_state, user_id, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [eventId, workflowId, WorkflowState.RESEARCH, tenantContext.user.id, 'Workflow created', now.toISOString()]);

      if (client.query !== this.db.query) {
        await client.query('COMMIT');
      }

      return {
        id: workflowId,
        contentId,
        currentState: WorkflowState.RESEARCH,
        stateHistory: [{
          id: eventId,
          workflowId,
          toState: WorkflowState.RESEARCH,
          userId: tenantContext.user.id,
          reason: 'Workflow created',
          createdAt: now
        }],
        comments: [],
        approvals: [],
        tenantId: tenantContext.tenantId,
        createdAt: now,
        updatedAt: now
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

  async transitionState(
    workflowId: string, 
    newState: WorkflowState, 
    tenantContext: TenantContext,
    reason?: string
  ): Promise<void> {
    const client = this.db.connect ? await this.db.connect() : this.db as DatabaseClient;
    try {
      if (client.query !== this.db.query) {
        await client.query('BEGIN');
      }

      // Get current workflow state
      const workflowResult = await client.query(`
        SELECT current_state, tenant_id FROM workflows 
        WHERE id = ? AND tenant_id = ?
      `, [workflowId, tenantContext.tenantId]);

      if (workflowResult.rows.length === 0) {
        throw new Error('Workflow not found');
      }

      const currentState = workflowResult.rows[0].current_state as WorkflowState;

      // Validate transition
      const validationResult = this.validateTransition(currentState, newState, tenantContext);
      if (!validationResult.isValid) {
        throw new Error(`Invalid transition: ${validationResult.errors.map(e => e.message).join(', ')}`);
      }

      // Check if transition to PUBLISH requires approval
      if (newState === WorkflowState.PUBLISH) {
        const hasApproval = await this.checkApprovalRequirement(workflowId, client);
        if (!hasApproval) {
          throw new Error('Cannot transition to PUBLISH state without required approvals');
        }
      }

      // Update workflow state
      const now = new Date();
      await client.query(`
        UPDATE workflows 
        SET current_state = ?, updated_at = ? 
        WHERE id = ? AND tenant_id = ?
      `, [newState, now.toISOString(), workflowId, tenantContext.tenantId]);

      // Create workflow event
      const eventId = uuidv4();
      await client.query(`
        INSERT INTO workflow_events (id, workflow_id, from_state, to_state, user_id, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [eventId, workflowId, currentState, newState, tenantContext.user.id, reason || 'State transition', now.toISOString()]);

      if (client.query !== this.db.query) {
        await client.query('COMMIT');
      }
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

  private validateTransition(
    fromState: WorkflowState, 
    toState: WorkflowState, 
    tenantContext: TenantContext
  ): ValidationResult {
    const errors: ValidationError[] = [];

    // Check if transition is allowed
    const allowedTransitions = this.transitions.get(fromState) || [];
    const transition = allowedTransitions.find(t => t.to === toState);

    if (!transition) {
      errors.push({
        field: 'state',
        message: `Transition from ${fromState} to ${toState} is not allowed`,
        code: 'INVALID_TRANSITION'
      });
      return { isValid: false, errors };
    }

    // Check permissions
    const userPermissions = tenantContext.permissions.map(p => p.name);
    const hasRequiredPermissions = transition.requiredPermissions.every(
      permission => userPermissions.includes(permission)
    );

    if (!hasRequiredPermissions) {
      errors.push({
        field: 'permissions',
        message: `Missing required permissions: ${transition.requiredPermissions.join(', ')}`,
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    return { isValid: errors.length === 0, errors };
  }

  private async checkApprovalRequirement(workflowId: string, client: DatabaseClient): Promise<boolean> {
    const result = await client.query(`
      SELECT COUNT(*) as approved_count
      FROM approvals a
      JOIN approval_responses ar ON a.id = ar.approval_id
      WHERE a.workflow_id = ? 
        AND a.status = 'approved'
        AND ar.decision = 'approved'
    `, [workflowId]);

    if (!result.rows || result.rows.length === 0) {
      return false;
    }

    return parseInt(result.rows[0].approved_count) > 0;
  }

  async addComment(
    workflowId: string, 
    content: string, 
    tenantContext: TenantContext,
    parentId?: string
  ): Promise<Comment> {
    const commentId = uuidv4();
    const now = new Date();

    const client = this.db.connect ? await this.db.connect() : this.db as DatabaseClient;
    try {
      // Get current workflow state
      const workflowResult = await client.query(`
        SELECT current_state FROM workflows 
        WHERE id = ? AND tenant_id = ?
      `, [workflowId, tenantContext.tenantId]);

      if (workflowResult.rows.length === 0) {
        throw new Error('Workflow not found');
      }

      const currentState = workflowResult.rows[0].current_state as WorkflowState;

      await client.query(`
        INSERT INTO workflow_comments (id, workflow_id, parent_id, user_id, content, state, is_resolved, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [commentId, workflowId, parentId, tenantContext.user.id, content, currentState, 0, now.toISOString(), now.toISOString()]);

      return {
        id: commentId,
        workflowId,
        parentId,
        userId: tenantContext.user.id,
        content,
        state: currentState,
        isResolved: false,
        createdAt: now,
        updatedAt: now
      };
    } finally {
      if (client.release) {
        client.release();
      }
    }
  }

  async requestApproval(
    workflowId: string, 
    approvers: string[], 
    tenantContext: TenantContext,
    requiredApprovals: number = 1
  ): Promise<Approval> {
    return this.approvalService.requestApproval(workflowId, approvers, tenantContext, requiredApprovals);
  }

  async respondToApproval(
    approvalId: string,
    decision: 'approved' | 'rejected',
    tenantContext: TenantContext,
    comment?: string
  ): Promise<ApprovalResponse> {
    return this.approvalService.respondToApproval(approvalId, decision, tenantContext, comment);
  }

  async getApproval(approvalId: string, tenantContext: TenantContext): Promise<Approval | null> {
    return this.approvalService.getApproval(approvalId, tenantContext);
  }

  async getWorkflowApprovals(workflowId: string, tenantContext: TenantContext): Promise<Approval[]> {
    return this.approvalService.getWorkflowApprovals(workflowId, tenantContext);
  }

  async getPendingApprovals(userId: string, tenantContext: TenantContext): Promise<Approval[]> {
    return this.approvalService.getPendingApprovals(userId, tenantContext);
  }

  async getWorkflowHistory(workflowId: string, tenantContext: TenantContext): Promise<WorkflowEvent[]> {
    const result = await this.db.query(`
      SELECT id, workflow_id, from_state, to_state, user_id, reason, metadata, created_at
      FROM workflow_events
      WHERE workflow_id = ? 
        AND workflow_id IN (SELECT id FROM workflows WHERE tenant_id = ?)
      ORDER BY created_at ASC
    `, [workflowId, tenantContext.tenantId]);

    return result.rows.map(row => ({
      id: row.id,
      workflowId: row.workflow_id,
      fromState: row.from_state,
      toState: row.to_state,
      userId: row.user_id,
      reason: row.reason,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: new Date(row.created_at)
    }));
  }

  async getWorkflow(workflowId: string, tenantContext: TenantContext): Promise<Workflow | null> {
    const client = this.db.connect ? await this.db.connect() : this.db as DatabaseClient;
    try {
      // Get workflow
      const workflowResult = await client.query(`
        SELECT id, content_id, current_state, tenant_id, created_at, updated_at
        FROM workflows
        WHERE id = ? AND tenant_id = ?
      `, [workflowId, tenantContext.tenantId]);

      if (workflowResult.rows.length === 0) {
        return null;
      }

      const workflow = workflowResult.rows[0];

      // Get state history
      const historyResult = await client.query(`
        SELECT id, workflow_id, from_state, to_state, user_id, reason, metadata, created_at
        FROM workflow_events
        WHERE workflow_id = ?
        ORDER BY created_at ASC
      `, [workflowId]);

      // Get comments
      const commentsResult = await client.query(`
        SELECT id, workflow_id, parent_id, user_id, content, state, is_resolved, created_at, updated_at
        FROM workflow_comments
        WHERE workflow_id = ?
        ORDER BY created_at ASC
      `, [workflowId]);

      // Get approvals
      const approvalsResult = await client.query(`
        SELECT a.id, a.workflow_id, a.requested_by, a.approvers, a.required_approvals, a.status, a.requested_at, a.completed_at,
               ar.id as response_id, ar.user_id as response_user_id, ar.decision, ar.comment as response_comment, ar.created_at as response_created_at
        FROM approvals a
        LEFT JOIN approval_responses ar ON a.id = ar.approval_id
        WHERE a.workflow_id = ?
        ORDER BY a.requested_at ASC, ar.created_at ASC
      `, [workflowId]);

      // Process approvals with responses
      const approvalsMap = new Map<string, Approval>();
      for (const row of approvalsResult.rows) {
        if (!approvalsMap.has(row.id)) {
          approvalsMap.set(row.id, {
            id: row.id,
            workflowId: row.workflow_id,
            requestedBy: row.requested_by,
            approvers: JSON.parse(row.approvers),
            requiredApprovals: row.required_approvals,
            receivedApprovals: [],
            status: row.status,
            requestedAt: new Date(row.requested_at),
            completedAt: row.completed_at ? new Date(row.completed_at) : undefined
          });
        }

        if (row.response_id) {
          approvalsMap.get(row.id)!.receivedApprovals.push({
            id: row.response_id,
            approvalId: row.id,
            userId: row.response_user_id,
            decision: row.decision,
            comment: row.response_comment,
            createdAt: new Date(row.response_created_at)
          });
        }
      }

      return {
        id: workflow.id,
        contentId: workflow.content_id,
        currentState: workflow.current_state,
        stateHistory: historyResult.rows.map(row => ({
          id: row.id,
          workflowId: row.workflow_id,
          fromState: row.from_state,
          toState: row.to_state,
          userId: row.user_id,
          reason: row.reason,
          metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
          createdAt: new Date(row.created_at)
        })),
        comments: commentsResult.rows.map(row => ({
          id: row.id,
          workflowId: row.workflow_id,
          parentId: row.parent_id,
          userId: row.user_id,
          content: row.content,
          state: row.state,
          isResolved: Boolean(row.is_resolved),
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at)
        })),
        approvals: Array.from(approvalsMap.values()),
        tenantId: workflow.tenant_id,
        createdAt: new Date(workflow.created_at),
        updatedAt: new Date(workflow.updated_at)
      };
    } finally {
      if (client.release) {
        client.release();
      }
    }
  }
}