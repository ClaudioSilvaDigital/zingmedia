const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware básico
app.use(express.json());
app.use(express.static('public'));

// Rota principal
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Content Automation Platform - Preview</title>
        <style>
            body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                margin: 0;
                padding: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .container {
                background: white;
                border-radius: 20px;
                padding: 40px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                max-width: 800px;
                text-align: center;
            }
            h1 {
                color: #2d3748;
                margin-bottom: 20px;
                font-size: 2.5rem;
            }
            .subtitle {
                color: #718096;
                font-size: 1.2rem;
                margin-bottom: 30px;
            }
            .features {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 20px;
                margin: 30px 0;
            }
            .feature {
                background: #f7fafc;
                padding: 20px;
                border-radius: 10px;
                border-left: 4px solid #667eea;
            }
            .feature h3 {
                color: #2d3748;
                margin-bottom: 10px;
            }
            .feature p {
                color: #718096;
                margin: 0;
            }
            .status {
                background: #f0fff4;
                border: 1px solid #9ae6b4;
                border-radius: 10px;
                padding: 15px;
                margin: 20px 0;
            }
            .status-title {
                color: #22543d;
                font-weight: bold;
                margin-bottom: 10px;
            }
            .api-endpoints {
                background: #f7fafc;
                border-radius: 10px;
                padding: 20px;
                margin: 20px 0;
                text-align: left;
            }
            .endpoint {
                background: white;
                padding: 10px;
                margin: 5px 0;
                border-radius: 5px;
                font-family: 'Courier New', monospace;
                font-size: 0.9rem;
            }
            .method {
                color: #667eea;
                font-weight: bold;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🚀 Content Automation Platform</h1>
            <p class="subtitle">Plataforma SaaS White-label de Automação Inteligente de Conteúdo Multi-Plataforma</p>
            
            <div class="status">
                <div class="status-title">✅ Servidor Online</div>
                <p>A aplicação está rodando em <strong>http://localhost:${PORT}</strong></p>
            </div>

            <div class="features">
                <div class="feature">
                    <h3>🤖 IA Integrada</h3>
                    <p>Geração automática de conteúdo com múltiplos provedores de IA</p>
                </div>
                <div class="feature">
                    <h3>🏢 Multi-Tenant</h3>
                    <p>Isolamento completo de dados entre agências e clientes</p>
                </div>
                <div class="feature">
                    <h3>🎨 White-Label</h3>
                    <p>Personalização completa da marca por tenant</p>
                </div>
                <div class="feature">
                    <h3>📱 Multi-Plataforma</h3>
                    <p>Publicação automática no Instagram, TikTok, Facebook e LinkedIn</p>
                </div>
                <div class="feature">
                    <h3>📊 Analytics</h3>
                    <p>Métricas avançadas e recomendações de performance</p>
                </div>
                <div class="feature">
                    <h3>🔒 Segurança</h3>
                    <p>Conformidade LGPD e criptografia de dados</p>
                </div>
            </div>

            <div class="api-endpoints">
                <h3>🔗 Endpoints da API</h3>
                <div class="endpoint"><span class="method">GET</span> /api/v1/health - Status da aplicação</div>
                <div class="endpoint"><span class="method">POST</span> /api/v1/auth/login - Autenticação</div>
                <div class="endpoint"><span class="method">GET</span> /api/v1/protected/tenants - Gerenciar tenants</div>
                <div class="endpoint"><span class="method">POST</span> /api/v1/protected/content - Criar conteúdo</div>
                <div class="endpoint"><span class="method">GET</span> /api/v1/protected/analytics - Métricas</div>
            </div>

            <p style="margin-top: 30px; color: #718096;">
                <strong>Próximos passos:</strong> Configure as variáveis de ambiente e conecte os serviços externos
            </p>
        </div>
    </body>
    </html>
  `);
});

// Rota de health check
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      database: 'checking...',
      redis: 'checking...',
      ai_providers: 'checking...'
    }
  });
});

// Rota de informações do sistema
app.get('/api/v1/info', (req, res) => {
  res.json({
    name: 'Content Automation Platform',
    description: 'Plataforma SaaS White-label de Automação Inteligente de Conteúdo Multi-Plataforma',
    features: [
      'Multi-tenant architecture',
      'AI-powered content generation',
      'Multi-platform publishing',
      'White-label customization',
      'Advanced analytics',
      'LGPD compliance'
    ],
    platforms: ['Instagram', 'TikTok', 'Facebook', 'LinkedIn'],
    tech_stack: ['Node.js', 'TypeScript', 'PostgreSQL', 'Redis', 'Express']
  });
});

app.listen(PORT, () => {
  console.log(`
🚀 Content Automation Platform está rodando!

📍 URL: http://localhost:${PORT}
🌐 Para acessar de outros dispositivos na rede: http://${getLocalIP()}:${PORT}

✨ Abra seu navegador e acesse a URL acima para ver o preview!
  `);
});

// Função para obter IP local
function getLocalIP() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}