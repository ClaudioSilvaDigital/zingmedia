-- Security and LGPD Compliance Tables
-- This script creates tables for data encryption and LGPD compliance

-- Create consent records table for LGPD compliance
CREATE TABLE IF NOT EXISTS public.consent_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    user_id UUID NOT NULL REFERENCES public.users(id),
    data_type VARCHAR(50) NOT NULL CHECK (data_type IN ('image', 'voice', 'personal_data', 'biometric', 'location')),
    purpose VARCHAR(500) NOT NULL,
    consent_given BOOLEAN NOT NULL DEFAULT false,
    consent_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expiry_date TIMESTAMP,
    withdrawn_date TIMESTAMP,
    legal_basis VARCHAR(50) NOT NULL CHECK (legal_basis IN ('consent', 'contract', 'legal_obligation', 'vital_interests', 'public_task', 'legitimate_interests')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create data processing records table for LGPD compliance
CREATE TABLE IF NOT EXISTS public.data_processing_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    user_id UUID NOT NULL REFERENCES public.users(id),
    data_type VARCHAR(100) NOT NULL,
    processing_purpose VARCHAR(500) NOT NULL,
    legal_basis VARCHAR(50) NOT NULL,
    data_source VARCHAR(200) NOT NULL,
    retention_period INTEGER NOT NULL DEFAULT 365, -- in days
    processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create data subject requests table for LGPD Article 18 rights
CREATE TABLE IF NOT EXISTS public.data_subject_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    user_id UUID NOT NULL REFERENCES public.users(id),
    request_type VARCHAR(50) NOT NULL CHECK (request_type IN ('access', 'rectification', 'erasure', 'portability', 'restriction', 'objection')),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
    request_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completion_date TIMESTAMP,
    request_details TEXT NOT NULL,
    response_details TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create encryption keys table for key management
CREATE TABLE IF NOT EXISTS public.encryption_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    key_type VARCHAR(50) NOT NULL CHECK (key_type IN ('master', 'data', 'backup')),
    key_hash VARCHAR(128) NOT NULL, -- Hash of the key for identification
    algorithm VARCHAR(50) NOT NULL DEFAULT 'aes-256-gcm',
    key_status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (key_status IN ('active', 'rotated', 'revoked')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    rotated_at TIMESTAMP,
    expires_at TIMESTAMP
);

-- Create encrypted data table for storing encrypted sensitive information
CREATE TABLE IF NOT EXISTS public.encrypted_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    data_type VARCHAR(100) NOT NULL,
    encrypted_content TEXT NOT NULL, -- Format: iv:authTag:encryptedData
    key_id UUID NOT NULL REFERENCES public.encryption_keys(id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create data breach incidents table for security monitoring
CREATE TABLE IF NOT EXISTS public.data_breach_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    incident_type VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    affected_data_types JSONB NOT NULL DEFAULT '[]',
    affected_users_count INTEGER DEFAULT 0,
    detected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    reported_to_authority BOOLEAN DEFAULT false,
    authority_report_date TIMESTAMP,
    mitigation_actions JSONB DEFAULT '[]',
    status VARCHAR(50) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create privacy impact assessments table
CREATE TABLE IF NOT EXISTS public.privacy_impact_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    assessment_name VARCHAR(255) NOT NULL,
    data_processing_description TEXT NOT NULL,
    data_types JSONB NOT NULL DEFAULT '[]',
    legal_basis VARCHAR(50) NOT NULL,
    risk_level VARCHAR(50) NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
    risk_assessment JSONB NOT NULL DEFAULT '{}',
    mitigation_measures JSONB NOT NULL DEFAULT '[]',
    assessment_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    review_date TIMESTAMP,
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected', 'under_review')),
    approved_by UUID REFERENCES public.users(id),
    created_by UUID NOT NULL REFERENCES public.users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add deleted_at column to users table for soft deletion
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_consent_records_tenant_id ON public.consent_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_consent_records_user_id ON public.consent_records(user_id);
CREATE INDEX IF NOT EXISTS idx_consent_records_data_type ON public.consent_records(data_type);
CREATE INDEX IF NOT EXISTS idx_consent_records_consent_given ON public.consent_records(consent_given);
CREATE INDEX IF NOT EXISTS idx_consent_records_expiry_date ON public.consent_records(expiry_date);

CREATE INDEX IF NOT EXISTS idx_data_processing_records_tenant_id ON public.data_processing_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_data_processing_records_user_id ON public.data_processing_records(user_id);
CREATE INDEX IF NOT EXISTS idx_data_processing_records_data_type ON public.data_processing_records(data_type);
CREATE INDEX IF NOT EXISTS idx_data_processing_records_processed_at ON public.data_processing_records(processed_at);
CREATE INDEX IF NOT EXISTS idx_data_processing_records_deleted_at ON public.data_processing_records(deleted_at);

CREATE INDEX IF NOT EXISTS idx_data_subject_requests_tenant_id ON public.data_subject_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_data_subject_requests_user_id ON public.data_subject_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_data_subject_requests_request_type ON public.data_subject_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_data_subject_requests_status ON public.data_subject_requests(status);
CREATE INDEX IF NOT EXISTS idx_data_subject_requests_request_date ON public.data_subject_requests(request_date);

CREATE INDEX IF NOT EXISTS idx_encryption_keys_tenant_id ON public.encryption_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_encryption_keys_key_type ON public.encryption_keys(key_type);
CREATE INDEX IF NOT EXISTS idx_encryption_keys_key_status ON public.encryption_keys(key_status);
CREATE INDEX IF NOT EXISTS idx_encryption_keys_expires_at ON public.encryption_keys(expires_at);

CREATE INDEX IF NOT EXISTS idx_encrypted_data_tenant_id ON public.encrypted_data(tenant_id);
CREATE INDEX IF NOT EXISTS idx_encrypted_data_data_type ON public.encrypted_data(data_type);
CREATE INDEX IF NOT EXISTS idx_encrypted_data_key_id ON public.encrypted_data(key_id);

CREATE INDEX IF NOT EXISTS idx_data_breach_incidents_tenant_id ON public.data_breach_incidents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_data_breach_incidents_severity ON public.data_breach_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_data_breach_incidents_status ON public.data_breach_incidents(status);
CREATE INDEX IF NOT EXISTS idx_data_breach_incidents_detected_at ON public.data_breach_incidents(detected_at);

CREATE INDEX IF NOT EXISTS idx_privacy_impact_assessments_tenant_id ON public.privacy_impact_assessments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_privacy_impact_assessments_risk_level ON public.privacy_impact_assessments(risk_level);
CREATE INDEX IF NOT EXISTS idx_privacy_impact_assessments_status ON public.privacy_impact_assessments(status);
CREATE INDEX IF NOT EXISTS idx_privacy_impact_assessments_assessment_date ON public.privacy_impact_assessments(assessment_date);

CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON public.users(deleted_at);

-- Create triggers for updated_at columns
CREATE TRIGGER update_consent_records_updated_at BEFORE UPDATE ON public.consent_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_data_subject_requests_updated_at BEFORE UPDATE ON public.data_subject_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_encrypted_data_updated_at BEFORE UPDATE ON public.encrypted_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_data_breach_incidents_updated_at BEFORE UPDATE ON public.data_breach_incidents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_privacy_impact_assessments_updated_at BEFORE UPDATE ON public.privacy_impact_assessments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function for automatic data retention cleanup
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    -- Mark expired data processing records as deleted
    UPDATE public.data_processing_records
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE deleted_at IS NULL 
      AND processed_at + INTERVAL '1 day' * retention_period < CURRENT_TIMESTAMP;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log the cleanup operation
    INSERT INTO public.audit_logs (tenant_id, action, resource, details, created_at)
    SELECT DISTINCT 
        tenant_id,
        'data_retention_cleanup',
        'data_processing_records',
        json_build_object('deleted_count', deleted_count, 'cleanup_date', CURRENT_TIMESTAMP),
        CURRENT_TIMESTAMP
    FROM public.data_processing_records
    WHERE deleted_at = CURRENT_TIMESTAMP;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function for consent expiry cleanup
CREATE OR REPLACE FUNCTION cleanup_expired_consents()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER := 0;
BEGIN
    -- Mark expired consents as withdrawn
    UPDATE public.consent_records
    SET consent_given = false, withdrawn_date = CURRENT_TIMESTAMP
    WHERE consent_given = true 
      AND withdrawn_date IS NULL
      AND expiry_date IS NOT NULL 
      AND expiry_date < CURRENT_TIMESTAMP;
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    
    -- Log the cleanup operation
    INSERT INTO public.audit_logs (tenant_id, action, resource, details, created_at)
    SELECT DISTINCT 
        tenant_id,
        'consent_expiry_cleanup',
        'consent_records',
        json_build_object('expired_count', expired_count, 'cleanup_date', CURRENT_TIMESTAMP),
        CURRENT_TIMESTAMP
    FROM public.consent_records
    WHERE withdrawn_date = CURRENT_TIMESTAMP;
    
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Create view for active consents
CREATE OR REPLACE VIEW public.active_consents AS
SELECT 
    id,
    tenant_id,
    user_id,
    data_type,
    purpose,
    consent_date,
    expiry_date,
    legal_basis,
    metadata
FROM public.consent_records
WHERE consent_given = true 
  AND withdrawn_date IS NULL
  AND (expiry_date IS NULL OR expiry_date > CURRENT_TIMESTAMP);

-- Create view for LGPD compliance dashboard
CREATE OR REPLACE VIEW public.lgpd_compliance_summary AS
SELECT 
    t.id as tenant_id,
    t.name as tenant_name,
    -- Consent metrics
    COUNT(DISTINCT cr.id) as total_consents,
    COUNT(DISTINCT CASE WHEN cr.consent_given = true AND cr.withdrawn_date IS NULL THEN cr.id END) as active_consents,
    COUNT(DISTINCT CASE WHEN cr.withdrawn_date IS NOT NULL THEN cr.id END) as withdrawn_consents,
    -- Data processing metrics
    COUNT(DISTINCT dpr.id) as total_processing_records,
    COUNT(DISTINCT CASE WHEN dpr.deleted_at IS NULL THEN dpr.id END) as active_processing_records,
    -- Data subject requests metrics
    COUNT(DISTINCT dsr.id) as total_data_requests,
    COUNT(DISTINCT CASE WHEN dsr.status = 'pending' THEN dsr.id END) as pending_requests,
    COUNT(DISTINCT CASE WHEN dsr.status = 'completed' THEN dsr.id END) as completed_requests,
    -- Breach incidents
    COUNT(DISTINCT dbi.id) as total_breach_incidents,
    COUNT(DISTINCT CASE WHEN dbi.status = 'open' THEN dbi.id END) as open_incidents
FROM public.tenants t
LEFT JOIN public.consent_records cr ON t.id = cr.tenant_id
LEFT JOIN public.data_processing_records dpr ON t.id = dpr.tenant_id
LEFT JOIN public.data_subject_requests dsr ON t.id = dsr.tenant_id
LEFT JOIN public.data_breach_incidents dbi ON t.id = dbi.tenant_id
GROUP BY t.id, t.name;