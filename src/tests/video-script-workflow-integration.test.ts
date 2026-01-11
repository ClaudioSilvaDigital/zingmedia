import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { TestDatabaseManager } from '../config/test-database';
import { VideoScriptService } from '../services/video-script';
import { BriefingService } from '../services/briefing';
import { WorkflowEngine } from '../services/workflow';
import { 
  VideoScript,
  ScriptTemplate,
  ScriptSectionType,
  ScriptGenerationRequest,
  TenantContext, 
  User, 
  Tenant,
  BriefingTemplate,
  BriefingField,
  Briefing,
  Platform,
  WorkflowState
} from '../types';

describe('Video Script Workflow Integration Tests', () => {
  let testDb: TestDatabaseManager;
  let videoScriptService: VideoScriptService;
  let briefingService: BriefingService;
  let workflowEngine: WorkflowEngine;
  let testTenants: Tenant[] = [];
  let testUsers: User[] = [];
  let testScripts: VideoScript[] = [];
  let testTemplates: ScriptTemplate[] = [];
  let testBriefings: Briefing[] = [];
  let testBriefingTemplates: BriefingTemplate[] = [];

  beforeAll(async () => {
    testDb = new TestDatabaseManager();
    videoScriptService = new VideoScriptService(testDb as any);
    briefingService = new BriefingService(testDb as any);
    workflowEngine = new WorkflowEngine(testDb as any);
    
    // Ensure database is ready
    await testDb.query('SELECT 1');
    
    // Create required tables for testing (simplified versions)
    await testDb.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        parent_id TEXT,
        brand_config TEXT DEFAULT '{}',
        settings TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await testDb.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        roles TEXT DEFAULT '[]',
        permissions TEXT DEFAULT '[]',
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await testDb.query(`
      CREATE TABLE IF NOT EXISTS briefing_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        fields TEXT NOT NULL DEFAULT '[]',
        required_fields TEXT NOT NULL DEFAULT '[]',
        tenant_id TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await testDb.query(`
      CREATE TABLE IF NOT EXISTS briefings (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        template_id TEXT NOT NULL,
        fields TEXT NOT NULL DEFAULT '{}',
        version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'draft',
        tenant_id TEXT NOT NULL,
        client_id TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await testDb.query(`
      CREATE TABLE IF NOT EXISTS briefing_versions (
        id TEXT PRIMARY KEY,
        briefing_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        fields TEXT NOT NULL DEFAULT '{}',
        changes TEXT NOT NULL DEFAULT '[]',
        tenant_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await testDb.query(`
      CREATE TABLE IF NOT EXISTS script_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        content_type TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT 'universal',
        sections TEXT NOT NULL DEFAULT '[]',
        duration_min INTEGER NOT NULL DEFAULT 15,
        duration_max INTEGER NOT NULL DEFAULT 180,
        tenant_id TEXT,
        is_active INTEGER DEFAULT 1,
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await testDb.query(`
      CREATE TABLE IF NOT EXISTS video_scripts (
        id TEXT PRIMARY KEY,
        briefing_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        template_id TEXT NOT NULL,
        sections TEXT NOT NULL DEFAULT '[]',
        version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'draft',
        workflow_id TEXT,
        tenant_id TEXT NOT NULL,
        client_id TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await testDb.query(`
      CREATE TABLE IF NOT EXISTS script_versions (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        sections TEXT NOT NULL DEFAULT '[]',
        changes TEXT NOT NULL DEFAULT '[]',
        tenant_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await testDb.query(`
      CREATE TABLE IF NOT EXISTS content (
        id TEXT PRIMARY KEY,
        briefing_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        content_type TEXT NOT NULL,
        base_content TEXT NOT NULL DEFAULT '{}',
        adapted_content TEXT NOT NULL DEFAULT '{}',
        workflow_id TEXT,
        tenant_id TEXT NOT NULL,
        client_id TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await testDb.query(`
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        content_id TEXT NOT NULL,
        current_state TEXT NOT NULL DEFAULT 'research',
        tenant_id TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await testDb.query(`
      CREATE TABLE IF NOT EXISTS workflow_events (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        from_state TEXT,
        to_state TEXT NOT NULL,
        user_id TEXT NOT NULL,
        reason TEXT,
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await testDb.query(`
      CREATE TABLE IF NOT EXISTS workflow_comments (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        parent_id TEXT,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        state TEXT NOT NULL,
        is_resolved INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await testDb.query(`
      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        approvers TEXT NOT NULL DEFAULT '[]',
        required_approvals INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'pending',
        requested_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT
      )
    `);

    await testDb.query(`
      CREATE TABLE IF NOT EXISTS approval_responses (
        id TEXT PRIMARY KEY,
        approval_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        decision TEXT NOT NULL,
        comment TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create brand voice guidelines table
    await testDb.query(`
      CREATE TABLE IF NOT EXISTS brand_voice_guidelines (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        tone TEXT NOT NULL,
        personality TEXT NOT NULL DEFAULT '[]',
        dos_list TEXT NOT NULL DEFAULT '[]',
        donts_list TEXT NOT NULL DEFAULT '[]',
        examples TEXT NOT NULL DEFAULT '[]',
        tenant_id TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Mock AI provider tables
    await testDb.query(`
      CREATE TABLE IF NOT EXISTS ai_providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        capabilities TEXT NOT NULL DEFAULT '[]',
        config TEXT NOT NULL DEFAULT '{}',
        is_active INTEGER DEFAULT 1,
        health_status TEXT NOT NULL DEFAULT '{"isHealthy": true}',
        tenant_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await testDb.query(`
      CREATE TABLE IF NOT EXISTS ai_request_logs (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        provider_id TEXT,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        request_type TEXT NOT NULL,
        prompt TEXT NOT NULL,
        options TEXT DEFAULT '{}',
        response_status TEXT NOT NULL,
        processing_time INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await testDb.query(`
      CREATE TABLE IF NOT EXISTS ai_usage_logs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        credits_consumed INTEGER NOT NULL DEFAULT 0,
        request_count INTEGER NOT NULL DEFAULT 1,
        processing_time INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await testDb.query(`
      CREATE TABLE IF NOT EXISTS best_practices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        content_type TEXT NOT NULL,
        objective TEXT NOT NULL,
        rules TEXT NOT NULL DEFAULT '[]',
        examples TEXT NOT NULL DEFAULT '{"positive": [], "negative": []}',
        priority INTEGER NOT NULL DEFAULT 1,
        is_custom INTEGER DEFAULT 0,
        tenant_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  afterAll(async () => {
    // Cleanup all test data
    for (const script of testScripts) {
      try {
        await testDb.query('DELETE FROM video_scripts WHERE id = ?', [script.id]);
      } catch (error) {
        console.warn(`Failed to cleanup script ${script.id}:`, error);
      }
    }

    await testDb.close();
  });

  beforeEach(async () => {
    // Cleanup any existing test data
    await testDb.query('DELETE FROM approval_responses');
    await testDb.query('DELETE FROM approvals');
    await testDb.query('DELETE FROM workflow_comments');
    await testDb.query('DELETE FROM workflow_events');
    await testDb.query('DELETE FROM workflows');
    await testDb.query('DELETE FROM content');
    await testDb.query('DELETE FROM video_scripts');
    await testDb.query('DELETE FROM script_templates');
    await testDb.query('DELETE FROM briefings');
    await testDb.query('DELETE FROM briefing_templates');
    await testDb.query('DELETE FROM brand_voice_guidelines');
    await testDb.query('DELETE FROM ai_usage_logs');
    await testDb.query('DELETE FROM ai_request_logs');
    await testDb.query('DELETE FROM ai_providers');
    await testDb.query('DELETE FROM best_practices');
    await testDb.query('DELETE FROM users');
    await testDb.query('DELETE FROM tenants');
    
    // Reset test arrays
    testScripts = [];
    testTemplates = [];
    testBriefings = [];
    testBriefingTemplates = [];
    testTenants = [];
    testUsers = [];
  });

  it('should integrate script with workflow and approval system', async () => {
    // Create test tenant
    const tenantId = uuidv4();
    await testDb.query(`
      INSERT INTO tenants (id, name, type, brand_config, settings)
      VALUES (?, ?, ?, ?, ?)
    `, [
      tenantId,
      'Test Agency',
      'agency',
      JSON.stringify({ primaryColor: '#007bff' }),
      JSON.stringify({ maxUsers: 100 })
    ]);

    const tenant: Tenant = {
      id: tenantId,
      name: 'Test Agency',
      type: 'agency',
      brandConfig: { primaryColor: '#007bff', secondaryColor: '#6c757d', fontFamily: 'Inter' },
      settings: { maxUsers: 100, maxClients: 50, features: ['all'], billingPlan: 'premium' },
      createdAt: new Date(),
      updatedAt: new Date()
    };
    testTenants.push(tenant);

    // Create test user
    const userId = uuidv4();
    await testDb.query(`
      INSERT INTO users (id, email, name, password_hash, tenant_id, roles, permissions, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId,
      'test@example.com',
      'Test User',
      'hashed_password',
      tenantId,
      JSON.stringify([]),
      JSON.stringify([{ name: 'workflow:transition' }, { name: 'workflow:publish' }]),
      1
    ]);

    const user: User = {
      id: userId,
      email: 'test@example.com',
      name: 'Test User',
      passwordHash: 'hashed_password',
      tenantId: tenantId,
      roles: [],
      permissions: [{ id: '1', name: 'workflow:transition', resource: 'workflow', action: 'transition' }],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    testUsers.push(user);

    const tenantContext: TenantContext = {
      tenantId: tenantId,
      tenant: tenant,
      user: user,
      permissions: [{ id: '1', name: 'workflow:transition', resource: 'workflow', action: 'transition' }]
    };

    // Create brand voice guidelines
    await testDb.query(`
      INSERT INTO brand_voice_guidelines (id, name, tone, personality, dos_list, donts_list, examples, tenant_id, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      uuidv4(),
      'Brand Voice',
      'Professional and friendly',
      JSON.stringify(['approachable', 'expert', 'helpful']),
      JSON.stringify(['Use clear language', 'Be concise', 'Show expertise']),
      JSON.stringify(['Avoid jargon', 'Don\'t be pushy']),
      JSON.stringify(['Here\'s how to...', 'Let me show you...']),
      tenantId,
      1
    ]);

    // Create briefing template and briefing
    const briefingTemplateId = uuidv4();
    const briefingFields: BriefingField[] = [
      {
        id: 'field1',
        name: 'objective',
        label: 'Campaign Objective',
        type: 'text',
        required: true,
        order: 1
      }
    ];

    await testDb.query(`
      INSERT INTO briefing_templates (id, name, fields, required_fields, tenant_id, is_active, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      briefingTemplateId,
      'Test Template',
      JSON.stringify(briefingFields),
      JSON.stringify(['objective']),
      tenantId,
      1,
      userId
    ]);

    const briefingData = {
      title: 'Test Briefing',
      type: 'internal' as const,
      templateId: briefingTemplateId,
      fields: { objective: 'Create engaging video content' },
      status: 'active' as const,
      tenantId: tenantId,
      createdBy: userId
    };

    const briefing = await briefingService.createBriefing(briefingData, tenantContext);
    testBriefings.push(briefing);

    // Create script template
    const templateId = uuidv4();
    const templateSections = [
      {
        type: ScriptSectionType.HOOK,
        title: 'Hook',
        description: 'Attention-grabbing opening',
        isRequired: true,
        suggestedDuration: 5,
        prompts: ['Create an engaging hook'],
        examples: [],
        order: 1
      },
      {
        type: ScriptSectionType.STORYTELLING,
        title: 'Main Content',
        description: 'Core narrative content',
        isRequired: true,
        suggestedDuration: 45,
        prompts: ['Tell a compelling story'],
        examples: [],
        order: 2
      },
      {
        type: ScriptSectionType.TONE,
        title: 'Tone & Style',
        description: 'Emotional tone for the video',
        isRequired: true,
        suggestedDuration: 0,
        prompts: ['Define the tone'],
        examples: [],
        order: 3
      },
      {
        type: ScriptSectionType.EMOTIONS,
        title: 'Emotional Journey',
        description: 'Emotions the video should evoke',
        isRequired: true,
        suggestedDuration: 0,
        prompts: ['Map emotional journey'],
        examples: [],
        order: 4
      },
      {
        type: ScriptSectionType.CTA,
        title: 'Call to Action',
        description: 'Clear directive for viewers',
        isRequired: true,
        suggestedDuration: 10,
        prompts: ['Create clear CTA'],
        examples: [],
        order: 5
      }
    ];

    await testDb.query(`
      INSERT INTO script_templates (id, name, content_type, platform, sections, duration_min, duration_max, tenant_id, is_active, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      templateId,
      'Test Script Template',
      'engagement',
      'universal',
      JSON.stringify(templateSections),
      15,
      180,
      tenantId,
      1,
      userId
    ]);

    // Mock AI provider
    const providerId = uuidv4();
    await testDb.query(`
      INSERT INTO ai_providers (id, name, type, capabilities, config, is_active, health_status, tenant_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      providerId,
      'Mock Provider',
      'text',
      JSON.stringify([{ type: 'text_generation', models: ['mock'] }]),
      JSON.stringify({ apiKey: 'mock' }),
      1,
      JSON.stringify({ isHealthy: true }),
      tenantId
    ]);

    // Mock AI responses
    const originalRouteRequest = videoScriptService['aiHub'].routeRequest;
    let sectionIndex = 0;
    const mockResponses = [
      'Engaging hook content with brand voice applied',
      'Compelling story content that follows brand guidelines',
      'Professional and friendly tone as per brand voice',
      'Journey from curiosity to confidence',
      'Clear call to action that drives engagement'
    ];

    videoScriptService['aiHub'].routeRequest = async (request: any) => {
      const content = mockResponses[sectionIndex % mockResponses.length];
      sectionIndex++;
      return {
        id: uuidv4(),
        requestId: request.id,
        providerId: providerId,
        content: { type: 'text', data: content },
        usage: { creditsConsumed: 1, requestCount: 1, processingTime: 100 },
        status: 'success' as const,
        processingTime: 100,
        createdAt: new Date()
      };
    };

    try {
      // Generate script
      const scriptRequest: ScriptGenerationRequest = {
        briefingId: briefing.id,
        templateId: templateId,
        title: 'Test Video Script',
        description: 'Script for workflow integration test',
        targetPlatform: 'instagram' as Platform,
        duration: 60
      };

      const script = await videoScriptService.generateScript(scriptRequest, tenantContext);
      testScripts.push(script);

      // Verify script was created with brand voice integration
      expect(script).toBeDefined();
      expect(script.sections.length).toBe(5);
      expect(script.sections.every(s => s.content.length > 0)).toBe(true);
      
      // Check that brand voice was applied (metadata should indicate this)
      expect(script.sections.some(s => s.metadata?.brandVoiceApplied)).toBe(true);

      // Connect script to workflow
      const workflowId = await videoScriptService.connectToWorkflow(script.id, tenantContext);
      expect(workflowId).toBeDefined();

      // Verify workflow was created
      const workflow = await videoScriptService.getScriptWorkflowStatus(script.id, tenantContext);
      expect(workflow).toBeDefined();
      expect(workflow.currentState).toBe(WorkflowState.RESEARCH);

      // Add comment to workflow
      const comment = await videoScriptService.addScriptComment(
        script.id,
        'This script looks good, ready for review',
        tenantContext
      );
      expect(comment).toBeDefined();
      expect(comment.content).toBe('This script looks good, ready for review');

      // Transition workflow state
      await videoScriptService.transitionScriptWorkflow(
        script.id,
        WorkflowState.PLANNING,
        tenantContext,
        'Moving to planning phase'
      );

      // Verify state transition
      const updatedWorkflow = await videoScriptService.getScriptWorkflowStatus(script.id, tenantContext);
      expect(updatedWorkflow.currentState).toBe(WorkflowState.PLANNING);

      // Request approval
      const approvalId = await videoScriptService.requestScriptApproval(
        script.id,
        [userId],
        tenantContext,
        1
      );
      expect(approvalId).toBeDefined();

      // Verify approval was created
      const finalWorkflow = await videoScriptService.getScriptWorkflowStatus(script.id, tenantContext);
      expect(finalWorkflow.approvals.length).toBe(1);
      expect(finalWorkflow.approvals[0].status).toBe('pending');

      console.log('✅ Video script workflow integration test completed successfully');

    } finally {
      // Restore original method
      videoScriptService['aiHub'].routeRequest = originalRouteRequest;
    }
  });
});