-- Content Automation Platform Database Schema
-- This script initializes the main database structure

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create main tenants table
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('platform', 'agency', 'client')),
    parent_id UUID REFERENCES public.tenants(id),
    brand_config JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create main users table (for platform-level users)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    roles JSONB DEFAULT '[]',
    permissions JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create roles table for RBAC
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    permissions JSONB DEFAULT '[]',
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, tenant_id)
);

-- Create audit logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    user_id UUID,
    action VARCHAR(255) NOT NULL,
    resource VARCHAR(255) NOT NULL,
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create email templates table
CREATE TABLE IF NOT EXISTS public.email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    html_content TEXT NOT NULL,
    text_content TEXT NOT NULL,
    variables JSONB DEFAULT '[]',
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, tenant_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tenants_type ON public.tenants(type);
CREATE INDEX IF NOT EXISTS idx_tenants_parent_id ON public.tenants(parent_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON public.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_roles_tenant_id ON public.roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_roles_name ON public.roles(name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_email_templates_tenant_id ON public.email_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_name ON public.email_templates(name);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON public.roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create briefing templates table
CREATE TABLE IF NOT EXISTS public.briefing_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    fields JSONB NOT NULL DEFAULT '[]',
    required_fields JSONB NOT NULL DEFAULT '[]',
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    is_active BOOLEAN DEFAULT true,
    created_by UUID NOT NULL REFERENCES public.users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, tenant_id)
);

-- Create briefings table
CREATE TABLE IF NOT EXISTS public.briefings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('internal', 'external')),
    template_id UUID NOT NULL REFERENCES public.briefing_templates(id),
    fields JSONB NOT NULL DEFAULT '{}',
    version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    client_id UUID REFERENCES public.tenants(id),
    created_by UUID NOT NULL REFERENCES public.users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create briefing versions table for version history
CREATE TABLE IF NOT EXISTS public.briefing_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    briefing_id UUID NOT NULL REFERENCES public.briefings(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    fields JSONB NOT NULL DEFAULT '{}',
    changes JSONB NOT NULL DEFAULT '[]',
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    created_by UUID NOT NULL REFERENCES public.users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(briefing_id, version)
);

-- Create indexes for briefing tables
CREATE INDEX IF NOT EXISTS idx_briefing_templates_tenant_id ON public.briefing_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_briefing_templates_name ON public.briefing_templates(name);
CREATE INDEX IF NOT EXISTS idx_briefings_tenant_id ON public.briefings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_briefings_template_id ON public.briefings(template_id);
CREATE INDEX IF NOT EXISTS idx_briefings_client_id ON public.briefings(client_id);
CREATE INDEX IF NOT EXISTS idx_briefings_status ON public.briefings(status);
CREATE INDEX IF NOT EXISTS idx_briefing_versions_briefing_id ON public.briefing_versions(briefing_id);
CREATE INDEX IF NOT EXISTS idx_briefing_versions_tenant_id ON public.briefing_versions(tenant_id);

-- Create triggers for updated_at on briefing tables
CREATE TRIGGER update_briefing_templates_updated_at BEFORE UPDATE ON public.briefing_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_briefings_updated_at BEFORE UPDATE ON public.briefings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create content table
CREATE TABLE IF NOT EXISTS public.content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    briefing_id UUID NOT NULL REFERENCES public.briefings(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('text', 'image', 'video', 'carousel')),
    base_content JSONB NOT NULL DEFAULT '{}',
    adapted_content JSONB NOT NULL DEFAULT '{}',
    workflow_id UUID,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    client_id UUID REFERENCES public.tenants(id),
    created_by UUID NOT NULL REFERENCES public.users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create workflows table
CREATE TABLE IF NOT EXISTS public.workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL REFERENCES public.content(id) ON DELETE CASCADE,
    current_state VARCHAR(50) NOT NULL DEFAULT 'research' CHECK (current_state IN (
        'research', 'planning', 'content', 'creative', 'brand_apply', 
        'compliance_check', 'approval', 'publish', 'monitor'
    )),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(content_id)
);

-- Create workflow events table for state history
CREATE TABLE IF NOT EXISTS public.workflow_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    from_state VARCHAR(50) CHECK (from_state IN (
        'research', 'planning', 'content', 'creative', 'brand_apply', 
        'compliance_check', 'approval', 'publish', 'monitor'
    )),
    to_state VARCHAR(50) NOT NULL CHECK (to_state IN (
        'research', 'planning', 'content', 'creative', 'brand_apply', 
        'compliance_check', 'approval', 'publish', 'monitor'
    )),
    user_id UUID NOT NULL REFERENCES public.users(id),
    reason TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create workflow comments table for discussion threading
CREATE TABLE IF NOT EXISTS public.workflow_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES public.workflow_comments(id),
    user_id UUID NOT NULL REFERENCES public.users(id),
    content TEXT NOT NULL,
    state VARCHAR(50) NOT NULL CHECK (state IN (
        'research', 'planning', 'content', 'creative', 'brand_apply', 
        'compliance_check', 'approval', 'publish', 'monitor'
    )),
    is_resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create approvals table
CREATE TABLE IF NOT EXISTS public.approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES public.users(id),
    approvers JSONB NOT NULL DEFAULT '[]',
    required_approvals INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Create approval responses table
CREATE TABLE IF NOT EXISTS public.approval_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_id UUID NOT NULL REFERENCES public.approvals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id),
    decision VARCHAR(50) NOT NULL CHECK (decision IN ('approved', 'rejected')),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(approval_id, user_id)
);

-- Add foreign key constraint for workflow_id in content table
ALTER TABLE public.content ADD CONSTRAINT fk_content_workflow 
    FOREIGN KEY (workflow_id) REFERENCES public.workflows(id);

-- Create indexes for workflow tables
CREATE INDEX IF NOT EXISTS idx_content_briefing_id ON public.content(briefing_id);
CREATE INDEX IF NOT EXISTS idx_content_tenant_id ON public.content(tenant_id);
CREATE INDEX IF NOT EXISTS idx_content_client_id ON public.content(client_id);
CREATE INDEX IF NOT EXISTS idx_content_workflow_id ON public.content(workflow_id);

CREATE INDEX IF NOT EXISTS idx_workflows_content_id ON public.workflows(content_id);
CREATE INDEX IF NOT EXISTS idx_workflows_tenant_id ON public.workflows(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workflows_current_state ON public.workflows(current_state);

CREATE INDEX IF NOT EXISTS idx_workflow_events_workflow_id ON public.workflow_events(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_created_at ON public.workflow_events(created_at);

CREATE INDEX IF NOT EXISTS idx_workflow_comments_workflow_id ON public.workflow_comments(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_comments_parent_id ON public.workflow_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_workflow_comments_state ON public.workflow_comments(state);

CREATE INDEX IF NOT EXISTS idx_approvals_workflow_id ON public.approvals(workflow_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON public.approvals(status);

CREATE INDEX IF NOT EXISTS idx_approval_responses_approval_id ON public.approval_responses(approval_id);
CREATE INDEX IF NOT EXISTS idx_approval_responses_user_id ON public.approval_responses(user_id);

-- Create content versions table for version history
CREATE TABLE IF NOT EXISTS public.content_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL REFERENCES public.content(id) ON DELETE CASCADE,
    version_data JSONB NOT NULL DEFAULT '{}',
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    created_by UUID NOT NULL REFERENCES public.users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for content versions
CREATE INDEX IF NOT EXISTS idx_content_versions_content_id ON public.content_versions(content_id);
CREATE INDEX IF NOT EXISTS idx_content_versions_tenant_id ON public.content_versions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_content_versions_created_at ON public.content_versions(created_at);

-- Create triggers for updated_at on workflow tables
CREATE TRIGGER update_content_updated_at BEFORE UPDATE ON public.content
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON public.workflows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflow_comments_updated_at BEFORE UPDATE ON public.workflow_comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create AI providers table
CREATE TABLE IF NOT EXISTS public.ai_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('text', 'image', 'video', 'avatar', 'research')),
    capabilities JSONB NOT NULL DEFAULT '[]',
    config JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    health_status JSONB NOT NULL DEFAULT '{"isHealthy": false, "lastChecked": null, "consecutiveFailures": 0}',
    tenant_id UUID REFERENCES public.tenants(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create AI request logs table
CREATE TABLE IF NOT EXISTS public.ai_request_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL,
    provider_id UUID REFERENCES public.ai_providers(id),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    user_id UUID NOT NULL REFERENCES public.users(id),
    request_type VARCHAR(50) NOT NULL,
    prompt TEXT NOT NULL,
    options JSONB DEFAULT '{}',
    response_status VARCHAR(50) NOT NULL CHECK (response_status IN ('success', 'error', 'partial')),
    error_message TEXT,
    processing_time INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create AI usage logs table for billing and monitoring
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    provider_id UUID NOT NULL REFERENCES public.ai_providers(id),
    credits_consumed INTEGER NOT NULL DEFAULT 0,
    request_count INTEGER NOT NULL DEFAULT 1,
    processing_time INTEGER NOT NULL DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    data_transferred BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create AI provider metrics table for performance tracking
CREATE TABLE IF NOT EXISTS public.ai_provider_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.ai_providers(id),
    response_time INTEGER NOT NULL DEFAULT 0,
    success BOOLEAN NOT NULL DEFAULT false,
    credits_consumed INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create credit balances table for tenant billing
CREATE TABLE IF NOT EXISTS public.credit_balances (
    tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id),
    balance INTEGER NOT NULL DEFAULT 0,
    monthly_usage INTEGER NOT NULL DEFAULT 0,
    daily_usage INTEGER NOT NULL DEFAULT 0,
    monthly_limit INTEGER NOT NULL DEFAULT 0,
    daily_limit INTEGER NOT NULL DEFAULT 0,
    last_reset_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create billing entries table for detailed billing records
CREATE TABLE IF NOT EXISTS public.billing_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    provider_id UUID NOT NULL REFERENCES public.ai_providers(id),
    request_id UUID NOT NULL,
    credits_consumed INTEGER NOT NULL DEFAULT 0,
    breakdown JSONB NOT NULL DEFAULT '{}',
    rate_info JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for AI tables
CREATE INDEX IF NOT EXISTS idx_ai_providers_tenant_id ON public.ai_providers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_providers_type ON public.ai_providers(type);
CREATE INDEX IF NOT EXISTS idx_ai_providers_is_active ON public.ai_providers(is_active);

CREATE INDEX IF NOT EXISTS idx_ai_request_logs_tenant_id ON public.ai_request_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_request_logs_provider_id ON public.ai_request_logs(provider_id);
CREATE INDEX IF NOT EXISTS idx_ai_request_logs_user_id ON public.ai_request_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_request_logs_created_at ON public.ai_request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_request_logs_request_type ON public.ai_request_logs(request_type);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_tenant_id ON public.ai_usage_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_provider_id ON public.ai_usage_logs(provider_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at ON public.ai_usage_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_ai_provider_metrics_provider_id ON public.ai_provider_metrics(provider_id);
CREATE INDEX IF NOT EXISTS idx_ai_provider_metrics_created_at ON public.ai_provider_metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_provider_metrics_success ON public.ai_provider_metrics(success);

CREATE INDEX IF NOT EXISTS idx_credit_balances_tenant_id ON public.credit_balances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_credit_balances_last_reset_date ON public.credit_balances(last_reset_date);

CREATE INDEX IF NOT EXISTS idx_billing_entries_tenant_id ON public.billing_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_entries_provider_id ON public.billing_entries(provider_id);
CREATE INDEX IF NOT EXISTS idx_billing_entries_request_id ON public.billing_entries(request_id);
CREATE INDEX IF NOT EXISTS idx_billing_entries_created_at ON public.billing_entries(created_at);

-- Create triggers for updated_at on AI tables
CREATE TRIGGER update_ai_providers_updated_at BEFORE UPDATE ON public.ai_providers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credit_balances_updated_at BEFORE UPDATE ON public.credit_balances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create best practices table
CREATE TABLE IF NOT EXISTS public.best_practices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    content_type VARCHAR(50) NOT NULL,
    objective VARCHAR(100) NOT NULL,
    rules JSONB NOT NULL DEFAULT '[]',
    examples JSONB NOT NULL DEFAULT '{"positive": [], "negative": []}',
    priority INTEGER NOT NULL DEFAULT 1,
    is_custom BOOLEAN DEFAULT false,
    tenant_id UUID REFERENCES public.tenants(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, content_type, objective, tenant_id)
);

-- Create brand voice guidelines table
CREATE TABLE IF NOT EXISTS public.brand_voice_guidelines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    tone VARCHAR(100) NOT NULL,
    personality JSONB NOT NULL DEFAULT '[]',
    dos_list JSONB NOT NULL DEFAULT '[]',
    donts_list JSONB NOT NULL DEFAULT '[]',
    examples JSONB NOT NULL DEFAULT '[]',
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, tenant_id)
);

-- Create indexes for best practices and brand voice tables
CREATE INDEX IF NOT EXISTS idx_best_practices_tenant_id ON public.best_practices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_best_practices_content_type ON public.best_practices(content_type);
CREATE INDEX IF NOT EXISTS idx_best_practices_objective ON public.best_practices(objective);
CREATE INDEX IF NOT EXISTS idx_best_practices_priority ON public.best_practices(priority);

CREATE INDEX IF NOT EXISTS idx_brand_voice_guidelines_tenant_id ON public.brand_voice_guidelines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_brand_voice_guidelines_is_active ON public.brand_voice_guidelines(is_active);

-- Create triggers for updated_at on brand voice guidelines
CREATE TRIGGER update_brand_voice_guidelines_updated_at BEFORE UPDATE ON public.brand_voice_guidelines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create video script templates table
CREATE TABLE IF NOT EXISTS public.script_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    content_type VARCHAR(100) NOT NULL,
    platform VARCHAR(50) NOT NULL DEFAULT 'universal' CHECK (platform IN ('instagram', 'tiktok', 'facebook', 'linkedin', 'universal')),
    sections JSONB NOT NULL DEFAULT '[]',
    duration_min INTEGER NOT NULL DEFAULT 15,
    duration_max INTEGER NOT NULL DEFAULT 180,
    tenant_id UUID REFERENCES public.tenants(id),
    is_active BOOLEAN DEFAULT true,
    created_by UUID NOT NULL REFERENCES public.users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, tenant_id)
);

-- Create video scripts table
CREATE TABLE IF NOT EXISTS public.video_scripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    briefing_id UUID NOT NULL REFERENCES public.briefings(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    template_id UUID NOT NULL REFERENCES public.script_templates(id),
    sections JSONB NOT NULL DEFAULT '[]',
    version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'approved', 'archived')),
    workflow_id UUID REFERENCES public.workflows(id),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    client_id UUID REFERENCES public.tenants(id),
    created_by UUID NOT NULL REFERENCES public.users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create script versions table for version history
CREATE TABLE IF NOT EXISTS public.script_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id UUID NOT NULL REFERENCES public.video_scripts(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    sections JSONB NOT NULL DEFAULT '[]',
    changes JSONB NOT NULL DEFAULT '[]',
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    created_by UUID NOT NULL REFERENCES public.users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(script_id, version)
);

-- Create indexes for video script tables
CREATE INDEX IF NOT EXISTS idx_script_templates_tenant_id ON public.script_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_script_templates_platform ON public.script_templates(platform);
CREATE INDEX IF NOT EXISTS idx_script_templates_content_type ON public.script_templates(content_type);
CREATE INDEX IF NOT EXISTS idx_script_templates_is_active ON public.script_templates(is_active);

CREATE INDEX IF NOT EXISTS idx_video_scripts_briefing_id ON public.video_scripts(briefing_id);
CREATE INDEX IF NOT EXISTS idx_video_scripts_template_id ON public.video_scripts(template_id);
CREATE INDEX IF NOT EXISTS idx_video_scripts_tenant_id ON public.video_scripts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_video_scripts_client_id ON public.video_scripts(client_id);
CREATE INDEX IF NOT EXISTS idx_video_scripts_status ON public.video_scripts(status);
CREATE INDEX IF NOT EXISTS idx_video_scripts_workflow_id ON public.video_scripts(workflow_id);

CREATE INDEX IF NOT EXISTS idx_script_versions_script_id ON public.script_versions(script_id);
CREATE INDEX IF NOT EXISTS idx_script_versions_tenant_id ON public.script_versions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_script_versions_version ON public.script_versions(version);

-- Create triggers for updated_at on video script tables
CREATE TRIGGER update_script_templates_updated_at BEFORE UPDATE ON public.script_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_video_scripts_updated_at BEFORE UPDATE ON public.video_scripts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default script templates
INSERT INTO public.script_templates (id, name, description, content_type, platform, sections, duration_min, duration_max, tenant_id, created_by)
VALUES 
(
    gen_random_uuid(),
    'Universal Engagement Template',
    'A versatile template for creating engaging video content across all platforms',
    'engagement',
    'universal',
    '[
        {
            "type": "hook",
            "title": "Hook",
            "description": "Attention-grabbing opening that hooks viewers in the first 3-5 seconds",
            "isRequired": true,
            "suggestedDuration": 5,
            "prompts": [
                "Start with a compelling question or surprising statement",
                "Use visual or audio elements that immediately capture attention",
                "Promise value or reveal what viewers will learn"
            ],
            "examples": [
                "Did you know that 90% of people make this common mistake?",
                "The secret that changed everything for me was...",
                "Stop scrolling - this will save you hours of work"
            ],
            "order": 1
        },
        {
            "type": "storytelling",
            "title": "Main Content",
            "description": "Core narrative that delivers value and maintains engagement",
            "isRequired": true,
            "suggestedDuration": 45,
            "prompts": [
                "Tell a story that relates to your audience",
                "Provide clear, actionable information",
                "Use examples and analogies to make complex topics simple"
            ],
            "examples": [
                "Here''s exactly what happened when I tried this approach...",
                "Let me walk you through the three steps that made all the difference",
                "The biggest mistake I see people making is..."
            ],
            "order": 2
        },
        {
            "type": "tone",
            "title": "Tone & Style",
            "description": "Emotional tone and communication style for the video",
            "isRequired": true,
            "suggestedDuration": 0,
            "prompts": [
                "Define whether the tone should be professional, casual, energetic, or calming",
                "Consider your brand voice and target audience",
                "Ensure consistency throughout the video"
            ],
            "examples": [
                "Conversational and friendly, like talking to a close friend",
                "Professional but approachable, with confidence and expertise",
                "Energetic and motivational, inspiring action"
            ],
            "order": 3
        },
        {
            "type": "emotions",
            "title": "Emotional Journey",
            "description": "Emotional arc and feelings the video should evoke",
            "isRequired": true,
            "suggestedDuration": 0,
            "prompts": [
                "Map the emotional journey from beginning to end",
                "Consider what emotions will drive engagement and action",
                "Balance different emotions to maintain interest"
            ],
            "examples": [
                "Start with curiosity, build excitement, end with confidence",
                "Create empathy through shared struggles, then provide hope",
                "Generate surprise, then satisfaction through resolution"
            ],
            "order": 4
        },
        {
            "type": "cta",
            "title": "Call to Action",
            "description": "Clear directive that tells viewers what to do next",
            "isRequired": true,
            "suggestedDuration": 10,
            "prompts": [
                "Make the next step clear and specific",
                "Create urgency or incentive to act now",
                "Align the CTA with your business goals"
            ],
            "examples": [
                "Try this technique today and let me know how it works for you",
                "Follow for more tips like this, and don''t forget to save this post",
                "Click the link in my bio to get the free template"
            ],
            "order": 5
        }
    ]',
    15,
    180,
    '00000000-0000-0000-0000-000000000000',
    (SELECT id FROM public.users WHERE email = 'admin@platform.com' LIMIT 1)
),
(
    gen_random_uuid(),
    'TikTok Viral Template',
    'Optimized template for TikTok content with viral potential',
    'viral',
    'tiktok',
    '[
        {
            "type": "hook",
            "title": "Viral Hook",
            "description": "Ultra-fast hook designed for TikTok''s algorithm and short attention spans",
            "isRequired": true,
            "suggestedDuration": 3,
            "prompts": [
                "Use trending sounds or music",
                "Start with movement or visual interest",
                "Reference current trends or challenges"
            ],
            "examples": [
                "POV: You just discovered the easiest way to...",
                "This trend is everywhere but nobody talks about...",
                "Wait for it... *dramatic pause*"
            ],
            "order": 1
        },
        {
            "type": "storytelling",
            "title": "Quick Story",
            "description": "Fast-paced narrative that fits TikTok''s format",
            "isRequired": true,
            "suggestedDuration": 20,
            "prompts": [
                "Keep it simple and visual",
                "Use quick cuts and transitions",
                "Include relatable moments"
            ],
            "examples": [],
            "order": 2
        },
        {
            "type": "tone",
            "title": "TikTok Tone",
            "description": "Casual, authentic tone that resonates with TikTok audience",
            "isRequired": true,
            "suggestedDuration": 0,
            "prompts": [
                "Be authentic and unpolished",
                "Use casual language and slang",
                "Show personality and humor"
            ],
            "examples": [],
            "order": 3
        },
        {
            "type": "emotions",
            "title": "Emotional Impact",
            "description": "Strong emotional response optimized for engagement",
            "isRequired": true,
            "suggestedDuration": 0,
            "prompts": [
                "Aim for surprise, humor, or relatability",
                "Create moments that make people want to share",
                "Build emotional connection quickly"
            ],
            "examples": [],
            "order": 4
        },
        {
            "type": "cta",
            "title": "TikTok CTA",
            "description": "Platform-specific call to action for TikTok",
            "isRequired": true,
            "suggestedDuration": 5,
            "prompts": [
                "Encourage comments, shares, or follows",
                "Ask questions to boost engagement",
                "Reference other content or trends"
            ],
            "examples": [
                "Comment if you''ve tried this!",
                "Follow for more life hacks",
                "Duet this with your version"
            ],
            "order": 5
        }
    ]',
    15,
    60,
    '00000000-0000-0000-0000-000000000000',
    (SELECT id FROM public.users WHERE email = 'admin@platform.com' LIMIT 1)
) ON CONFLICT (name, tenant_id) DO NOTHING;

-- Insert default platform tenant
INSERT INTO public.tenants (id, name, type, brand_config, settings)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    'Platform',
    'platform',
    '{"primaryColor": "#007bff", "secondaryColor": "#6c757d", "fontFamily": "Inter"}',
    '{"maxUsers": -1, "maxClients": -1, "features": ["all"], "billingPlan": "platform"}'
) ON CONFLICT (id) DO NOTHING;

-- Create calendar events table for editorial calendar
CREATE TABLE IF NOT EXISTS public.calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL REFERENCES public.content(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    scheduled_at TIMESTAMP NOT NULL,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'facebook', 'linkedin')),
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'published', 'failed', 'cancelled')),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    client_id UUID REFERENCES public.tenants(id),
    created_by UUID NOT NULL REFERENCES public.users(id),
    published_at TIMESTAMP,
    failure_reason TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create platform scheduling rules table
CREATE TABLE IF NOT EXISTS public.platform_scheduling_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'facebook', 'linkedin')),
    max_posts_per_hour INTEGER NOT NULL DEFAULT 1,
    max_posts_per_day INTEGER NOT NULL DEFAULT 10,
    min_interval_minutes INTEGER NOT NULL DEFAULT 60,
    optimal_times JSONB NOT NULL DEFAULT '[]',
    blackout_periods JSONB DEFAULT '[]',
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform, tenant_id)
);

-- Create rescheduling rules table
CREATE TABLE IF NOT EXISTS public.rescheduling_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    condition VARCHAR(50) NOT NULL CHECK (condition IN ('failure', 'conflict', 'manual')),
    action VARCHAR(50) NOT NULL CHECK (action IN ('retry', 'reschedule', 'cancel')),
    delay_minutes INTEGER NOT NULL DEFAULT 60,
    max_retries INTEGER NOT NULL DEFAULT 3,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, tenant_id)
);

-- Create indexes for calendar tables
CREATE INDEX IF NOT EXISTS idx_calendar_events_content_id ON public.calendar_events(content_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_tenant_id ON public.calendar_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_client_id ON public.calendar_events(client_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_scheduled_at ON public.calendar_events(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_platform ON public.calendar_events(platform);
CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON public.calendar_events(status);
CREATE INDEX IF NOT EXISTS idx_calendar_events_created_by ON public.calendar_events(created_by);

CREATE INDEX IF NOT EXISTS idx_platform_scheduling_rules_tenant_id ON public.platform_scheduling_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_scheduling_rules_platform ON public.platform_scheduling_rules(platform);
CREATE INDEX IF NOT EXISTS idx_platform_scheduling_rules_is_active ON public.platform_scheduling_rules(is_active);

CREATE INDEX IF NOT EXISTS idx_rescheduling_rules_tenant_id ON public.rescheduling_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rescheduling_rules_condition ON public.rescheduling_rules(condition);
CREATE INDEX IF NOT EXISTS idx_rescheduling_rules_is_active ON public.rescheduling_rules(is_active);

-- Create triggers for updated_at on calendar tables
CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON public.calendar_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_platform_scheduling_rules_updated_at BEFORE UPDATE ON public.platform_scheduling_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rescheduling_rules_updated_at BEFORE UPDATE ON public.rescheduling_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default platform scheduling rules
INSERT INTO public.platform_scheduling_rules (platform, max_posts_per_hour, max_posts_per_day, min_interval_minutes, optimal_times, tenant_id)
VALUES 
(
    'instagram',
    2,
    5,
    30,
    '[
        {"dayOfWeek": 1, "hour": 9, "score": 85, "reason": "Monday morning engagement peak"},
        {"dayOfWeek": 1, "hour": 17, "score": 90, "reason": "Monday evening high activity"},
        {"dayOfWeek": 2, "hour": 11, "score": 80, "reason": "Tuesday mid-morning"},
        {"dayOfWeek": 2, "hour": 19, "score": 88, "reason": "Tuesday evening peak"},
        {"dayOfWeek": 3, "hour": 10, "score": 82, "reason": "Wednesday morning"},
        {"dayOfWeek": 3, "hour": 18, "score": 92, "reason": "Wednesday evening highest engagement"},
        {"dayOfWeek": 4, "hour": 12, "score": 78, "reason": "Thursday lunch time"},
        {"dayOfWeek": 4, "hour": 20, "score": 85, "reason": "Thursday evening"},
        {"dayOfWeek": 5, "hour": 14, "score": 75, "reason": "Friday afternoon"},
        {"dayOfWeek": 6, "hour": 11, "score": 70, "reason": "Saturday late morning"},
        {"dayOfWeek": 0, "hour": 13, "score": 65, "reason": "Sunday afternoon"}
    ]',
    '00000000-0000-0000-0000-000000000000'
),
(
    'tiktok',
    3,
    8,
    20,
    '[
        {"dayOfWeek": 1, "hour": 6, "score": 75, "reason": "Monday early morning commute"},
        {"dayOfWeek": 1, "hour": 19, "score": 88, "reason": "Monday evening entertainment time"},
        {"dayOfWeek": 2, "hour": 9, "score": 82, "reason": "Tuesday morning break"},
        {"dayOfWeek": 2, "hour": 21, "score": 95, "reason": "Tuesday night peak viewing"},
        {"dayOfWeek": 3, "hour": 7, "score": 78, "reason": "Wednesday morning"},
        {"dayOfWeek": 3, "hour": 20, "score": 92, "reason": "Wednesday evening prime time"},
        {"dayOfWeek": 4, "hour": 8, "score": 80, "reason": "Thursday morning"},
        {"dayOfWeek": 4, "hour": 22, "score": 90, "reason": "Thursday late evening"},
        {"dayOfWeek": 5, "hour": 15, "score": 85, "reason": "Friday afternoon wind-down"},
        {"dayOfWeek": 6, "hour": 12, "score": 88, "reason": "Saturday noon peak"},
        {"dayOfWeek": 0, "hour": 14, "score": 82, "reason": "Sunday afternoon leisure"}
    ]',
    '00000000-0000-0000-0000-000000000000'
),
(
    'facebook',
    1,
    3,
    60,
    '[
        {"dayOfWeek": 1, "hour": 15, "score": 80, "reason": "Monday afternoon check-in"},
        {"dayOfWeek": 2, "hour": 9, "score": 75, "reason": "Tuesday morning news consumption"},
        {"dayOfWeek": 2, "hour": 15, "score": 85, "reason": "Tuesday afternoon peak"},
        {"dayOfWeek": 3, "hour": 13, "score": 88, "reason": "Wednesday lunch break"},
        {"dayOfWeek": 3, "hour": 15, "score": 90, "reason": "Wednesday afternoon highest engagement"},
        {"dayOfWeek": 4, "hour": 11, "score": 78, "reason": "Thursday late morning"},
        {"dayOfWeek": 4, "hour": 16, "score": 82, "reason": "Thursday afternoon"},
        {"dayOfWeek": 5, "hour": 13, "score": 70, "reason": "Friday lunch time"},
        {"dayOfWeek": 6, "hour": 10, "score": 65, "reason": "Saturday morning"},
        {"dayOfWeek": 0, "hour": 12, "score": 68, "reason": "Sunday midday"}
    ]',
    '00000000-0000-0000-0000-000000000000'
),
(
    'linkedin',
    1,
    2,
    120,
    '[
        {"dayOfWeek": 1, "hour": 8, "score": 85, "reason": "Monday morning professional start"},
        {"dayOfWeek": 1, "hour": 17, "score": 80, "reason": "Monday end of workday"},
        {"dayOfWeek": 2, "hour": 9, "score": 90, "reason": "Tuesday morning peak professional activity"},
        {"dayOfWeek": 2, "hour": 12, "score": 88, "reason": "Tuesday lunch networking"},
        {"dayOfWeek": 3, "hour": 10, "score": 92, "reason": "Wednesday mid-morning highest engagement"},
        {"dayOfWeek": 3, "hour": 14, "score": 85, "reason": "Wednesday afternoon"},
        {"dayOfWeek": 4, "hour": 11, "score": 88, "reason": "Thursday late morning"},
        {"dayOfWeek": 4, "hour": 16, "score": 82, "reason": "Thursday afternoon wrap-up"},
        {"dayOfWeek": 5, "hour": 9, "score": 75, "reason": "Friday morning"},
        {"dayOfWeek": 6, "hour": 10, "score": 40, "reason": "Saturday low professional activity"},
        {"dayOfWeek": 0, "hour": 11, "score": 35, "reason": "Sunday minimal professional engagement"}
    ]',
    '00000000-0000-0000-0000-000000000000'
) ON CONFLICT (platform, tenant_id) DO NOTHING;

-- Insert default rescheduling rules
INSERT INTO public.rescheduling_rules (name, condition, action, delay_minutes, max_retries, tenant_id)
VALUES 
(
    'Auto Retry Failed Posts',
    'failure',
    'retry',
    30,
    3,
    '00000000-0000-0000-0000-000000000000'
),
(
    'Reschedule Conflicts',
    'conflict',
    'reschedule',
    60,
    1,
    '00000000-0000-0000-0000-000000000000'
),
(
    'Manual Reschedule',
    'manual',
    'reschedule',
    0,
    0,
    '00000000-0000-0000-0000-000000000000'
) ON CONFLICT (name, tenant_id) DO NOTHING;

-- Create platform credentials table for storing API credentials
CREATE TABLE IF NOT EXISTS public.platform_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'facebook', 'linkedin')),
    credentials JSONB NOT NULL DEFAULT '{}', -- Encrypted credentials
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, platform)
);

-- Create publish jobs table for tracking publishing operations
CREATE TABLE IF NOT EXISTS public.publish_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL REFERENCES public.content(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'facebook', 'linkedin')),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'retrying')),
    result JSONB DEFAULT '{}',
    error TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    scheduled_at TIMESTAMP,
    published_at TIMESTAMP,
    next_retry_at TIMESTAMP,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create platform posts table for tracking published content
CREATE TABLE IF NOT EXISTS public.platform_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL REFERENCES public.content(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'facebook', 'linkedin')),
    platform_post_id VARCHAR(255) NOT NULL, -- ID from the platform
    post_url VARCHAR(500),
    status VARCHAR(50) NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'deleted', 'hidden', 'failed')),
    engagement_metrics JSONB DEFAULT '{}',
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform, platform_post_id)
);

-- Create platform health checks table for monitoring API health
CREATE TABLE IF NOT EXISTS public.platform_health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'facebook', 'linkedin')),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    is_healthy BOOLEAN NOT NULL DEFAULT false,
    response_time INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    rate_limit_remaining INTEGER,
    rate_limit_reset TIMESTAMP,
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create content adaptation logs table for tracking adaptations
CREATE TABLE IF NOT EXISTS public.content_adaptation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL REFERENCES public.content(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'facebook', 'linkedin')),
    original_content JSONB NOT NULL DEFAULT '{}',
    adapted_content JSONB NOT NULL DEFAULT '{}',
    adaptation_rules JSONB DEFAULT '[]',
    validation_result JSONB DEFAULT '{}',
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for publishing tables
CREATE INDEX IF NOT EXISTS idx_platform_credentials_tenant_id ON public.platform_credentials(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_credentials_platform ON public.platform_credentials(platform);
CREATE INDEX IF NOT EXISTS idx_platform_credentials_is_active ON public.platform_credentials(is_active);

CREATE INDEX IF NOT EXISTS idx_publish_jobs_content_id ON public.publish_jobs(content_id);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_platform ON public.publish_jobs(platform);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_status ON public.publish_jobs(status);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_tenant_id ON public.publish_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_scheduled_at ON public.publish_jobs(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_next_retry_at ON public.publish_jobs(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_created_at ON public.publish_jobs(created_at);

CREATE INDEX IF NOT EXISTS idx_platform_posts_content_id ON public.platform_posts(content_id);
CREATE INDEX IF NOT EXISTS idx_platform_posts_platform ON public.platform_posts(platform);
CREATE INDEX IF NOT EXISTS idx_platform_posts_tenant_id ON public.platform_posts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_posts_status ON public.platform_posts(status);
CREATE INDEX IF NOT EXISTS idx_platform_posts_published_at ON public.platform_posts(published_at);
CREATE INDEX IF NOT EXISTS idx_platform_posts_platform_post_id ON public.platform_posts(platform_post_id);

CREATE INDEX IF NOT EXISTS idx_platform_health_checks_platform ON public.platform_health_checks(platform);
CREATE INDEX IF NOT EXISTS idx_platform_health_checks_tenant_id ON public.platform_health_checks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_health_checks_checked_at ON public.platform_health_checks(checked_at);
CREATE INDEX IF NOT EXISTS idx_platform_health_checks_is_healthy ON public.platform_health_checks(is_healthy);

CREATE INDEX IF NOT EXISTS idx_content_adaptation_logs_content_id ON public.content_adaptation_logs(content_id);
CREATE INDEX IF NOT EXISTS idx_content_adaptation_logs_platform ON public.content_adaptation_logs(platform);
CREATE INDEX IF NOT EXISTS idx_content_adaptation_logs_tenant_id ON public.content_adaptation_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_content_adaptation_logs_created_at ON public.content_adaptation_logs(created_at);

-- Create triggers for updated_at on publishing tables
CREATE TRIGGER update_platform_credentials_updated_at BEFORE UPDATE ON public.platform_credentials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_publish_jobs_updated_at BEFORE UPDATE ON public.publish_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_platform_posts_updated_at BEFORE UPDATE ON public.platform_posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();