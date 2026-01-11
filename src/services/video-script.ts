import { v4 as uuidv4 } from 'uuid';
import {
  VideoScript,
  ScriptSection,
  ScriptSectionType,
  ScriptTemplate,
  ScriptTemplateSection,
  ScriptVersion,
  ScriptChange,
  ScriptGenerationRequest,
  TenantContext,
  ValidationResult,
  ValidationError,
  AIRequest,
  GenerationOptions,
  Platform
} from '../types/index.js';
import { AIIntegrationHub } from './ai-hub.js';
import { BriefingService } from './briefing.js';
import { BestPracticesService } from './best-practices.js';
import { WorkflowEngine } from './workflow.js';
import { DatabasePool, DatabaseClient } from '../interfaces/database.js';

export class VideoScriptService {
  private db: DatabasePool;
  private aiHub: AIIntegrationHub;
  private briefingService: BriefingService;
  private bestPracticesService: BestPracticesService;
  private workflowEngine: WorkflowEngine;

  constructor(db: DatabasePool) {
    this.db = db;
    this.aiHub = new AIIntegrationHub(db);
    this.briefingService = new BriefingService(db);
    this.bestPracticesService = new BestPracticesService(db);
    this.workflowEngine = new WorkflowEngine(db);
  }

  /**
   * Generate a new video script based on briefing and template
   */
  async generateScript(
    request: ScriptGenerationRequest,
    tenantContext: TenantContext
  ): Promise<VideoScript> {
    // Validate briefing exists and is active (Requirement 9.1)
    const briefing = await this.briefingService.getBriefing(request.briefingId, tenantContext);
    if (!briefing || briefing.status !== 'active') {
      throw new Error('Script generation requires an active briefing');
    }

    // Get script template
    const template = await this.getScriptTemplate(request.templateId, tenantContext);
    if (!template) {
      throw new Error('Script template not found');
    }

    // Generate script sections using AI (Requirement 9.1)
    const sections = await this.generateScriptSections(request, template, briefing, tenantContext);

    // Create script record
    const scriptId = uuidv4();
    const now = new Date();

    const client = this.db.connect ? await this.db.connect() : this.db as DatabaseClient;
    try {
      if (client.query !== this.db.query) {
        await client.query('BEGIN');
      }

      // Insert script
      await client.query(`
        INSERT INTO video_scripts (
          id, briefing_id, title, description, template_id, sections, version, 
          status, tenant_id, client_id, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        scriptId,
        request.briefingId,
        request.title,
        request.description || '',
        request.templateId,
        JSON.stringify(sections),
        1,
        'draft',
        tenantContext.tenantId,
        briefing.clientId,
        tenantContext.user.id,
        now.toISOString(),
        now.toISOString()
      ]);

      // Create initial version record (Requirement 9.2)
      const versionId = uuidv4();
      await client.query(`
        INSERT INTO script_versions (
          id, script_id, version, sections, changes, tenant_id, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        versionId,
        scriptId,
        1,
        JSON.stringify(sections),
        JSON.stringify([]),
        tenantContext.tenantId,
        tenantContext.user.id,
        now.toISOString()
      ]);

      if (client.query !== this.db.query) {
        await client.query('COMMIT');
      }

      return {
        id: scriptId,
        briefingId: request.briefingId,
        title: request.title,
        description: request.description,
        templateId: request.templateId,
        sections,
        version: 1,
        status: 'draft',
        tenantId: tenantContext.tenantId,
        clientId: briefing.clientId,
        createdBy: tenantContext.user.id,
        createdAt: now,
        updatedAt: now
      };
    } catch (error) {
      if (client.query !== this.db.query) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      if (client.release) {
        client.release();
      }
    }
  }

  /**
   * Generate script sections using AI
   */
  private async generateScriptSections(
    request: ScriptGenerationRequest,
    template: ScriptTemplate,
    briefing: any,
    tenantContext: TenantContext
  ): Promise<ScriptSection[]> {
    const sections: ScriptSection[] = [];

    // Get brand voice guidelines and best practices (Requirement 9.4)
    const brandVoiceGuidelines = await this.bestPracticesService.formatBrandVoiceForPrompt(tenantContext);
    const bestPractices = await this.bestPracticesService.formatBestPracticesForPrompt(
      'video',
      'engagement',
      tenantContext
    );

    // Generate each required section
    for (const templateSection of template.sections) {
      const sectionContent = await this.generateSectionContent(
        templateSection,
        request,
        briefing,
        brandVoiceGuidelines,
        bestPractices,
        tenantContext
      );

      const section: ScriptSection = {
        id: uuidv4(),
        type: templateSection.type,
        title: templateSection.title,
        content: sectionContent,
        duration: templateSection.suggestedDuration,
        visualElements: [],
        audioElements: [],
        metadata: {
          generatedAt: new Date().toISOString(),
          templateSectionId: templateSection.type
        },
        order: templateSection.order
      };

      sections.push(section);
    }

    return sections.sort((a, b) => a.order - b.order);
  }

  /**
   * Generate content for a specific script section
   */
  private async generateSectionContent(
    templateSection: ScriptTemplateSection,
    request: ScriptGenerationRequest,
    briefing: any,
    brandVoiceGuidelines: string[],
    bestPractices: string[],
    tenantContext: TenantContext
  ): Promise<string> {
    // Build section-specific prompt
    const prompt = this.buildSectionPrompt(
      templateSection,
      request,
      briefing,
      brandVoiceGuidelines,
      bestPractices
    );

    // Create AI request
    const aiRequest: AIRequest = {
      id: uuidv4(),
      type: 'text',
      prompt,
      options: {
        maxTokens: 500,
        temperature: 0.7,
        format: 'text/plain',
        metadata: {
          sectionType: templateSection.type,
          briefingId: briefing.id,
          scriptTitle: request.title
        }
      },
      tenantId: tenantContext.tenantId,
      userId: tenantContext.user.id,
      briefingId: briefing.id,
      createdAt: new Date()
    };

    // Route request through AI hub
    const aiResponse = await this.aiHub.routeRequest(aiRequest);

    if (aiResponse.status === 'error') {
      throw new Error(`Section generation failed for ${templateSection.type}: ${aiResponse.error}`);
    }

    return typeof aiResponse.content.data === 'string' ? 
      aiResponse.content.data : 
      JSON.stringify(aiResponse.content.data);
  }

  /**
   * Build AI prompt for specific script section
   */
  private buildSectionPrompt(
    templateSection: ScriptTemplateSection,
    request: ScriptGenerationRequest,
    briefing: any,
    brandVoiceGuidelines: string[],
    bestPractices: string[]
  ): string {
    let prompt = `Generate ${templateSection.type} content for a video script.\n\n`;

    prompt += `SECTION: ${templateSection.title}\n`;
    prompt += `DESCRIPTION: ${templateSection.description}\n\n`;

    if (templateSection.suggestedDuration) {
      prompt += `TARGET DURATION: ${templateSection.suggestedDuration} seconds\n\n`;
    }

    // Add briefing context
    prompt += `BRIEFING CONTEXT:\n`;
    prompt += `Title: ${briefing.title}\n`;
    prompt += `Type: ${briefing.type}\n`;
    Object.entries(briefing.fields).forEach(([key, value]) => {
      if (value && typeof value === 'string' && value.trim()) {
        prompt += `${key}: ${value}\n`;
      }
    });
    prompt += '\n';

    // Add script context
    prompt += `SCRIPT TITLE: ${request.title}\n`;
    if (request.description) {
      prompt += `SCRIPT DESCRIPTION: ${request.description}\n`;
    }
    prompt += `TARGET PLATFORM: ${request.targetPlatform}\n\n`;

    // Add brand voice guidelines (Requirement 9.4)
    if (brandVoiceGuidelines.length > 0) {
      prompt += `BRAND VOICE GUIDELINES:\n${brandVoiceGuidelines.join('\n')}\n\n`;
    }

    // Add best practices
    if (bestPractices.length > 0) {
      prompt += `BEST PRACTICES:\n${bestPractices.join('\n')}\n\n`;
    }

    // Add section-specific prompts
    if (templateSection.prompts.length > 0) {
      prompt += `SECTION GUIDELINES:\n${templateSection.prompts.join('\n')}\n\n`;
    }

    // Add examples if available
    if (templateSection.examples && templateSection.examples.length > 0) {
      prompt += `EXAMPLES:\n${templateSection.examples.join('\n')}\n\n`;
    }

    // Add custom prompts if provided
    if (request.customPrompts && request.customPrompts[templateSection.type]) {
      prompt += `CUSTOM INSTRUCTIONS:\n${request.customPrompts[templateSection.type]}\n\n`;
    }

    // Add section-specific instructions
    switch (templateSection.type) {
      case ScriptSectionType.HOOK:
        prompt += 'Generate an attention-grabbing opening that hooks the viewer within the first 3-5 seconds.';
        break;
      case ScriptSectionType.STORYTELLING:
        prompt += 'Create compelling narrative content that engages the audience and supports the main message.';
        break;
      case ScriptSectionType.TONE:
        prompt += 'Define the emotional tone and style that should be maintained throughout the video.';
        break;
      case ScriptSectionType.EMOTIONS:
        prompt += 'Specify the emotional journey and feelings the video should evoke in viewers.';
        break;
      case ScriptSectionType.CTA:
        prompt += 'Create a clear, compelling call-to-action that drives the desired viewer response.';
        break;
      default:
        prompt += `Generate appropriate content for the ${templateSection.type} section.`;
    }

    return prompt;
  }

  /**
   * Update script with new content and create version (Requirement 9.2)
   */
  async updateScript(
    scriptId: string,
    updates: Partial<Pick<VideoScript, 'title' | 'description' | 'sections'>>,
    tenantContext: TenantContext
  ): Promise<VideoScript> {
    const client = this.db.connect ? await this.db.connect() : this.db as DatabaseClient;
    try {
      if (client.query !== this.db.query) {
        await client.query('BEGIN');
      }

      // Get current script
      const currentScript = await this.getScript(scriptId, tenantContext);
      if (!currentScript) {
        throw new Error('Script not found');
      }

      // Calculate changes
      const changes: ScriptChange[] = [];
      if (updates.title && updates.title !== currentScript.title) {
        changes.push({
          sectionId: 'root',
          field: 'title',
          oldValue: currentScript.title,
          newValue: updates.title,
          changeType: 'modified'
        });
      }

      if (updates.sections) {
        // Compare sections for changes
        const oldSections = currentScript.sections;
        const newSections = updates.sections;

        // Track section changes
        for (const newSection of newSections) {
          const oldSection = oldSections.find(s => s.id === newSection.id);
          if (!oldSection) {
            changes.push({
              sectionId: newSection.id,
              field: 'section',
              oldValue: null,
              newValue: newSection,
              changeType: 'added'
            });
          } else if (oldSection.content !== newSection.content) {
            changes.push({
              sectionId: newSection.id,
              field: 'content',
              oldValue: oldSection.content,
              newValue: newSection.content,
              changeType: 'modified'
            });
          }
        }

        // Check for removed sections
        for (const oldSection of oldSections) {
          if (!newSections.find(s => s.id === oldSection.id)) {
            changes.push({
              sectionId: oldSection.id,
              field: 'section',
              oldValue: oldSection,
              newValue: null,
              changeType: 'removed'
            });
          }
        }
      }

      const newVersion = currentScript.version + 1;
      const now = new Date();

      // Update script
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      if (updates.title) {
        updateFields.push(`title = ?`);
        updateValues.push(updates.title);
        paramIndex++;
      }

      if (updates.description !== undefined) {
        updateFields.push(`description = ?`);
        updateValues.push(updates.description);
        paramIndex++;
      }

      if (updates.sections) {
        updateFields.push(`sections = ?`);
        updateValues.push(JSON.stringify(updates.sections));
        paramIndex++;
      }

      updateFields.push(`version = ?`, `updated_at = ?`);
      updateValues.push(newVersion, now.toISOString());

      updateValues.push(scriptId, tenantContext.tenantId);

      await client.query(`
        UPDATE video_scripts 
        SET ${updateFields.join(', ')}
        WHERE id = ? AND tenant_id = ?
      `, updateValues);

      // Create version record
      const versionId = uuidv4();
      await client.query(`
        INSERT INTO script_versions (
          id, script_id, version, sections, changes, tenant_id, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        versionId,
        scriptId,
        newVersion,
        JSON.stringify(updates.sections || currentScript.sections),
        JSON.stringify(changes),
        tenantContext.tenantId,
        tenantContext.user.id,
        now.toISOString()
      ]);

      if (client.query !== this.db.query) {
        await client.query('COMMIT');
      }

      // Return updated script
      return await this.getScript(scriptId, tenantContext) as VideoScript;
    } catch (error) {
      if (client.query !== this.db.query) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      if (client.release) {
        client.release();
      }
    }
  }

  /**
   * Get script by ID
   */
  async getScript(scriptId: string, tenantContext: TenantContext): Promise<VideoScript | null> {
    const result = await this.db.query(`
      SELECT id, briefing_id, title, description, template_id, sections, version, 
             status, workflow_id, tenant_id, client_id, created_by, created_at, updated_at
      FROM video_scripts
      WHERE id = ? AND tenant_id = ?
    `, [scriptId, tenantContext.tenantId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      briefingId: row.briefing_id,
      title: row.title,
      description: row.description,
      templateId: row.template_id,
      sections: typeof row.sections === 'string' ? JSON.parse(row.sections) : row.sections,
      version: row.version,
      status: row.status,
      workflowId: row.workflow_id,
      tenantId: row.tenant_id,
      clientId: row.client_id,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  /**
   * Get script version history (Requirement 9.2)
   */
  async getScriptVersions(scriptId: string, tenantContext: TenantContext): Promise<ScriptVersion[]> {
    const result = await this.db.query(`
      SELECT id, script_id, version, sections, changes, tenant_id, created_by, created_at
      FROM script_versions
      WHERE script_id = ? 
        AND script_id IN (SELECT id FROM video_scripts WHERE tenant_id = ?)
      ORDER BY version DESC
    `, [scriptId, tenantContext.tenantId]);

    return result.rows.map(row => ({
      id: row.id,
      scriptId: row.script_id,
      version: row.version,
      sections: row.sections,
      changes: row.changes,
      tenantId: row.tenant_id,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at)
    }));
  }

  /**
   * Create script template (Requirement 9.5)
   */
  async createScriptTemplate(
    template: Omit<ScriptTemplate, 'id' | 'createdAt' | 'updatedAt'>,
    tenantContext: TenantContext
  ): Promise<ScriptTemplate> {
    const templateId = uuidv4();
    const now = new Date();

    await this.db.query(`
      INSERT INTO script_templates (
        id, name, description, content_type, platform, sections, duration_min, 
        duration_max, tenant_id, is_active, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      templateId,
      template.name,
      template.description || '',
      template.contentType,
      template.platform,
      JSON.stringify(template.sections),
      template.duration.min,
      template.duration.max,
      tenantContext.tenantId,
      template.isActive,
      tenantContext.user.id,
      now.toISOString(),
      now.toISOString()
    ]);

    return {
      ...template,
      id: templateId,
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Get script template by ID
   */
  async getScriptTemplate(templateId: string, tenantContext: TenantContext): Promise<ScriptTemplate | null> {
    const result = await this.db.query(`
      SELECT id, name, description, content_type, platform, sections, duration_min, 
             duration_max, tenant_id, is_active, created_by, created_at, updated_at
      FROM script_templates
      WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)
    `, [templateId, tenantContext.tenantId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      contentType: row.content_type,
      platform: row.platform,
      sections: typeof row.sections === 'string' ? JSON.parse(row.sections) : row.sections,
      duration: {
        min: row.duration_min,
        max: row.duration_max
      },
      tenantId: row.tenant_id,
      isActive: Boolean(row.is_active),
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  /**
   * List available script templates
   */
  async listScriptTemplates(
    tenantContext: TenantContext,
    platform?: Platform,
    contentType?: string
  ): Promise<ScriptTemplate[]> {
    let query = `
      SELECT id, name, description, content_type, platform, sections, duration_min, 
             duration_max, tenant_id, is_active, created_by, created_at, updated_at
      FROM script_templates
      WHERE (tenant_id = ? OR tenant_id IS NULL) AND is_active = ?
    `;
    const params: any[] = [tenantContext.tenantId, true];

    if (platform) {
      query += ` AND (platform = ? OR platform = 'universal')`;
      params.push(platform);
    }

    if (contentType) {
      query += ` AND content_type = ?`;
      params.push(contentType);
    }

    query += ` ORDER BY name ASC`;

    const result = await this.db.query(query, params);

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      contentType: row.content_type,
      platform: row.platform,
      sections: typeof row.sections === 'string' ? JSON.parse(row.sections) : row.sections,
      duration: {
        min: row.duration_min,
        max: row.duration_max
      },
      tenantId: row.tenant_id,
      isActive: Boolean(row.is_active),
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  /**
   * Validate script structure (Requirement 9.1)
   */
  validateScriptStructure(script: VideoScript): ValidationResult {
    const errors: ValidationError[] = [];

    // Check required sections based on template
    const requiredSectionTypes = [
      ScriptSectionType.HOOK,
      ScriptSectionType.STORYTELLING,
      ScriptSectionType.TONE,
      ScriptSectionType.EMOTIONS,
      ScriptSectionType.CTA
    ];

    for (const requiredType of requiredSectionTypes) {
      const hasSection = script.sections.some(section => section.type === requiredType);
      if (!hasSection) {
        errors.push({
          field: 'sections',
          message: `Missing required section: ${requiredType}`,
          code: 'MISSING_REQUIRED_SECTION'
        });
      }
    }

    // Validate section content
    for (const section of script.sections) {
      if (!section.content || section.content.trim().length === 0) {
        errors.push({
          field: 'sections',
          message: `Section ${section.type} has empty content`,
          code: 'EMPTY_SECTION_CONTENT'
        });
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Connect script to workflow for approval (Requirement 9.3)
   */
  async connectToWorkflow(
    scriptId: string,
    tenantContext: TenantContext
  ): Promise<string> {
    const client = this.db.connect ? await this.db.connect() : this.db as DatabaseClient;
    try {
      if (client.query !== this.db.query) {
        await client.query('BEGIN');
      }

      // Get script
      const script = await this.getScript(scriptId, tenantContext);
      if (!script) {
        throw new Error('Script not found');
      }

      // Validate script structure before connecting to workflow (Requirement 9.3)
      const validation = this.validateScriptStructure(script);
      if (!validation.isValid) {
        throw new Error(`Script validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
      }

      // Create content record for workflow
      const contentId = uuidv4();
      const now = new Date();

      await client.query(`
        INSERT INTO content (
          id, briefing_id, title, description, content_type, base_content, 
          adapted_content, tenant_id, client_id, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        contentId,
        script.briefingId,
        script.title,
        script.description || '',
        'video',
        JSON.stringify({
          text: JSON.stringify(script.sections),
          metadata: {
            scriptId: script.id,
            contentType: 'video_script',
            templateId: script.templateId,
            version: script.version
          }
        }),
        JSON.stringify({}),
        tenantContext.tenantId,
        script.clientId,
        tenantContext.user.id,
        now.toISOString(),
        now.toISOString()
      ]);

      // Create workflow
      const workflow = await this.workflowEngine.createWorkflow(contentId, tenantContext);

      // Update script with workflow ID
      await client.query(`
        UPDATE video_scripts 
        SET workflow_id = ?, updated_at = ?
        WHERE id = ? AND tenant_id = ?
      `, [workflow.id, now.toISOString(), scriptId, tenantContext.tenantId]);

      if (client.query !== this.db.query) {
        await client.query('COMMIT');
      }

      return workflow.id;
    } catch (error) {
      if (client.query !== this.db.query) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      if (client.release) {
        client.release();
      }
    }
  }

  /**
   * Request approval for script (Requirement 9.3)
   */
  async requestScriptApproval(
    scriptId: string,
    approvers: string[],
    tenantContext: TenantContext,
    requiredApprovals: number = 1
  ): Promise<string> {
    const script = await this.getScript(scriptId, tenantContext);
    if (!script) {
      throw new Error('Script not found');
    }

    if (!script.workflowId) {
      // Automatically connect to workflow if not already connected
      await this.connectToWorkflow(scriptId, tenantContext);
      // Refresh script to get workflow ID
      const updatedScript = await this.getScript(scriptId, tenantContext);
      if (!updatedScript?.workflowId) {
        throw new Error('Failed to connect script to workflow');
      }
      script.workflowId = updatedScript.workflowId;
    }

    // Request approval through workflow engine
    const approval = await this.workflowEngine.requestApproval(
      script.workflowId,
      approvers,
      tenantContext,
      requiredApprovals
    );

    return approval.id;
  }

  /**
   * Approve script for production (Requirement 9.3)
   */
  async approveScript(
    scriptId: string,
    tenantContext: TenantContext
  ): Promise<void> {
    const script = await this.getScript(scriptId, tenantContext);
    if (!script) {
      throw new Error('Script not found');
    }

    if (!script.workflowId) {
      throw new Error('Script must be connected to workflow before approval');
    }

    // Validate script structure
    const validation = this.validateScriptStructure(script);
    if (!validation.isValid) {
      throw new Error(`Script validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    // Check if workflow has required approvals
    const workflow = await this.workflowEngine.getWorkflow(script.workflowId, tenantContext);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    const hasApprovals = workflow.approvals.some(approval => 
      approval.status === 'approved' && 
      approval.receivedApprovals.some(response => response.decision === 'approved')
    );

    if (!hasApprovals) {
      throw new Error('Script requires approval before it can be marked as approved');
    }

    // Update script status
    await this.db.query(`
      UPDATE video_scripts 
      SET status = 'approved', updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `, [new Date().toISOString(), scriptId, tenantContext.tenantId]);

    // Transition workflow to publish state
    await this.workflowEngine.transitionState(
      script.workflowId,
      'publish' as any,
      tenantContext,
      'Script approved for production'
    );
  }

  /**
   * Enhanced script generation with brand voice integration (Requirement 9.4)
   */
  private async generateScriptSections(
    request: ScriptGenerationRequest,
    template: ScriptTemplate,
    briefing: any,
    tenantContext: TenantContext
  ): Promise<ScriptSection[]> {
    const sections: ScriptSection[] = [];

    // Get brand voice guidelines and best practices (Requirement 9.4)
    const brandVoiceGuidelines = await this.getBrandVoiceGuidelines(tenantContext);
    const bestPractices = await this.bestPracticesService.formatBestPracticesForPrompt(
      'video',
      'engagement',
      tenantContext
    );

    // Generate each required section with brand voice integration
    for (const templateSection of template.sections) {
      const sectionContent = await this.generateSectionContent(
        templateSection,
        request,
        briefing,
        brandVoiceGuidelines,
        bestPractices,
        tenantContext
      );

      const section: ScriptSection = {
        id: uuidv4(),
        type: templateSection.type,
        title: templateSection.title,
        content: sectionContent,
        duration: templateSection.suggestedDuration,
        visualElements: [],
        audioElements: [],
        metadata: {
          generatedAt: new Date().toISOString(),
          templateSectionId: templateSection.type,
          brandVoiceApplied: brandVoiceGuidelines.length > 0,
          bestPracticesApplied: bestPractices.length > 0
        },
        order: templateSection.order
      };

      sections.push(section);
    }

    return sections.sort((a, b) => a.order - b.order);
  }

  /**
   * Get brand voice guidelines for tenant (Requirement 9.4)
   */
  private async getBrandVoiceGuidelines(tenantContext: TenantContext): Promise<string[]> {
    try {
      const result = await this.db.query(`
        SELECT tone, personality, dos_list, donts_list, examples
        FROM brand_voice_guidelines
        WHERE tenant_id = ? AND is_active = ?
        ORDER BY created_at DESC
        LIMIT 1
      `, [tenantContext.tenantId, true]);

      if (result.rows.length === 0) {
        return [];
      }

      const row = result.rows[0];
      const guidelines: string[] = [];

      // Add tone
      if (row.tone) {
        guidelines.push(`Tone: ${row.tone}`);
      }

      // Add personality traits
      if (row.personality) {
        const personality = typeof row.personality === 'string' ? 
          JSON.parse(row.personality) : row.personality;
        if (Array.isArray(personality) && personality.length > 0) {
          guidelines.push(`Personality: ${personality.join(', ')}`);
        }
      }

      // Add dos
      if (row.dos_list) {
        const dos = typeof row.dos_list === 'string' ? 
          JSON.parse(row.dos_list) : row.dos_list;
        if (Array.isArray(dos) && dos.length > 0) {
          guidelines.push(`Do: ${dos.join(', ')}`);
        }
      }

      // Add don'ts
      if (row.donts_list) {
        const donts = typeof row.donts_list === 'string' ? 
          JSON.parse(row.donts_list) : row.donts_list;
        if (Array.isArray(donts) && donts.length > 0) {
          guidelines.push(`Don't: ${donts.join(', ')}`);
        }
      }

      // Add examples
      if (row.examples) {
        const examples = typeof row.examples === 'string' ? 
          JSON.parse(row.examples) : row.examples;
        if (Array.isArray(examples) && examples.length > 0) {
          guidelines.push(`Examples: ${examples.join(', ')}`);
        }
      }

      return guidelines;
    } catch (error) {
      console.warn('Failed to get brand voice guidelines:', error);
      return [];
    }
  }

  /**
   * Get script workflow status
   */
  async getScriptWorkflowStatus(scriptId: string, tenantContext: TenantContext): Promise<any> {
    const script = await this.getScript(scriptId, tenantContext);
    if (!script || !script.workflowId) {
      return null;
    }

    return await this.workflowEngine.getWorkflow(script.workflowId, tenantContext);
  }

  /**
   * Add comment to script workflow
   */
  async addScriptComment(
    scriptId: string,
    content: string,
    tenantContext: TenantContext,
    parentId?: string
  ): Promise<any> {
    const script = await this.getScript(scriptId, tenantContext);
    if (!script || !script.workflowId) {
      throw new Error('Script not connected to workflow');
    }

    return await this.workflowEngine.addComment(
      script.workflowId,
      content,
      tenantContext,
      parentId
    );
  }

  /**
   * Transition script workflow state
   */
  async transitionScriptWorkflow(
    scriptId: string,
    newState: any,
    tenantContext: TenantContext,
    reason?: string
  ): Promise<void> {
    const script = await this.getScript(scriptId, tenantContext);
    if (!script || !script.workflowId) {
      throw new Error('Script not connected to workflow');
    }

    await this.workflowEngine.transitionState(
      script.workflowId,
      newState,
      tenantContext,
      reason
    );
  }
}