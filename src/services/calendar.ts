import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  CalendarEvent,
  CalendarView,
  ScheduleRequest,
  ScheduleConflict,
  OptimalPostingTime,
  PlatformSchedulingRules,
  ReschedulingRule,
  CalendarStats,
  Platform,
  TenantContext,
  ValidationResult
} from '../types';

export class CalendarService {
  constructor(private db: Pool) {}

  async getCalendarView(
    tenantContext: TenantContext,
    viewType: 'daily' | 'weekly' | 'monthly',
    startDate: Date,
    clientId?: string
  ): Promise<CalendarView> {
    const endDate = this.calculateEndDate(startDate, viewType);
    
    let query = `
      SELECT 
        ce.*,
        c.title as content_title,
        c.description as content_description
      FROM calendar_events ce
      JOIN content c ON ce.content_id = c.id
      WHERE ce.tenant_id = $1 
        AND ce.scheduled_at >= $2 
        AND ce.scheduled_at <= $3
    `;
    
    const params: any[] = [tenantContext.tenantId, startDate, endDate];
    
    if (clientId) {
      query += ' AND ce.client_id = $4';
      params.push(clientId);
    }
    
    query += ' ORDER BY ce.scheduled_at ASC';
    
    const result = await this.db.query(query, params);
    
    const events: CalendarEvent[] = result.rows.map(row => ({
      id: row.id,
      contentId: row.content_id,
      title: row.title,
      description: row.description,
      scheduledAt: new Date(row.scheduled_at),
      platform: row.platform as Platform,
      status: row.status,
      tenantId: row.tenant_id,
      clientId: row.client_id,
      createdBy: row.created_by,
      publishedAt: row.published_at ? new Date(row.published_at) : undefined,
      failureReason: row.failure_reason,
      retryCount: row.retry_count,
      metadata: row.metadata || {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));

    return {
      type: viewType,
      startDate,
      endDate,
      events
    };
  }

  async scheduleContent(
    tenantContext: TenantContext,
    request: ScheduleRequest,
    clientId?: string
  ): Promise<{ success: boolean; eventId?: string; conflicts?: ScheduleConflict[] }> {
    // Check for scheduling conflicts
    const conflicts = await this.checkSchedulingConflicts(
      tenantContext,
      request.scheduledAt,
      request.platform,
      clientId
    );

    if (conflicts.length > 0) {
      return { success: false, conflicts };
    }

    // Create calendar event
    const eventId = uuidv4();
    
    const query = `
      INSERT INTO calendar_events (
        id, content_id, title, description, scheduled_at, platform,
        tenant_id, client_id, created_by, metadata
      )
      SELECT 
        $1, $2, c.title, c.description, $3, $4,
        $5, $6, $7, $8
      FROM content c
      WHERE c.id = $2 AND c.tenant_id = $5
      RETURNING id
    `;

    const result = await this.db.query(query, [
      eventId,
      request.contentId,
      request.scheduledAt,
      request.platform,
      tenantContext.tenantId,
      clientId,
      tenantContext.user.id,
      JSON.stringify(request.metadata || {})
    ]);

    if (result.rows.length === 0) {
      throw new Error('Content not found or access denied');
    }

    return { success: true, eventId };
  }

  async checkSchedulingConflicts(
    tenantContext: TenantContext,
    scheduledAt: Date,
    platform: Platform,
    clientId?: string
  ): Promise<ScheduleConflict[]> {
    const conflicts: ScheduleConflict[] = [];

    // Get platform scheduling rules
    const rules = await this.getPlatformSchedulingRules(tenantContext.tenantId, platform);
    if (!rules) {
      return conflicts;
    }

    // Check hourly limits
    const hourStart = new Date(scheduledAt);
    hourStart.setMinutes(0, 0, 0);
    const hourEnd = new Date(hourStart);
    hourEnd.setHours(hourEnd.getHours() + 1);

    const hourlyQuery = `
      SELECT COUNT(*) as count
      FROM calendar_events
      WHERE tenant_id = $1 
        AND platform = $2
        AND scheduled_at >= $3 
        AND scheduled_at < $4
        AND status IN ('scheduled', 'published')
        ${clientId ? 'AND client_id = $5' : ''}
    `;

    const hourlyParams = [tenantContext.tenantId, platform, hourStart, hourEnd];
    if (clientId) hourlyParams.push(clientId);

    const hourlyResult = await this.db.query(hourlyQuery, hourlyParams);
    const hourlyCount = parseInt(hourlyResult.rows[0].count);

    if (hourlyCount >= rules.maxPostsPerHour) {
      conflicts.push({
        conflictType: 'platform_limit',
        message: `Maximum posts per hour (${rules.maxPostsPerHour}) exceeded for ${platform}`,
        suggestedAlternatives: await this.suggestAlternativeTimes(tenantContext, platform, scheduledAt, clientId)
      });
    }

    // Check daily limits
    const dayStart = new Date(scheduledAt);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const dailyQuery = `
      SELECT COUNT(*) as count
      FROM calendar_events
      WHERE tenant_id = $1 
        AND platform = $2
        AND scheduled_at >= $3 
        AND scheduled_at < $4
        AND status IN ('scheduled', 'published')
        ${clientId ? 'AND client_id = $5' : ''}
    `;

    const dailyParams = [tenantContext.tenantId, platform, dayStart, dayEnd];
    if (clientId) dailyParams.push(clientId);

    const dailyResult = await this.db.query(dailyQuery, dailyParams);
    const dailyCount = parseInt(dailyResult.rows[0].count);

    if (dailyCount >= rules.maxPostsPerDay) {
      conflicts.push({
        conflictType: 'platform_limit',
        message: `Maximum posts per day (${rules.maxPostsPerDay}) exceeded for ${platform}`,
        suggestedAlternatives: await this.suggestAlternativeTimes(tenantContext, platform, scheduledAt, clientId)
      });
    }

    // Check minimum interval - exclude the exact time being scheduled to avoid self-conflicts
    const intervalStart = new Date(scheduledAt.getTime() - rules.minIntervalMinutes * 60000);
    const intervalEnd = new Date(scheduledAt.getTime() + rules.minIntervalMinutes * 60000);

    const intervalQuery = `
      SELECT COUNT(*) as count
      FROM calendar_events
      WHERE tenant_id = $1 
        AND platform = $2
        AND scheduled_at >= $3 
        AND scheduled_at <= $4
        AND scheduled_at != $5
        AND status IN ('scheduled', 'published')
        ${clientId ? 'AND client_id = $6' : ''}
    `;

    const intervalParams = [tenantContext.tenantId, platform, intervalStart, intervalEnd, scheduledAt];
    if (clientId) intervalParams.push(clientId);

    const intervalResult = await this.db.query(intervalQuery, intervalParams);
    const intervalCount = parseInt(intervalResult.rows[0].count);

    if (intervalCount > 0) {
      conflicts.push({
        conflictType: 'time_slot',
        message: `Minimum interval of ${rules.minIntervalMinutes} minutes not met for ${platform}`,
        suggestedAlternatives: await this.suggestAlternativeTimes(tenantContext, platform, scheduledAt, clientId)
      });
    }

    return conflicts;
  }

  async suggestOptimalPostingTimes(
    tenantContext: TenantContext,
    platform: Platform,
    targetDate: Date,
    clientId?: string
  ): Promise<OptimalPostingTime[]> {
    const rules = await this.getPlatformSchedulingRules(tenantContext.tenantId, platform);
    if (!rules) {
      return [];
    }

    const dayOfWeek = targetDate.getDay();
    const optimalTimes = rules.optimalTimes.filter(time => time.dayOfWeek === dayOfWeek);

    // Filter out times that would create conflicts
    const availableTimes: OptimalPostingTime[] = [];
    
    for (const time of optimalTimes) {
      const testDate = new Date(targetDate);
      testDate.setHours(time.hour, 0, 0, 0);
      
      const conflicts = await this.checkSchedulingConflicts(tenantContext, testDate, platform, clientId);
      if (conflicts.length === 0) {
        availableTimes.push(time);
      }
    }

    return availableTimes.sort((a, b) => b.score - a.score);
  }

  async rescheduleEvent(
    tenantContext: TenantContext,
    eventId: string,
    newScheduledAt: Date,
    reason?: string
  ): Promise<{ success: boolean; conflicts?: ScheduleConflict[] }> {
    // Get the event
    const eventQuery = `
      SELECT * FROM calendar_events 
      WHERE id = $1 AND tenant_id = $2
    `;
    
    const eventResult = await this.db.query(eventQuery, [eventId, tenantContext.tenantId]);
    if (eventResult.rows.length === 0) {
      throw new Error('Event not found or access denied');
    }

    const event = eventResult.rows[0];

    // Check for conflicts at new time
    const conflicts = await this.checkSchedulingConflicts(
      tenantContext,
      newScheduledAt,
      event.platform,
      event.client_id
    );

    if (conflicts.length > 0) {
      return { success: false, conflicts };
    }

    // Update the event
    const updateQuery = `
      UPDATE calendar_events 
      SET scheduled_at = $1, 
          status = 'scheduled',
          failure_reason = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND tenant_id = $4
    `;

    await this.db.query(updateQuery, [
      newScheduledAt,
      reason || null,
      eventId,
      tenantContext.tenantId
    ]);

    return { success: true };
  }

  async getCalendarStats(
    tenantContext: TenantContext,
    startDate: Date,
    endDate: Date,
    clientId?: string
  ): Promise<CalendarStats> {
    let query = `
      SELECT 
        status,
        platform,
        COUNT(*) as count
      FROM calendar_events
      WHERE tenant_id = $1 
        AND scheduled_at >= $2 
        AND scheduled_at <= $3
    `;

    const params: any[] = [tenantContext.tenantId, startDate, endDate];

    if (clientId) {
      query += ' AND client_id = $4';
      params.push(clientId);
    }

    query += ' GROUP BY status, platform';

    const result = await this.db.query(query, params);

    const stats: CalendarStats = {
      totalScheduled: 0,
      totalPublished: 0,
      totalFailed: 0,
      successRate: 0,
      upcomingToday: 0,
      upcomingWeek: 0,
      platformBreakdown: {
        instagram: { scheduled: 0, published: 0, failed: 0 },
        tiktok: { scheduled: 0, published: 0, failed: 0 },
        facebook: { scheduled: 0, published: 0, failed: 0 },
        linkedin: { scheduled: 0, published: 0, failed: 0 }
      }
    };

    // Process results
    for (const row of result.rows) {
      const count = parseInt(row.count);
      const platform = row.platform as Platform;
      
      switch (row.status) {
        case 'scheduled':
          stats.totalScheduled += count;
          stats.platformBreakdown[platform].scheduled += count;
          break;
        case 'published':
          stats.totalPublished += count;
          stats.platformBreakdown[platform].published += count;
          break;
        case 'failed':
          stats.totalFailed += count;
          stats.platformBreakdown[platform].failed += count;
          break;
      }
    }

    // Calculate success rate
    const total = stats.totalPublished + stats.totalFailed;
    stats.successRate = total > 0 ? Math.round((stats.totalPublished / total) * 100) : 0;

    // Get upcoming counts
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    const weekFromNow = new Date();
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    weekFromNow.setHours(23, 59, 59, 999);

    const upcomingQuery = `
      SELECT 
        CASE 
          WHEN scheduled_at <= $2 THEN 'today'
          WHEN scheduled_at <= $3 THEN 'week'
        END as period,
        COUNT(*) as count
      FROM calendar_events
      WHERE tenant_id = $1 
        AND status = 'scheduled'
        AND scheduled_at >= CURRENT_TIMESTAMP
        ${clientId ? 'AND client_id = $4' : ''}
      GROUP BY period
    `;

    const upcomingParams = [tenantContext.tenantId, today, weekFromNow];
    if (clientId) upcomingParams.push(clientId);

    const upcomingResult = await this.db.query(upcomingQuery, upcomingParams);
    
    for (const row of upcomingResult.rows) {
      if (row.period === 'today') {
        stats.upcomingToday = parseInt(row.count);
      } else if (row.period === 'week') {
        stats.upcomingWeek = parseInt(row.count);
      }
    }

    return stats;
  }

  private async getPlatformSchedulingRules(
    tenantId: string,
    platform: Platform
  ): Promise<PlatformSchedulingRules | null> {
    const query = `
      SELECT * FROM platform_scheduling_rules
      WHERE tenant_id = $1 AND platform = $2 AND is_active = true
    `;

    const result = await this.db.query(query, [tenantId, platform]);
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      platform: row.platform as Platform,
      maxPostsPerHour: row.max_posts_per_hour,
      maxPostsPerDay: row.max_posts_per_day,
      minIntervalMinutes: row.min_interval_minutes,
      optimalTimes: row.optimal_times || [],
      blackoutPeriods: row.blackout_periods || []
    };
  }

  private async suggestAlternativeTimes(
    tenantContext: TenantContext,
    platform: Platform,
    originalTime: Date,
    clientId?: string
  ): Promise<Date[]> {
    const alternatives: Date[] = [];
    const rules = await this.getPlatformSchedulingRules(tenantContext.tenantId, platform);
    
    if (!rules) {
      return alternatives;
    }

    // Try next few hours
    for (let i = 1; i <= 6; i++) {
      const testTime = new Date(originalTime.getTime() + i * 60 * 60 * 1000);
      const conflicts = await this.checkSchedulingConflicts(tenantContext, testTime, platform, clientId);
      
      if (conflicts.length === 0) {
        alternatives.push(testTime);
        if (alternatives.length >= 3) break;
      }
    }

    return alternatives;
  }

  private calculateEndDate(startDate: Date, viewType: 'daily' | 'weekly' | 'monthly'): Date {
    const endDate = new Date(startDate);
    
    switch (viewType) {
      case 'daily':
        endDate.setDate(endDate.getDate() + 1);
        break;
      case 'weekly':
        endDate.setDate(endDate.getDate() + 7);
        break;
      case 'monthly':
        endDate.setMonth(endDate.getMonth() + 1);
        break;
    }
    
    return endDate;
  }

  async updateEventStatus(
    tenantContext: TenantContext,
    eventId: string,
    status: 'published' | 'failed' | 'cancelled',
    failureReason?: string
  ): Promise<void> {
    const query = `
      UPDATE calendar_events 
      SET status = $1,
          published_at = CASE WHEN $1 = 'published' THEN CURRENT_TIMESTAMP ELSE published_at END,
          failure_reason = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND tenant_id = $4
    `;

    await this.db.query(query, [status, failureReason || null, eventId, tenantContext.tenantId]);
  }

  async incrementRetryCount(tenantContext: TenantContext, eventId: string): Promise<void> {
    const query = `
      UPDATE calendar_events 
      SET retry_count = retry_count + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND tenant_id = $2
    `;

    await this.db.query(query, [eventId, tenantContext.tenantId]);
  }

  async processFailedEvents(tenantContext: TenantContext): Promise<void> {
    // Get all failed events that haven't exceeded retry limits
    const failedEventsQuery = `
      SELECT ce.*, rr.max_retries, rr.delay_minutes, rr.action
      FROM calendar_events ce
      JOIN rescheduling_rules rr ON rr.tenant_id = ce.tenant_id 
        AND rr.condition = 'failure' 
        AND rr.is_active = true
      WHERE ce.tenant_id = $1 
        AND ce.status = 'failed'
        AND ce.retry_count < rr.max_retries
      ORDER BY ce.created_at ASC
    `;

    const failedEvents = await this.db.query(failedEventsQuery, [tenantContext.tenantId]);

    for (const event of failedEvents.rows) {
      await this.processFailedEvent(tenantContext, event);
    }
  }

  async processFailedEvent(tenantContext: TenantContext, event: any): Promise<void> {
    const reschedulingRule = await this.getReschedulingRule(tenantContext.tenantId, 'failure');
    if (!reschedulingRule) {
      return;
    }

    switch (reschedulingRule.action) {
      case 'retry':
        await this.retryFailedEvent(tenantContext, event, reschedulingRule);
        break;
      case 'reschedule':
        await this.autoRescheduleFailedEvent(tenantContext, event, reschedulingRule);
        break;
      case 'cancel':
        await this.cancelEvent(tenantContext, event.id);
        break;
    }
  }

  async retryFailedEvent(
    tenantContext: TenantContext, 
    event: any, 
    rule: ReschedulingRule
  ): Promise<void> {
    // Calculate retry time
    const retryTime = new Date(Date.now() + rule.delayMinutes * 60000);

    // Update event to retry
    const updateQuery = `
      UPDATE calendar_events 
      SET scheduled_at = $1,
          status = 'scheduled',
          retry_count = retry_count + 1,
          failure_reason = 'Auto-retry after failure',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND tenant_id = $3
    `;

    await this.db.query(updateQuery, [retryTime, event.id, tenantContext.tenantId]);
  }

  async autoRescheduleFailedEvent(
    tenantContext: TenantContext, 
    event: any, 
    rule: ReschedulingRule
  ): Promise<void> {
    // Find next available optimal time
    const optimalTimes = await this.suggestOptimalPostingTimes(
      tenantContext,
      event.platform,
      new Date(),
      event.client_id
    );

    if (optimalTimes.length === 0) {
      // No optimal times available, schedule for tomorrow at the same hour
      const tomorrow = new Date(event.scheduled_at);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const conflicts = await this.checkSchedulingConflicts(
        tenantContext,
        tomorrow,
        event.platform,
        event.client_id
      );

      if (conflicts.length === 0) {
        await this.rescheduleEvent(
          tenantContext,
          event.id,
          tomorrow,
          'Auto-rescheduled after failure - no optimal times available'
        );
      } else {
        // Mark as cancelled if can't reschedule
        await this.cancelEvent(tenantContext, event.id);
      }
      return;
    }

    // Use the best optimal time
    const bestTime = optimalTimes[0];
    const rescheduleDate = new Date();
    rescheduleDate.setHours(bestTime.hour, 0, 0, 0);
    
    // If the time is in the past today, schedule for tomorrow
    if (rescheduleDate <= new Date()) {
      rescheduleDate.setDate(rescheduleDate.getDate() + 1);
    }

    const conflicts = await this.checkSchedulingConflicts(
      tenantContext,
      rescheduleDate,
      event.platform,
      event.client_id
    );

    if (conflicts.length === 0) {
      await this.rescheduleEvent(
        tenantContext,
        event.id,
        rescheduleDate,
        `Auto-rescheduled to optimal time: ${bestTime.reason}`
      );
    } else {
      // Try alternative times
      const alternatives = await this.suggestAlternativeTimes(
        tenantContext,
        event.platform,
        rescheduleDate,
        event.client_id
      );

      if (alternatives.length > 0) {
        await this.rescheduleEvent(
          tenantContext,
          event.id,
          alternatives[0],
          'Auto-rescheduled to alternative time after conflict'
        );
      } else {
        // Mark as cancelled if no alternatives
        await this.cancelEvent(tenantContext, event.id);
      }
    }
  }

  async cancelEvent(tenantContext: TenantContext, eventId: string): Promise<void> {
    const query = `
      UPDATE calendar_events 
      SET status = 'cancelled',
          failure_reason = 'Auto-cancelled - unable to reschedule',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND tenant_id = $2
    `;

    await this.db.query(query, [eventId, tenantContext.tenantId]);
  }

  async detectAndResolveConflicts(tenantContext: TenantContext): Promise<void> {
    // Find events that have scheduling conflicts
    const conflictQuery = `
      SELECT 
        ce1.id as event1_id,
        ce1.scheduled_at as event1_time,
        ce1.platform as event1_platform,
        ce2.id as event2_id,
        ce2.scheduled_at as event2_time,
        ce2.platform as event2_platform,
        psr.min_interval_minutes
      FROM calendar_events ce1
      JOIN calendar_events ce2 ON ce1.tenant_id = ce2.tenant_id 
        AND ce1.platform = ce2.platform
        AND ce1.id != ce2.id
        AND ce1.status = 'scheduled'
        AND ce2.status = 'scheduled'
      JOIN platform_scheduling_rules psr ON psr.tenant_id = ce1.tenant_id 
        AND psr.platform = ce1.platform
        AND psr.is_active = true
      WHERE ce1.tenant_id = $1
        AND ABS(EXTRACT(EPOCH FROM (ce1.scheduled_at - ce2.scheduled_at))) < (psr.min_interval_minutes * 60)
      ORDER BY ce1.created_at ASC
    `;

    const conflicts = await this.db.query(conflictQuery, [tenantContext.tenantId]);

    for (const conflict of conflicts.rows) {
      await this.resolveSchedulingConflict(tenantContext, conflict);
    }
  }

  async resolveSchedulingConflict(tenantContext: TenantContext, conflict: any): Promise<void> {
    const reschedulingRule = await this.getReschedulingRule(tenantContext.tenantId, 'conflict');
    if (!reschedulingRule) {
      return;
    }

    // Always reschedule the later-created event (event1 is ordered by created_at ASC)
    const eventToReschedule = conflict.event1_id;
    const originalTime = new Date(conflict.event1_time);

    // Find alternative time
    const alternatives = await this.suggestAlternativeTimes(
      tenantContext,
      conflict.event1_platform,
      originalTime,
      null // We don't have client_id in this query, could be enhanced
    );

    if (alternatives.length > 0) {
      await this.rescheduleEvent(
        tenantContext,
        eventToReschedule,
        alternatives[0],
        'Auto-rescheduled due to scheduling conflict'
      );
    } else {
      // If no alternatives, delay by the rule's delay minutes
      const delayedTime = new Date(originalTime.getTime() + reschedulingRule.delayMinutes * 60000);
      
      const delayedConflicts = await this.checkSchedulingConflicts(
        tenantContext,
        delayedTime,
        conflict.event1_platform,
        null
      );

      if (delayedConflicts.length === 0) {
        await this.rescheduleEvent(
          tenantContext,
          eventToReschedule,
          delayedTime,
          `Auto-rescheduled by ${reschedulingRule.delayMinutes} minutes due to conflict`
        );
      }
    }
  }

  async getReschedulingRule(
    tenantId: string, 
    condition: 'failure' | 'conflict' | 'manual'
  ): Promise<ReschedulingRule | null> {
    const query = `
      SELECT * FROM rescheduling_rules
      WHERE tenant_id = $1 AND condition = $2 AND is_active = true
      ORDER BY created_at ASC
      LIMIT 1
    `;

    const result = await this.db.query(query, [tenantId, condition]);
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      condition: row.condition,
      action: row.action,
      delayMinutes: row.delay_minutes,
      maxRetries: row.max_retries,
      tenantId: row.tenant_id,
      isActive: row.is_active
    };
  }

  async getUpcomingEvents(
    tenantContext: TenantContext,
    hoursAhead: number = 24,
    clientId?: string
  ): Promise<CalendarEvent[]> {
    const endTime = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
    
    let query = `
      SELECT ce.*, c.title as content_title
      FROM calendar_events ce
      JOIN content c ON ce.content_id = c.id
      WHERE ce.tenant_id = $1 
        AND ce.status = 'scheduled'
        AND ce.scheduled_at >= CURRENT_TIMESTAMP
        AND ce.scheduled_at <= $2
    `;

    const params: any[] = [tenantContext.tenantId, endTime];

    if (clientId) {
      query += ' AND ce.client_id = $3';
      params.push(clientId);
    }

    query += ' ORDER BY ce.scheduled_at ASC';

    const result = await this.db.query(query, params);
    
    return result.rows.map(row => ({
      id: row.id,
      contentId: row.content_id,
      title: row.title,
      description: row.description,
      scheduledAt: new Date(row.scheduled_at),
      platform: row.platform as Platform,
      status: row.status,
      tenantId: row.tenant_id,
      clientId: row.client_id,
      createdBy: row.created_by,
      publishedAt: row.published_at ? new Date(row.published_at) : undefined,
      failureReason: row.failure_reason,
      retryCount: row.retry_count,
      metadata: row.metadata || {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  async runAutomaticRescheduling(tenantContext: TenantContext): Promise<{
    processedFailures: number;
    resolvedConflicts: number;
    upcomingEvents: number;
  }> {
    // Process failed events
    const failedEventsBefore = await this.db.query(
      'SELECT COUNT(*) as count FROM calendar_events WHERE tenant_id = $1 AND status = \'failed\'',
      [tenantContext.tenantId]
    );
    const failedCountBefore = parseInt(failedEventsBefore.rows[0].count);

    await this.processFailedEvents(tenantContext);

    const failedEventsAfter = await this.db.query(
      'SELECT COUNT(*) as count FROM calendar_events WHERE tenant_id = $1 AND status = \'failed\'',
      [tenantContext.tenantId]
    );
    const failedCountAfter = parseInt(failedEventsAfter.rows[0].count);

    // Detect and resolve conflicts
    await this.detectAndResolveConflicts(tenantContext);

    // Get upcoming events count
    const upcomingEvents = await this.getUpcomingEvents(tenantContext, 24);

    return {
      processedFailures: failedCountBefore - failedCountAfter,
      resolvedConflicts: 0, // This would need more sophisticated tracking
      upcomingEvents: upcomingEvents.length
    };
  }
}