import { Router, Request, Response } from 'express';
import { BriefingService } from '../services/briefing';
import { authenticateToken } from '../middleware/auth';
import { tenantContextMiddleware } from '../middleware/tenant';
import { Pool } from 'pg';

export function createBriefingRouter(db: Pool): Router {
  const router = Router();
  const briefingService = new BriefingService(db);

  // Apply middleware
  router.use(authenticateToken);
  router.use(tenantContextMiddleware);

  // Create briefing template
  router.post('/templates', async (req: Request, res: Response) => {
    try {
      const templateData = {
        ...req.body,
        createdBy: req.user.id
      };

      const template = await briefingService.createBriefingTemplate(templateData, req.tenantContext);
      res.status(201).json(template);
    } catch (error) {
      console.error('Error creating briefing template:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // Get briefing templates
  router.get('/templates', async (req: Request, res: Response) => {
    try {
      const templates = await briefingService.getBriefingTemplates(req.tenantContext);
      res.json(templates);
    } catch (error) {
      console.error('Error fetching briefing templates:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get specific briefing template
  router.get('/templates/:id', async (req: Request, res: Response) => {
    try {
      const template = await briefingService.getBriefingTemplate(req.params.id, req.tenantContext);
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }
      res.json(template);
    } catch (error) {
      console.error('Error fetching briefing template:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Create briefing
  router.post('/', async (req: Request, res: Response) => {
    try {
      const briefingData = {
        ...req.body,
        createdBy: req.user.id
      };

      const briefing = await briefingService.createBriefing(briefingData, req.tenantContext);
      res.status(201).json(briefing);
    } catch (error) {
      console.error('Error creating briefing:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // Get briefing
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const briefing = await briefingService.getBriefing(req.params.id, req.tenantContext);
      if (!briefing) {
        return res.status(404).json({ error: 'Briefing not found' });
      }
      res.json(briefing);
    } catch (error) {
      console.error('Error fetching briefing:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Update briefing
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const briefing = await briefingService.updateBriefing(req.params.id, req.body, req.tenantContext);
      res.json(briefing);
    } catch (error) {
      console.error('Error updating briefing:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // Validate briefing
  router.post('/:id/validate', async (req: Request, res: Response) => {
    try {
      const validation = await briefingService.validateBriefing(req.params.id, req.tenantContext);
      res.json(validation);
    } catch (error) {
      console.error('Error validating briefing:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get briefing versions
  router.get('/:id/versions', async (req: Request, res: Response) => {
    try {
      const versions = await briefingService.getBriefingVersions(req.params.id, req.tenantContext);
      res.json(versions);
    } catch (error) {
      console.error('Error fetching briefing versions:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}