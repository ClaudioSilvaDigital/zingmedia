import { v4 as uuidv4 } from 'uuid';
import { TenantContext } from '../types/index.js';
import { DatabasePool, DatabaseClient } from '../interfaces/database.js';

export interface BestPractice {
  id: string;
  name: string;
  contentType: string;
  objective: string;
  rules: string[];
  examples: {
    positive: string[];
    negative: string[];
  };
  priority: number;
  isCustom: boolean;
  tenantId?: string;
  createdAt: Date;
}

export interface BrandVoiceGuideline {
  id: string;
  name: string;
  description: string;
  tone: string;
  personality: string[];
  dosList: string[];
  dontsList: string[];
  examples: string[];
  tenantId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class BestPracticesService {
  private db: DatabasePool;

  constructor(db: DatabasePool) {
    this.db = db;
  }

  async getBestPracticesForContent(
    contentType: string,
    objective: string,
    tenantContext: TenantContext
  ): Promise<BestPractice[]> {
    const query = `
      SELECT * FROM best_practices
      WHERE (tenant_id = ? OR tenant_id IS NULL)
        AND (content_type = ? OR content_type = 'all')
        AND (objective = ? OR objective = 'all')
      ORDER BY 
        CASE WHEN tenant_id = ? THEN 0 ELSE 1 END,
        priority DESC,
        created_at ASC
    `;

    const result = await this.db.query(query, [
      tenantContext.tenantId,
      contentType,
      objective,
      tenantContext.tenantId
    ]);

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      contentType: row.content_type,
      objective: row.objective,
      rules: JSON.parse(row.rules),
      examples: JSON.parse(row.examples),
      priority: row.priority,
      isCustom: Boolean(row.is_custom),
      tenantId: row.tenant_id,
      createdAt: new Date(row.created_at)
    }));
  }

  async getBrandVoiceGuidelines(tenantContext: TenantContext): Promise<BrandVoiceGuideline[]> {
    const query = `
      SELECT * FROM brand_voice_guidelines
      WHERE tenant_id = ? AND is_active = true
      ORDER BY created_at ASC
    `;

    const result = await this.db.query(query, [tenantContext.tenantId]);

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      tone: row.tone,
      personality: JSON.parse(row.personality),
      dosList: JSON.parse(row.dos_list),
      dontsList: JSON.parse(row.donts_list),
      examples: JSON.parse(row.examples),
      tenantId: row.tenant_id,
      isActive: Boolean(row.is_active),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  async createBestPractice(
    practiceData: Omit<BestPractice, 'id' | 'createdAt'>,
    tenantContext: TenantContext
  ): Promise<BestPractice> {
    const practiceId = uuidv4();
    const now = new Date();

    const query = `
      INSERT INTO best_practices (
        id, name, content_type, objective, rules, examples, 
        priority, is_custom, tenant_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.query(query, [
      practiceId,
      practiceData.name,
      practiceData.contentType,
      practiceData.objective,
      JSON.stringify(practiceData.rules),
      JSON.stringify(practiceData.examples),
      practiceData.priority,
      practiceData.isCustom,
      practiceData.tenantId || tenantContext.tenantId,
      now.toISOString()
    ]);

    return {
      ...practiceData,
      id: practiceId,
      createdAt: now
    };
  }

  async createBrandVoiceGuideline(
    guidelineData: Omit<BrandVoiceGuideline, 'id' | 'createdAt' | 'updatedAt'>,
    tenantContext: TenantContext
  ): Promise<BrandVoiceGuideline> {
    const guidelineId = uuidv4();
    const now = new Date();

    const query = `
      INSERT INTO brand_voice_guidelines (
        id, name, description, tone, personality, dos_list, 
        donts_list, examples, tenant_id, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.query(query, [
      guidelineId,
      guidelineData.name,
      guidelineData.description,
      guidelineData.tone,
      JSON.stringify(guidelineData.personality),
      JSON.stringify(guidelineData.dosList),
      JSON.stringify(guidelineData.dontsList),
      JSON.stringify(guidelineData.examples),
      guidelineData.tenantId,
      guidelineData.isActive,
      now.toISOString(),
      now.toISOString()
    ]);

    return {
      ...guidelineData,
      id: guidelineId,
      createdAt: now,
      updatedAt: now
    };
  }

  async formatBestPracticesForPrompt(
    contentType: string,
    objective: string,
    tenantContext: TenantContext
  ): Promise<string[]> {
    const practices = await this.getBestPracticesForContent(contentType, objective, tenantContext);
    
    return practices.map(practice => {
      let formatted = `${practice.name}:\n`;
      formatted += `Rules: ${practice.rules.join(', ')}\n`;
      
      if (practice.examples.positive.length > 0) {
        formatted += `Good examples: ${practice.examples.positive.join(', ')}\n`;
      }
      
      if (practice.examples.negative.length > 0) {
        formatted += `Avoid: ${practice.examples.negative.join(', ')}\n`;
      }
      
      return formatted;
    });
  }

  async formatBrandVoiceForPrompt(tenantContext: TenantContext): Promise<string[]> {
    const guidelines = await this.getBrandVoiceGuidelines(tenantContext);
    
    return guidelines.map(guideline => {
      let formatted = `${guideline.name}:\n`;
      formatted += `Tone: ${guideline.tone}\n`;
      formatted += `Personality: ${guideline.personality.join(', ')}\n`;
      
      if (guideline.dosList.length > 0) {
        formatted += `Do: ${guideline.dosList.join(', ')}\n`;
      }
      
      if (guideline.dontsList.length > 0) {
        formatted += `Don't: ${guideline.dontsList.join(', ')}\n`;
      }
      
      if (guideline.examples.length > 0) {
        formatted += `Examples: ${guideline.examples.join(', ')}\n`;
      }
      
      return formatted;
    });
  }

  async updateBestPractice(
    practiceId: string,
    updates: Partial<Omit<BestPractice, 'id' | 'createdAt'>>,
    tenantContext: TenantContext
  ): Promise<BestPractice> {
    const setClause = [];
    const params = [];

    if (updates.name !== undefined) {
      setClause.push('name = ?');
      params.push(updates.name);
    }
    if (updates.contentType !== undefined) {
      setClause.push('content_type = ?');
      params.push(updates.contentType);
    }
    if (updates.objective !== undefined) {
      setClause.push('objective = ?');
      params.push(updates.objective);
    }
    if (updates.rules !== undefined) {
      setClause.push('rules = ?');
      params.push(JSON.stringify(updates.rules));
    }
    if (updates.examples !== undefined) {
      setClause.push('examples = ?');
      params.push(JSON.stringify(updates.examples));
    }
    if (updates.priority !== undefined) {
      setClause.push('priority = ?');
      params.push(updates.priority);
    }

    if (setClause.length === 0) {
      throw new Error('No updates provided');
    }

    params.push(practiceId);
    params.push(tenantContext.tenantId);

    const query = `
      UPDATE best_practices 
      SET ${setClause.join(', ')}
      WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)
      RETURNING *
    `;

    const result = await this.db.query(query, params);

    if (result.rows.length === 0) {
      throw new Error('Best practice not found or access denied');
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      contentType: row.content_type,
      objective: row.objective,
      rules: JSON.parse(row.rules),
      examples: JSON.parse(row.examples),
      priority: row.priority,
      isCustom: Boolean(row.is_custom),
      tenantId: row.tenant_id,
      createdAt: new Date(row.created_at)
    };
  }

  async deleteBestPractice(
    practiceId: string,
    tenantContext: TenantContext
  ): Promise<void> {
    const query = `
      DELETE FROM best_practices 
      WHERE id = ? AND tenant_id = ?
    `;

    const result = await this.db.query(query, [practiceId, tenantContext.tenantId]);

    if (result.rowCount === 0) {
      throw new Error('Best practice not found or access denied');
    }
  }

  async getBestPracticeById(
    practiceId: string,
    tenantContext: TenantContext
  ): Promise<BestPractice | null> {
    const query = `
      SELECT * FROM best_practices
      WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)
    `;

    const result = await this.db.query(query, [practiceId, tenantContext.tenantId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      contentType: row.content_type,
      objective: row.objective,
      rules: JSON.parse(row.rules),
      examples: JSON.parse(row.examples),
      priority: row.priority,
      isCustom: Boolean(row.is_custom),
      tenantId: row.tenant_id,
      createdAt: new Date(row.created_at)
    };
  }

  async getAllBestPractices(tenantContext: TenantContext): Promise<BestPractice[]> {
    const query = `
      SELECT * FROM best_practices
      WHERE tenant_id = ? OR tenant_id IS NULL
      ORDER BY 
        CASE WHEN tenant_id = ? THEN 0 ELSE 1 END,
        priority DESC,
        name ASC
    `;

    const result = await this.db.query(query, [
      tenantContext.tenantId,
      tenantContext.tenantId
    ]);

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      contentType: row.content_type,
      objective: row.objective,
      rules: JSON.parse(row.rules),
      examples: JSON.parse(row.examples),
      priority: row.priority,
      isCustom: Boolean(row.is_custom),
      tenantId: row.tenant_id,
      createdAt: new Date(row.created_at)
    }));
  }

  async getBestPracticesByCategory(
    contentType: string,
    tenantContext: TenantContext
  ): Promise<BestPractice[]> {
    const query = `
      SELECT * FROM best_practices
      WHERE (tenant_id = ? OR tenant_id IS NULL)
        AND (content_type = ? OR content_type = 'all')
      ORDER BY 
        CASE WHEN tenant_id = ? THEN 0 ELSE 1 END,
        priority DESC,
        name ASC
    `;

    const result = await this.db.query(query, [
      tenantContext.tenantId,
      contentType,
      tenantContext.tenantId
    ]);

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      contentType: row.content_type,
      objective: row.objective,
      rules: JSON.parse(row.rules),
      examples: JSON.parse(row.examples),
      priority: row.priority,
      isCustom: Boolean(row.is_custom),
      tenantId: row.tenant_id,
      createdAt: new Date(row.created_at)
    }));
  }

  async updateBrandVoiceGuideline(
    guidelineId: string,
    updates: Partial<Omit<BrandVoiceGuideline, 'id' | 'createdAt' | 'updatedAt'>>,
    tenantContext: TenantContext
  ): Promise<BrandVoiceGuideline> {
    const setClause = [];
    const params = [];

    if (updates.name !== undefined) {
      setClause.push('name = ?');
      params.push(updates.name);
    }
    if (updates.description !== undefined) {
      setClause.push('description = ?');
      params.push(updates.description);
    }
    if (updates.tone !== undefined) {
      setClause.push('tone = ?');
      params.push(updates.tone);
    }
    if (updates.personality !== undefined) {
      setClause.push('personality = ?');
      params.push(JSON.stringify(updates.personality));
    }
    if (updates.dosList !== undefined) {
      setClause.push('dos_list = ?');
      params.push(JSON.stringify(updates.dosList));
    }
    if (updates.dontsList !== undefined) {
      setClause.push('donts_list = ?');
      params.push(JSON.stringify(updates.dontsList));
    }
    if (updates.examples !== undefined) {
      setClause.push('examples = ?');
      params.push(JSON.stringify(updates.examples));
    }
    if (updates.isActive !== undefined) {
      setClause.push('is_active = ?');
      params.push(updates.isActive);
    }

    if (setClause.length === 0) {
      throw new Error('No updates provided');
    }

    setClause.push('updated_at = ?');
    params.push(new Date().toISOString());

    params.push(guidelineId);
    params.push(tenantContext.tenantId);

    const query = `
      UPDATE brand_voice_guidelines 
      SET ${setClause.join(', ')}
      WHERE id = ? AND tenant_id = ?
      RETURNING *
    `;

    const result = await this.db.query(query, params);

    if (result.rows.length === 0) {
      throw new Error('Brand voice guideline not found or access denied');
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      tone: row.tone,
      personality: JSON.parse(row.personality),
      dosList: JSON.parse(row.dos_list),
      dontsList: JSON.parse(row.donts_list),
      examples: JSON.parse(row.examples),
      tenantId: row.tenant_id,
      isActive: Boolean(row.is_active),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  async deleteBrandVoiceGuideline(
    guidelineId: string,
    tenantContext: TenantContext
  ): Promise<void> {
    const query = `
      DELETE FROM brand_voice_guidelines 
      WHERE id = ? AND tenant_id = ?
    `;

    const result = await this.db.query(query, [guidelineId, tenantContext.tenantId]);

    if (result.rowCount === 0) {
      throw new Error('Brand voice guideline not found or access denied');
    }
  }

  async getBrandVoiceGuidelineById(
    guidelineId: string,
    tenantContext: TenantContext
  ): Promise<BrandVoiceGuideline | null> {
    const query = `
      SELECT * FROM brand_voice_guidelines
      WHERE id = ? AND tenant_id = ?
    `;

    const result = await this.db.query(query, [guidelineId, tenantContext.tenantId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      tone: row.tone,
      personality: JSON.parse(row.personality),
      dosList: JSON.parse(row.dos_list),
      dontsList: JSON.parse(row.donts_list),
      examples: JSON.parse(row.examples),
      tenantId: row.tenant_id,
      isActive: Boolean(row.is_active),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  async initializeDefaultBestPractices(): Promise<void> {
    const defaultPractices: Omit<BestPractice, 'id' | 'createdAt'>[] = [
      {
        name: 'Instagram Engagement',
        contentType: 'image',
        objective: 'engagement',
        rules: [
          'Use high-quality, visually appealing images',
          'Include relevant hashtags (5-10 optimal)',
          'Write engaging captions that encourage interaction',
          'Post consistently at optimal times'
        ],
        examples: {
          positive: ['Behind-the-scenes content', 'User-generated content', 'Story-driven posts'],
          negative: ['Overly promotional content', 'Low-quality images', 'Excessive hashtags']
        },
        priority: 5,
        isCustom: false,
        tenantId: undefined
      },
      {
        name: 'TikTok Viral Content',
        contentType: 'video',
        objective: 'viral',
        rules: [
          'Hook viewers in first 3 seconds',
          'Use trending sounds and effects',
          'Keep videos under 60 seconds',
          'Include clear call-to-action'
        ],
        examples: {
          positive: ['Trend participation', 'Educational content', 'Entertainment value'],
          negative: ['Long introductions', 'Poor audio quality', 'Overly complex content']
        },
        priority: 5,
        isCustom: false,
        tenantId: undefined
      },
      {
        name: 'LinkedIn Professional',
        contentType: 'text',
        objective: 'professional',
        rules: [
          'Maintain professional tone',
          'Share industry insights',
          'Use professional headshots',
          'Engage with comments promptly'
        ],
        examples: {
          positive: ['Industry analysis', 'Professional achievements', 'Thought leadership'],
          negative: ['Personal drama', 'Controversial opinions', 'Unprofessional language']
        },
        priority: 5,
        isCustom: false,
        tenantId: undefined
      }
    ];

    for (const practice of defaultPractices) {
      try {
        const practiceId = uuidv4();
        const now = new Date();

        const query = `
          INSERT INTO best_practices (
            id, name, content_type, objective, rules, examples, 
            priority, is_custom, tenant_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (name, content_type, objective) DO NOTHING
        `;

        await this.db.query(query, [
          practiceId,
          practice.name,
          practice.contentType,
          practice.objective,
          JSON.stringify(practice.rules),
          JSON.stringify(practice.examples),
          practice.priority,
          practice.isCustom,
          practice.tenantId,
          now.toISOString()
        ]);
      } catch (error) {
        // Ignore conflicts - practice already exists
        console.log(`Best practice already exists: ${practice.name}`);
      }
    }
  }
}