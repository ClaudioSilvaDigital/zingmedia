import { Router, Request, Response } from 'express';
import { AnalyticsService } from '../services/analytics';
import { PerformanceHistoryService } from '../services/performance-history';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { AnalyticsQuery, Platform } from '../types';

const router = Router();
const analyticsService = new AnalyticsService();
const performanceHistoryService = new PerformanceHistoryService();

// Apply middleware
router.use(authMiddleware);
router.use(tenantMiddleware);

/**
 * POST /analytics/collect-metrics
 * Trigger metrics collection from social platforms
 * Requirements: 11.1
 */
router.post('/collect-metrics', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.tenantContext;
    const { platforms } = req.body;
    
    // Validate platforms if provided
    if (platforms && !Array.isArray(platforms)) {
      return res.status(400).json({ error: 'Platforms must be an array' });
    }
    
    if (platforms) {
      const validPlatforms = ['instagram', 'tiktok', 'facebook', 'linkedin'];
      const invalidPlatforms = platforms.filter(p => !validPlatforms.includes(p));
      if (invalidPlatforms.length > 0) {
        return res.status(400).json({ 
          error: `Invalid platforms: ${invalidPlatforms.join(', ')}` 
        });
      }
    }
    
    const job = await analyticsService.collectMetricsFromPlatforms(tenantId, platforms);
    
    res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        metricsCollected: job.metricsCollected,
        contentIds: job.contentIds
      }
    });
  } catch (error) {
    console.error('Error collecting metrics:', error);
    res.status(500).json({ error: 'Failed to collect metrics' });
  }
});

/**
 * GET /analytics/reports
 * Generate comprehensive analytics report
 * Requirements: 11.4, 11.5
 */
router.get('/reports', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.tenantContext;
    const { 
      clientId, 
      platforms, 
      contentTypes, 
      startDate, 
      endDate, 
      groupBy,
      limit,
      offset 
    } = req.query;
    
    // Validate date range
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }
    
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    
    if (start >= end) {
      return res.status(400).json({ error: 'Start date must be before end date' });
    }
    
    // Build analytics query
    const query: AnalyticsQuery = {
      tenantId,
      clientId: clientId as string,
      platforms: platforms ? (platforms as string).split(',') as Platform[] : undefined,
      contentTypes: contentTypes ? (contentTypes as string).split(',') : undefined,
      dateRange: { start, end },
      groupBy: groupBy as 'day' | 'week' | 'month' | 'platform' | 'content_type',
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined
    };
    
    const report = await analyticsService.generateAnalyticsReport(query);
    
    res.json({
      success: true,
      report
    });
  } catch (error) {
    console.error('Error generating analytics report:', error);
    res.status(500).json({ error: 'Failed to generate analytics report' });
  }
});

/**
 * GET /analytics/content/:contentId/performance
 * Get detailed performance data for specific content
 * Requirements: 11.2, 11.4
 */
router.get('/content/:contentId/performance', async (req: Request, res: Response) => {
  try {
    const { contentId } = req.params;
    const { platform } = req.query;
    
    if (!platform) {
      return res.status(400).json({ error: 'Platform parameter is required' });
    }
    
    const validPlatforms = ['instagram', 'tiktok', 'facebook', 'linkedin'];
    if (!validPlatforms.includes(platform as string)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }
    
    const performanceHistory = await analyticsService.getPerformanceHistory(
      contentId, 
      platform as Platform
    );
    
    res.json({
      success: true,
      performance: performanceHistory
    });
  } catch (error) {
    console.error('Error getting content performance:', error);
    res.status(500).json({ error: 'Failed to get content performance' });
  }
});

/**
 * POST /analytics/content/:contentId/brand-adherence
 * Calculate brand adherence score for content
 * Requirements: 11.3
 */
router.post('/content/:contentId/brand-adherence', async (req: Request, res: Response) => {
  try {
    const { contentId } = req.params;
    const { tenantId } = req.tenantContext;
    
    const brandAdherence = await analyticsService.calculateBrandAdherence(contentId, tenantId);
    
    res.json({
      success: true,
      brandAdherence
    });
  } catch (error) {
    console.error('Error calculating brand adherence:', error);
    res.status(500).json({ error: 'Failed to calculate brand adherence' });
  }
});

/**
 * GET /analytics/dashboard
 * Get dashboard summary data
 * Requirements: 11.1, 11.2
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.tenantContext;
    const { clientId, period = '30' } = req.query;
    
    const days = parseInt(period as string);
    if (isNaN(days) || days < 1 || days > 365) {
      return res.status(400).json({ error: 'Period must be between 1 and 365 days' });
    }
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const query: AnalyticsQuery = {
      tenantId,
      clientId: clientId as string,
      dateRange: { start: startDate, end: endDate },
      limit: 10
    };
    
    const report = await analyticsService.generateAnalyticsReport(query);
    
    // Return simplified dashboard data
    const dashboard = {
      overview: report.overview,
      platformBreakdown: report.platformBreakdown.map(platform => ({
        platform: platform.platform,
        totalPosts: platform.totalPosts,
        totalEngagement: platform.totalEngagement,
        averageEngagementRate: platform.averageEngagementRate
      })),
      topContent: report.contentPerformance.slice(0, 5),
      recommendations: report.recommendations.slice(0, 3),
      trends: report.trends.slice(-7) // Last 7 data points
    };
    
    res.json({
      success: true,
      dashboard
    });
  } catch (error) {
    console.error('Error getting dashboard data:', error);
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
});

/**
 * GET /analytics/metrics/engagement
 * Get engagement metrics for specific time period
 * Requirements: 11.2
 */
router.get('/metrics/engagement', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.tenantContext;
    const { 
      clientId, 
      platform, 
      startDate, 
      endDate, 
      groupBy = 'day' 
    } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }
    
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    
    const query: AnalyticsQuery = {
      tenantId,
      clientId: clientId as string,
      platforms: platform ? [platform as Platform] : undefined,
      dateRange: { start, end },
      groupBy: groupBy as 'day' | 'week' | 'month' | 'platform' | 'content_type',
      metrics: ['engagement', 'reach', 'impressions']
    };
    
    const report = await analyticsService.generateAnalyticsReport(query);
    
    res.json({
      success: true,
      metrics: {
        trends: report.trends,
        platformBreakdown: report.platformBreakdown,
        totalEngagement: report.overview.totalEngagement
      }
    });
  } catch (error) {
    console.error('Error getting engagement metrics:', error);
    res.status(500).json({ error: 'Failed to get engagement metrics' });
  }
});

/**
 * GET /analytics/recommendations
 * Get performance recommendations
 * Requirements: 11.5
 */
router.get('/recommendations', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.tenantContext;
    const { clientId, type, impact, limit = '10' } = req.query;
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // Last 30 days
    
    const query: AnalyticsQuery = {
      tenantId,
      clientId: clientId as string,
      dateRange: { start: startDate, end: endDate }
    };
    
    const report = await analyticsService.generateAnalyticsReport(query);
    
    let recommendations = report.recommendations;
    
    // Filter by type if specified
    if (type) {
      recommendations = recommendations.filter(rec => rec.type === type);
    }
    
    // Filter by impact if specified
    if (impact) {
      recommendations = recommendations.filter(rec => rec.impact === impact);
    }
    
    // Limit results
    const limitNum = parseInt(limit as string);
    if (!isNaN(limitNum) && limitNum > 0) {
      recommendations = recommendations.slice(0, limitNum);
    }
    
    res.json({
      success: true,
      recommendations
    });
  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

/**
 * GET /analytics/content/scores
 * Get content scores for performance analysis
 * Requirements: 11.3
 */
router.get('/content/scores', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.tenantContext;
    const { 
      clientId, 
      platform, 
      contentType, 
      startDate, 
      endDate, 
      sortBy = 'score',
      order = 'desc',
      limit = '20' 
    } = req.query;
    
    const endDateObj = endDate ? new Date(endDate as string) : new Date();
    const startDateObj = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const query: AnalyticsQuery = {
      tenantId,
      clientId: clientId as string,
      platforms: platform ? [platform as Platform] : undefined,
      contentTypes: contentType ? [contentType as string] : undefined,
      dateRange: { start: startDateObj, end: endDateObj },
      limit: parseInt(limit as string)
    };
    
    const report = await analyticsService.generateAnalyticsReport(query);
    
    // Sort content by specified criteria
    let sortedContent = [...report.contentPerformance];
    if (sortBy === 'score') {
      sortedContent.sort((a, b) => order === 'desc' ? b.score - a.score : a.score - b.score);
    } else if (sortBy === 'brandAdherence') {
      sortedContent.sort((a, b) => order === 'desc' ? b.brandAdherenceScore - a.brandAdherenceScore : a.brandAdherenceScore - b.brandAdherenceScore);
    } else if (sortBy === 'engagement') {
      sortedContent.sort((a, b) => {
        const aEngagement = a.metrics.likes + a.metrics.comments + a.metrics.shares + (a.metrics.saves || 0);
        const bEngagement = b.metrics.likes + b.metrics.comments + b.metrics.shares + (b.metrics.saves || 0);
        return order === 'desc' ? bEngagement - aEngagement : aEngagement - bEngagement;
      });
    }
    
    res.json({
      success: true,
      content: sortedContent,
      summary: {
        totalContent: sortedContent.length,
        averageScore: sortedContent.reduce((sum, content) => sum + content.score, 0) / sortedContent.length,
        averageBrandAdherence: sortedContent.reduce((sum, content) => sum + content.brandAdherenceScore, 0) / sortedContent.length
      }
    });
  } catch (error) {
    console.error('Error getting content scores:', error);
    res.status(500).json({ error: 'Failed to get content scores' });
  }
});

/**
 * GET /analytics/history/publications
 * Get publication history with performance data
 * Requirements: 11.4
 */
router.get('/history/publications', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.tenantContext;
    const { 
      clientId, 
      platforms, 
      startDate, 
      endDate, 
      limit = '50' 
    } = req.query;
    
    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;
    const platformArray = platforms ? (platforms as string).split(',') as Platform[] : undefined;
    
    const history = await performanceHistoryService.getPublicationHistory(
      tenantId,
      clientId as string,
      platformArray,
      start,
      end,
      parseInt(limit as string)
    );
    
    res.json({
      success: true,
      ...history
    });
  } catch (error) {
    console.error('Error getting publication history:', error);
    res.status(500).json({ error: 'Failed to get publication history' });
  }
});

/**
 * GET /analytics/history/content/:contentId
 * Get detailed performance history for specific content
 * Requirements: 11.4
 */
router.get('/history/content/:contentId', async (req: Request, res: Response) => {
  try {
    const { contentId } = req.params;
    const { platform } = req.query;
    
    const platformEnum = platform ? platform as Platform : undefined;
    const history = await performanceHistoryService.getContentPerformanceHistory(contentId, platformEnum);
    
    res.json({
      success: true,
      history
    });
  } catch (error) {
    console.error('Error getting content performance history:', error);
    res.status(500).json({ error: 'Failed to get content performance history' });
  }
});

/**
 * POST /analytics/recommendations/generate
 * Generate automated strategy recommendations
 * Requirements: 11.5
 */
router.post('/recommendations/generate', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.tenantContext;
    const { clientId, analysisWindow = 30 } = req.body;
    
    const recommendations = await performanceHistoryService.generateStrategyRecommendations(
      tenantId,
      clientId,
      analysisWindow
    );
    
    res.json({
      success: true,
      recommendations,
      count: recommendations.length
    });
  } catch (error) {
    console.error('Error generating strategy recommendations:', error);
    res.status(500).json({ error: 'Failed to generate strategy recommendations' });
  }
});

/**
 * GET /analytics/recommendations/stored
 * Get stored recommendations
 * Requirements: 11.5
 */
router.get('/recommendations/stored', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.tenantContext;
    const { type, status = 'active', limit = '10' } = req.query;
    
    const recommendations = await performanceHistoryService.getStoredRecommendations(
      tenantId,
      type as string,
      status as string,
      parseInt(limit as string)
    );
    
    res.json({
      success: true,
      recommendations
    });
  } catch (error) {
    console.error('Error getting stored recommendations:', error);
    res.status(500).json({ error: 'Failed to get stored recommendations' });
  }
});

/**
 * PUT /analytics/recommendations/:recommendationId/status
 * Update recommendation status
 * Requirements: 11.5
 */
router.put('/recommendations/:recommendationId/status', async (req: Request, res: Response) => {
  try {
    const { recommendationId } = req.params;
    const { status } = req.body;
    
    if (!['active', 'implemented', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be active, implemented, or dismissed' });
    }
    
    await performanceHistoryService.updateRecommendationStatus(recommendationId, status);
    
    res.json({
      success: true,
      message: 'Recommendation status updated successfully'
    });
  } catch (error) {
    console.error('Error updating recommendation status:', error);
    res.status(500).json({ error: 'Failed to update recommendation status' });
  }
});

export default router;