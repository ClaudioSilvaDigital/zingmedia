import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { TestDatabaseManager } from '../config/test-database';
import { PerformanceHistoryService } from '../services/performance-history';
import { 
  PerformanceRecommendation,
  Platform,
  EngagementMetrics 
} from '../types';

/**
 * Analytics Recommendation Generation Tests
 * Tests automated strategy adjustment recommendations
 * Requirements: 11.5
 */

describe('Analytics Recommendation Generation', () => {
  let db: TestDatabaseManager;
  let performanceHistoryService: PerformanceHistoryService;
  let testTenantId: string;
  let testUserId: string;

  beforeAll(async () => {
    db = new TestDatabaseManager();
    
    // Mock the database connection for the service
    (performanceHistoryService as any) = new PerformanceHistoryService();
    (performanceHistoryService as any).db = db;
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    // Create test tenant
    testTenantId = uuidv4();
    await db.query(`
      INSERT INTO tenants (id, name, type, brand_config, settings)
      VALUES (?, 'Test Agency', 'agency', '{}', '{}')
    `, [testTenantId]);

    // Create test user with unique email
    testUserId = uuidv4();
    const uniqueEmail = `test-${testUserId}@example.com`;
    await db.query(`
      INSERT INTO users (id, email, name, password_hash, tenant_id)
      VALUES (?, ?, 'Test User', 'hash', ?)
    `, [testUserId, uniqueEmail, testTenantId]);

    // Create analytics tables for testing
    await createAnalyticsTables(db);
  });

  describe('Strategy Recommendations', () => {
    it('should recommend increasing publishing frequency for low activity', async () => {
      const mockService = {
        async generateStrategyRecommendations(tenantId: string, clientId?: string, analysisWindow: number = 30) {
          // Simulate low publication count
          const publications: any[] = [
            { publishedAt: new Date(), score: 75 },
            { publishedAt: new Date(), score: 80 }
          ];

          if (publications.length < 10) {
            return [{
              id: uuidv4(),
              type: 'engagement_strategy' as const,
              title: 'Increase Publishing Frequency',
              description: 'You have published fewer than 10 posts in the last 30 days. Consider increasing your publishing frequency to build audience engagement.',
              impact: 'medium' as const,
              confidence: 80,
              data: { currentPublications: publications.length, recommendedMinimum: 15 },
              actionable: true,
              createdAt: new Date()
            }];
          }

          return [];
        }
      };

      const recommendations = await mockService.generateStrategyRecommendations(testTenantId);

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].type).toBe('engagement_strategy');
      expect(recommendations[0].title).toBe('Increase Publishing Frequency');
      expect(recommendations[0].impact).toBe('medium');
      expect(recommendations[0].data.currentPublications).toBeLessThan(10);
    });

    it('should recommend optimal posting times based on performance data', async () => {
      const mockService = {
        analyzePostingTimePatterns(publications: any[]): PerformanceRecommendation | null {
          const hourlyPerformance: Record<number, { scores: number[], count: number }> = {};
          
          publications.forEach(pub => {
            const hour = new Date(pub.publishedAt).getHours();
            if (!hourlyPerformance[hour]) {
              hourlyPerformance[hour] = { scores: [], count: 0 };
            }
            hourlyPerformance[hour].scores.push(pub.score);
            hourlyPerformance[hour].count += 1;
          });

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

            if (bestAverage > overallAverage * 1.15) {
              return {
                id: uuidv4(),
                type: 'posting_time',
                title: 'Optimize Posting Schedule',
                description: `Your content performs ${Math.round(((bestAverage - overallAverage) / overallAverage) * 100)}% better when posted at ${bestHours.map(h => `${h.hour}:00`).join(', ')}.`,
                impact: 'high',
                confidence: Math.min(90, 60 + (bestHours[0].count * 3)),
                data: { 
                  bestHours: bestHours.map(h => h.hour), 
                  improvement: ((bestAverage - overallAverage) / overallAverage) * 100
                },
                actionable: true,
                createdAt: new Date()
              };
            }
          }

          return null;
        }
      };

      // Create test data with clear time patterns - more extreme difference
      const publications = [
        { publishedAt: new Date('2024-01-01T09:00:00Z'), score: 95 },
        { publishedAt: new Date('2024-01-02T09:00:00Z'), score: 92 },
        { publishedAt: new Date('2024-01-03T09:00:00Z'), score: 90 },
        { publishedAt: new Date('2024-01-04T15:00:00Z'), score: 60 },
        { publishedAt: new Date('2024-01-05T15:00:00Z'), score: 65 },
        { publishedAt: new Date('2024-01-06T21:00:00Z'), score: 55 }
      ];

      const recommendation = mockService.analyzePostingTimePatterns(publications);

      expect(recommendation).toBeDefined();
      expect(recommendation?.type).toBe('posting_time');
      expect(recommendation?.impact).toBe('high');
      expect(Array.isArray(recommendation?.data.bestHours)).toBe(true);
      expect(recommendation?.data.improvement).toBeGreaterThan(0);
    });

    it('should recommend content type optimization', async () => {
      const mockService = {
        analyzeContentTypePerformance(publications: any[]): PerformanceRecommendation | null {
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

            if (bestType.averageScore > worstType.averageScore * 1.2) {
              return {
                id: uuidv4(),
                type: 'content_type',
                title: `Focus More on ${bestType.type} Content`,
                description: `Your ${bestType.type} content performs ${Math.round(((bestType.averageScore - worstType.averageScore) / worstType.averageScore) * 100)}% better than ${worstType.type} content.`,
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
      };

      const publications = [
        { contentType: 'video', score: 90 },
        { contentType: 'video', score: 88 },
        { contentType: 'video', score: 92 },
        { contentType: 'image', score: 70 },
        { contentType: 'image', score: 72 },
        { contentType: 'text', score: 65 },
        { contentType: 'text', score: 68 }
      ];

      const recommendation = mockService.analyzeContentTypePerformance(publications);

      expect(recommendation).toBeDefined();
      expect(recommendation?.type).toBe('content_type');
      expect(recommendation?.data.bestType).toBe('video');
      expect(recommendation?.data.improvement).toBeGreaterThan(20);
    });

    it('should recommend platform focus based on performance', async () => {
      const mockService = {
        analyzePlatformPerformance(publications: any[]): PerformanceRecommendation | null {
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

            if (bestPlatform.averageScore > secondBest.averageScore * 1.3) {
              return {
                id: uuidv4(),
                type: 'platform_focus',
                title: `Prioritize ${bestPlatform.platform} Content`,
                description: `Your ${bestPlatform.platform} content significantly outperforms other platforms with ${Math.round(((bestPlatform.averageScore - secondBest.averageScore) / secondBest.averageScore) * 100)}% higher scores.`,
                impact: 'high',
                confidence: 85,
                data: { 
                  bestPlatform: bestPlatform.platform,
                  improvement: ((bestPlatform.averageScore - secondBest.averageScore) / secondBest.averageScore) * 100
                },
                actionable: true,
                createdAt: new Date()
              };
            }
          }

          return null;
        }
      };

      const publications = [
        { 
          platform: 'instagram', 
          score: 90, 
          metrics: { likes: 100, comments: 15, shares: 8, saves: 5 } 
        },
        { 
          platform: 'instagram', 
          score: 88, 
          metrics: { likes: 95, comments: 12, shares: 6, saves: 4 } 
        },
        { 
          platform: 'instagram', 
          score: 92, 
          metrics: { likes: 110, comments: 18, shares: 10, saves: 6 } 
        },
        { 
          platform: 'tiktok', 
          score: 65, 
          metrics: { likes: 50, comments: 5, shares: 2, saves: 1 } 
        },
        { 
          platform: 'tiktok', 
          score: 68, 
          metrics: { likes: 55, comments: 6, shares: 3, saves: 2 } 
        },
        { 
          platform: 'tiktok', 
          score: 70, 
          metrics: { likes: 60, comments: 7, shares: 4, saves: 2 } 
        }
      ];

      const recommendation = mockService.analyzePlatformPerformance(publications);

      expect(recommendation).toBeDefined();
      expect(recommendation?.type).toBe('platform_focus');
      expect(recommendation?.data.bestPlatform).toBe('instagram');
      expect(recommendation?.impact).toBe('high');
    });

    it('should recommend engagement strategy improvements', async () => {
      const mockService = {
        analyzeEngagementPatterns(publications: any[]): PerformanceRecommendation | null {
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
      };

      const publications = [
        { metrics: { engagementRate: 8.5 } }, // High engagement
        { metrics: { engagementRate: 7.2 } }, // High engagement
        { metrics: { engagementRate: 1.5 } }, // Low engagement
        { metrics: { engagementRate: 1.8 } }, // Low engagement
        { metrics: { engagementRate: 1.2 } }, // Low engagement
        { metrics: { engagementRate: 3.5 } }, // Medium engagement
        { metrics: { engagementRate: 4.1 } }, // Medium engagement
        { metrics: { engagementRate: 1.9 } }, // Low engagement
        { metrics: { engagementRate: 1.1 } }, // Low engagement
        { metrics: { engagementRate: 6.8 } }  // High engagement
      ];

      const recommendation = mockService.analyzeEngagementPatterns(publications);

      expect(recommendation).toBeDefined();
      expect(recommendation?.type).toBe('engagement_strategy');
      expect(recommendation?.title).toBe('Improve Engagement Consistency');
      expect(recommendation?.data.highEngagementCount).toBe(3);
      expect(recommendation?.data.lowEngagementCount).toBe(5);
      expect(recommendation?.data.lowEngagementPercentage).toBe(50);
    });

    it('should recommend posting consistency improvements', async () => {
      const mockService = {
        analyzeConsistencyPatterns(publications: any[]): PerformanceRecommendation | null {
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
      };

      // Create inconsistent posting pattern
      const publications = [
        // Week 1: 1 post
        { publishedAt: new Date('2024-01-01') },
        
        // Week 2: 5 posts
        { publishedAt: new Date('2024-01-08') },
        { publishedAt: new Date('2024-01-09') },
        { publishedAt: new Date('2024-01-10') },
        { publishedAt: new Date('2024-01-11') },
        { publishedAt: new Date('2024-01-12') },
        
        // Week 3: 2 posts
        { publishedAt: new Date('2024-01-15') },
        { publishedAt: new Date('2024-01-18') },
        
        // Week 4: 6 posts
        { publishedAt: new Date('2024-01-22') },
        { publishedAt: new Date('2024-01-23') },
        { publishedAt: new Date('2024-01-24') },
        { publishedAt: new Date('2024-01-25') },
        { publishedAt: new Date('2024-01-26') },
        { publishedAt: new Date('2024-01-27') }
      ];

      const recommendation = mockService.analyzeConsistencyPatterns(publications);

      expect(recommendation).toBeDefined();
      expect(recommendation?.type).toBe('engagement_strategy');
      expect(recommendation?.title).toBe('Improve Posting Consistency');
      expect(recommendation?.data.standardDeviation).toBeGreaterThan(1);
      expect(recommendation?.data.consistencyScore).toBeLessThan(80);
    });
  });

  describe('Recommendation Storage and Management', () => {
    it('should store recommendations in database', async () => {
      const recommendation: PerformanceRecommendation = {
        id: uuidv4(),
        type: 'posting_time',
        title: 'Test Recommendation',
        description: 'This is a test recommendation',
        impact: 'high',
        confidence: 85,
        data: { testData: 'value' },
        actionable: true,
        createdAt: new Date()
      };

      // Store recommendation
      await db.query(`
        INSERT INTO performance_recommendations (
          id, tenant_id, type, title, description, impact, confidence, 
          data, actionable, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `, [
        recommendation.id,
        testTenantId,
        recommendation.type,
        recommendation.title,
        recommendation.description,
        recommendation.impact,
        recommendation.confidence,
        JSON.stringify(recommendation.data),
        recommendation.actionable ? 1 : 0
      ]);

      // Verify storage
      const result = await db.query(`
        SELECT * FROM performance_recommendations WHERE id = ?
      `, [recommendation.id]);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].id).toBe(recommendation.id);
      expect(result.rows[0].type).toBe(recommendation.type);
      expect(result.rows[0].title).toBe(recommendation.title);
      expect(result.rows[0].impact).toBe(recommendation.impact);
      expect(result.rows[0].confidence).toBe(recommendation.confidence);
    });

    it('should retrieve stored recommendations by type and status', async () => {
      // Create multiple recommendations
      const recommendations = [
        {
          id: uuidv4(),
          type: 'posting_time',
          title: 'Posting Time Rec',
          impact: 'high',
          status: 'active'
        },
        {
          id: uuidv4(),
          type: 'content_type',
          title: 'Content Type Rec',
          impact: 'medium',
          status: 'active'
        },
        {
          id: uuidv4(),
          type: 'posting_time',
          title: 'Old Posting Time Rec',
          impact: 'low',
          status: 'implemented'
        }
      ];

      for (const rec of recommendations) {
        await db.query(`
          INSERT INTO performance_recommendations (
            id, tenant_id, type, title, description, impact, confidence, 
            data, actionable, status
          ) VALUES (?, ?, ?, ?, 'Test description', ?, 75, '{}', 1, ?)
        `, [rec.id, testTenantId, rec.type, rec.title, rec.impact, rec.status]);
      }

      // Test filtering by type
      const postingTimeRecs = await db.query(`
        SELECT * FROM performance_recommendations 
        WHERE tenant_id = ? AND type = 'posting_time' AND status = 'active'
        ORDER BY confidence DESC
      `, [testTenantId]);

      expect(postingTimeRecs.rows).toHaveLength(1);
      expect(postingTimeRecs.rows[0].type).toBe('posting_time');
      expect(postingTimeRecs.rows[0].status).toBe('active');

      // Test getting all active recommendations
      const activeRecs = await db.query(`
        SELECT * FROM performance_recommendations 
        WHERE tenant_id = ? AND status = 'active'
        ORDER BY confidence DESC
      `, [testTenantId]);

      expect(activeRecs.rows).toHaveLength(2);
    });

    it('should update recommendation status', async () => {
      const recommendationId = uuidv4();
      
      // Create recommendation
      await db.query(`
        INSERT INTO performance_recommendations (
          id, tenant_id, type, title, description, impact, confidence, 
          data, actionable, status
        ) VALUES (?, ?, 'posting_time', 'Test Rec', 'Test description', 'high', 85, '{}', 1, 'active')
      `, [recommendationId, testTenantId]);

      // Update status
      await db.query(`
        UPDATE performance_recommendations 
        SET status = 'implemented', updated_at = datetime('now')
        WHERE id = ?
      `, [recommendationId]);

      // Verify update
      const result = await db.query(`
        SELECT status FROM performance_recommendations WHERE id = ?
      `, [recommendationId]);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('implemented');
    });
  });
});

// Helper function to create analytics tables for testing
async function createAnalyticsTables(db: TestDatabaseManager) {
  // Create performance recommendations table
  await db.query(`
    CREATE TABLE IF NOT EXISTS performance_recommendations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      impact TEXT NOT NULL,
      confidence INTEGER DEFAULT 0,
      data TEXT DEFAULT '{}',
      actionable INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now'))
    )
  `);

  // Create platform posts table for testing
  await db.query(`
    CREATE TABLE IF NOT EXISTS platform_posts (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      platform_post_id TEXT NOT NULL,
      status TEXT DEFAULT 'published',
      engagement_metrics TEXT DEFAULT '{}',
      published_at DATETIME DEFAULT (datetime('now'))
    )
  `);
}