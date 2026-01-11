import { Router, Request, Response } from 'express';
import { getLgpdService, encryptionService } from '../services/encryption';
import { logAuditEvent } from '../middleware/audit';
import { AUDIT_ACTIONS, AUDIT_RESOURCES } from '../services/audit';

const router = Router();

/**
 * POST /lgpd/consent - Record user consent
 */
router.post('/consent', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auditContext?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const { userId, dataType, purpose, consentGiven, expiryDate, legalBasis, metadata } = req.body;

    if (!userId || !dataType || !purpose || consentGiven === undefined || !legalBasis) {
      return res.status(400).json({ 
        error: 'Missing required fields: userId, dataType, purpose, consentGiven, legalBasis' 
      });
    }

    const consent = await getLgpdService().recordConsent({
      tenantId,
      userId,
      dataType,
      purpose,
      consentGiven,
      consentDate: new Date(),
      expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      legalBasis,
      metadata
    });

    // Log the consent recording
    await logAuditEvent(req, AUDIT_ACTIONS.USER_CREATED, AUDIT_RESOURCES.SYSTEM, consent.id, {
      consentType: 'recorded',
      dataType,
      purpose,
      consentGiven,
      legalBasis
    });

    res.json({
      success: true,
      data: consent
    });
  } catch (error) {
    console.error('Error recording consent:', error);
    res.status(500).json({ 
      error: 'Failed to record consent',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PUT /lgpd/consent/:consentId/withdraw - Withdraw consent
 */
router.put('/consent/:consentId/withdraw', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auditContext?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const { consentId } = req.params;

    await getLgpdService().withdrawConsent(consentId, tenantId);

    // Log the consent withdrawal
    await logAuditEvent(req, AUDIT_ACTIONS.USER_UPDATED, AUDIT_RESOURCES.SYSTEM, consentId, {
      consentType: 'withdrawn'
    });

    res.json({
      success: true,
      message: 'Consent withdrawn successfully'
    });
  } catch (error) {
    console.error('Error withdrawing consent:', error);
    res.status(500).json({ 
      error: 'Failed to withdraw consent',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /lgpd/consent/check - Check if valid consent exists
 */
router.get('/consent/check', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auditContext?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const { userId, dataType, purpose } = req.query;

    if (!userId || !dataType || !purpose) {
      return res.status(400).json({ 
        error: 'Missing required query parameters: userId, dataType, purpose' 
      });
    }

    const hasConsent = await getLgpdService().hasValidConsent(
      tenantId,
      userId as string,
      dataType as string,
      purpose as string
    );

    res.json({
      success: true,
      data: {
        hasValidConsent: hasConsent,
        userId,
        dataType,
        purpose
      }
    });
  } catch (error) {
    console.error('Error checking consent:', error);
    res.status(500).json({ 
      error: 'Failed to check consent',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /lgpd/data-processing - Record data processing activity
 */
router.post('/data-processing', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auditContext?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const { 
      userId, dataType, processingPurpose, legalBasis, 
      dataSource, retentionPeriod, metadata 
    } = req.body;

    if (!userId || !dataType || !processingPurpose || !legalBasis || !dataSource) {
      return res.status(400).json({ 
        error: 'Missing required fields: userId, dataType, processingPurpose, legalBasis, dataSource' 
      });
    }

    const processing = await getLgpdService().recordDataProcessing({
      tenantId,
      userId,
      dataType,
      processingPurpose,
      legalBasis,
      dataSource,
      retentionPeriod: retentionPeriod || 365,
      processedAt: new Date(),
      metadata
    });

    // Log the data processing record
    await logAuditEvent(req, AUDIT_ACTIONS.DATA_IMPORT, AUDIT_RESOURCES.SYSTEM, processing.id, {
      dataType,
      processingPurpose,
      legalBasis,
      dataSource,
      retentionPeriod
    });

    res.json({
      success: true,
      data: processing
    });
  } catch (error) {
    console.error('Error recording data processing:', error);
    res.status(500).json({ 
      error: 'Failed to record data processing',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /lgpd/data-subject-request - Create data subject request
 */
router.post('/data-subject-request', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auditContext?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const { userId, requestType, requestDetails, metadata } = req.body;

    if (!userId || !requestType || !requestDetails) {
      return res.status(400).json({ 
        error: 'Missing required fields: userId, requestType, requestDetails' 
      });
    }

    const validRequestTypes = ['access', 'rectification', 'erasure', 'portability', 'restriction', 'objection'];
    if (!validRequestTypes.includes(requestType)) {
      return res.status(400).json({ 
        error: `Invalid request type. Must be one of: ${validRequestTypes.join(', ')}` 
      });
    }

    const request = await getLgpdService().createDataSubjectRequest({
      tenantId,
      userId,
      requestType,
      requestDetails,
      metadata
    });

    // Log the data subject request
    await logAuditEvent(req, AUDIT_ACTIONS.USER_CREATED, AUDIT_RESOURCES.SYSTEM, request.id, {
      requestType,
      userId,
      requestDetails: requestDetails.substring(0, 100) // Truncate for audit log
    });

    res.json({
      success: true,
      data: request
    });
  } catch (error) {
    console.error('Error creating data subject request:', error);
    res.status(500).json({ 
      error: 'Failed to create data subject request',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /lgpd/data-subject-request/:requestId/process-erasure - Process erasure request
 */
router.post('/data-subject-request/:requestId/process-erasure', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auditContext?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    // Check permissions (only admins should process erasure requests)
    if (!req.user?.permissions?.some(p => p.name === 'lgpd:process_erasure')) {
      await logAuditEvent(req, AUDIT_ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT, AUDIT_RESOURCES.SYSTEM);
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { requestId } = req.params;

    await getLgpdService().processErasureRequest(requestId, tenantId);

    // Log the erasure processing
    await logAuditEvent(req, AUDIT_ACTIONS.DATA_EXPORT, AUDIT_RESOURCES.SYSTEM, requestId, {
      action: 'erasure_processed',
      requestId
    });

    res.json({
      success: true,
      message: 'Erasure request processed successfully'
    });
  } catch (error) {
    console.error('Error processing erasure request:', error);
    res.status(500).json({ 
      error: 'Failed to process erasure request',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /lgpd/data-export/:userId - Generate data portability export
 */
router.get('/data-export/:userId', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auditContext?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const { userId } = req.params;

    // Check permissions (users can export their own data, admins can export any)
    const canExportAnyUser = req.user?.permissions?.some(p => p.name === 'lgpd:export_data');
    const canExportOwnData = req.user?.id === userId;

    if (!canExportAnyUser && !canExportOwnData) {
      await logAuditEvent(req, AUDIT_ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT, AUDIT_RESOURCES.SYSTEM);
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const userData = await getLgpdService().generateDataExport(tenantId, userId);

    // Log the data export
    await logAuditEvent(req, AUDIT_ACTIONS.DATA_EXPORT, AUDIT_RESOURCES.SYSTEM, userId, {
      exportType: 'user_data_portability',
      userId,
      recordCount: Object.values(userData).reduce((sum, arr) => 
        sum + (Array.isArray(arr) ? arr.length : (arr ? 1 : 0)), 0
      )
    });

    // Set headers for file download
    const filename = `user-data-export-${userId}-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.json({
      success: true,
      data: userData,
      exportInfo: {
        userId,
        tenantId,
        exportDate: new Date().toISOString(),
        dataTypes: Object.keys(userData)
      }
    });
  } catch (error) {
    console.error('Error generating data export:', error);
    res.status(500).json({ 
      error: 'Failed to generate data export',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /lgpd/compliance-report - Generate LGPD compliance report
 */
router.get('/compliance-report', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auditContext?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    // Check permissions
    if (!req.user?.permissions?.some(p => p.name === 'lgpd:view_reports')) {
      await logAuditEvent(req, AUDIT_ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT, AUDIT_RESOURCES.SYSTEM);
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const report = await getLgpdService().generateComplianceReport(tenantId);

    // Log the report generation
    await logAuditEvent(req, AUDIT_ACTIONS.DATA_EXPORT, AUDIT_RESOURCES.SYSTEM, undefined, {
      reportType: 'lgpd_compliance',
      tenantId
    });

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Error generating compliance report:', error);
    res.status(500).json({ 
      error: 'Failed to generate compliance report',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /lgpd/retention-cleanup - Run data retention cleanup
 */
router.post('/retention-cleanup', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auditContext?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    // Check permissions (only admins should run cleanup)
    if (!req.user?.permissions?.some(p => p.name === 'lgpd:run_cleanup')) {
      await logAuditEvent(req, AUDIT_ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT, AUDIT_RESOURCES.SYSTEM);
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const result = await getLgpdService().checkRetentionCompliance(tenantId);

    // Log the cleanup operation
    await logAuditEvent(req, AUDIT_ACTIONS.SYSTEM_BACKUP, AUDIT_RESOURCES.SYSTEM, undefined, {
      operation: 'retention_cleanup',
      expiredRecords: result.expiredRecords,
      deletedRecords: result.deletedRecords
    });

    res.json({
      success: true,
      data: result,
      message: `Cleaned up ${result.deletedRecords} expired records`
    });
  } catch (error) {
    console.error('Error running retention cleanup:', error);
    res.status(500).json({ 
      error: 'Failed to run retention cleanup',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /lgpd/encrypt-data - Encrypt sensitive data
 */
router.post('/encrypt-data', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auditContext?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const { data, dataType } = req.body;

    if (!data || !dataType) {
      return res.status(400).json({ 
        error: 'Missing required fields: data, dataType' 
      });
    }

    const encryptedResult = encryptionService.encrypt(data);

    // Log the encryption operation
    await logAuditEvent(req, AUDIT_ACTIONS.DATA_IMPORT, AUDIT_RESOURCES.SYSTEM, undefined, {
      operation: 'data_encryption',
      dataType,
      dataLength: data.length
    });

    res.json({
      success: true,
      data: {
        encrypted: encryptedResult,
        dataType,
        algorithm: encryptionService.getConfig().algorithm
      }
    });
  } catch (error) {
    console.error('Error encrypting data:', error);
    res.status(500).json({ 
      error: 'Failed to encrypt data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /lgpd/decrypt-data - Decrypt sensitive data
 */
router.post('/decrypt-data', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auditContext?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    // Check permissions (only authorized users should decrypt data)
    if (!req.user?.permissions?.some(p => p.name === 'encryption:decrypt')) {
      await logAuditEvent(req, AUDIT_ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT, AUDIT_RESOURCES.SYSTEM);
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { encryptedData, iv, authTag, dataType } = req.body;

    if (!encryptedData || !iv || !authTag) {
      return res.status(400).json({ 
        error: 'Missing required fields: encryptedData, iv, authTag' 
      });
    }

    const decryptedData = encryptionService.decrypt({ encryptedData, iv, authTag });

    // Log the decryption operation
    await logAuditEvent(req, AUDIT_ACTIONS.DATA_EXPORT, AUDIT_RESOURCES.SYSTEM, undefined, {
      operation: 'data_decryption',
      dataType: dataType || 'unknown',
      success: true
    });

    res.json({
      success: true,
      data: {
        decrypted: decryptedData,
        dataType
      }
    });
  } catch (error) {
    console.error('Error decrypting data:', error);
    
    // Log failed decryption attempt
    await logAuditEvent(req, AUDIT_ACTIONS.SUSPICIOUS_ACTIVITY, AUDIT_RESOURCES.SYSTEM, undefined, {
      operation: 'data_decryption_failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({ 
      error: 'Failed to decrypt data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;