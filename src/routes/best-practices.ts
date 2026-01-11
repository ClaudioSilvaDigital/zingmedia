import { Router, Request, Response } from 'express';
import { BestPracticesService } from '../services/best-practices.js';
import { DatabasePool } from '../interfaces/database.js';
import { TenantContext } from '../types/index.js';

export function createBestPracticesRouter(db: DatabasePool): Router {
  const router = Router();
  const bestPracticesService = new BestPracticesService(db);

  // Get all best practices for tenant
  router.get('/', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const practices = await bestPracticesService.getAllBestPractices(tenantContext);
      res.json(practices);
    } catch (error) {
      console.error('Error fetching best practices:', error);
      res.status(500).json({ error: 'Failed to fetch best practices' });
    }
  });

  // Get best practices by category
  router.get('/category/:contentType', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const { contentType } = req.params;
      const practices = await bestPracticesService.getBestPracticesByCategory(contentType, tenantContext);
      res.json(practices);
    } catch (error) {
      console.error('Error fetching best practices by category:', error);
      res.status(500).json({ error: 'Failed to fetch best practices' });
    }
  });

  // Get best practices for specific content generation
  router.get('/for-content', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const { contentType, objective } = req.query;
      
      if (!contentType || !objective) {
        return res.status(400).json({ error: 'contentType and objective are required' });
      }

      const practices = await bestPracticesService.getBestPracticesForContent(
        contentType as string,
        objective as string,
        tenantContext
      );
      res.json(practices);
    } catch (error) {
      console.error('Error fetching best practices for content:', error);
      res.status(500).json({ error: 'Failed to fetch best practices' });
    }
  });

  // Get formatted best practices for AI prompts
  router.get('/formatted', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const { contentType, objective } = req.query;
      
      if (!contentType || !objective) {
        return res.status(400).json({ error: 'contentType and objective are required' });
      }

      const formattedPractices = await bestPracticesService.formatBestPracticesForPrompt(
        contentType as string,
        objective as string,
        tenantContext
      );
      res.json({ formattedPractices });
    } catch (error) {
      console.error('Error formatting best practices:', error);
      res.status(500).json({ error: 'Failed to format best practices' });
    }
  });

  // Get single best practice by ID
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const { id } = req.params;
      const practice = await bestPracticesService.getBestPracticeById(id, tenantContext);
      
      if (!practice) {
        return res.status(404).json({ error: 'Best practice not found' });
      }
      
      res.json(practice);
    } catch (error) {
      console.error('Error fetching best practice:', error);
      res.status(500).json({ error: 'Failed to fetch best practice' });
    }
  });

  // Create new best practice
  router.post('/', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const practiceData = req.body;

      // Validate required fields
      if (!practiceData.name || !practiceData.contentType || !practiceData.objective) {
        return res.status(400).json({ 
          error: 'name, contentType, and objective are required' 
        });
      }

      // Set defaults
      practiceData.isCustom = true;
      practiceData.priority = practiceData.priority || 1;
      practiceData.rules = practiceData.rules || [];
      practiceData.examples = practiceData.examples || { positive: [], negative: [] };

      const practice = await bestPracticesService.createBestPractice(practiceData, tenantContext);
      res.status(201).json(practice);
    } catch (error) {
      console.error('Error creating best practice:', error);
      res.status(500).json({ error: 'Failed to create best practice' });
    }
  });

  // Update best practice
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const { id } = req.params;
      const updates = req.body;

      const practice = await bestPracticesService.updateBestPractice(id, updates, tenantContext);
      res.json(practice);
    } catch (error) {
      console.error('Error updating best practice:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to update best practice' });
      }
    }
  });

  // Delete best practice
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const { id } = req.params;

      await bestPracticesService.deleteBestPractice(id, tenantContext);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting best practice:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to delete best practice' });
      }
    }
  });

  // Brand Voice Guidelines endpoints

  // Get all brand voice guidelines for tenant
  router.get('/brand-voice/guidelines', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const guidelines = await bestPracticesService.getBrandVoiceGuidelines(tenantContext);
      res.json(guidelines);
    } catch (error) {
      console.error('Error fetching brand voice guidelines:', error);
      res.status(500).json({ error: 'Failed to fetch brand voice guidelines' });
    }
  });

  // Get formatted brand voice for AI prompts
  router.get('/brand-voice/formatted', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const formattedGuidelines = await bestPracticesService.formatBrandVoiceForPrompt(tenantContext);
      res.json({ formattedGuidelines });
    } catch (error) {
      console.error('Error formatting brand voice guidelines:', error);
      res.status(500).json({ error: 'Failed to format brand voice guidelines' });
    }
  });

  // Get single brand voice guideline by ID
  router.get('/brand-voice/:id', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const { id } = req.params;
      const guideline = await bestPracticesService.getBrandVoiceGuidelineById(id, tenantContext);
      
      if (!guideline) {
        return res.status(404).json({ error: 'Brand voice guideline not found' });
      }
      
      res.json(guideline);
    } catch (error) {
      console.error('Error fetching brand voice guideline:', error);
      res.status(500).json({ error: 'Failed to fetch brand voice guideline' });
    }
  });

  // Create new brand voice guideline
  router.post('/brand-voice', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const guidelineData = req.body;

      // Validate required fields
      if (!guidelineData.name || !guidelineData.tone) {
        return res.status(400).json({ 
          error: 'name and tone are required' 
        });
      }

      // Set defaults
      guidelineData.personality = guidelineData.personality || [];
      guidelineData.dosList = guidelineData.dosList || [];
      guidelineData.dontsList = guidelineData.dontsList || [];
      guidelineData.examples = guidelineData.examples || [];
      guidelineData.isActive = guidelineData.isActive !== undefined ? guidelineData.isActive : true;
      guidelineData.tenantId = tenantContext.tenantId;

      const guideline = await bestPracticesService.createBrandVoiceGuideline(guidelineData, tenantContext);
      res.status(201).json(guideline);
    } catch (error) {
      console.error('Error creating brand voice guideline:', error);
      res.status(500).json({ error: 'Failed to create brand voice guideline' });
    }
  });

  // Update brand voice guideline
  router.put('/brand-voice/:id', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const { id } = req.params;
      const updates = req.body;

      const guideline = await bestPracticesService.updateBrandVoiceGuideline(id, updates, tenantContext);
      res.json(guideline);
    } catch (error) {
      console.error('Error updating brand voice guideline:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to update brand voice guideline' });
      }
    }
  });

  // Delete brand voice guideline
  router.delete('/brand-voice/:id', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const { id } = req.params;

      await bestPracticesService.deleteBrandVoiceGuideline(id, tenantContext);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting brand voice guideline:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to delete brand voice guideline' });
      }
    }
  });

  return router;
}