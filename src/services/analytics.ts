import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';
import {
  EngagementMetrics,
  ContentPerformance,
  PlatformMetrics,
  AnalyticsReport,
  PerformanceRecommendation,
  ContentScore,
  BrandAdherenceMetrics,
  PerformanceHistory,
  AnalyticsQuery,
  MetricsCollectionJob,
  MetricTrend,
  Platform,
  ScoreFactor,
  PerformanceSnapshot,
  PerformanceMilestone
} from '../types';

/**
 * Analytics Service
 * Handles metrics collection, performance tracking, content scoring, and recommendations
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 */
export class AnalyticsService {
  /**
   * Collect metrics from social platforms for published content
   * Requirements: 11.1
   */
  async collectMetricsFromPlatforms(tenantId: string, platforms?: Platform[]): Promise<MetricsCollectionJob> {
    const jobId = uuidv4();
    
    try {
      // Get published content for the tenant
      const contentQuery = `
        SELECT DISTINCT pp.content_id, pp.platform, pp.platform_post_id, pp.post_url, pp.published_at
        FROM public.platform_posts pp
        JOIN public.content c ON pp.content_id = c.id
        WHERE c.tenant_id = $1
          AND pp.status = 'published'
          AND pp.published_at >= NOW() - INTERVAL '30 days'
          ${platforms ? 'AND pp.platform = ANY($2)' : ''}
        ORDER BY pp.published_at DESC
        LIMIT 100
      `;
      
      const params = platforms ? [tenantId, platforms] : [tenantId];
      const contentResult = await db.query(contentQuery, params);
      
      // Create metrics collection job
      await db.query(`
        INSERT INTO public.metrics_collection_jobs (
          id, tenant_id, platforms, content_ids, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        jobId,
        tenantId,
        JSON.stringify(platforms || ['instagram', 'tiktok', 'facebook', 'linkedin']),
        JSON.stringify(contentResult.rows.map(row => row.content_id))
      ]);
      
      // Process metrics collection for each platform
      let metricsCollected = 0;
      for (const content of contentResult.rows) {
        try {
          const metrics = await this.fetchPlatformMetrics(content.platform, content.platform_post_id, tenantId);
          if (metrics) {
            await this.storeContentMetrics(content.content_id, content.platform, metrics);
            metricsCollected++;
          }
        } catch (error) {
          console.error(`Error collecting metrics for content ${content.content_id}:`, error);
        }
      }
      
      // Update job status
      await db.query(`
        UPDATE public.metrics_collection_jobs 
        SET status = 'completed', metrics_collected = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [metricsCollected, jobId]);
      
      return {
        id: jobId,
        tenantId,
        platform: platforms?.[0] || 'instagram',
        contentIds: contentResult.rows.map(row => row.content_id),
        status: 'completed',
        metricsCollected,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
    } catch (error) {
      // Update job status to failed
      await db.query(`
        UPDATE public.metrics_collection_jobs 
        SET status = 'failed', error_message = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [error.message, jobId]);
      
      throw error;
    }
  }
  
  /**
   * Fetch metrics from specific platform APIs
   * This would integrate with actual platform APIs in production
   */
  private async fetchPlatformMetrics(platform: Platform, platformPostId: string, tenantId: string): Promise<EngagementMetrics | null> {
    // In a real implementation, this would call the actual platform APIs
    // For now, we'll simulate metrics collection
    
    // Get platform credentials
    const credentialsResult = await db.query(`
      SELECT credentials FROM public.platform_credentials 
      WHERE tenant_id = $1 AND platform = $2 AND is_active = true
    `, [tenantId, platform]);
    
    if (credentialsResult.rows.length === 0) {
      console.warn(`No active credentials found for platform ${platform} and tenant ${tenantId}`);
      return null;
    }
    
    // Simulate API call with realistic metrics
    const baseMetrics = this.generateRealisticMetrics(platform);
    
    return {
      ...baseMetrics,
      engagementRate: this.calculateEngagementRate(baseMetrics)
    };
  }
  
  /**
   * Generate realistic metrics for simulation
   */
  private generateRealisticMetrics(platform: Platform): Omit<EngagementMetrics, 'engagementRate'> {
    const platformMultipliers = {
      instagram: { views: 1000, likes: 50, comments: 5, shares: 2 },
      tiktok: { views: 5000, likes: 200, comments: 20, shares: 10 },
      facebook: { views: 800, likes: 30, comments: 3, shares: 5 },
      linkedin: { views: 500, likes: 20, comments: 2, shares: 3 }
    };
    
    const multiplier = platformMultipliers[platform];
    const randomFactor = 0.5 + Math.random(); // 0.5 to 1.5
    
    return {
      views: Math.floor(multiplier.views * randomFactor),
      likes: Math.floor(multiplier.likes * randomFactor),
      comments: Math.floor(multiplier.comments * randomFactor),
      shares: Math.floor(multiplier.shares * randomFactor),
      saves: platform === 'instagram' ? Math.floor(multiplier.likes * 0.3 * randomFactor) : undefined,
      clicks: Math.floor(multiplier.likes * 0.1 * randomFactor),
      impressions: Math.floor(multiplier.views * 1.5 * randomFactor),
      reach: Math.floor(multiplier.views * 0.8 * randomFactor),
      ctr: Math.random() * 0.05 // 0-5% CTR
    };
  }
  
  /**
   * Calculate engagement rate from metrics
   */
  private calculateEngagementRate(metrics: Omit<EngagementMetrics, 'engagementRate'>): number {
    const totalEngagement = metrics.likes + metrics.comments + metrics.shares + (metrics.saves || 0);
    const reach = metrics.reach || metrics.views;
    
    if (reach === 0) return 0;
    
    return (totalEngagement / reach) * 100;
  }
  
  /**
   * Store collected metrics in database
   */
  private async storeContentMetrics(contentId: string, platform: Platform, metrics: EngagementMetrics): Promise<void> {
    // Update platform_posts table with new metrics
    await db.query(`
      UPDATE public.platform_posts 
      SET engagement_metrics = $1, last_updated = CURRENT_TIMESTAMP
      WHERE content_id = $2 AND platform = $3
    `, [JSON.stringify(metrics), contentId, platform]);
    
    // Store historical snapshot
    await db.query(`
      INSERT INTO public.content_performance_history (
        id, content_id, platform, metrics, score, timestamp
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    `, [
      uuidv4(),
      contentId,
      platform,
      JSON.stringify(metrics),
      this.calculateContentScore(metrics)
    ]);
  }
  
  /**
   * Calculate content performance score
   * Requirements: 11.3
   */
  calculateContentScore(metrics: EngagementMetrics, brandAdherence?: number): number {
    const factors: ScoreFactor[] = [
      {
        name: 'Engagement Rate',
        weight: 0.4,
        score: Math.min(metrics.engagementRate * 10, 100), // Scale engagement rate
        description: 'How well the content engages the audience',
        impact: 'positive'
      },
      {
        name: 'Reach Efficiency',
        weight: 0.2,
        score: metrics.reach ? Math.min((metrics.reach / (metrics.impressions || metrics.reach)) * 100, 100) : 50,
        description: 'How efficiently the content reaches unique users',
        impact: 'positive'
      },
      {
        name: 'Interaction Quality',
        weight: 0.2,
        score: Math.min(((metrics.comments + metrics.shares) / Math.max(metrics.likes, 1)) * 50, 100),
        description: 'Quality of interactions (comments and shares vs likes)',
        impact: 'positive'
      },
      {
        name: 'Click-through Rate',
        weight: 0.1,
        score: metrics.ctr ? Math.min(metrics.ctr * 2000, 100) : 0, // Scale CTR
        description: 'How well the content drives traffic',
        impact: 'positive'
      },
      {
        name: 'Brand Adherence',
        weight: 0.1,
        score: brandAdherence || 75, // Default if not provided
        description: 'How well the content follows brand guidelines',
        impact: 'positive'
      }
    ];
    
    // Calculate weighted score
    const totalScore = factors.reduce((sum, factor) => sum + (factor.score * factor.weight), 0);
    
    return Math.round(Math.min(Math.max(totalScore, 0), 100));
  }
  
  /**
   * Calculate brand adherence score for content
   * Requirements: 11.3
   */
  async calculateBrandAdherence(contentId: string, tenantId: string): Promise<BrandAdherenceMetrics> {
    // Get content details
    const contentResult = await db.query(`
      SELECT c.*, b.fields as briefing_fields
      FROM public.content c
      JOIN public.briefings b ON c.briefing_id = b.id
      WHERE c.id = $1 AND c.tenant_id = $2
    `, [contentId, tenantId]);
    
    if (contentResult.rows.length === 0) {
      throw new Error('Content not found');
    }
    
    const content = contentResult.rows[0];
    
    // Get brand voice guidelines
    const brandVoiceResult = await db.query(`
      SELECT * FROM public.brand_voice_guidelines 
      WHERE tenant_id = $1 AND is_active = true
    `, [tenantId]);
    
    // Get applicable best practices
    const bestPracticesResult = await db.query(`
      SELECT * FROM public.best_practices 
      WHERE (tenant_id = $1 OR tenant_id IS NULL) 
        AND content_type = $2
      ORDER BY priority DESC, is_custom DESC
    `, [tenantId, content.content_type]);
    
    // Calculate adherence scores
    const voiceConsistency = this.calculateVoiceConsistency(content, brandVoiceResult.rows);
    const visualConsistency = this.calculateVisualConsistency(content, tenantId);
    const messageAlignment = this.calculateMessageAlignment(content, brandVoiceResult.rows);
    const bestPracticesFollowed = this.checkBestPracticesAdherence(content, bestPracticesResult.rows);
    
    const overallScore = Math.round(
      (voiceConsistency * 0.4) + 
      (visualConsistency * 0.3) + 
      (messageAlignment * 0.3)
    );
    
    const adherenceMetrics: BrandAdherenceMetrics = {
      contentId,
      voiceConsistency,
      visualConsistency,
      messageAlignment,
      bestPracticesFollowed: bestPracticesFollowed.followed,
      violations: bestPracticesFollowed.violations,
      overallScore,
      calculatedAt: new Date()
    };
    
    // Store brand adherence metrics
    await db.query(`
      INSERT INTO public.brand_adherence_metrics (
        id, content_id, voice_consistency, visual_consistency, message_alignment,
        best_practices_followed, violations, overall_score, calculated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      ON CONFLICT (content_id) DO UPDATE SET
        voice_consistency = EXCLUDED.voice_consistency,
        visual_consistency = EXCLUDED.visual_consistency,
        message_alignment = EXCLUDED.message_alignment,
        best_practices_followed = EXCLUDED.best_practices_followed,
        violations = EXCLUDED.violations,
        overall_score = EXCLUDED.overall_score,
        calculated_at = EXCLUDED.calculated_at
    `, [
      uuidv4(),
      contentId,
      voiceConsistency,
      visualConsistency,
      messageAlignment,
      JSON.stringify(bestPracticesFollowed.followed),
      JSON.stringify(bestPracticesFollowed.violations),
      overallScore
    ]);
    
    return adherenceMetrics;
  }
  
  /**
   * Calculate voice consistency score
   */
  private calculateVoiceConsistency(content: any, brandVoiceGuidelines: any[]): number {
    if (brandVoiceGuidelines.length === 0) return 75; // Default score if no guidelines
    
    // Simulate voice consistency analysis
    // In a real implementation, this would use NLP to analyze tone, style, etc.
    const baseScore = 70 + Math.random() * 25; // 70-95 range
    
    return Math.round(baseScore);
  }
  
  /**
   * Calculate visual consistency score
   */
  private calculateVisualConsistency(content: any, tenantId: string): number {
    // Simulate visual consistency analysis
    // In a real implementation, this would analyze colors, fonts, layout, etc.
    const baseScore = 75 + Math.random() * 20; // 75-95 range
    
    return Math.round(baseScore);
  }
  
  /**
   * Calculate message alignment score
   */
  private calculateMessageAlignment(content: any, brandVoiceGuidelines: any[]): number {
    // Simulate message alignment analysis
    // In a real implementation, this would check against brand messaging guidelines
    const baseScore = 80 + Math.random() * 15; // 80-95 range
    
    return Math.round(baseScore);
  }
  
  /**
   * Check best practices adherence
   */
  private checkBestPracticesAdherence(content: any, bestPractices: any[]): { followed: string[], violations: string[] } {
    const followed: string[] = [];
    const violations: string[] = [];
    
    // Simulate best practices checking
    bestPractices.forEach(practice => {
      const adherenceScore = Math.random();
      if (adherenceScore > 0.7) {
        followed.push(practice.name);
      } else if (adherenceScore < 0.3) {
        violations.push(practice.name);
      }
    });
    
    return { followed, violations };
  }
  
  /**
   * Generate comprehensive analytics report
   * Requirements: 11.4, 11.5
   */
  async generateAnalyticsReport(query: AnalyticsQuery): Promise<AnalyticsReport> {
    const { tenantId, clientId, platforms, contentTypes, dateRange, groupBy } = query;
    
    // Get content performance data
    const performanceData = await this.getContentPerformance(query);
    
    // Calculate overview metrics
    const overview = this.calculateOverviewMetrics(performanceData);
    
    // Get platform breakdown
    const platformBreakdown = await this.getPlatformBreakdown(query);
    
    // Generate recommendations
    const recommendations = await this.generateRecommendations(tenantId, performanceData, platformBreakdown);
    
    // Get trends data
    const trends = await this.getTrends(query);
    
    const report: AnalyticsReport = {
      tenantId,
      clientId,
      period: dateRange,
      overview,
      platformBreakdown,
      contentPerformance: performanceData,
      recommendations,
      trends,
      generatedAt: new Date()
    };
    
    // Store report for future reference
    await this.storeAnalyticsReport(report);
    
    return report;
  }
  
  /**
   * Get content performance data
   */
  private async getContentPerformance(query: AnalyticsQuery): Promise<ContentPerformance[]> {
    const { tenantId, clientId, platforms, contentTypes, dateRange, limit = 50 } = query;
    
    let sql = `
      SELECT 
        c.id as content_id,
        pp.platform,
        pp.platform_post_id,
        pp.published_at,
        pp.engagement_metrics,
        COALESCE(bam.overall_score, 75) as brand_adherence_score,
        pp.last_updated
      FROM public.content c
      JOIN public.platform_posts pp ON c.id = pp.content_id
      LEFT JOIN public.brand_adherence_metrics bam ON c.id = bam.content_id
      WHERE c.tenant_id = $1
        AND pp.status = 'published'
        AND pp.published_at BETWEEN $2 AND $3
    `;
    
    const params: any[] = [tenantId, dateRange.start, dateRange.end];
    let paramIndex = 4;
    
    if (clientId) {
      sql += ` AND c.client_id = $${paramIndex}`;
      params.push(clientId);
      paramIndex++;
    }
    
    if (platforms && platforms.length > 0) {
      sql += ` AND pp.platform = ANY($${paramIndex})`;
      params.push(platforms);
      paramIndex++;
    }
    
    if (contentTypes && contentTypes.length > 0) {
      sql += ` AND c.content_type = ANY($${paramIndex})`;
      params.push(contentTypes);
      paramIndex++;
    }
    
    sql += ` ORDER BY pp.published_at DESC LIMIT $${paramIndex}`;
    params.push(limit);
    
    const result = await db.query(sql, params);
    
    return result.rows.map(row => ({
      contentId: row.content_id,
      platform: row.platform,
      platformPostId: row.platform_post_id,
      publishedAt: row.published_at,
      metrics: row.engagement_metrics || {},
      score: this.calculateContentScore(row.engagement_metrics || {}, row.brand_adherence_score),
      brandAdherenceScore: row.brand_adherence_score,
      lastUpdated: row.last_updated
    }));
  }
  
  /**
   * Calculate overview metrics
   */
  private calculateOverviewMetrics(performanceData: ContentPerformance[]) {
    if (performanceData.length === 0) {
      return {
        totalPosts: 0,
        totalEngagement: 0,
        averageScore: 0,
        averageBrandAdherence: 0,
        topPlatform: 'instagram' as Platform
      };
    }
    
    const totalPosts = performanceData.length;
    const totalEngagement = performanceData.reduce((sum, content) => {
      const metrics = content.metrics;
      return sum + metrics.likes + metrics.comments + metrics.shares + (metrics.saves || 0);
    }, 0);
    
    const averageScore = performanceData.reduce((sum, content) => sum + content.score, 0) / totalPosts;
    const averageBrandAdherence = performanceData.reduce((sum, content) => sum + content.brandAdherenceScore, 0) / totalPosts;
    
    // Find top performing platform
    const platformEngagement: Record<Platform, number> = {
      instagram: 0,
      tiktok: 0,
      facebook: 0,
      linkedin: 0
    };
    
    performanceData.forEach(content => {
      const engagement = content.metrics.likes + content.metrics.comments + content.metrics.shares + (content.metrics.saves || 0);
      platformEngagement[content.platform] += engagement;
    });
    
    const topPlatform = Object.entries(platformEngagement)
      .sort(([,a], [,b]) => b - a)[0][0] as Platform;
    
    return {
      totalPosts,
      totalEngagement,
      averageScore: Math.round(averageScore),
      averageBrandAdherence: Math.round(averageBrandAdherence),
      topPlatform
    };
  }
  
  /**
   * Get platform breakdown metrics
   */
  private async getPlatformBreakdown(query: AnalyticsQuery): Promise<PlatformMetrics[]> {
    const performanceData = await this.getContentPerformance(query);
    const platformData: Record<Platform, ContentPerformance[]> = {
      instagram: [],
      tiktok: [],
      facebook: [],
      linkedin: []
    };
    
    // Group by platform
    performanceData.forEach(content => {
      platformData[content.platform].push(content);
    });
    
    // Calculate metrics for each platform
    const platformMetrics: PlatformMetrics[] = [];
    
    for (const [platform, contents] of Object.entries(platformData)) {
      if (contents.length === 0) continue;
      
      const totalPosts = contents.length;
      const totalEngagement = contents.reduce((sum, content) => {
        const metrics = content.metrics;
        return sum + metrics.likes + metrics.comments + metrics.shares + (metrics.saves || 0);
      }, 0);
      
      const averageEngagementRate = contents.reduce((sum, content) => sum + content.metrics.engagementRate, 0) / totalPosts;
      
      const topPerformingContent = contents
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      
      // Generate engagement trends (simplified)
      const engagementTrends: MetricTrend[] = this.generateTrends(contents, 'engagement');
      
      // Get optimal posting times for this platform
      const optimalTimes = await this.getOptimalPostingTimes(platform, query.tenantId);
      
      platformMetrics.push({
        platform: platform as Platform,
        totalPosts,
        totalEngagement,
        averageEngagementRate,
        topPerformingContent,
        engagementTrends,
        optimalPostingTimes
      });
    }
    
    return platformMetrics;
  }
  
  /**
   * Generate performance trends
   */
  private generateTrends(contents: ContentPerformance[], metric: string): MetricTrend[] {
    // Group content by day and calculate daily averages
    const dailyData: Record<string, { total: number, count: number }> = {};
    
    contents.forEach(content => {
      const date = content.publishedAt.toISOString().split('T')[0];
      if (!dailyData[date]) {
        dailyData[date] = { total: 0, count: 0 };
      }
      
      let value = 0;
      if (metric === 'engagement') {
        value = content.metrics.likes + content.metrics.comments + content.metrics.shares + (content.metrics.saves || 0);
      }
      
      dailyData[date].total += value;
      dailyData[date].count += 1;
    });
    
    // Convert to trends with change percentages
    const trends: MetricTrend[] = [];
    const sortedDates = Object.keys(dailyData).sort();
    
    sortedDates.forEach((date, index) => {
      const data = dailyData[date];
      const value = data.total / data.count;
      
      let changePercent: number | undefined;
      if (index > 0) {
        const previousDate = sortedDates[index - 1];
        const previousValue = dailyData[previousDate].total / dailyData[previousDate].count;
        changePercent = ((value - previousValue) / previousValue) * 100;
      }
      
      trends.push({
        date: new Date(date),
        value,
        metric,
        changePercent
      });
    });
    
    return trends;
  }
  
  /**
   * Get optimal posting times for platform
   */
  private async getOptimalPostingTimes(platform: Platform, tenantId: string): Promise<OptimalPostingTime[]> {
    const result = await db.query(`
      SELECT optimal_times FROM public.platform_scheduling_rules 
      WHERE platform = $1 AND tenant_id = $2 AND is_active = true
    `, [platform, tenantId]);
    
    if (result.rows.length > 0) {
      return result.rows[0].optimal_times || [];
    }
    
    return [];
  }
  
  /**
   * Generate performance recommendations
   * Requirements: 11.5
   */
  private async generateRecommendations(
    tenantId: string, 
    performanceData: ContentPerformance[], 
    platformBreakdown: PlatformMetrics[]
  ): Promise<PerformanceRecommendation[]> {
    const recommendations: PerformanceRecommendation[] = [];
    
    // Analyze posting time optimization
    const postingTimeRec = this.analyzePostingTimes(performanceData);
    if (postingTimeRec) recommendations.push(postingTimeRec);
    
    // Analyze content type performance
    const contentTypeRec = this.analyzeContentTypes(performanceData);
    if (contentTypeRec) recommendations.push(contentTypeRec);
    
    // Analyze platform focus
    const platformFocusRec = this.analyzePlatformFocus(platformBreakdown);
    if (platformFocusRec) recommendations.push(platformFocusRec);
    
    // Analyze engagement strategies
    const engagementRec = this.analyzeEngagementStrategies(performanceData);
    if (engagementRec) recommendations.push(engagementRec);
    
    // Analyze brand adherence
    const brandRec = this.analyzeBrandAdherence(performanceData);
    if (brandRec) recommendations.push(brandRec);
    
    return recommendations;
  }
  
  /**
   * Analyze posting times for recommendations
   */
  private analyzePostingTimes(performanceData: ContentPerformance[]): PerformanceRecommendation | null {
    if (performanceData.length < 10) return null;
    
    // Group by hour and calculate average performance
    const hourlyPerformance: Record<number, { total: number, count: number }> = {};
    
    performanceData.forEach(content => {
      const hour = content.publishedAt.getHours();
      if (!hourlyPerformance[hour]) {
        hourlyPerformance[hour] = { total: 0, count: 0 };
      }
      hourlyPerformance[hour].total += content.score;
      hourlyPerformance[hour].count += 1;
    });
    
    // Find best performing hours
    const hourlyAverages = Object.entries(hourlyPerformance)
      .map(([hour, data]) => ({
        hour: parseInt(hour),
        average: data.total / data.count,
        count: data.count
      }))
      .filter(item => item.count >= 2) // Only consider hours with at least 2 posts
      .sort((a, b) => b.average - a.average);
    
    if (hourlyAverages.length < 2) return null;
    
    const bestHours = hourlyAverages.slice(0, 3).map(item => item.hour);
    const overallAverage = performanceData.reduce((sum, content) => sum + content.score, 0) / performanceData.length;
    const bestAverage = hourlyAverages[0].average;
    
    if (bestAverage > overallAverage * 1.1) { // At least 10% better
      return {
        id: uuidv4(),
        type: 'posting_time',
        title: 'Optimize Posting Times',
        description: `Your content performs ${Math.round(((bestAverage - overallAverage) / overallAverage) * 100)}% better when posted at ${bestHours.join(', ')}:00. Consider scheduling more content during these peak hours.`,
        impact: 'high',
        confidence: Math.min(90, 60 + (hourlyAverages[0].count * 5)),
        data: { bestHours, improvement: ((bestAverage - overallAverage) / overallAverage) * 100 },
        actionable: true,
        createdAt: new Date()
      };
    }
    
    return null;
  }
  
  /**
   * Analyze content types for recommendations
   */
  private analyzeContentTypes(performanceData: ContentPerformance[]): PerformanceRecommendation | null {
    // This would analyze different content types and their performance
    // For now, return a generic recommendation
    return {
      id: uuidv4(),
      type: 'content_type',
      title: 'Diversify Content Types',
      description: 'Consider experimenting with different content formats to maximize engagement across your audience.',
      impact: 'medium',
      confidence: 70,
      data: {},
      actionable: true,
      createdAt: new Date()
    };
  }
  
  /**
   * Analyze platform focus for recommendations
   */
  private analyzePlatformFocus(platformBreakdown: PlatformMetrics[]): PerformanceRecommendation | null {
    if (platformBreakdown.length < 2) return null;
    
    const sortedPlatforms = platformBreakdown.sort((a, b) => b.averageEngagementRate - a.averageEngagementRate);
    const topPlatform = sortedPlatforms[0];
    const secondPlatform = sortedPlatforms[1];
    
    if (topPlatform.averageEngagementRate > secondPlatform.averageEngagementRate * 1.5) {
      return {
        id: uuidv4(),
        type: 'platform_focus',
        title: `Focus More on ${topPlatform.platform}`,
        description: `Your ${topPlatform.platform} content has ${Math.round(((topPlatform.averageEngagementRate - secondPlatform.averageEngagementRate) / secondPlatform.averageEngagementRate) * 100)}% higher engagement rate. Consider allocating more resources to this platform.`,
        impact: 'high',
        confidence: 85,
        data: { 
          topPlatform: topPlatform.platform, 
          engagementDifference: topPlatform.averageEngagementRate - secondPlatform.averageEngagementRate 
        },
        actionable: true,
        createdAt: new Date()
      };
    }
    
    return null;
  }
  
  /**
   * Analyze engagement strategies for recommendations
   */
  private analyzeEngagementStrategies(performanceData: ContentPerformance[]): PerformanceRecommendation | null {
    const highEngagementContent = performanceData.filter(content => content.metrics.engagementRate > 5);
    
    if (highEngagementContent.length > 0) {
      return {
        id: uuidv4(),
        type: 'engagement_strategy',
        title: 'Replicate High-Engagement Patterns',
        description: `${highEngagementContent.length} of your posts achieved above 5% engagement rate. Analyze these posts to identify successful patterns and replicate them.`,
        impact: 'medium',
        confidence: 75,
        data: { highEngagementCount: highEngagementContent.length },
        actionable: true,
        createdAt: new Date()
      };
    }
    
    return null;
  }
  
  /**
   * Analyze brand adherence for recommendations
   */
  private analyzeBrandAdherence(performanceData: ContentPerformance[]): PerformanceRecommendation | null {
    const averageBrandScore = performanceData.reduce((sum, content) => sum + content.brandAdherenceScore, 0) / performanceData.length;
    
    if (averageBrandScore < 80) {
      return {
        id: uuidv4(),
        type: 'brand_adherence',
        title: 'Improve Brand Consistency',
        description: `Your average brand adherence score is ${Math.round(averageBrandScore)}%. Focus on following brand guidelines more closely to improve consistency.`,
        impact: 'medium',
        confidence: 80,
        data: { currentScore: averageBrandScore, targetScore: 85 },
        actionable: true,
        createdAt: new Date()
      };
    }
    
    return null;
  }
  
  /**
   * Get trends data for analytics query
   */
  private async getTrends(query: AnalyticsQuery): Promise<MetricTrend[]> {
    const performanceData = await this.getContentPerformance(query);
    return this.generateTrends(performanceData, 'engagement');
  }
  
  /**
   * Store analytics report for future reference
   */
  private async storeAnalyticsReport(report: AnalyticsReport): Promise<void> {
    await db.query(`
      INSERT INTO public.analytics_reports (
        id, tenant_id, client_id, period_start, period_end, 
        report_data, generated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
    `, [
      uuidv4(),
      report.tenantId,
      report.clientId,
      report.period.start,
      report.period.end,
      JSON.stringify(report)
    ]);
  }
  
  /**
   * Get performance history for specific content
   * Requirements: 11.4
   */
  async getPerformanceHistory(contentId: string, platform: Platform): Promise<PerformanceHistory> {
    const snapshotsResult = await db.query(`
      SELECT timestamp, metrics, score
      FROM public.content_performance_history
      WHERE content_id = $1 AND platform = $2
      ORDER BY timestamp ASC
    `, [contentId, platform]);
    
    const snapshots: PerformanceSnapshot[] = snapshotsResult.rows.map(row => ({
      timestamp: row.timestamp,
      metrics: row.metrics,
      score: row.score
    }));
    
    // Generate trends from snapshots
    const engagementTrend = snapshots.map(snapshot => ({
      date: snapshot.timestamp,
      value: snapshot.metrics.likes + snapshot.metrics.comments + snapshot.metrics.shares + (snapshot.metrics.saves || 0),
      metric: 'engagement'
    }));
    
    const reachTrend = snapshots.map(snapshot => ({
      date: snapshot.timestamp,
      value: snapshot.metrics.reach || snapshot.metrics.views,
      metric: 'reach'
    }));
    
    const impressionsTrend = snapshots.map(snapshot => ({
      date: snapshot.timestamp,
      value: snapshot.metrics.impressions || snapshot.metrics.views,
      metric: 'impressions'
    }));
    
    // Identify milestones (simplified)
    const milestones: PerformanceMilestone[] = [];
    snapshots.forEach(snapshot => {
      const totalEngagement = snapshot.metrics.likes + snapshot.metrics.comments + snapshot.metrics.shares + (snapshot.metrics.saves || 0);
      
      if (totalEngagement > 1000) {
        milestones.push({
          timestamp: snapshot.timestamp,
          type: 'high_engagement',
          description: 'Achieved high engagement (1000+ interactions)',
          metrics: snapshot.metrics
        });
      }
      
      if (snapshot.metrics.engagementRate > 10) {
        milestones.push({
          timestamp: snapshot.timestamp,
          type: 'viral',
          description: 'Achieved viral engagement rate (>10%)',
          metrics: snapshot.metrics
        });
      }
    });
    
    return {
      contentId,
      platform,
      snapshots,
      trends: {
        engagement: engagementTrend,
        reach: reachTrend,
        impressions: impressionsTrend
      },
      milestones
    };
  }
}