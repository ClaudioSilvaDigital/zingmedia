-- Billing and Financial Management Tables
-- This script creates additional tables for comprehensive billing system

-- Create billing plans table
CREATE TABLE IF NOT EXISTS public.billing_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    type VARCHAR(50) NOT NULL CHECK (type IN ('subscription', 'pay_per_use', 'hybrid')),
    pricing JSONB NOT NULL DEFAULT '{}',
    limits JSONB NOT NULL DEFAULT '{}',
    features JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.billing_plans(id),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'suspended', 'trial')),
    current_period_start TIMESTAMP NOT NULL,
    current_period_end TIMESTAMP NOT NULL,
    trial_end TIMESTAMP,
    cancelled_at TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.subscriptions(id),
    invoice_number VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
    issue_date TIMESTAMP NOT NULL,
    due_date TIMESTAMP NOT NULL,
    paid_at TIMESTAMP,
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
    line_items JSONB NOT NULL DEFAULT '[]',
    tax_details JSONB NOT NULL DEFAULT '{}',
    payment_method VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create payment methods table
CREATE TABLE IF NOT EXISTS public.payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('credit_card', 'bank_transfer', 'pix', 'boleto')),
    is_default BOOLEAN DEFAULT false,
    metadata JSONB NOT NULL DEFAULT '{}', -- Encrypted payment details
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create billing history table
CREATE TABLE IF NOT EXISTS public.billing_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    period JSONB NOT NULL DEFAULT '{}',
    total_credits_used INTEGER NOT NULL DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    invoice_id UUID REFERENCES public.invoices(id),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'billed', 'paid')),
    breakdown JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create credit transactions table for audit trail
CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('credit', 'debit', 'refund', 'adjustment')),
    reason TEXT NOT NULL,
    reference_id UUID, -- Can reference invoice, subscription, etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create fiscal providers table
CREATE TABLE IF NOT EXISTS public.fiscal_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('nfse', 'nfe', 'nfce')),
    config JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create nota fiscals table for Brazilian tax compliance
CREATE TABLE IF NOT EXISTS public.nota_fiscals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    number VARCHAR(20) NOT NULL,
    series VARCHAR(10) NOT NULL DEFAULT '001',
    access_key VARCHAR(44) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'authorized', 'cancelled', 'rejected')),
    issue_date TIMESTAMP NOT NULL,
    xml_content TEXT NOT NULL,
    pdf_url VARCHAR(500),
    xml_url VARCHAR(500),
    fiscal_provider_id UUID NOT NULL REFERENCES public.fiscal_providers(id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create billing alerts table
CREATE TABLE IF NOT EXISTS public.billing_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('credit_low', 'limit_exceeded', 'payment_failed', 'invoice_overdue')),
    threshold INTEGER,
    is_active BOOLEAN DEFAULT true,
    last_triggered TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for billing tables
CREATE INDEX IF NOT EXISTS idx_billing_plans_name ON public.billing_plans(name);
CREATE INDEX IF NOT EXISTS idx_billing_plans_type ON public.billing_plans(type);
CREATE INDEX IF NOT EXISTS idx_billing_plans_is_active ON public.billing_plans(is_active);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_id ON public.subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id ON public.subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_current_period_end ON public.subscriptions(current_period_end);
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_end ON public.subscriptions(trial_end);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id ON public.invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription_id ON public.invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON public.invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON public.invoices(issue_date);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(due_date);

CREATE INDEX IF NOT EXISTS idx_payment_methods_tenant_id ON public.payment_methods(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_type ON public.payment_methods(type);
CREATE INDEX IF NOT EXISTS idx_payment_methods_is_default ON public.payment_methods(is_default);

CREATE INDEX IF NOT EXISTS idx_billing_history_tenant_id ON public.billing_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_history_invoice_id ON public.billing_history(invoice_id);
CREATE INDEX IF NOT EXISTS idx_billing_history_status ON public.billing_history(status);
CREATE INDEX IF NOT EXISTS idx_billing_history_created_at ON public.billing_history(created_at);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_tenant_id ON public.credit_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON public.credit_transactions(type);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_reference_id ON public.credit_transactions(reference_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON public.credit_transactions(created_at);

CREATE INDEX IF NOT EXISTS idx_fiscal_providers_type ON public.fiscal_providers(type);
CREATE INDEX IF NOT EXISTS idx_fiscal_providers_is_active ON public.fiscal_providers(is_active);

CREATE INDEX IF NOT EXISTS idx_nota_fiscals_invoice_id ON public.nota_fiscals(invoice_id);
CREATE INDEX IF NOT EXISTS idx_nota_fiscals_tenant_id ON public.nota_fiscals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_nota_fiscals_number ON public.nota_fiscals(number);
CREATE INDEX IF NOT EXISTS idx_nota_fiscals_access_key ON public.nota_fiscals(access_key);
CREATE INDEX IF NOT EXISTS idx_nota_fiscals_status ON public.nota_fiscals(status);
CREATE INDEX IF NOT EXISTS idx_nota_fiscals_issue_date ON public.nota_fiscals(issue_date);
CREATE INDEX IF NOT EXISTS idx_nota_fiscals_fiscal_provider_id ON public.nota_fiscals(fiscal_provider_id);

CREATE INDEX IF NOT EXISTS idx_billing_alerts_tenant_id ON public.billing_alerts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_alerts_type ON public.billing_alerts(type);
CREATE INDEX IF NOT EXISTS idx_billing_alerts_is_active ON public.billing_alerts(is_active);

-- Create triggers for updated_at on billing tables
CREATE TRIGGER update_billing_plans_updated_at BEFORE UPDATE ON public.billing_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON public.payment_methods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_fiscal_providers_updated_at BEFORE UPDATE ON public.fiscal_providers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_nota_fiscals_updated_at BEFORE UPDATE ON public.nota_fiscals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_billing_alerts_updated_at BEFORE UPDATE ON public.billing_alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default billing plans
INSERT INTO public.billing_plans (id, name, description, type, pricing, limits, features)
VALUES 
(
    gen_random_uuid(),
    'Basic',
    'Perfect for small agencies getting started with content automation',
    'subscription',
    '{"monthlyPrice": 99.00, "creditPrice": 0.10, "currency": "BRL"}',
    '{"monthlyCredits": 1000, "dailyCredits": 50, "maxUsers": 5, "maxClients": 10, "maxRequestsPerMinute": 10, "maxConcurrentRequests": 2}',
    '["content_generation", "basic_analytics", "single_platform_publishing", "email_support"]'
),
(
    gen_random_uuid(),
    'Premium',
    'Ideal for growing agencies with multiple clients and advanced needs',
    'subscription',
    '{"monthlyPrice": 299.00, "creditPrice": 0.08, "currency": "BRL"}',
    '{"monthlyCredits": 10000, "dailyCredits": 500, "maxUsers": 25, "maxClients": 50, "maxRequestsPerMinute": 60, "maxConcurrentRequests": 10}',
    '["content_generation", "advanced_analytics", "multi_platform_publishing", "workflow_automation", "white_label", "priority_support"]'
),
(
    gen_random_uuid(),
    'Enterprise',
    'For large agencies requiring maximum scale and customization',
    'subscription',
    '{"monthlyPrice": 999.00, "creditPrice": 0.05, "currency": "BRL"}',
    '{"monthlyCredits": 100000, "dailyCredits": 5000, "maxUsers": -1, "maxClients": -1, "maxRequestsPerMinute": 300, "maxConcurrentRequests": 50}',
    '["content_generation", "enterprise_analytics", "multi_platform_publishing", "advanced_workflow", "full_white_label", "api_access", "dedicated_support", "custom_integrations"]'
) ON CONFLICT (name) DO NOTHING;

-- Insert default fiscal provider
INSERT INTO public.fiscal_providers (id, name, type, config)
VALUES (
    gen_random_uuid(),
    'Default NFSe Provider',
    'nfse',
    '{"apiUrl": "https://api.fiscalprovider.com", "environment": "sandbox"}'
) ON CONFLICT DO NOTHING;

-- Create function to automatically update credit limits when subscription changes
CREATE OR REPLACE FUNCTION update_credit_limits_on_subscription_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Update credit limits based on new plan
    IF NEW.plan_id != OLD.plan_id OR NEW.status != OLD.status THEN
        UPDATE public.credit_balances cb
        SET 
            monthly_limit = (bp.limits->>'monthlyCredits')::integer,
            daily_limit = (bp.limits->>'dailyCredits')::integer,
            updated_at = CURRENT_TIMESTAMP
        FROM public.billing_plans bp
        WHERE cb.tenant_id = NEW.tenant_id 
        AND bp.id = NEW.plan_id
        AND NEW.status IN ('active', 'trial');
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for subscription changes
CREATE TRIGGER update_credit_limits_on_subscription_change
    AFTER UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_credit_limits_on_subscription_change();

-- Create function to check and trigger billing alerts
CREATE OR REPLACE FUNCTION check_billing_alerts()
RETURNS TRIGGER AS $$
DECLARE
    alert_record RECORD;
BEGIN
    -- Check for low credit alerts
    FOR alert_record IN 
        SELECT ba.* FROM public.billing_alerts ba
        WHERE ba.tenant_id = NEW.tenant_id 
        AND ba.type = 'credit_low' 
        AND ba.is_active = true
        AND (ba.last_triggered IS NULL OR ba.last_triggered < CURRENT_TIMESTAMP - INTERVAL '1 hour')
    LOOP
        IF NEW.balance <= alert_record.threshold THEN
            -- Trigger alert (in production, this would send notification)
            UPDATE public.billing_alerts 
            SET last_triggered = CURRENT_TIMESTAMP
            WHERE id = alert_record.id;
            
            -- Log alert
            INSERT INTO public.audit_logs (tenant_id, action, resource, details)
            VALUES (
                NEW.tenant_id,
                'billing_alert_triggered',
                'credit_balance',
                jsonb_build_object(
                    'alert_type', 'credit_low',
                    'current_balance', NEW.balance,
                    'threshold', alert_record.threshold
                )
            );
        END IF;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for billing alerts
CREATE TRIGGER check_billing_alerts_trigger
    AFTER UPDATE ON public.credit_balances
    FOR EACH ROW
    EXECUTE FUNCTION check_billing_alerts();