import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { TestDatabaseManager } from '../config/test-database';
import { VideoScriptService } from '../services/video-script';
import { BriefingService } from '../services/briefing';
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
  Platform
} from '../types';

// Feature: content-automation-platform, Property 10: Video Script Structure Completeness
// For any generated video script, the script should contain all required sections: hook, storytelling, tone, emotions, and CTA

describe('Video Script Structure Property Tests', () => {
  let testDb: TestDatabaseManager;
  let videoScriptService: VideoScriptService;
  let briefingService: BriefingService;
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
    
    // Ensure database is ready
    await testDb.query('SELECT 1');
    
    // Create required tables for testing
    await testDb.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('platform', 'agency', 'client')),
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
        last_login_at TEXT,
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
        type TEXT NOT NULL CHECK (type IN ('internal', 'external')),
        template_id TEXT NOT NULL,
        fields TEXT NOT NULL DEFAULT '{}',
        version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
        tenant_id TEXT NOT NULL,
        client_id TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await testDb.query(`
      CREATE TABLE IF NOT EXISTS script_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        content_type TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT 'universal' CHECK (platform IN ('instagram', 'tiktok', 'facebook', 'linkedin', 'universal')),
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
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'approved', 'archived')),
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

    // Create mock AI provider tables for testing
    await testDb.query(`
      CREATE TABLE IF NOT EXISTS ai_providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        capabilities TEXT NOT NULL DEFAULT '[]',
        config TEXT NOT NULL DEFAULT '{}',
        is_active INTEGER DEFAULT 1,
        health_status TEXT NOT NULL DEFAULT '{"isHealthy": true, "lastChecked": null, "consecutiveFailures": 0}',
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
        response_status TEXT NOT NULL CHECK (response_status IN ('success', 'error', 'partial')),
        error_message TEXT,
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
        tokens_used INTEGER DEFAULT 0,
        data_transferred INTEGER DEFAULT 0,
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

    await testDb.query(`
      CREATE TABLE IF NOT EXISTS brand_voice_guidelines (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
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
  });

  afterAll(async () => {
    // Cleanup all test data
    for (const script of testScripts) {
      try {
        await testDb.query('DELETE FROM video_scripts WHERE id = ?', [script.id]);
        await testDb.query('DELETE FROM script_versions WHERE script_id = ?', [script.id]);
      } catch (error) {
        console.warn(`Failed to cleanup script ${script.id}:`, error);
      }
    }

    for (const template of testTemplates) {
      try {
        await testDb.query('DELETE FROM script_templates WHERE id = ?', [template.id]);
      } catch (error) {
        console.warn(`Failed to cleanup template ${template.id}:`, error);
      }
    }

    for (const briefing of testBriefings) {
      try {
        await testDb.query('DELETE FROM briefings WHERE id = ?', [briefing.id]);
      } catch (error) {
        console.warn(`Failed to cleanup briefing ${briefing.id}:`, error);
      }
    }

    for (const template of testBriefingTemplates) {
      try {
        await testDb.query('DELETE FROM briefing_templates WHERE id = ?', [template.id]);
      } catch (error) {
        console.warn(`Failed to cleanup briefing template ${template.id}:`, error);
      }
    }

    for (const tenant of testTenants) {
      try {
        await testDb.query('DELETE FROM tenants WHERE id = ?', [tenant.id]);
      } catch (error) {
        console.warn(`Failed to cleanup tenant ${tenant.id}:`, error);
      }
    }

    await testDb.close();
  });

  beforeEach(async () => {
    // Cleanup any existing test data
    await testDb.query('DELETE FROM script_versions');
    await testDb.query('DELETE FROM video_scripts');
    await testDb.query('DELETE FROM script_templates');
    await testDb.query('DELETE FROM briefings');
    await testDb.query('DELETE FROM briefing_templates');
    await testDb.query('DELETE FROM ai_usage_logs');
    await testDb.query('DELETE FROM ai_request_logs');
    await testDb.query('DELETE FROM ai_providers');
    await testDb.query('DELETE FROM brand_voice_guidelines');
    await testDb.query('DELETE FROM best_practices');
    await testDb.query('DELETE FROM users');
    await testDb.query('DELETE FROM tenants');
    
    // Reset test arrays for each test
    testScripts = [];
    testTemplates = [];
    testBriefings = [];
    testBriefingTemplates = [];
    testTenants = [];
    testUsers = [];
  });

  it('Property 10: Video Script Structure Completeness - should contain all required sections', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate test data
        fc.record({
          tenantName: fc.string({ minLength: 3, maxLength: 50 }).filter(s => s.trim().length > 0),
          userName: fc.string({ minLength: 3, maxLength: 50 }).filter(s => s.trim().length > 0),
          userEmail: fc.emailAddress(),
          scriptTitle: fc.string({ minLength: 3, maxLength: 100 }).filter(s => s.trim().length > 0),
          briefingTitle: fc.string({ minLength: 3, maxLength: 100 }).filter(s => s.trim().length > 0),
          objective: fc.string({ minLength: 5, maxLength: 200 }).filter(s => s.trim().length > 0),
          platform: fc.constantFrom('instagram', 'tiktok', 'facebook', 'linkedin') as fc.Arbitrary<Platform>
        }),
        async (testData) => {
          let tenant: Tenant | null = null;
          let user: User | null = null;
          let briefing: Briefing | null = null;
          let template: ScriptTemplate | null = null;
          let script: VideoScript | null = null;
          
          try {
            // Create test tenant
            const tenantId = uuidv4();
            await testDb.query(`
              INSERT INTO tenants (id, name, type, brand_config, settings, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `, [
              tenantId,
              testData.tenantName.trim(),
              'agency',
              JSON.stringify({ primaryColor: '#007bff', secondaryColor: '#6c757d', fontFamily: 'Inter' }),
              JSON.stringify({ maxUsers: 100, maxClients: 50, features: ['all'], billingPlan: 'premium' })
            ]);

            tenant = {
              id: tenantId,
              name: testData.tenantName.trim(),
              type: 'agency',
              brandConfig: { primaryColor: '#007bff', secondaryColor: '#6c757d', fontFamily: 'Inter' },
              settings: { maxUsers: 100, maxClients: 50, features: ['all'], billingPlan: 'premium' },
              createdAt: new Date(),
              updatedAt: new Date()
            };
            testTenants.push(tenant);

            // Create test user
            const userId = uuidv4();
            const uniqueEmail = `${userId.substring(0, 8)}_${testData.userEmail}`;
            await testDb.query(`
              INSERT INTO users (id, email, name, password_hash, tenant_id, roles, permissions, is_active, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `, [
              userId,
              uniqueEmail,
              testData.userName.trim(),
              'hashed_password',
              tenantId,
              JSON.stringify([]),
              JSON.stringify([]),
              1
            ]);

            user = {
              id: userId,
              email: uniqueEmail,
              name: testData.userName.trim(),
              passwordHash: 'hashed_password',
              tenantId: tenantId,
              roles: [],
              permissions: [],
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date()
            };
            testUsers.push(user);

            const tenantContext: TenantContext = {
              tenantId: tenantId,
              tenant: tenant,
              user: user,
              permissions: []
            };

            // Create mock AI provider
            const providerId = uuidv4();
            await testDb.query(`
              INSERT INTO ai_providers (id, name, type, capabilities, config, is_active, health_status, tenant_id, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `, [
              providerId,
              'Mock Text Provider',
              'text',
              JSON.stringify([{ type: 'text_generation', models: ['mock-model'], maxTokens: 1000 }]),
              JSON.stringify({ apiKey: 'mock-key' }),
              1,
              JSON.stringify({ isHealthy: true, lastChecked: new Date(), consecutiveFailures: 0 }),
              tenantId
            ]);

            // Create briefing template
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
              INSERT INTO briefing_templates (id, name, description, fields, required_fields, tenant_id, is_active, created_by, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `, [
              briefingTemplateId,
              'Test Briefing Template',
              'Test template for script generation',
              JSON.stringify(briefingFields),
              JSON.stringify(['objective']),
              tenantId,
              1,
              userId
            ]);

            const briefingTemplate: BriefingTemplate = {
              id: briefingTemplateId,
              name: 'Test Briefing Template',
              description: 'Test template for script generation',
              fields: briefingFields,
              requiredFields: ['objective'],
              tenantId: tenantId,
              isActive: true,
              createdBy: userId,
              createdAt: new Date(),
              updatedAt: new Date()
            };
            testBriefingTemplates.push(briefingTemplate);

            // Create briefing
            const briefingData = {
              title: testData.briefingTitle.trim(),
              type: 'internal' as const,
              templateId: briefingTemplateId,
              fields: { 
                objective: testData.objective.trim()
              },
              status: 'active' as const,
              tenantId: tenantId,
              createdBy: userId
            };

            briefing = await briefingService.createBriefing(briefingData, tenantContext);
            testBriefings.push(briefing);

            // Create script template with all required sections
            const templateId = uuidv4();
            const templateSections = [
              {
                type: ScriptSectionType.HOOK,
                title: 'Hook',
                description: 'Attention-grabbing opening',
                isRequired: true,
                suggestedDuration: 5,
                prompts: ['Create an engaging hook'],
                examples: ['Did you know...'],
                order: 1
              },
              {
                type: ScriptSectionType.STORYTELLING,
                title: 'Main Content',
                description: 'Core narrative content',
                isRequired: true,
                suggestedDuration: 45,
                prompts: ['Tell a compelling story'],
                examples: ['Here is what happened...'],
                order: 2
              },
              {
                type: ScriptSectionType.TONE,
                title: 'Tone & Style',
                description: 'Emotional tone for the video',
                isRequired: true,
                suggestedDuration: 0,
                prompts: ['Define the tone'],
                examples: ['Conversational and friendly'],
                order: 3
              },
              {
                type: ScriptSectionType.EMOTIONS,
                title: 'Emotional Journey',
                description: 'Emotions the video should evoke',
                isRequired: true,
                suggestedDuration: 0,
                prompts: ['Map emotional journey'],
                examples: ['Start with curiosity, end with confidence'],
                order: 4
              },
              {
                type: ScriptSectionType.CTA,
                title: 'Call to Action',
                description: 'Clear directive for viewers',
                isRequired: true,
                suggestedDuration: 10,
                prompts: ['Create clear CTA'],
                examples: ['Follow for more tips'],
                order: 5
              }
            ];

            await testDb.query(`
              INSERT INTO script_templates (id, name, description, content_type, platform, sections, duration_min, duration_max, tenant_id, is_active, created_by, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `, [
              templateId,
              'Test Script Template',
              'Template for testing script structure',
              'engagement',
              testData.platform,
              JSON.stringify(templateSections),
              15,
              180,
              tenantId,
              1,
              userId
            ]);

            template = {
              id: templateId,
              name: 'Test Script Template',
              description: 'Template for testing script structure',
              contentType: 'engagement',
              platform: testData.platform,
              sections: templateSections,
              duration: { min: 15, max: 180 },
              tenantId: tenantId,
              isActive: true,
              createdBy: userId,
              createdAt: new Date(),
              updatedAt: new Date()
            };
            testTemplates.push(template);

            // Mock AI responses for each section
            const mockResponses = [
              { sectionType: 'hook', content: 'Engaging hook content for the video' },
              { sectionType: 'storytelling', content: 'Compelling story content that engages viewers' },
              { sectionType: 'tone', content: 'Conversational and friendly tone throughout' },
              { sectionType: 'emotions', content: 'Journey from curiosity to confidence and satisfaction' },
              { sectionType: 'cta', content: 'Follow for more tips and save this post for later' }
            ];

            // Insert mock AI request logs to simulate successful generation
            for (const mockResponse of mockResponses) {
              const requestId = uuidv4();
              await testDb.query(`
                INSERT INTO ai_request_logs (id, request_id, provider_id, tenant_id, user_id, request_type, prompt, options, response_status, processing_time, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
              `, [
                uuidv4(),
                requestId,
                providerId,
                tenantId,
                userId,
                'text',
                `Generate ${mockResponse.sectionType} content`,
                JSON.stringify({}),
                'success',
                100
              ]);

              await testDb.query(`
                INSERT INTO ai_usage_logs (id, tenant_id, provider_id, credits_consumed, request_count, processing_time, tokens_used, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
              `, [
                uuidv4(),
                tenantId,
                providerId,
                1,
                1,
                100,
                50
              ]);
            }

            // Generate script request
            const scriptRequest: ScriptGenerationRequest = {
              briefingId: briefing.id,
              templateId: templateId,
              title: testData.scriptTitle.trim(),
              description: 'Generated script for testing',
              targetPlatform: testData.platform,
              duration: 60
            };

            // Mock the AI hub to return successful responses
            const originalRouteRequest = videoScriptService['aiHub'].routeRequest;
            let sectionIndex = 0;
            videoScriptService['aiHub'].routeRequest = async (request: any) => {
              const mockResponse = mockResponses[sectionIndex % mockResponses.length];
              sectionIndex++;
              return {
                id: uuidv4(),
                requestId: request.id,
                providerId: providerId,
                content: {
                  type: 'text',
                  data: mockResponse.content
                },
                usage: { creditsConsumed: 1, requestCount: 1, processingTime: 100 },
                status: 'success' as const,
                processingTime: 100,
                createdAt: new Date()
              };
            };

            try {
              // Generate the script
              script = await videoScriptService.generateScript(scriptRequest, tenantContext);
              testScripts.push(script);

              // Property: Script should contain all required sections
              const requiredSectionTypes = [
                ScriptSectionType.HOOK,
                ScriptSectionType.STORYTELLING,
                ScriptSectionType.TONE,
                ScriptSectionType.EMOTIONS,
                ScriptSectionType.CTA
              ];

              // Verify all required sections are present
              for (const requiredType of requiredSectionTypes) {
                const hasSection = script.sections.some(section => section.type === requiredType);
                expect(hasSection).toBe(true);
              }

              // Property: Script should have exactly the required number of sections
              expect(script.sections.length).toBe(requiredSectionTypes.length);

              // Property: Each section should have non-empty content
              for (const section of script.sections) {
                expect(section.content).toBeDefined();
                expect(section.content.trim().length).toBeGreaterThan(0);
                expect(section.title).toBeDefined();
                expect(section.title.trim().length).toBeGreaterThan(0);
              }

              // Property: Sections should be in correct order
              const sectionTypes = script.sections.map(s => s.type);
              expect(sectionTypes).toEqual(requiredSectionTypes);

              // Property: Script validation should pass
              const validation = videoScriptService.validateScriptStructure(script);
              expect(validation.isValid).toBe(true);
              expect(validation.errors.length).toBe(0);

              // Property: Script should have correct metadata
              expect(script.briefingId).toBe(briefing.id);
              expect(script.templateId).toBe(templateId);
              expect(script.title).toBe(testData.scriptTitle.trim());
              expect(script.version).toBe(1);
              expect(script.status).toBe('draft');
              expect(script.tenantId).toBe(tenantId);
              expect(script.createdBy).toBe(userId);

            } finally {
              // Restore original method
              videoScriptService['aiHub'].routeRequest = originalRouteRequest;
            }

          } finally {
            // Cleanup will be handled by afterAll
          }
        }
      ),
      { numRuns: 10, timeout: 30000 }
    );
  });
});