import { Router, Request, Response } from 'express';
import { VideoScriptService } from '../services/video-script.js';
import { authenticateToken } from '../middleware/auth.js';
import { extractTenantContext } from '../middleware/tenant.js';
import { db } from '../config/database.js';
import {
  ScriptGenerationRequest,
  ScriptTemplate,
  ScriptTemplateSection,
  ScriptSectionType,
  Platform
} from '../types/index.js';

const router = Router();
const videoScriptService = new VideoScriptService(db);

// Apply authentication and tenant context to all routes
router.use(authenticateToken);
router.use(extractTenantContext);

/**
 * Generate a new video script
 * POST /api/video-scripts
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const request: ScriptGenerationRequest = req.body;
    
    // Validate required fields
    if (!request.briefingId || !request.templateId || !request.title || !request.targetPlatform) {
      return res.status(400).json({
        error: 'Missing required fields: briefingId, templateId, title, targetPlatform'
      });
    }

    const script = await videoScriptService.generateScript(request, req.tenantContext);
    
    res.status(201).json({
      success: true,
      data: script
    });
  } catch (error) {
    console.error('Error generating video script:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate video script'
    });
  }
});

/**
 * Get script by ID
 * GET /api/video-scripts/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const script = await videoScriptService.getScript(id, req.tenantContext);
    
    if (!script) {
      return res.status(404).json({
        error: 'Script not found'
      });
    }

    res.json({
      success: true,
      data: script
    });
  } catch (error) {
    console.error('Error getting video script:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get video script'
    });
  }
});

/**
 * Update script
 * PUT /api/video-scripts/:id
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const script = await videoScriptService.updateScript(id, updates, req.tenantContext);
    
    res.json({
      success: true,
      data: script
    });
  } catch (error) {
    console.error('Error updating video script:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update video script'
    });
  }
});

/**
 * Get script version history
 * GET /api/video-scripts/:id/versions
 */
router.get('/:id/versions', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const versions = await videoScriptService.getScriptVersions(id, req.tenantContext);
    
    res.json({
      success: true,
      data: versions
    });
  } catch (error) {
    console.error('Error getting script versions:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get script versions'
    });
  }
});

/**
 * Request approval for script
 * POST /api/video-scripts/:id/request-approval
 */
router.post('/:id/request-approval', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { approvers, requiredApprovals = 1 } = req.body;
    
    if (!approvers || !Array.isArray(approvers) || approvers.length === 0) {
      return res.status(400).json({
        error: 'Approvers array is required and must not be empty'
      });
    }

    const approvalId = await videoScriptService.requestScriptApproval(
      id, 
      approvers, 
      req.tenantContext, 
      requiredApprovals
    );
    
    res.json({
      success: true,
      data: { approvalId }
    });
  } catch (error) {
    console.error('Error requesting script approval:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to request script approval'
    });
  }
});

/**
 * Get script workflow status
 * GET /api/video-scripts/:id/workflow
 */
router.get('/:id/workflow', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const workflow = await videoScriptService.getScriptWorkflowStatus(id, req.tenantContext);
    
    if (!workflow) {
      return res.status(404).json({
        error: 'Script workflow not found'
      });
    }

    res.json({
      success: true,
      data: workflow
    });
  } catch (error) {
    console.error('Error getting script workflow:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get script workflow'
    });
  }
});

/**
 * Add comment to script workflow
 * POST /api/video-scripts/:id/comments
 */
router.post('/:id/comments', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { content, parentId } = req.body;
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        error: 'Comment content is required'
      });
    }

    const comment = await videoScriptService.addScriptComment(
      id, 
      content.trim(), 
      req.tenantContext, 
      parentId
    );
    
    res.status(201).json({
      success: true,
      data: comment
    });
  } catch (error) {
    console.error('Error adding script comment:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to add script comment'
    });
  }
});

/**
 * Transition script workflow state
 * POST /api/video-scripts/:id/workflow/transition
 */
router.post('/:id/workflow/transition', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newState, reason } = req.body;
    
    if (!newState) {
      return res.status(400).json({
        error: 'New state is required'
      });
    }

    await videoScriptService.transitionScriptWorkflow(
      id, 
      newState, 
      req.tenantContext, 
      reason
    );
    
    res.json({
      success: true,
      message: `Script workflow transitioned to ${newState}`
    });
  } catch (error) {
    console.error('Error transitioning script workflow:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to transition script workflow'
    });
  }
});

/**
 * Connect script to workflow for approval
 * POST /api/video-scripts/:id/workflow
 */
router.post('/:id/workflow', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const workflowId = await videoScriptService.connectToWorkflow(id, req.tenantContext);
    
    res.json({
      success: true,
      data: { workflowId }
    });
  } catch (error) {
    console.error('Error connecting script to workflow:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to connect script to workflow'
    });
  }
});

/**
 * Approve script for production
 * POST /api/video-scripts/:id/approve
 */
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await videoScriptService.approveScript(id, req.tenantContext);
    
    res.json({
      success: true,
      message: 'Script approved successfully'
    });
  } catch (error) {
    console.error('Error approving script:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to approve script'
    });
  }
});

/**
 * Validate script structure
 * POST /api/video-scripts/:id/validate
 */
router.post('/:id/validate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const script = await videoScriptService.getScript(id, req.tenantContext);
    
    if (!script) {
      return res.status(404).json({
        error: 'Script not found'
      });
    }

    const validation = videoScriptService.validateScriptStructure(script);
    
    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    console.error('Error validating script:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to validate script'
    });
  }
});

// Script Template Routes

/**
 * Create script template
 * POST /api/video-scripts/templates
 */
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const templateData = req.body;
    
    // Validate required fields
    if (!templateData.name || !templateData.contentType || !templateData.sections) {
      return res.status(400).json({
        error: 'Missing required fields: name, contentType, sections'
      });
    }

    const template = await videoScriptService.createScriptTemplate(templateData, req.tenantContext);
    
    res.status(201).json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Error creating script template:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create script template'
    });
  }
});

/**
 * Get script template by ID
 * GET /api/video-scripts/templates/:id
 */
router.get('/templates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const template = await videoScriptService.getScriptTemplate(id, req.tenantContext);
    
    if (!template) {
      return res.status(404).json({
        error: 'Template not found'
      });
    }

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Error getting script template:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get script template'
    });
  }
});

/**
 * List script templates
 * GET /api/video-scripts/templates
 */
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const { platform, contentType } = req.query;
    
    const templates = await videoScriptService.listScriptTemplates(
      req.tenantContext,
      platform as Platform,
      contentType as string
    );
    
    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error('Error listing script templates:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to list script templates'
    });
  }
});

export default router;