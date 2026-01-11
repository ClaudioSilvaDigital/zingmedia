import { Router, Request, Response } from 'express';
import { WorkflowEngine } from '../services/workflow.js';
import { ApprovalService } from '../services/approval.js';
import { authenticateToken } from '../middleware/auth.js';
import { getTenantContext } from '../middleware/tenant.js';
import { WorkflowState } from '../types/index.js';
import { Pool } from 'pg';

export function createWorkflowRoutes(db: Pool): Router {
  const router = Router();
  const workflowEngine = new WorkflowEngine(db);
  const approvalService = new ApprovalService(db);

  // Apply authentication and tenant context middleware
  router.use(authenticateToken);
  router.use(getTenantContext);

  // Create workflow for content
  router.post('/workflows', async (req: Request, res: Response) => {
    try {
      const { contentId } = req.body;
      
      if (!contentId) {
        return res.status(400).json({ error: 'Content ID is required' });
      }

      const workflow = await workflowEngine.createWorkflow(contentId, req.tenantContext);
      res.status(201).json(workflow);
    } catch (error) {
      console.error('Error creating workflow:', error);
      res.status(500).json({ error: 'Failed to create workflow' });
    }
  });

  // Get workflow details
  router.get('/workflows/:workflowId', async (req: Request, res: Response) => {
    try {
      const { workflowId } = req.params;
      const workflow = await workflowEngine.getWorkflow(workflowId, req.tenantContext);
      
      if (!workflow) {
        return res.status(404).json({ error: 'Workflow not found' });
      }

      res.json(workflow);
    } catch (error) {
      console.error('Error getting workflow:', error);
      res.status(500).json({ error: 'Failed to get workflow' });
    }
  });

  // Transition workflow state
  router.post('/workflows/:workflowId/transition', async (req: Request, res: Response) => {
    try {
      const { workflowId } = req.params;
      const { newState, reason } = req.body;

      if (!Object.values(WorkflowState).includes(newState)) {
        return res.status(400).json({ error: 'Invalid workflow state' });
      }

      await workflowEngine.transitionState(workflowId, newState, req.tenantContext, reason);
      res.json({ success: true, message: 'State transition completed' });
    } catch (error) {
      console.error('Error transitioning workflow state:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // Add comment to workflow
  router.post('/workflows/:workflowId/comments', async (req: Request, res: Response) => {
    try {
      const { workflowId } = req.params;
      const { content, parentId } = req.body;

      if (!content) {
        return res.status(400).json({ error: 'Comment content is required' });
      }

      const comment = await workflowEngine.addComment(workflowId, content, req.tenantContext, parentId);
      res.status(201).json(comment);
    } catch (error) {
      console.error('Error adding comment:', error);
      res.status(500).json({ error: 'Failed to add comment' });
    }
  });

  // Request approval
  router.post('/workflows/:workflowId/approvals', async (req: Request, res: Response) => {
    try {
      const { workflowId } = req.params;
      const { approvers, requiredApprovals = 1 } = req.body;

      if (!approvers || !Array.isArray(approvers) || approvers.length === 0) {
        return res.status(400).json({ error: 'At least one approver is required' });
      }

      const approval = await workflowEngine.requestApproval(
        workflowId, 
        approvers, 
        req.tenantContext, 
        requiredApprovals
      );
      
      res.status(201).json(approval);
    } catch (error) {
      console.error('Error requesting approval:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // Respond to approval
  router.post('/approvals/:approvalId/respond', async (req: Request, res: Response) => {
    try {
      const { approvalId } = req.params;
      const { decision, comment } = req.body;

      if (!['approved', 'rejected'].includes(decision)) {
        return res.status(400).json({ error: 'Decision must be "approved" or "rejected"' });
      }

      const response = await workflowEngine.respondToApproval(
        approvalId, 
        decision, 
        req.tenantContext, 
        comment
      );
      
      res.status(201).json(response);
    } catch (error) {
      console.error('Error responding to approval:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // Get approval details
  router.get('/approvals/:approvalId', async (req: Request, res: Response) => {
    try {
      const { approvalId } = req.params;
      const approval = await workflowEngine.getApproval(approvalId, req.tenantContext);
      
      if (!approval) {
        return res.status(404).json({ error: 'Approval not found' });
      }

      res.json(approval);
    } catch (error) {
      console.error('Error getting approval:', error);
      res.status(500).json({ error: 'Failed to get approval' });
    }
  });

  // Get workflow approvals
  router.get('/workflows/:workflowId/approvals', async (req: Request, res: Response) => {
    try {
      const { workflowId } = req.params;
      const approvals = await workflowEngine.getWorkflowApprovals(workflowId, req.tenantContext);
      res.json(approvals);
    } catch (error) {
      console.error('Error getting workflow approvals:', error);
      res.status(500).json({ error: 'Failed to get workflow approvals' });
    }
  });

  // Get pending approvals for current user
  router.get('/approvals/pending', async (req: Request, res: Response) => {
    try {
      const pendingApprovals = await workflowEngine.getPendingApprovals(
        req.tenantContext.user.id, 
        req.tenantContext
      );
      res.json(pendingApprovals);
    } catch (error) {
      console.error('Error getting pending approvals:', error);
      res.status(500).json({ error: 'Failed to get pending approvals' });
    }
  });

  // Get workflow history
  router.get('/workflows/:workflowId/history', async (req: Request, res: Response) => {
    try {
      const { workflowId } = req.params;
      const history = await workflowEngine.getWorkflowHistory(workflowId, req.tenantContext);
      res.json(history);
    } catch (error) {
      console.error('Error getting workflow history:', error);
      res.status(500).json({ error: 'Failed to get workflow history' });
    }
  });

  return router;
}