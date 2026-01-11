import { Router, Request, Response } from 'express';
import { CalendarService } from '../services/calendar';
import { CalendarSchedulerService } from '../services/calendar-scheduler';
import { authenticateToken } from '../middleware/auth';
import { getTenantContext } from '../middleware/tenant';
import { Pool } from 'pg';
import { 
  CalendarView, 
  ScheduleRequest, 
  Platform,
  TenantContext 
} from '../types';

export function createCalendarRoutes(db: Pool): Router {
  const router = Router();
  const calendarService = new CalendarService(db);
  const calendarScheduler = new CalendarSchedulerService(db);

  // Apply authentication and tenant context to all routes
  router.use(authenticateToken);
  router.use(getTenantContext);

  // GET /calendar/view - Get calendar view (daily, weekly, monthly)
  router.get('/view', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const { 
        type = 'weekly', 
        startDate, 
        clientId 
      } = req.query;

      // Validate view type
      if (!['daily', 'weekly', 'monthly'].includes(type as string)) {
        return res.status(400).json({ 
          error: 'Invalid view type. Must be daily, weekly, or monthly' 
        });
      }

      // Parse start date
      let parsedStartDate: Date;
      if (startDate) {
        parsedStartDate = new Date(startDate as string);
        if (isNaN(parsedStartDate.getTime())) {
          return res.status(400).json({ error: 'Invalid start date format' });
        }
      } else {
        parsedStartDate = new Date();
        parsedStartDate.setHours(0, 0, 0, 0);
      }

      const calendarView = await calendarService.getCalendarView(
        tenantContext,
        type as 'daily' | 'weekly' | 'monthly',
        parsedStartDate,
        clientId as string
      );

      res.json(calendarView);
    } catch (error) {
      console.error('Error getting calendar view:', error);
      res.status(500).json({ error: 'Failed to get calendar view' });
    }
  });

  // POST /calendar/schedule - Schedule content
  router.post('/schedule', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const { contentId, scheduledAt, platform, metadata, clientId } = req.body;

      // Validate required fields
      if (!contentId || !scheduledAt || !platform) {
        return res.status(400).json({ 
          error: 'Missing required fields: contentId, scheduledAt, platform' 
        });
      }

      // Validate platform
      if (!['instagram', 'tiktok', 'facebook', 'linkedin'].includes(platform)) {
        return res.status(400).json({ 
          error: 'Invalid platform. Must be instagram, tiktok, facebook, or linkedin' 
        });
      }

      // Parse scheduled date
      const parsedScheduledAt = new Date(scheduledAt);
      if (isNaN(parsedScheduledAt.getTime())) {
        return res.status(400).json({ error: 'Invalid scheduledAt date format' });
      }

      // Check if scheduled time is in the future
      if (parsedScheduledAt <= new Date()) {
        return res.status(400).json({ error: 'Scheduled time must be in the future' });
      }

      const scheduleRequest: ScheduleRequest = {
        contentId,
        scheduledAt: parsedScheduledAt,
        platform: platform as Platform,
        metadata
      };

      const result = await calendarService.scheduleContent(
        tenantContext,
        scheduleRequest,
        clientId
      );

      if (result.success) {
        res.status(201).json({ 
          success: true, 
          eventId: result.eventId,
          message: 'Content scheduled successfully' 
        });
      } else {
        res.status(409).json({ 
          success: false, 
          conflicts: result.conflicts,
          message: 'Scheduling conflicts detected' 
        });
      }
    } catch (error) {
      console.error('Error scheduling content:', error);
      res.status(500).json({ error: 'Failed to schedule content' });
    }
  });

  // GET /calendar/optimal-times - Get optimal posting times
  router.get('/optimal-times', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const { platform, targetDate, clientId } = req.query;

      // Validate platform
      if (!platform || !['instagram', 'tiktok', 'facebook', 'linkedin'].includes(platform as string)) {
        return res.status(400).json({ 
          error: 'Invalid or missing platform. Must be instagram, tiktok, facebook, or linkedin' 
        });
      }

      // Parse target date
      let parsedTargetDate: Date;
      if (targetDate) {
        parsedTargetDate = new Date(targetDate as string);
        if (isNaN(parsedTargetDate.getTime())) {
          return res.status(400).json({ error: 'Invalid target date format' });
        }
      } else {
        parsedTargetDate = new Date();
      }

      const optimalTimes = await calendarService.suggestOptimalPostingTimes(
        tenantContext,
        platform as Platform,
        parsedTargetDate,
        clientId as string
      );

      res.json({ 
        platform,
        targetDate: parsedTargetDate,
        optimalTimes 
      });
    } catch (error) {
      console.error('Error getting optimal times:', error);
      res.status(500).json({ error: 'Failed to get optimal posting times' });
    }
  });

  // PUT /calendar/events/:eventId/reschedule - Reschedule an event
  router.put('/events/:eventId/reschedule', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const { eventId } = req.params;
      const { newScheduledAt, reason } = req.body;

      if (!newScheduledAt) {
        return res.status(400).json({ error: 'Missing required field: newScheduledAt' });
      }

      // Parse new scheduled date
      const parsedNewScheduledAt = new Date(newScheduledAt);
      if (isNaN(parsedNewScheduledAt.getTime())) {
        return res.status(400).json({ error: 'Invalid newScheduledAt date format' });
      }

      // Check if new scheduled time is in the future
      if (parsedNewScheduledAt <= new Date()) {
        return res.status(400).json({ error: 'New scheduled time must be in the future' });
      }

      const result = await calendarService.rescheduleEvent(
        tenantContext,
        eventId,
        parsedNewScheduledAt,
        reason
      );

      if (result.success) {
        res.json({ 
          success: true, 
          message: 'Event rescheduled successfully' 
        });
      } else {
        res.status(409).json({ 
          success: false, 
          conflicts: result.conflicts,
          message: 'Rescheduling conflicts detected' 
        });
      }
    } catch (error) {
      console.error('Error rescheduling event:', error);
      if (error instanceof Error && error.message === 'Event not found or access denied') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to reschedule event' });
      }
    }
  });

  // GET /calendar/stats - Get calendar statistics
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const { startDate, endDate, clientId } = req.query;

      // Parse dates or use defaults
      let parsedStartDate: Date;
      let parsedEndDate: Date;

      if (startDate) {
        parsedStartDate = new Date(startDate as string);
        if (isNaN(parsedStartDate.getTime())) {
          return res.status(400).json({ error: 'Invalid start date format' });
        }
      } else {
        parsedStartDate = new Date();
        parsedStartDate.setDate(parsedStartDate.getDate() - 30); // Default to last 30 days
      }

      if (endDate) {
        parsedEndDate = new Date(endDate as string);
        if (isNaN(parsedEndDate.getTime())) {
          return res.status(400).json({ error: 'Invalid end date format' });
        }
      } else {
        parsedEndDate = new Date(); // Default to today
      }

      const stats = await calendarService.getCalendarStats(
        tenantContext,
        parsedStartDate,
        parsedEndDate,
        clientId as string
      );

      res.json(stats);
    } catch (error) {
      console.error('Error getting calendar stats:', error);
      res.status(500).json({ error: 'Failed to get calendar statistics' });
    }
  });

  // PUT /calendar/events/:eventId/status - Update event status
  router.put('/events/:eventId/status', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const { eventId } = req.params;
      const { status, failureReason } = req.body;

      if (!status) {
        return res.status(400).json({ error: 'Missing required field: status' });
      }

      if (!['published', 'failed', 'cancelled'].includes(status)) {
        return res.status(400).json({ 
          error: 'Invalid status. Must be published, failed, or cancelled' 
        });
      }

      await calendarService.updateEventStatus(
        tenantContext,
        eventId,
        status,
        failureReason
      );

      res.json({ 
        success: true, 
        message: 'Event status updated successfully' 
      });
    } catch (error) {
      console.error('Error updating event status:', error);
      res.status(500).json({ error: 'Failed to update event status' });
    }
  });

  // POST /calendar/events/:eventId/retry - Increment retry count
  router.post('/events/:eventId/retry', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const { eventId } = req.params;

      await calendarService.incrementRetryCount(tenantContext, eventId);

      res.json({ 
        success: true, 
        message: 'Retry count incremented successfully' 
      });
    } catch (error) {
      console.error('Error incrementing retry count:', error);
      res.status(500).json({ error: 'Failed to increment retry count' });
    }
  });

  // POST /calendar/process-failures - Process failed events for automatic rescheduling
  router.post('/process-failures', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;

      await calendarService.processFailedEvents(tenantContext);

      res.json({ 
        success: true, 
        message: 'Failed events processed successfully' 
      });
    } catch (error) {
      console.error('Error processing failed events:', error);
      res.status(500).json({ error: 'Failed to process failed events' });
    }
  });

  // POST /calendar/resolve-conflicts - Detect and resolve scheduling conflicts
  router.post('/resolve-conflicts', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;

      await calendarService.detectAndResolveConflicts(tenantContext);

      res.json({ 
        success: true, 
        message: 'Scheduling conflicts resolved successfully' 
      });
    } catch (error) {
      console.error('Error resolving conflicts:', error);
      res.status(500).json({ error: 'Failed to resolve scheduling conflicts' });
    }
  });

  // GET /calendar/upcoming - Get upcoming events
  router.get('/upcoming', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const { hoursAhead = '24', clientId } = req.query;

      const hoursAheadNum = parseInt(hoursAhead as string);
      if (isNaN(hoursAheadNum) || hoursAheadNum < 1) {
        return res.status(400).json({ error: 'Invalid hoursAhead parameter' });
      }

      const upcomingEvents = await calendarService.getUpcomingEvents(
        tenantContext,
        hoursAheadNum,
        clientId as string
      );

      res.json({ 
        hoursAhead: hoursAheadNum,
        events: upcomingEvents 
      });
    } catch (error) {
      console.error('Error getting upcoming events:', error);
      res.status(500).json({ error: 'Failed to get upcoming events' });
    }
  });

  // POST /calendar/auto-reschedule - Run automatic rescheduling process
  router.post('/auto-reschedule', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;

      const result = await calendarService.runAutomaticRescheduling(tenantContext);

      res.json({ 
        success: true, 
        message: 'Automatic rescheduling completed',
        results: result
      });
    } catch (error) {
      console.error('Error running automatic rescheduling:', error);
      res.status(500).json({ error: 'Failed to run automatic rescheduling' });
    }
  });

  // PUT /calendar/events/:eventId/cancel - Cancel an event
  router.put('/events/:eventId/cancel', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      const { eventId } = req.params;

      await calendarService.cancelEvent(tenantContext, eventId);

      res.json({ 
        success: true, 
        message: 'Event cancelled successfully' 
      });
    } catch (error) {
      console.error('Error cancelling event:', error);
      res.status(500).json({ error: 'Failed to cancel event' });
    }
  });

  // GET /calendar/scheduler/status - Get scheduler status
  router.get('/scheduler/status', async (req: Request, res: Response) => {
    try {
      const status = calendarScheduler.getStatus();
      res.json(status);
    } catch (error) {
      console.error('Error getting scheduler status:', error);
      res.status(500).json({ error: 'Failed to get scheduler status' });
    }
  });

  // POST /calendar/scheduler/run - Run scheduler for current tenant
  router.post('/scheduler/run', async (req: Request, res: Response) => {
    try {
      const tenantContext = req.tenantContext as TenantContext;
      
      const result = await calendarScheduler.runForTenant(tenantContext);
      
      res.json({ 
        success: true, 
        message: 'Scheduler run completed',
        results: result
      });
    } catch (error) {
      console.error('Error running scheduler:', error);
      res.status(500).json({ error: 'Failed to run scheduler' });
    }
  });

  return router;
}