import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';
import {
  PerformanceHistory,
  PerformanceSnapshot,
  PerformanceMilestone,
  PerformanceRecommendation,
  Platform,
  EngagementMetrics,
  MetricTrend,
  AnalyticsQuery
} from '../types';

/**
 * Performance History Service
 * Manages publication history with performance data and automated recommendations
 * Requirements: 11.4, 11.5
 */
export class PerformanceHistoryService {
  /**
   * Record performance snapshot for content
   * Requirements: 11.4
   */
  async recordPerformanceSnapshot(
    contentId: string,
    platform: Platform,
    metrics: EngagementMetrics,
    score: number,
    rankingPosition?: number
  ): Promise<void> {
    await db.query(`
      INSERT INTO public.content_performance_history (
        id, content_id, platform, metrics, score, ranking_position, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
    `, [
      uuidv4(),
      contentId,
      platform,
      JSON.stringify(metrics),
      score,
      rankingPosition
    ]);
  }
  
  /**
   * Get complete performance history for content
   * Requirements: 11.4
   */
  async getContentPerformanceHistory(contentId: string, platform?: Platform): Promise<PerformanceHistory[]> {
    let sql = `
      SELECT 
        content_id,
        platform,
        timestamp,
        metrics,
        score,
        ranking_position
      FROM public.content_performance_history
      WHERE content_id = $1
    `;
    
    const params: any[] = [contentId];
    
    if (platform) {
      sql += ` AND platform = $2`;
      params.push(platform);
    }
    
    sql += ` ORDER BY platform, timestamp ASC`;
    
    const result = await db.query(sql, params);
    
    // Group by platform
    const platformData: Record<Platform, PerformanceSnapshot[]> = {
      instagram: [],
      tiktok: [],
      facebook: [],
      linkedin: []
    };
    
    result.rows.forEach(row => {
      platformData[row.platform as Platform].push({
        timestamp: row.timestamp,
        metrics: row.metrics,
        score: row.score,
        rankingPosition: row.ranking_position
      });
    });
    
    // Build performance history for each platform
    const histories: PerformanceHistory[] = [];
    
    for (const [platformKey, snapshots] of Object.entries(platformData)) {
      if (snapshots.length === 0) continue;
      
      const platformEnum = platformKey as Platform;
      
      // Generate trends
      const engagementTrend = this.generateMetricTrend(snapshots, 'engagement');
      const reachTrend = this.generateMetricTrend(snapshots, 'reach');
      const impressionsTrend = this.generateMetricTrend(snapshots, 'impressions');
      
      // Identify milestones
      const milestones = this.identifyMilestones(snapshots);
      
      histories.push({
        contentId,
        platform: platformEnum,
        snapshots,
        trends: {
          engagement: engagementTrend,
          reach: reachTrend,
          impressions: impressionsTrend
        },
        milestones
      });
    }
    
    return histories;
  }
  
  /**
   * Generate metric trend from snapshots
   */
  private generateMetricTrend(snapshots: PerformanceSnapshot[], metricType: string): MetricTrend[] {
    return snapshots.map((snapshot, index) => {
      let value = 0;
      
      switch (metricType) {
        case 'engagement':
          value = snapshot.metrics.likes + snapshot.metrics.comments + 
                 snapshot.metrics.shares + (snapshot.metrics.saves || 0);
          break;
        case 'reach':
          value = snapshot.metrics.reach || snapshot.metrics.views;
          break;
        case 'impressions':
          value = snapshot.metrics.impressions || snapshot.metrics.views;
          break;
      }
      
      let changePercent: number | undefined;
      if (index > 0) {
        const previousSnapshot = snapshots[index - 1];
        let previousValue = 0;
        
        switch (metricType) {
          case 'engagement':
            previousValue = previousSnapshot.metrics.likes + previousSnapshot.metrics.comments + 
                           previousSnapshot.metrics.shares + (previousSnapshot.metrics.saves || 0);
            break;
          case 'reach':
            previousValue = previousSnapshot.metrics.reach || previousSnapshot.metrics.views;
            break;
          case 'impressions':
            previousValue = previousSnapshot.metrics.impressions || previousSnapshot.metrics.views;
            break;
        }
        
        if (previousValue > 0) {
          changePercent = ((value - previousValue) / previousValue) * 100;
        }
      }
      
      return {
        date: snapshot.timestamp,
        value,
        metric: metricType,
        changePercent
      };
    });
  }
  
  /**
   * Identify performance milestones
   */
  private identifyMilestones(snapshots: PerformanceSnapshot[]): PerformanceMilestone[] {
    const milestones: PerformanceMilestone[] = [];
    
    snapshots.forEach(snapshot => {
      const totalEngagement = snapshot.metrics.likes + snapshot.metrics.comments + 
                             snapshot.metrics.shares + (snapshot.metrics.saves || 0);
      
      // High engagement milestone
      if (totalEngagement >= 1000) {
        milestones.push({
          timestamp: snapshot.timestamp,
          type: 'high_engagement',
          description: `Achieved high engagement with ${totalEngagement.toLocaleString()} total interactions`,
          metrics: snapshot.metrics
        });
      }
      
      // Viral content milestone (high engagement rate)
      if (snapshot.metrics.engagementRate >= 10) {
        milestones.push({
          timestamp: snapshot.timestamp,
          type: 'viral',
          description: `Achieved viral engagement rate of ${snapshot.metrics.engagementRate.toFixed(2)}%`,
          metrics: snapshot.metrics
        });
      }
      
      // Trending milestone (high reach relative to followers)
      if (snapshot.metrics.reach && snapshot.metrics.reach >= 10000) {
        milestones.push({
          timestamp: snapshot.timestamp,
          type: 'trending',
          description: `Reached ${snapshot.metrics.reach.toLocaleString()} users`,
          metrics: snapshot.metrics
        });
      }
      
      // Score milestone
      if (snapshot.score >= 90) {
        milestones.push({
          timestamp: snapshot.timestamp,
          type: 'milestone_reached',
          description: `Achieved excellent performance score of ${snapshot.score}`,
          metrics: snapshot.metrics
        });
      }
    });
    
    return milestones;
  }
  
  /**
   * Get publication history with performance data for tenant
   * Requirements: 11.4
   */
  async getPublicationHistory(
    tenantId: string,
    clientId?: string,
    platforms?: Platform[],
    startDate?: Date,
    endDate?: Date,
    limit: number = 50
  ): Promise<{
    publications: any[],
    summary: {
      totalPublications: number,
      averageScore: number,
      topPerformingPlatform: Platform,
      engagementTrend: MetricTrend[]
    }
  }> {
    let sql = `
      SELECT 
        c.id as content_id,
        c.title,
        c.content_type,
        pp.platform,
        pp.platform_post_id,
        pp.post_url,
        pp.published_at,
        pp.engagement_metrics,
        pp.status,
        COALESCE(
          (SELECT score FROM public.content_performance_history cph 
           WHERE cph.content_id = c.id AND cph.platform = pp.platform 
           ORDER BY cph.timestamp DESC LIMIT 1), 
          0
        ) as latest_score,
        COALESCE(bam.overall_score, 75) as brand_adherence_score
      FROM public.content c
      JOIN public.platform_posts pp ON c.id = pp.content_id
      LEFT JOIN public.brand_adherence_metrics bam ON c.id = bam.content_id
      WHERE c.tenant_id = $1
        AND pp.status = 'published'
    `;
    
    const params: any[] = [tenantId];
    let paramIndex = 2;
    
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
    
    if (startDate) {
      sql += ` AND pp.published_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      sql += ` AND pp.published_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    sql += ` ORDER BY pp.published_at DESC LIMIT $${paramIndex}`;
    params.push(limit);
    
    const result = await db.query(sql, params);
    
    const publications = result.rows.map(row => ({
      contentId: row.content_id,
      title: row.title,
      contentType: row.content_type,
      platform: row.platform,
      platformPostId: row.platform_post_id,
      postUrl: row.post_url,
      publishedAt: row.published_at,
      metrics: row.engagement_metrics || {},
      status: row.status,
      score: row.latest_score,
      brandAdherenceScore: row.brand_adherence_score
    }));
    
    // Calculate summary
    const summary = this.calculatePublicationSummary(publications);
    
    return {
      publications,
      summary
    };
  }
  
  /**
   * Calculate publication summary statistics
   */
  private calculatePublicationSummary(publications: any[]): {
    totalPublications: number,
    averageScore: number,
    topPerformingPlatform: Platform,
    engagementTrend: MetricTrend[]
  } {
    if (publications.length === 0) {
      return {
        totalPublications: 0,
        averageScore: 0,
        topPerformingPlatform: 'instagram',
        engagementTrend: []
      };
    }
    
    const totalPublications = publications.length;
    const averageScore = publications.reduce((sum, pub) => sum + pub.score, 0) / totalPublications;
    
    // Find top performing platform by average engagement
    const platformEngagement: Record<Platform, { total: number, count: number }> = {
      instagram: { total: 0, count: 0 },
      tiktok: { total: 0, count: 0 },
      facebook: { total: 0, count: 0 },
      linkedin: { total: 0, count: 0 }
    };
    
    publications.forEach(pub => {
      const engagement = pub.metrics.likes + pub.metrics.comments + pub.metrics.shares + (pub.metrics.saves || 0);
      platformEngagement[pub.platform as Platform].total += engagement;
      platformEngagement[pub.platform as Platform].count += 1;
    });
    
    let topPerformingPlatform: Platform = 'instagram';
    let highestAverage = 0;
    
    Object.entries(platformEngagement).forEach(([platform, data]) => {
      if (data.count > 0) {
        const average = data.total / data.count;
        if (average > highestAverage) {
          highestAverage = average;
          topPerformingPlatform = platform as Platform;
        }
      }
    });
    
    // Generate engagement trend (group by day)
    const dailyEngagement: Record<string, { total: number, count: number }> = {};
    
    publications.forEach(pub => {
      const date = new Date(pub.publishedAt).toISOString().split('T')[0];
      if (!dailyEngagement[date]) {
        dailyEngagement[date] = { total: 0, count: 0 };
      }
      
      const engagement = pub.metrics.likes + pub.metrics.comments + pub.metrics.shares + (pub.metrics.saves || 0);
      dailyEngagement[date].total += engagement;
      dailyEngagement[date].count += 1;
    });
    
    const engagementTrend: MetricTrend[] = Object.entries(dailyEngagement)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data], index, array) => {
        const value = data.total / data.count;
        let changePercent: number | undefined;
        
        if (index > 0) {
          const previousValue = array[index - 1][1].total / array[index - 1][1].count;
          changePercent = ((value - previousValue) / previousValue) * 100;
        }
        
        return {
          date: new Date(date),
          value,
          metric: 'engagement',
          changePercent
        };
      });
    
    return {
      totalPublications,
      averageScore: Math.round(averageScore),
      topPerformingPlatform,
      engagementTrend
    };
  }
  
  /**
   * Generate automated strategy adjustment recommendations
   * Requirements: 11.5
   */
  async generateStrategyRecommendations(
    tenantId: string,
    clientId?: string,
    analysisWindow: number = 30 // days
  ): Promise<PerformanceRecommendation[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - analysisWindow);
    
    // Get publication history
    const { publications } = await this.getPublicationHistory(
      tenantId,
      clientId,
      undefined,
      startDate,
      endDate,
      100
    );
    
    if (publications.length < 10) {
      return [{
        id: uuidv4(),
        type: 'engagement_strategy',
        title: 'Increase Publishing Frequency',
        description: 'You have published fewer than 10 posts in the last 30 days. Consider increasing your publishing frequency to build audience engagement.',
        impact: 'medium',
        confidence: 80,
        data: { currentPublications: publications.length, recommendedMinimum: 15 },
        actionable: true,
        createdAt: new Date()
      }];
    }
    
    const recommendations: PerformanceRecommendation[] = [];
    
    // Analyze posting time patterns
    const postingTimeRec = this.analyzePostingTimePatterns(publications);
    if (postingTimeRec) recommendations.push(postingTimeRec);
    
    // Analyze content type performance
    const contentTypeRec = this.analyzeContentTypePerformance(publications);
    if (contentTypeRec) recommendations.push(contentTypeRec);
    
    // Analyze platform performance
    const platformRec = this.analyzePlatformPerformance(publications);
    if (platformRec) recommendations.push(platformRec);
    
    // Analyze engagement patterns
    const engagementRec = this.analyzeEngagementPatterns(publications);
    if (engagementRec) recommendations.push(engagementRec);
    
    // Analyze consistency patterns
    const consistencyRec = this.analyzeConsistencyPatterns(publications);
    if (consistencyRec) recommendations.push(consistencyRec);
    
    // Store recommendations in database
    for (const rec of recommendations) {
      await this.storeRecommendation(rec, tenantId);
    }
    
    return recommendations;
  }
  
  /**
   * Analyze posting time patterns for recommendations
   */
  private analyzePostingTimePatterns(publications: any[]): PerformanceRecommendation | null {
    // Group by hour and day of week
    const hourlyPerformance: Record<number, { scores: number[], count: number }> = {};
    const dailyPerformance: Record<number, { scores: number[], count: number }> = {};
    
    publications.forEach(pub => {
      const publishedAt = new Date(pub.publishedAt);
      const hour = publishedAt.getHours();
      const dayOfWeek = publishedAt.getDay();
      
      if (!hourlyPerformance[hour]) {
        hourlyPerformance[hour] = { scores: [], count: 0 };
      }
      if (!dailyPerformance[dayOfWeek]) {
        dailyPerformance[dayOfWeek] = { scores: [], count: 0 };
      }
      
      hourlyPerformance[hour].scores.push(pub.score);
      hourlyPerformance[hour].count += 1;
      
      dailyPerformance[dayOfWeek].scores.push(pub.score);
      dailyPerformance[dayOfWeek].count += 1;
    });
    
    // Find best performing hours (with at least 3 posts)
    const bestHours = Object.entries(hourlyPerformance)
      .filter(([, data]) => data.count >= 3)
      .map(([hour, data]) => ({
        hour: parseInt(hour),
        averageScore: data.scores.reduce((sum, score) => sum + score, 0) / data.count,
        count: data.count
      }))
      .sort((a, b) => b.averageScore - a.averageScore)
      .slice(0, 3);
    
    if (bestHours.length > 0) {
      const overallAverage = publications.reduce((sum, pub) => sum + pub.score, 0) / publications.length;
      const bestAverage = bestHours[0].averageScore;
      
      if (bestAverage > overallAverage * 1.15) { // 15% better
        return {
          id: uuidv4(),
          type: 'posting_time',
          title: 'Optimize Posting Schedule',
          description: `Your content performs ${Math.round(((bestAverage - overallAverage) / overallAverage) * 100)}% better when posted at ${bestHours.map(h => `${h.hour}:00`).join(', ')}. Consider scheduling more content during these peak hours.`,
          impact: 'high',
          confidence: Math.min(90, 60 + (bestHours[0].count * 3)),
          data: { 
            bestHours: bestHours.map(h => h.hour), 
            improvement: ((bestAverage - overallAverage) / overallAverage) * 100,
            sampleSize: bestHours[0].count
          },
          actionable: true,
          createdAt: new Date()
        };
      }
    }
    
    return null;
  }
  
  /**
   * Analyze content type performance
   */
  private analyzeContentTypePerformance(publications: any[]): PerformanceRecommendation | null {
    const contentTypePerformance: Record<string, { scores: number[], count: number }> = {};
    
    publications.forEach(pub => {
      if (!contentTypePerformance[pub.contentType]) {
        contentTypePerformance[pub.contentType] = { scores: [], count: 0 };
      }
      
      contentTypePerformance[pub.contentType].scores.push(pub.score);
      contentTypePerformance[pub.contentType].count += 1;
    });
    
    const typeAverages = Object.entries(contentTypePerformance)
      .filter(([, data]) => data.count >= 2)
      .map(([type, data]) => ({
        type,
        averageScore: data.scores.reduce((sum, score) => sum + score, 0) / data.count,
        count: data.count
      }))
      .sort((a, b) => b.averageScore - a.averageScore);
    
    if (typeAverages.length >= 2) {
      const bestType = typeAverages[0];
      const worstType = typeAverages[typeAverages.length - 1];
      
      if (bestType.averageScore > worstType.averageScore * 1.2) { // 20% better
        return {
          id: uuidv4(),
          type: 'content_type',
          title: `Focus More on ${bestType.type} Content`,
          description: `Your ${bestType.type} content performs ${Math.round(((bestType.averageScore - worstType.averageScore) / worstType.averageScore) * 100)}% better than ${worstType.type} content. Consider creating more ${bestType.type} content.`,
          impact: 'medium',
          confidence: 75,
          data: { 
            bestType: bestType.type, 
            worstType: worstType.type,
            improvement: ((bestType.averageScore - worstType.averageScore) / worstType.averageScore) * 100
          },
          actionable: true,
          createdAt: new Date()
        };
      }
    }
    
    return null;
  }
  
  /**
   * Analyze platform performance
   */
  private analyzePlatformPerformance(publications: any[]): PerformanceRecommendation | null {
    const platformPerformance: Record<Platform, { scores: number[], engagement: number[], count: number }> = {
      instagram: { scores: [], engagement: [], count: 0 },
      tiktok: { scores: [], engagement: [], count: 0 },
      facebook: { scores: [], engagement: [], count: 0 },
      linkedin: { scores: [], engagement: [], count: 0 }
    };
    
    publications.forEach(pub => {
      const platform = pub.platform as Platform;
      const engagement = pub.metrics.likes + pub.metrics.comments + pub.metrics.shares + (pub.metrics.saves || 0);
      
      platformPerformance[platform].scores.push(pub.score);
      platformPerformance[platform].engagement.push(engagement);
      platformPerformance[platform].count += 1;
    });
    
    const platformAverages = Object.entries(platformPerformance)
      .filter(([, data]) => data.count >= 3)
      .map(([platform, data]) => ({
        platform: platform as Platform,
        averageScore: data.scores.reduce((sum, score) => sum + score, 0) / data.count,
        averageEngagement: data.engagement.reduce((sum, eng) => sum + eng, 0) / data.count,
        count: data.count
      }))
      .sort((a, b) => b.averageScore - a.averageScore);
    
    if (platformAverages.length >= 2) {
      const bestPlatform = platformAverages[0];
      const secondBest = platformAverages[1];
      
      if (bestPlatform.averageScore > secondBest.averageScore * 1.3) { // 30% better
        return {
          id: uuidv4(),
          type: 'platform_focus',
          title: `Prioritize ${bestPlatform.platform} Content`,
          description: `Your ${bestPlatform.platform} content significantly outperforms other platforms with ${Math.round(((bestPlatform.averageScore - secondBest.averageScore) / secondBest.averageScore) * 100)}% higher scores. Consider allocating more resources to this platform.`,
          impact: 'high',
          confidence: 85,
          data: { 
            bestPlatform: bestPlatform.platform,
            improvement: ((bestPlatform.averageScore - secondBest.averageScore) / secondBest.averageScore) * 100,
            sampleSize: bestPlatform.count
          },
          actionable: true,
          createdAt: new Date()
        };
      }
    }
    
    return null;
  }
  
  /**
   * Analyze engagement patterns
   */
  private analyzeEngagementPatterns(publications: any[]): PerformanceRecommendation | null {
    const highEngagementPosts = publications.filter(pub => pub.metrics.engagementRate > 5);
    const lowEngagementPosts = publications.filter(pub => pub.metrics.engagementRate < 2);
    
    if (highEngagementPosts.length > 0 && lowEngagementPosts.length > publications.length * 0.3) {
      return {
        id: uuidv4(),
        type: 'engagement_strategy',
        title: 'Improve Engagement Consistency',
        description: `${Math.round((lowEngagementPosts.length / publications.length) * 100)}% of your posts have low engagement rates (<2%). Analyze your ${highEngagementPosts.length} high-performing posts to identify successful patterns.`,
        impact: 'medium',
        confidence: 70,
        data: { 
          highEngagementCount: highEngagementPosts.length,
          lowEngagementCount: lowEngagementPosts.length,
          lowEngagementPercentage: (lowEngagementPosts.length / publications.length) * 100
        },
        actionable: true,
        createdAt: new Date()
      };
    }
    
    return null;
  }
  
  /**
   * Analyze consistency patterns
   */
  private analyzeConsistencyPatterns(publications: any[]): PerformanceRecommendation | null {
    // Group publications by week
    const weeklyPublications: Record<string, number> = {};
    
    publications.forEach(pub => {
      const publishedAt = new Date(pub.publishedAt);
      const weekStart = new Date(publishedAt);
      weekStart.setDate(publishedAt.getDate() - publishedAt.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];
      
      weeklyPublications[weekKey] = (weeklyPublications[weekKey] || 0) + 1;
    });
    
    const weeklyValues = Object.values(weeklyPublications);
    if (weeklyValues.length >= 3) {
      const average = weeklyValues.reduce((sum, count) => sum + count, 0) / weeklyValues.length;
      const variance = weeklyValues.reduce((sum, count) => sum + Math.pow(count - average, 2), 0) / weeklyValues.length;
      const standardDeviation = Math.sqrt(variance);
      
      // High variance indicates inconsistent posting
      if (standardDeviation > average * 0.5) {
        return {
          id: uuidv4(),
          type: 'engagement_strategy',
          title: 'Improve Posting Consistency',
          description: `Your posting frequency varies significantly week to week (${Math.round(standardDeviation)} posts standard deviation). Consistent posting helps maintain audience engagement.`,
          impact: 'medium',
          confidence: 65,
          data: { 
            averageWeeklyPosts: Math.round(average),
            standardDeviation: Math.round(standardDeviation),
            consistencyScore: Math.max(0, 100 - (standardDeviation / average) * 100)
          },
          actionable: true,
          createdAt: new Date()
        };
      }
    }
    
    return null;
  }
  
  /**
   * Store recommendation in database
   */
  private async storeRecommendation(recommendation: PerformanceRecommendation, tenantId: string): Promise<void> {
    await db.query(`
      INSERT INTO public.performance_recommendations (
        id, tenant_id, type, title, description, impact, confidence, 
        data, actionable, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO NOTHING
    `, [
      recommendation.id,
      tenantId,
      recommendation.type,
      recommendation.title,
      recommendation.description,
      recommendation.impact,
      recommendation.confidence,
      JSON.stringify(recommendation.data),
      recommendation.actionable
    ]);
  }
  
  /**
   * Get stored recommendations for tenant
   */
  async getStoredRecommendations(
    tenantId: string,
    type?: string,
    status: string = 'active',
    limit: number = 10
  ): Promise<PerformanceRecommendation[]> {
    let sql = `
      SELECT * FROM public.performance_recommendations
      WHERE tenant_id = $1 AND status = $2
    `;
    
    const params: any[] = [tenantId, status];
    
    if (type) {
      sql += ` AND type = $3`;
      params.push(type);
    }
    
    sql += ` ORDER BY confidence DESC, created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await db.query(sql, params);
    
    return result.rows.map(row => ({
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description,
      impact: row.impact,
      confidence: row.confidence,
      data: row.data,
      actionable: row.actionable,
      createdAt: row.created_at
    }));
  }
  
  /**
   * Update recommendation status
   */
  async updateRecommendationStatus(
    recommendationId: string,
    status: 'active' | 'implemented' | 'dismissed'
  ): Promise<void> {
    await db.query(`
      UPDATE public.performance_recommendations 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [status, recommendationId]);
  }
}