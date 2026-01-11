import { v4 as uuidv4 } from 'uuid';
import { NotaFiscal, FiscalProvider, Invoice, TaxDetails } from '../types';
import { db } from '../config/database';

/**
 * Nota Fiscal Service for Brazilian Tax Compliance
 * Handles automatic invoice generation, PDF/XML downloads, and fiscal provider integration
 */
export class NotaFiscalService {
  private fiscalProviders: Map<string, FiscalProvider> = new Map();

  constructor() {
    this.initializeFiscalProviders();
  }

  /**
   * Generate Nota Fiscal for an invoice
   */
  async generateNotaFiscal(invoiceId: string): Promise<NotaFiscal> {
    try {
      // Get invoice details
      const invoice = await this.getInvoice(invoiceId);
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      // Get fiscal provider
      const fiscalProvider = this.fiscalProviders.get('default');
      if (!fiscalProvider) {
        throw new Error('Fiscal provider not configured');
      }

      // Generate Nota Fiscal number and series
      const notaFiscalNumber = await this.generateNotaFiscalNumber();
      const series = '001';
      const accessKey = this.generateAccessKey(notaFiscalNumber, series);

      // Create XML content for Nota Fiscal
      const xmlContent = this.generateNotaFiscalXML(invoice, notaFiscalNumber, series, accessKey);

      const notaFiscalId = uuidv4();
      const now = new Date();

      // Save Nota Fiscal
      await db.query(`
        INSERT INTO public.nota_fiscals (
          id, invoice_id, tenant_id, number, series, access_key,
          status, issue_date, xml_content, fiscal_provider_id,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        notaFiscalId,
        invoiceId,
        invoice.tenantId,
        notaFiscalNumber,
        series,
        accessKey,
        now,
        xmlContent,
        fiscalProvider.id
      ]);

      // Submit to fiscal authority
      const submissionResult = await this.submitToFiscalAuthority(notaFiscalId, xmlContent, fiscalProvider);
      
      // Update status based on submission result
      await db.query(`
        UPDATE public.nota_fiscals 
        SET status = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [notaFiscalId, submissionResult.status]);

      // Generate PDF and XML URLs
      const pdfUrl = await this.generatePDFUrl(notaFiscalId);
      const xmlUrl = await this.generateXMLUrl(notaFiscalId);

      // Update URLs
      await db.query(`
        UPDATE public.nota_fiscals 
        SET pdf_url = $2, xml_url = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [notaFiscalId, pdfUrl, xmlUrl]);

      return {
        id: notaFiscalId,
        invoiceId,
        tenantId: invoice.tenantId,
        number: notaFiscalNumber,
        series,
        accessKey,
        status: submissionResult.status,
        issueDate: now,
        xmlContent,
        pdfUrl,
        xmlUrl,
        fiscalProviderId: fiscalProvider.id,
        createdAt: now,
        updatedAt: now
      };
    } catch (error) {
      console.error('Error generating Nota Fiscal:', error);
      throw new Error('Failed to generate Nota Fiscal');
    }
  }

  /**
   * Get Nota Fiscal by ID
   */
  async getNotaFiscal(notaFiscalId: string): Promise<NotaFiscal | null> {
    try {
      const result = await db.query(`
        SELECT * FROM public.nota_fiscals WHERE id = $1
      `, [notaFiscalId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        invoiceId: row.invoice_id,
        tenantId: row.tenant_id,
        number: row.number,
        series: row.series,
        accessKey: row.access_key,
        status: row.status,
        issueDate: row.issue_date,
        xmlContent: row.xml_content,
        pdfUrl: row.pdf_url,
        xmlUrl: row.xml_url,
        fiscalProviderId: row.fiscal_provider_id,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      console.error('Error getting Nota Fiscal:', error);
      return null;
    }
  }

  /**
   * Get Nota Fiscals for a tenant
   */
  async getNotaFiscalsByTenant(tenantId: string, limit: number = 50): Promise<NotaFiscal[]> {
    try {
      const result = await db.query(`
        SELECT * FROM public.nota_fiscals 
        WHERE tenant_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2
      `, [tenantId, limit]);

      return result.rows.map((row: any) => ({
        id: row.id,
        invoiceId: row.invoice_id,
        tenantId: row.tenant_id,
        number: row.number,
        series: row.series,
        accessKey: row.access_key,
        status: row.status,
        issueDate: row.issue_date,
        xmlContent: row.xml_content,
        pdfUrl: row.pdf_url,
        xmlUrl: row.xml_url,
        fiscalProviderId: row.fiscal_provider_id,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      console.error('Error getting Nota Fiscals by tenant:', error);
      throw new Error('Failed to get Nota Fiscals');
    }
  }

  /**
   * Cancel Nota Fiscal
   */
  async cancelNotaFiscal(notaFiscalId: string, reason: string): Promise<void> {
    try {
      const notaFiscal = await this.getNotaFiscal(notaFiscalId);
      if (!notaFiscal) {
        throw new Error('Nota Fiscal not found');
      }

      if (notaFiscal.status !== 'authorized') {
        throw new Error('Only authorized Nota Fiscals can be cancelled');
      }

      // Submit cancellation to fiscal authority
      const fiscalProvider = this.fiscalProviders.get(notaFiscal.fiscalProviderId);
      if (fiscalProvider) {
        await this.submitCancellationToFiscalAuthority(notaFiscal, reason, fiscalProvider);
      }

      // Update status
      await db.query(`
        UPDATE public.nota_fiscals 
        SET status = 'cancelled', 
            metadata = jsonb_set(COALESCE(metadata, '{}'), '{cancellationReason}', $2),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [notaFiscalId, JSON.stringify(reason)]);
    } catch (error) {
      console.error('Error cancelling Nota Fiscal:', error);
      throw new Error('Failed to cancel Nota Fiscal');
    }
  }

  /**
   * Generate PDF for Nota Fiscal
   */
  async generatePDF(notaFiscalId: string): Promise<Buffer> {
    try {
      const notaFiscal = await this.getNotaFiscal(notaFiscalId);
      if (!notaFiscal) {
        throw new Error('Nota Fiscal not found');
      }

      // In production, this would use a PDF generation library
      // For now, return a placeholder PDF
      const pdfContent = this.generatePDFContent(notaFiscal);
      return Buffer.from(pdfContent, 'utf-8');
    } catch (error) {
      console.error('Error generating PDF:', error);
      throw new Error('Failed to generate PDF');
    }
  }

  /**
   * Get XML content for download
   */
  async getXMLContent(notaFiscalId: string): Promise<string> {
    try {
      const notaFiscal = await this.getNotaFiscal(notaFiscalId);
      if (!notaFiscal) {
        throw new Error('Nota Fiscal not found');
      }

      return notaFiscal.xmlContent;
    } catch (error) {
      console.error('Error getting XML content:', error);
      throw new Error('Failed to get XML content');
    }
  }

  /**
   * Validate CNPJ format
   */
  validateCNPJ(cnpj: string): boolean {
    // Remove non-numeric characters
    const cleanCNPJ = cnpj.replace(/\D/g, '');
    
    // Check if it has 14 digits
    if (cleanCNPJ.length !== 14) {
      return false;
    }

    // Check for known invalid CNPJs
    const invalidCNPJs = [
      '00000000000000',
      '11111111111111',
      '22222222222222',
      '33333333333333',
      '44444444444444',
      '55555555555555',
      '66666666666666',
      '77777777777777',
      '88888888888888',
      '99999999999999'
    ];

    if (invalidCNPJs.includes(cleanCNPJ)) {
      return false;
    }

    // Validate check digits
    return this.validateCNPJCheckDigits(cleanCNPJ);
  }

  /**
   * Format CNPJ for display
   */
  formatCNPJ(cnpj: string): string {
    const cleanCNPJ = cnpj.replace(/\D/g, '');
    if (cleanCNPJ.length !== 14) {
      return cnpj;
    }
    
    return cleanCNPJ.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }

  /**
   * Get invoice details
   */
  private async getInvoice(invoiceId: string): Promise<Invoice | null> {
    try {
      const result = await db.query(`
        SELECT * FROM public.invoices WHERE id = $1
      `, [invoiceId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        tenantId: row.tenant_id,
        subscriptionId: row.subscription_id,
        invoiceNumber: row.invoice_number,
        status: row.status,
        issueDate: row.issue_date,
        dueDate: row.due_date,
        paidAt: row.paid_at,
        subtotal: parseFloat(row.subtotal),
        taxAmount: parseFloat(row.tax_amount),
        total: parseFloat(row.total),
        currency: row.currency,
        lineItems: JSON.parse(row.line_items),
        taxDetails: JSON.parse(row.tax_details),
        paymentMethod: row.payment_method,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      console.error('Error getting invoice:', error);
      return null;
    }
  }

  /**
   * Generate Nota Fiscal number
   */
  private async generateNotaFiscalNumber(): Promise<string> {
    const result = await db.query(`
      SELECT COUNT(*) as count FROM public.nota_fiscals 
      WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
    `);
    
    const count = parseInt(result.rows[0].count) + 1;
    return count.toString().padStart(9, '0');
  }

  /**
   * Generate access key for Nota Fiscal
   */
  private generateAccessKey(number: string, series: string): string {
    // Simplified access key generation (in production, use proper algorithm)
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}${series}${number}${random}`.padEnd(44, '0').substring(0, 44);
  }

  /**
   * Generate XML content for Nota Fiscal
   */
  private generateNotaFiscalXML(invoice: Invoice, number: string, series: string, accessKey: string): string {
    const taxDetails = invoice.taxDetails;
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe Id="NFe${accessKey}">
      <ide>
        <cUF>35</cUF>
        <cNF>${number}</cNF>
        <natOp>Prestação de Serviços de Automação de Conteúdo</natOp>
        <mod>55</mod>
        <serie>${series}</serie>
        <nNF>${number}</nNF>
        <dhEmi>${invoice.issueDate.toISOString()}</dhEmi>
        <tpNF>1</tpNF>
        <idDest>1</idDest>
        <cMunFG>3550308</cMunFG>
        <tpImp>1</tpImp>
        <tpEmis>1</tpEmis>
        <cDV>0</cDV>
        <tpAmb>2</tpAmb>
        <finNFe>1</finNFe>
        <indFinal>1</indFinal>
        <indPres>0</indPres>
      </ide>
      <emit>
        <CNPJ>12345678000195</CNPJ>
        <xNome>Content Automation Platform</xNome>
        <enderEmit>
          <xLgr>Rua das Empresas</xLgr>
          <nro>123</nro>
          <xBairro>Centro</xBairro>
          <cMun>3550308</cMun>
          <xMun>São Paulo</xMun>
          <UF>SP</UF>
          <CEP>01000000</CEP>
          <cPais>1058</cPais>
          <xPais>Brasil</xPais>
        </enderEmit>
        <IE>123456789</IE>
        <CRT>3</CRT>
      </emit>
      <dest>
        <CNPJ>${taxDetails.taxId || '00000000000000'}</CNPJ>
        <xNome>${taxDetails.companyName || 'Cliente'}</xNome>
        <enderDest>
          <xLgr>${taxDetails.address?.street || 'Rua do Cliente'}</xLgr>
          <nro>${taxDetails.address?.number || '1'}</nro>
          <xBairro>${taxDetails.address?.neighborhood || 'Centro'}</xBairro>
          <cMun>3550308</cMun>
          <xMun>${taxDetails.address?.city || 'São Paulo'}</xMun>
          <UF>${taxDetails.address?.state || 'SP'}</UF>
          <CEP>${taxDetails.address?.zipCode?.replace(/\D/g, '') || '01000000'}</CEP>
          <cPais>1058</cPais>
          <xPais>Brasil</xPais>
        </enderDest>
        <indIEDest>1</indIEDest>
      </dest>
      ${this.generateLineItemsXML(invoice.lineItems)}
      <total>
        <ICMSTot>
          <vBC>0.00</vBC>
          <vICMS>0.00</vICMS>
          <vICMSDeson>0.00</vICMSDeson>
          <vFCP>0.00</vFCP>
          <vBCST>0.00</vBCST>
          <vST>0.00</vST>
          <vFCPST>0.00</vFCPST>
          <vFCPSTRet>0.00</vFCPSTRet>
          <vProd>${invoice.subtotal.toFixed(2)}</vProd>
          <vFrete>0.00</vFrete>
          <vSeg>0.00</vSeg>
          <vDesc>0.00</vDesc>
          <vII>0.00</vII>
          <vIPI>0.00</vIPI>
          <vIPIDevol>0.00</vIPIDevol>
          <vPIS>0.00</vPIS>
          <vCOFINS>0.00</vCOFINS>
          <vOutro>0.00</vOutro>
          <vNF>${invoice.total.toFixed(2)}</vNF>
        </ICMSTot>
      </total>
      <transp>
        <modFrete>9</modFrete>
      </transp>
      <infAdic>
        <infCpl>Serviços de automação de conteúdo para redes sociais. Invoice: ${invoice.invoiceNumber}</infCpl>
      </infAdic>
    </infNFe>
  </NFe>
</nfeProc>`;
  }

  /**
   * Generate line items XML
   */
  private generateLineItemsXML(lineItems: any[]): string {
    return lineItems.map((item, index) => `
      <det nItem="${index + 1}">
        <prod>
          <cProd>${(index + 1).toString().padStart(6, '0')}</cProd>
          <cEAN>SEM GTIN</cEAN>
          <xProd>${item.description}</xProd>
          <NCM>85234910</NCM>
          <CFOP>5933</CFOP>
          <uCom>UN</uCom>
          <qCom>${item.quantity.toFixed(4)}</qCom>
          <vUnCom>${item.unitPrice.toFixed(10)}</vUnCom>
          <vProd>${item.amount.toFixed(2)}</vProd>
          <cEANTrib>SEM GTIN</cEANTrib>
          <uTrib>UN</uTrib>
          <qTrib>${item.quantity.toFixed(4)}</qTrib>
          <vUnTrib>${item.unitPrice.toFixed(10)}</vUnTrib>
          <indTot>1</indTot>
        </prod>
        <imposto>
          <ICMS>
            <ICMS00>
              <orig>0</orig>
              <CST>00</CST>
              <modBC>3</modBC>
              <vBC>0.00</vBC>
              <pICMS>0.00</pICMS>
              <vICMS>0.00</vICMS>
            </ICMS00>
          </ICMS>
          <PIS>
            <PISAliq>
              <CST>01</CST>
              <vBC>0.00</vBC>
              <pPIS>0.00</pPIS>
              <vPIS>0.00</vPIS>
            </PISAliq>
          </PIS>
          <COFINS>
            <COFINSAliq>
              <CST>01</CST>
              <vBC>0.00</vBC>
              <pCOFINS>0.00</pCOFINS>
              <vCOFINS>0.00</vCOFINS>
            </COFINSAliq>
          </COFINS>
        </imposto>
      </det>`).join('');
  }

  /**
   * Submit to fiscal authority (simulated)
   */
  private async submitToFiscalAuthority(notaFiscalId: string, xmlContent: string, fiscalProvider: FiscalProvider): Promise<{ status: 'authorized' | 'rejected'; message?: string }> {
    // In production, this would integrate with SEFAZ or fiscal provider API
    // For now, we'll simulate the submission
    
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Simulate success (90% success rate)
      const success = Math.random() > 0.1;
      
      if (success) {
        return { status: 'authorized' };
      } else {
        return { 
          status: 'rejected', 
          message: 'Simulated rejection for testing purposes' 
        };
      }
    } catch (error) {
      console.error('Error submitting to fiscal authority:', error);
      return { 
        status: 'rejected', 
        message: 'Failed to submit to fiscal authority' 
      };
    }
  }

  /**
   * Submit cancellation to fiscal authority
   */
  private async submitCancellationToFiscalAuthority(notaFiscal: NotaFiscal, reason: string, fiscalProvider: FiscalProvider): Promise<void> {
    // In production, this would submit cancellation to SEFAZ
    console.log(`Cancelling Nota Fiscal ${notaFiscal.number} - Reason: ${reason}`);
  }

  /**
   * Generate PDF URL
   */
  private async generatePDFUrl(notaFiscalId: string): Promise<string> {
    return `/api/billing/nota-fiscal/${notaFiscalId}/pdf`;
  }

  /**
   * Generate XML URL
   */
  private async generateXMLUrl(notaFiscalId: string): Promise<string> {
    return `/api/billing/nota-fiscal/${notaFiscalId}/xml`;
  }

  /**
   * Generate PDF content (placeholder)
   */
  private generatePDFContent(notaFiscal: NotaFiscal): string {
    return `PDF Content for Nota Fiscal ${notaFiscal.number}
Series: ${notaFiscal.series}
Access Key: ${notaFiscal.accessKey}
Issue Date: ${notaFiscal.issueDate.toISOString()}
Status: ${notaFiscal.status}

This is a placeholder PDF content. In production, this would be generated using a proper PDF library.`;
  }

  /**
   * Validate CNPJ check digits
   */
  private validateCNPJCheckDigits(cnpj: string): boolean {
    // First check digit
    let sum = 0;
    let weight = 5;
    
    for (let i = 0; i < 12; i++) {
      sum += parseInt(cnpj[i]) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    
    let remainder = sum % 11;
    let firstDigit = remainder < 2 ? 0 : 11 - remainder;
    
    if (parseInt(cnpj[12]) !== firstDigit) {
      return false;
    }
    
    // Second check digit
    sum = 0;
    weight = 6;
    
    for (let i = 0; i < 13; i++) {
      sum += parseInt(cnpj[i]) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    
    remainder = sum % 11;
    let secondDigit = remainder < 2 ? 0 : 11 - remainder;
    
    return parseInt(cnpj[13]) === secondDigit;
  }

  /**
   * Initialize fiscal providers
   */
  private initializeFiscalProviders(): void {
    // Default fiscal provider configuration
    this.fiscalProviders.set('default', {
      id: 'default',
      name: 'Default NFSe Provider',
      type: 'nfse',
      config: {
        apiUrl: process.env.FISCAL_PROVIDER_API_URL || 'https://api.fiscalprovider.com',
        apiKey: process.env.FISCAL_PROVIDER_API_KEY || '',
        environment: (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox') as 'sandbox' | 'production'
      },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }
}

export const notaFiscalService = new NotaFiscalService();