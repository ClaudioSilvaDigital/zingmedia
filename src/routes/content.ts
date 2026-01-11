import { Router, Request, Response } from 'express';
import { ContentService } from '../services/content.js';
import { ContentGenerationService } from '../services/content-generation.js';
import { authenticateToken } from '../middleware/auth.js';
import { getTenantContext } from '../middleware/tenant.js';
import { DatabasePool } from '../interfaces/database.js';
import { TenantContext, Content } from '../types/index.js';

export function createContentRouter(db: DatabasePool): Router {
  const router = Router();
  const contentService = new ContentService(db);
  const contentGenerationService = new ContentGenerationService(db);

  // Apply authentication and tenant context middleware
  router.use(authenticateToken);
  router.use(getTenantContext);

  // Generate new content using AI
  router.post('/generate', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const generationRequest = {
        briefingId: req.body.briefingId,
        contentType: req.body.contentType,
        title: req.body.title,
        description: req.body.description,
        targetPlatforms: req.body.targetPlatforms || ['instagram'],
        generationOptions: req.body.generationOptions || {},
        brandVoiceGuidelines: req.body.brandVoiceGuidelines || [],
        bestPractices: req.body.bestPractices || []
      };

      const generatedContent = await contentGenerationService.generateContent(
        generationRequest, 
        tenantContext
      );
      
      res.status(201).json(generatedContent);
    } catch (error) {
      console.error('Error generating content:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Failed to generate content' 
      });
    }
  });

  // Validate content against platform requirements
  router.post('/:id/validate/:platform', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const content = await contentService.getContent(req.params.id, tenantContext);
      const platform = req.params.platform as any;
      
      if (!content.adaptedContent[platform]) {
        return res.status(400).json({ error: `Content not adapted for platform: ${platform}` });
      }

      const validation = await contentGenerationService.validatePlatformRequirements(
        content.adaptedContent[platform],
        platform
      );
      
      res.json(validation);
    } catch (error) {
      console.error('Error validating content:', error);
      res.status(500).json({ error: 'Failed to validate content' });
    }
  });

  // Get platform requirements
  router.get('/platforms/:platform/requirements', async (req: Request, res: Response) => {
    try {
      const platform = req.params.platform as any;
      const requirements = contentGenerationService.getPlatformRequirements(platform);
      
      if (!requirements) {
        return res.status(404).json({ error: `Platform not supported: ${platform}` });
      }
      
      res.json(requirements);
    } catch (error) {
      console.error('Error getting platform requirements:', error);
      res.status(500).json({ error: 'Failed to get platform requirements' });
    }
  });

  // Get supported platforms
  router.get('/platforms', async (req: Request, res: Response) => {
    try {
      const platforms = contentGenerationService.getSupportedPlatforms();
      res.json({ platforms });
    } catch (error) {
      console.error('Error getting supported platforms:', error);
      res.status(500).json({ error: 'Failed to get supported platforms' });
    }
  });

  // Create new content
  router.post('/', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const contentData = {
        briefingId: req.body.briefingId,
        title: req.body.title,
        description: req.body.description,
        contentType: req.body.contentType,
        baseContent: req.body.baseContent || {},
        adaptedContent: req.body.adaptedContent || {},
        clientId: req.body.clientId,
        createdBy: tenantContext.user.id
      };

      const content = await contentService.createContent(contentData, tenantContext);
      res.status(201).json(content);
    } catch (error) {
      console.error('Error creating content:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Failed to create content' 
      });
    }
  });

  // Get content by ID
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const content = await contentService.getContent(req.params.id, tenantContext);
      res.json(content);
    } catch (error) {
      console.error('Error getting content:', error);
      if (error instanceof Error && error.message === 'Content not found') {
        res.status(404).json({ error: 'Content not found' });
      } else {
        res.status(500).json({ error: 'Failed to get content' });
      }
    }
  });

  // Update content
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const updates = {
        title: req.body.title,
        description: req.body.description,
        baseContent: req.body.baseContent,
        adaptedContent: req.body.adaptedContent
      };

      // Remove undefined values
      Object.keys(updates).forEach(key => {
        if (updates[key as keyof typeof updates] === undefined) {
          delete updates[key as keyof typeof updates];
        }
      });

      const content = await contentService.updateContent(req.params.id, updates, tenantContext);
      res.json(content);
    } catch (error) {
      console.error('Error updating content:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Failed to update content' 
      });
    }
  });

  // List content with filters
  router.get('/', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const filters = {
        briefingId: req.query.briefingId as string,
        contentType: req.query.contentType as string,
        clientId: req.query.clientId as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => {
        if (filters[key as keyof typeof filters] === undefined) {
          delete filters[key as keyof typeof filters];
        }
      });

      const content = await contentService.listContent(tenantContext, filters);
      res.json(content);
    } catch (error) {
      console.error('Error listing content:', error);
      res.status(500).json({ error: 'Failed to list content' });
    }
  });

  // Delete content
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      await contentService.deleteContent(req.params.id, tenantContext);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting content:', error);
      if (error instanceof Error && error.message === 'Content not found') {
        res.status(404).json({ error: 'Content not found' });
      } else {
        res.status(500).json({ error: 'Failed to delete content' });
      }
    }
  });

  // Get content version history
  router.get('/:id/versions', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const versions = await contentService.getContentVersions(req.params.id, tenantContext);
      res.json(versions);
    } catch (error) {
      console.error('Error getting content versions:', error);
      res.status(500).json({ error: 'Failed to get content versions' });
    }
  });

  return router;
}