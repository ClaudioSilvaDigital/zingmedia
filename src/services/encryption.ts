import crypto from 'crypto';

export interface EncryptionResult {
  encryptedData: string;
  iv: string;
  authTag: string;
}

export interface DecryptionInput {
  encryptedData: string;
  iv: string;
  authTag: string;
}

export interface EncryptionConfig {
  algorithm: string;
  keyLength: number;
  ivLength: number;
  tagLength: number;
}

/**
 * Encryption service for data at rest and in transit
 * Implements Property 15: Data Encryption Compliance
 */
export class EncryptionService {
  private readonly algorithm = 'aes-256-cbc';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly tagLength = 16; // 128 bits
  private readonly masterKey: Buffer;

  constructor(masterKeyHex?: string) {
    if (masterKeyHex) {
      this.masterKey = Buffer.from(masterKeyHex, 'hex');
    } else {
      // Generate a new master key if none provided
      this.masterKey = crypto.randomBytes(this.keyLength);
      console.warn('Generated new master key. In production, use a secure key management system.');
    }

    if (this.masterKey.length !== this.keyLength) {
      throw new Error(`Master key must be ${this.keyLength} bytes (${this.keyLength * 2} hex characters)`);
    }
  }

  /**
   * Encrypt sensitive data using AES-256-CBC
   */
  encrypt(plaintext: string): EncryptionResult {
    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv);

      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // For CBC mode, create a hash-based auth tag for integrity
      const authTag = crypto.createHash('sha256')
        .update(encrypted + iv.toString('hex'))
        .digest('hex')
        .substring(0, 32);

      return {
        encryptedData: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt sensitive data using AES-256-CBC
   */
  decrypt(input: DecryptionInput): string {
    try {
      // Verify integrity using the auth tag (hash)
      const expectedAuthTag = crypto.createHash('sha256')
        .update(input.encryptedData + input.iv)
        .digest('hex')
        .substring(0, 32);
      
      if (expectedAuthTag !== input.authTag) {
        throw new Error('Authentication failed - data may have been tampered with');
      }

      const iv = Buffer.from(input.iv, 'hex');
      const decipher = crypto.createDecipheriv(this.algorithm, this.masterKey, iv);

      let decrypted = decipher.update(input.encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Encrypt an object by serializing it first
   */
  encryptObject(obj: any): EncryptionResult {
    // Use a custom replacer to handle special values like NaN, Infinity, etc.
    const plaintext = JSON.stringify(obj, (key, value) => {
      if (typeof value === 'number') {
        if (Number.isNaN(value)) return { __type: 'NaN' };
        if (value === Infinity) return { __type: 'Infinity' };
        if (value === -Infinity) return { __type: '-Infinity' };
      }
      return value;
    });
    return this.encrypt(plaintext);
  }

  /**
   * Decrypt and deserialize an object
   */
  decryptObject<T>(input: DecryptionInput): T {
    const plaintext = this.decrypt(input);
    // Use a custom reviver to restore special values
    return JSON.parse(plaintext, (key, value) => {
      if (value && typeof value === 'object' && value.__type) {
        switch (value.__type) {
          case 'NaN': return NaN;
          case 'Infinity': return Infinity;
          case '-Infinity': return -Infinity;
        }
      }
      return value;
    });
  }

  /**
   * Hash sensitive data for indexing (one-way)
   */
  hash(data: string, salt?: string): string {
    const actualSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(data, actualSalt, 100000, 64, 'sha512');
    return `${actualSalt}:${hash.toString('hex')}`;
  }

  /**
   * Verify a hash
   */
  verifyHash(data: string, hash: string): boolean {
    try {
      const [salt, originalHash] = hash.split(':');
      const newHash = crypto.pbkdf2Sync(data, salt, 100000, 64, 'sha512');
      return originalHash === newHash.toString('hex');
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate a secure random token
   */
  generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Encrypt data for database storage
   */
  encryptForStorage(data: string): string {
    const result = this.encrypt(data);
    return `${result.iv}:${result.authTag}:${result.encryptedData}`;
  }

  /**
   * Decrypt data from database storage
   */
  decryptFromStorage(encryptedString: string): string {
    const parts = encryptedString.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted storage format');
    }
    const [iv, authTag, encryptedData] = parts;
    return this.decrypt({ iv, authTag, encryptedData });
  }

  /**
   * Get encryption configuration for audit purposes
   */
  getConfig(): EncryptionConfig {
    return {
      algorithm: this.algorithm,
      keyLength: this.keyLength,
      ivLength: this.ivLength,
      tagLength: this.tagLength
    };
  }

  /**
   * Rotate encryption key (for key rotation policies)
   */
  static generateMasterKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

// Export singleton instance
const masterKey = process.env.ENCRYPTION_MASTER_KEY;
export const encryptionService = new EncryptionService(masterKey);

/**
 * LGPD Compliance Service
 * Handles consent management and data protection requirements
 */
export interface ConsentRecord {
  id: string;
  tenantId: string;
  userId: string;
  dataType: 'image' | 'voice' | 'personal_data' | 'biometric' | 'location';
  purpose: string;
  consentGiven: boolean;
  consentDate: Date;
  expiryDate?: Date;
  withdrawnDate?: Date;
  legalBasis: 'consent' | 'contract' | 'legal_obligation' | 'vital_interests' | 'public_task' | 'legitimate_interests';
  metadata?: Record<string, any>;
}

export interface DataProcessingRecord {
  id: string;
  tenantId: string;
  userId: string;
  dataType: string;
  processingPurpose: string;
  legalBasis: string;
  dataSource: string;
  retentionPeriod: number; // in days
  processedAt: Date;
  deletedAt?: Date;
  metadata?: Record<string, any>;
}

export interface DataSubjectRequest {
  id: string;
  tenantId: string;
  userId: string;
  requestType: 'access' | 'rectification' | 'erasure' | 'portability' | 'restriction' | 'objection';
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  requestDate: Date;
  completionDate?: Date;
  requestDetails: string;
  responseDetails?: string;
  metadata?: Record<string, any>;
}

export class LGPDComplianceService {
  constructor(private db: any) {}

  /**
   * Record consent for data processing
   */
  async recordConsent(consent: Omit<ConsentRecord, 'id'>): Promise<ConsentRecord> {
    const consentId = crypto.randomUUID();
    
    const consentRecord: ConsentRecord = {
      id: consentId,
      ...consent
    };

    await this.db.query(`
      INSERT INTO public.consent_records (
        id, tenant_id, user_id, data_type, purpose, consent_given,
        consent_date, expiry_date, legal_basis, metadata, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
    `, [
      consentRecord.id,
      consentRecord.tenantId,
      consentRecord.userId,
      consentRecord.dataType,
      consentRecord.purpose,
      consentRecord.consentGiven,
      consentRecord.consentDate,
      consentRecord.expiryDate || null,
      consentRecord.legalBasis,
      JSON.stringify(consentRecord.metadata || {})
    ]);

    return consentRecord;
  }

  /**
   * Withdraw consent
   */
  async withdrawConsent(consentId: string, tenantId: string): Promise<void> {
    await this.db.query(`
      UPDATE public.consent_records 
      SET consent_given = false, withdrawn_date = CURRENT_TIMESTAMP
      WHERE id = $1 AND tenant_id = $2
    `, [consentId, tenantId]);
  }

  /**
   * Check if consent exists and is valid
   */
  async hasValidConsent(
    tenantId: string,
    userId: string,
    dataType: string,
    purpose: string
  ): Promise<boolean> {
    const result = await this.db.query(`
      SELECT consent_given, expiry_date, withdrawn_date
      FROM public.consent_records
      WHERE tenant_id = $1 AND user_id = $2 AND data_type = $3 AND purpose = $4
      ORDER BY consent_date DESC
      LIMIT 1
    `, [tenantId, userId, dataType, purpose]);

    if (result.rows.length === 0) {
      return false;
    }

    const consent = result.rows[0];
    
    // Check if consent was withdrawn
    if (consent.withdrawn_date) {
      return false;
    }

    // Check if consent is still given
    if (!consent.consent_given) {
      return false;
    }

    // Check if consent has expired
    if (consent.expiry_date && new Date(consent.expiry_date) < new Date()) {
      return false;
    }

    return true;
  }

  /**
   * Record data processing activity
   */
  async recordDataProcessing(processing: Omit<DataProcessingRecord, 'id'>): Promise<DataProcessingRecord> {
    const processingId = crypto.randomUUID();
    
    const processingRecord: DataProcessingRecord = {
      id: processingId,
      ...processing
    };

    await this.db.query(`
      INSERT INTO public.data_processing_records (
        id, tenant_id, user_id, data_type, processing_purpose, legal_basis,
        data_source, retention_period, processed_at, metadata, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
    `, [
      processingRecord.id,
      processingRecord.tenantId,
      processingRecord.userId,
      processingRecord.dataType,
      processingRecord.processingPurpose,
      processingRecord.legalBasis,
      processingRecord.dataSource,
      processingRecord.retentionPeriod,
      processingRecord.processedAt,
      JSON.stringify(processingRecord.metadata || {})
    ]);

    return processingRecord;
  }

  /**
   * Handle data subject request (LGPD Article 18)
   */
  async createDataSubjectRequest(request: Omit<DataSubjectRequest, 'id' | 'status' | 'requestDate'>): Promise<DataSubjectRequest> {
    const requestId = crypto.randomUUID();
    
    const dataSubjectRequest: DataSubjectRequest = {
      id: requestId,
      status: 'pending',
      requestDate: new Date(),
      ...request
    };

    await this.db.query(`
      INSERT INTO public.data_subject_requests (
        id, tenant_id, user_id, request_type, status, request_date,
        request_details, metadata, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
    `, [
      dataSubjectRequest.id,
      dataSubjectRequest.tenantId,
      dataSubjectRequest.userId,
      dataSubjectRequest.requestType,
      dataSubjectRequest.status,
      dataSubjectRequest.requestDate,
      dataSubjectRequest.requestDetails,
      JSON.stringify(dataSubjectRequest.metadata || {})
    ]);

    return dataSubjectRequest;
  }

  /**
   * Process data erasure request (Right to be forgotten)
   */
  async processErasureRequest(requestId: string, tenantId: string): Promise<void> {
    // Get the request details
    const requestResult = await this.db.query(`
      SELECT user_id FROM public.data_subject_requests
      WHERE id = $1 AND tenant_id = $2 AND request_type = 'erasure'
    `, [requestId, tenantId]);

    if (requestResult.rows.length === 0) {
      throw new Error('Erasure request not found');
    }

    const userId = requestResult.rows[0].user_id;

    // Begin transaction for data erasure
    await this.db.query('BEGIN');

    try {
      // Anonymize or delete personal data across all tables
      const tables = [
        'users', 'audit_logs', 'consent_records', 'data_processing_records',
        'briefings', 'content', 'workflows', 'calendar_events'
      ];

      for (const table of tables) {
        // Instead of deleting, we anonymize the data to preserve referential integrity
        await this.db.query(`
          UPDATE public.${table} 
          SET 
            user_id = NULL,
            details = CASE 
              WHEN details IS NOT NULL THEN '{"anonymized": true, "erasure_date": "' || CURRENT_TIMESTAMP || '"}'
              ELSE NULL 
            END
          WHERE user_id = $1 AND tenant_id = $2
        `, [userId, tenantId]);
      }

      // Mark user as deleted but keep record for audit purposes
      await this.db.query(`
        UPDATE public.users 
        SET 
          email = 'deleted-' || id || '@anonymized.local',
          name = 'Deleted User',
          password_hash = 'DELETED',
          is_active = false,
          deleted_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND tenant_id = $2
      `, [userId, tenantId]);

      // Update request status
      await this.db.query(`
        UPDATE public.data_subject_requests
        SET status = 'completed', completion_date = CURRENT_TIMESTAMP,
            response_details = 'Personal data has been anonymized and user account deactivated'
        WHERE id = $1
      `, [requestId]);

      await this.db.query('COMMIT');
    } catch (error) {
      await this.db.query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Generate data portability export (LGPD Article 18, V)
   */
  async generateDataExport(tenantId: string, userId: string): Promise<any> {
    const userData = {
      user: {},
      briefings: [],
      content: [],
      workflows: [],
      calendar_events: [],
      consent_records: [],
      data_processing_records: []
    };

    // Get user data
    const userResult = await this.db.query(`
      SELECT id, email, name, created_at, updated_at
      FROM public.users
      WHERE id = $1 AND tenant_id = $2
    `, [userId, tenantId]);

    if (userResult.rows.length > 0) {
      userData.user = userResult.rows[0];
    }

    // Get briefings
    const briefingsResult = await this.db.query(`
      SELECT id, title, type, fields, created_at, updated_at
      FROM public.briefings
      WHERE created_by = $1 AND tenant_id = $2
    `, [userId, tenantId]);
    userData.briefings = briefingsResult.rows;

    // Get content
    const contentResult = await this.db.query(`
      SELECT id, title, description, content_type, base_content, created_at, updated_at
      FROM public.content
      WHERE created_by = $1 AND tenant_id = $2
    `, [userId, tenantId]);
    userData.content = contentResult.rows;

    // Get workflows
    const workflowsResult = await this.db.query(`
      SELECT w.id, w.current_state, w.created_at, w.updated_at
      FROM public.workflows w
      JOIN public.content c ON w.content_id = c.id
      WHERE c.created_by = $1 AND w.tenant_id = $2
    `, [userId, tenantId]);
    userData.workflows = workflowsResult.rows;

    // Get calendar events
    const eventsResult = await this.db.query(`
      SELECT id, title, description, scheduled_at, platform, status, created_at
      FROM public.calendar_events
      WHERE created_by = $1 AND tenant_id = $2
    `, [userId, tenantId]);
    userData.calendar_events = eventsResult.rows;

    // Get consent records
    const consentResult = await this.db.query(`
      SELECT id, data_type, purpose, consent_given, consent_date, expiry_date, legal_basis
      FROM public.consent_records
      WHERE user_id = $1 AND tenant_id = $2
    `, [userId, tenantId]);
    userData.consent_records = consentResult.rows;

    // Get data processing records
    const processingResult = await this.db.query(`
      SELECT id, data_type, processing_purpose, legal_basis, data_source, processed_at
      FROM public.data_processing_records
      WHERE user_id = $1 AND tenant_id = $2
    `, [userId, tenantId]);
    userData.data_processing_records = processingResult.rows;

    return userData;
  }

  /**
   * Check data retention compliance
   */
  async checkRetentionCompliance(tenantId: string): Promise<{
    expiredRecords: number;
    deletedRecords: number;
  }> {
    // Find records that have exceeded their retention period
    const expiredResult = await this.db.query(`
      SELECT COUNT(*) as count
      FROM public.data_processing_records
      WHERE tenant_id = $1 
        AND processed_at + INTERVAL '1 day' * retention_period < CURRENT_TIMESTAMP
        AND deleted_at IS NULL
    `, [tenantId]);

    const expiredRecords = parseInt(expiredResult.rows[0].count);

    // Auto-delete expired records
    const deleteResult = await this.db.query(`
      UPDATE public.data_processing_records
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE tenant_id = $1 
        AND processed_at + INTERVAL '1 day' * retention_period < CURRENT_TIMESTAMP
        AND deleted_at IS NULL
    `, [tenantId]);

    const deletedRecords = deleteResult.rowCount || 0;

    return { expiredRecords, deletedRecords };
  }

  /**
   * Generate LGPD compliance report
   */
  async generateComplianceReport(tenantId: string): Promise<any> {
    const report = {
      tenantId,
      generatedAt: new Date(),
      consentSummary: {},
      dataProcessingSummary: {},
      dataSubjectRequests: {},
      retentionCompliance: {}
    };

    // Consent summary
    const consentSummary = await this.db.query(`
      SELECT 
        data_type,
        COUNT(*) as total_consents,
        SUM(CASE WHEN consent_given = true AND withdrawn_date IS NULL THEN 1 ELSE 0 END) as active_consents,
        SUM(CASE WHEN withdrawn_date IS NOT NULL THEN 1 ELSE 0 END) as withdrawn_consents
      FROM public.consent_records
      WHERE tenant_id = $1
      GROUP BY data_type
    `, [tenantId]);
    report.consentSummary = consentSummary.rows;

    // Data processing summary
    const processingSummary = await this.db.query(`
      SELECT 
        data_type,
        legal_basis,
        COUNT(*) as total_records,
        SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as active_records
      FROM public.data_processing_records
      WHERE tenant_id = $1
      GROUP BY data_type, legal_basis
    `, [tenantId]);
    report.dataProcessingSummary = processingSummary.rows;

    // Data subject requests summary
    const requestsSummary = await this.db.query(`
      SELECT 
        request_type,
        status,
        COUNT(*) as count
      FROM public.data_subject_requests
      WHERE tenant_id = $1
      GROUP BY request_type, status
    `, [tenantId]);
    report.dataSubjectRequests = requestsSummary.rows;

    // Retention compliance
    report.retentionCompliance = await this.checkRetentionCompliance(tenantId);

    return report;
  }
}

// Export singleton instance - lazy load to avoid circular dependencies
let _lgpdService: LGPDComplianceService | null = null;
export const getLgpdService = (): LGPDComplianceService => {
  if (!_lgpdService) {
    const { db } = require('../config/database');
    _lgpdService = new LGPDComplianceService(db);
  }
  return _lgpdService;
};