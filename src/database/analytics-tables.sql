-- Analytics and Performance Tracking Tables
-- These tables support the analytics service functionality

-- Create metrics collection jobs table
CREATE TABLE IF NOT EXISTS public.metrics_collection_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    platforms JSONB NOT NULL DEFAULT '[]',
    content_ids JSONB NOT NULL DEFAULT '[]',
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    last_run TIMESTAMP,
    next_run TIMESTAMP,
    error_message TEXT,
    metrics_collected INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create content performance history table for tracking metrics over time
CREATE TABLE IF NOT EXISTS public.content_performance_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL REFERENCES public.content(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'facebook', 'linkedin')),
    metrics JSONB NOT NULL DEFAULT '{}',
    score INTEGER NOT NULL DEFAULT 0,
    ranking_position INTEGER,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create brand adherence metrics table
CREATE TABLE IF NOT EXISTS public.brand_adherence_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL REFERENCES public.content(id) ON DELETE CASCADE,
    voice_consistency INTEGER NOT NULL DEFAULT 0,
    visual_consistency INTEGER NOT NULL DEFAULT 0,
    message_alignment INTEGER NOT NULL DEFAULT 0,
    best_practices_followed JSONB NOT NULL DEFAULT '[]',
    violations JSONB NOT NULL DEFAULT '[]',
    overall_score INTEGER NOT NULL DEFAULT 0,
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(content_id)
);

-- Create analytics reports table for storing generated reports
CREATE TABLE IF NOT EXISTS public.analytics_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    client_id UUID REFERENCES public.tenants(id),
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    report_data JSONB NOT NULL DEFAULT '{}',
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create performance recommendations table
CREATE TABLE IF NOT EXISTS public.performance_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    type VARCHAR(50) NOT NULL CHECK (type IN ('posting_time', 'content_type', 'platform_focus', 'engagement_strategy', 'brand_adherence')),
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    impact VARCHAR(20) NOT NULL CHECK (impact IN ('high', 'medium', 'low')),
    confidence INTEGER NOT NULL DEFAULT 0,
    data JSONB NOT NULL DEFAULT '{}',
    actionable BOOLEAN DEFAULT true,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'implemented', 'dismissed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create content scores table for detailed scoring breakdown
CREATE TABLE IF NOT EXISTS public.content_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL REFERENCES public.content(id) ON DELETE CASCADE,
    overall_score INTEGER NOT NULL DEFAULT 0,
    brand_adherence_score INTEGER NOT NULL DEFAULT 0,
    engagement_score INTEGER NOT NULL DEFAULT 0,
    quality_score INTEGER NOT NULL DEFAULT 0,
    factors JSONB NOT NULL DEFAULT '[]',
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(content_id)
);

-- Create platform analytics summary table for quick access to platform metrics
CREATE TABLE IF NOT EXISTS public.platform_analytics_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    client_id UUID REFERENCES public.tenants(id),
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'facebook', 'linkedin')),
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    total_posts INTEGER NOT NULL DEFAULT 0,
    total_engagement INTEGER NOT NULL DEFAULT 0,
    average_engagement_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
    top_performing_content JSONB DEFAULT '[]',
    engagement_trends JSONB DEFAULT '[]',
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, client_id, platform, period_start, period_end)
);

-- Create indexes for analytics tables
CREATE INDEX IF NOT EXISTS idx_metrics_collection_jobs_tenant_id ON public.metrics_collection_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_metrics_collection_jobs_status ON public.metrics_collection_jobs(status);
CREATE INDEX IF NOT EXISTS idx_metrics_collection_jobs_next_run ON public.metrics_collection_jobs(next_run);
CREATE INDEX IF NOT EXISTS idx_metrics_collection_jobs_created_at ON public.metrics_collection_jobs(created_at);

CREATE INDEX IF NOT EXISTS idx_content_performance_history_content_id ON public.content_performance_history(content_id);
CREATE INDEX IF NOT EXISTS idx_content_performance_history_platform ON public.content_performance_history(platform);
CREATE INDEX IF NOT EXISTS idx_content_performance_history_timestamp ON public.content_performance_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_content_performance_history_score ON public.content_performance_history(score);

CREATE INDEX IF NOT EXISTS idx_brand_adherence_metrics_content_id ON public.brand_adherence_metrics(content_id);
CREATE INDEX IF NOT EXISTS idx_brand_adherence_metrics_overall_score ON public.brand_adherence_metrics(overall_score);
CREATE INDEX IF NOT EXISTS idx_brand_adherence_metrics_calculated_at ON public.brand_adherence_metrics(calculated_at);

CREATE INDEX IF NOT EXISTS idx_analytics_reports_tenant_id ON public.analytics_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_analytics_reports_client_id ON public.analytics_reports(client_id);
CREATE INDEX IF NOT EXISTS idx_analytics_reports_period_start ON public.analytics_reports(period_start);
CREATE INDEX IF NOT EXISTS idx_analytics_reports_period_end ON public.analytics_reports(period_end);
CREATE INDEX IF NOT EXISTS idx_analytics_reports_generated_at ON public.analytics_reports(generated_at);

CREATE INDEX IF NOT EXISTS idx_performance_recommendations_tenant_id ON public.performance_recommendations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_performance_recommendations_type ON public.performance_recommendations(type);
CREATE INDEX IF NOT EXISTS idx_performance_recommendations_impact ON public.performance_recommendations(impact);
CREATE INDEX IF NOT EXISTS idx_performance_recommendations_status ON public.performance_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_performance_recommendations_created_at ON public.performance_recommendations(created_at);

CREATE INDEX IF NOT EXISTS idx_content_scores_content_id ON public.content_scores(content_id);
CREATE INDEX IF NOT EXISTS idx_content_scores_overall_score ON public.content_scores(overall_score);
CREATE INDEX IF NOT EXISTS idx_content_scores_calculated_at ON public.content_scores(calculated_at);

CREATE INDEX IF NOT EXISTS idx_platform_analytics_summary_tenant_id ON public.platform_analytics_summary(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_analytics_summary_client_id ON public.platform_analytics_summary(client_id);
CREATE INDEX IF NOT EXISTS idx_platform_analytics_summary_platform ON public.platform_analytics_summary(platform);
CREATE INDEX IF NOT EXISTS idx_platform_analytics_summary_period ON public.platform_analytics_summary(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_platform_analytics_summary_calculated_at ON public.platform_analytics_summary(calculated_at);

-- Create triggers for updated_at columns
CREATE TRIGGER update_metrics_collection_jobs_updated_at BEFORE UPDATE ON public.metrics_collection_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_performance_recommendations_updated_at BEFORE UPDATE ON public.performance_recommendations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();