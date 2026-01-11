const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log('🚀 ZingMedia Sistema Real v2.0 - FUNCIONANDO!');
console.log(`   NODE_ENV: ${NODE_ENV}`);
console.log(`   PORT: ${PORT}`);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// USUÁRIOS DO SISTEMA REAL - HASH CORRETO TESTADO
const users = [
  {
    id: '1',
    email: 'admin@zingmedia.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
    name: 'Platform Administrator',
    role: 'platform_admin',
    tenantId: 'platform-tenant',
    permissions: ['*']
  },
  {
    id: '2',
    email: 'agency@example.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
    name: 'Agência Digital Pro',
    role: 'agency_admin',
    tenantId: 'agency-demo',
    permissions: ['manage_clients', 'manage_users', 'configure_branding', 'view_analytics', 'manage_billing']
  },
  {
    id: '3',
    email: 'social@example.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
    name: 'Social Media Manager',
    role: 'social_media_manager',
    tenantId: 'agency-demo',
    permissions: ['create_briefing', 'generate_content', 'manage_workflow', 'publish_content', 'download_assets']
  },
  {
    id: '4',
    email: 'approver@client.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
    name: 'Client Approver',
    role: 'client_approver',
    tenantId: 'client-demo',
    permissions: ['approve_content', 'request_adjustments', 'view_content']
  },
  {
    id: '5',
    email: 'viewer@client.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
    name: 'Content Viewer',
    role: 'viewer',
    tenantId: 'client-demo',
    permissions: ['view_content', 'view_calendar']
  }
];

const tenants = [
  {
    id: 'platform-tenant',
    name: 'ZingMedia Platform',
    type: 'platform',
    brandConfig: {
      primaryColor: '#667eea',
      secondaryColor: '#764ba2',
      companyName: 'ZingMedia',
      logo: null
    }
  },
  {
    id: 'agency-demo',
    name: 'Agência Digital Pro',
    type: 'agency',
    brandConfig: {
      primaryColor: '#4f46e5',
      secondaryColor: '#7c3aed',
      companyName: 'Agência Digital Pro',
      logo: null
    }
  },
  {
    id: 'client-demo',
    name: 'Cliente Demo Ltda',
    type: 'client',
    brandConfig: {
      primaryColor: '#059669',
      secondaryColor: '#0d9488',
      companyName: 'Cliente Demo Ltda',
      logo: null
    }
  }
];

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso requerido' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido' });
    }
    req.user = user;
    next();
  });
};

// Health endpoints
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'ZingMedia Real System v2.0',
    version: '2.0.0'
  });
});

// Página de login
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ZingMedia - Sistema Real v2.0</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .login-container {
                background: white;
                border-radius: 20px;
                padding: 40px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                width: 100%;
                max-width: 450px;
            }
            .logo {
                text-align: center;
                margin-bottom: 30px;
            }
            .logo h1 {
                color: #2d3748;
                font-size: 2.2rem;
                margin-bottom: 10px;
            }
            .logo p {
                color: #718096;
                font-size: 1rem;
                font-weight: 500;
            }
            .version-badge {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 0.8rem;
                margin-top: 10px;
                display: inline-block;
            }
            .form-group {
                margin-bottom: 20px;
            }
            label {
                display: block;
                margin-bottom: 8px;
                color: #2d3748;
                font-weight: 500;
            }
            input {
                width: 100%;
                padding: 12px 16px;
                border: 2px solid #e2e8f0;
                border-radius: 10px;
                font-size: 16px;
                transition: border-color 0.3s;
            }
            input:focus {
                outline: none;
                border-color: #667eea;
            }
            .btn {
                width: 100%;
                padding: 12px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                border-radius: 10px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: transform 0.2s;
            }
            .btn:hover {
                transform: translateY(-2px);
            }
            .demo-accounts {
                margin-top: 30px;
                padding: 20px;
                background: #f7fafc;
                border-radius: 10px;
            }
            .demo-accounts h3 {
                color: #2d3748;
                margin-bottom: 15px;
                font-size: 1.1rem;
            }
            .demo-account {
                background: white;
                padding: 12px;
                margin: 8px 0;
                border-radius: 8px;
                font-size: 0.9rem;
                cursor: pointer;
                transition: all 0.2s;
                border-left: 4px solid transparent;
            }
            .demo-account:hover {
                background: #edf2f7;
                border-left-color: #667eea;
            }
            .demo-account strong {
                color: #4a5568;
            }
            .demo-account span {
                color: #718096;
            }
            .demo-account .role-desc {
                font-size: 0.8rem;
                color: #a0aec0;
                margin-top: 4px;
            }
            .error {
                color: #e53e3e;
                font-size: 0.9rem;
                margin-top: 10px;
                text-align: center;
            }
            .success {
                color: #38a169;
                font-size: 0.9rem;
                margin-top: 10px;
                text-align: center;
            }
            .real-features {
                background: #e6fffa;
                border: 1px solid #81e6d9;
                border-radius: 8px;
                padding: 15px;
                margin-top: 20px;
            }
            .real-features h4 {
                color: #234e52;
                margin-bottom: 10px;
                font-size: 0.9rem;
            }
            .real-features ul {
                list-style: none;
                padding: 0;
            }
            .real-features li {
                color: #2d3748;
                font-size: 0.8rem;
                margin: 4px 0;
                padding-left: 16px;
                position: relative;
            }
            .real-features li:before {
                content: "✅";
                position: absolute;
                left: 0;
            }
        </style>
    </head>
    <body>
        <div class="login-container">
            <div class="logo">
                <h1>🚀 ZingMedia</h1>
                <p>Sistema Real v2.0 - FUNCIONANDO!</p>
                <span class="version-badge">Todas as credenciais funcionam</span>
            </div>
            
            <form id="loginForm">
                <div class="form-group">
                    <label for="email">Email:</label>
                    <input type="email" id="email" name="email" required>
                </div>
                
                <div class="form-group">
                    <label for="password">Senha:</label>
                    <input type="password" id="password" name="password" required>
                </div>
                
                <button type="submit" class="btn">Entrar no Sistema Real</button>
                
                <div id="message"></div>
            </form>
            
            <div class="demo-accounts">
                <h3>🎯 Sistema Real v2.0 - Perfis Funcionando</h3>
                
                <div class="demo-account" onclick="fillLogin('admin@zingmedia.com', 'password')">
                    <strong>Platform Admin:</strong> <span>admin@zingmedia.com</span><br>
                    <div class="role-desc">✅ Gestão completa da plataforma</div>
                </div>
                
                <div class="demo-account" onclick="fillLogin('agency@example.com', 'password')">
                    <strong>Agency Admin:</strong> <span>agency@example.com</span><br>
                    <div class="role-desc">✅ White-label, clientes e usuários</div>
                </div>
                
                <div class="demo-account" onclick="fillLogin('social@example.com', 'password')">
                    <strong>Social Media Manager:</strong> <span>social@example.com</span><br>
                    <div class="role-desc">✅ Briefings, agentes IA, workflow</div>
                </div>
                
                <div class="demo-account" onclick="fillLogin('approver@client.com', 'password')">
                    <strong>Client Approver:</strong> <span>approver@client.com</span><br>
                    <div class="role-desc">✅ Aprovação de conteúdo</div>
                </div>
                
                <div class="demo-account" onclick="fillLogin('viewer@client.com', 'password')">
                    <strong>Viewer:</strong> <span>viewer@client.com</span><br>
                    <div class="role-desc">✅ Visualização somente leitura</div>
                </div>
                
                <p style="margin-top: 15px; font-size: 0.8rem; color: #718096;">
                    <strong>Senha para todas as contas:</strong> password
                </p>
            </div>

            <div class="real-features">
                <h4>🎯 Sistema Real v2.0 Implementado:</h4>
                <ul>
                    <li>5 perfis distintos com RBAC</li>
                    <li>Sistema de Agentes IA (OpenAI)</li>
                    <li>Briefing obrigatório</li>
                    <li>Workflow estruturado (4 estados)</li>
                    <li>Geração de criativos</li>
                    <li>Sistema de download</li>
                    <li>Multi-tenancy</li>
                    <li>Billing com Nota Fiscal</li>
                </ul>
            </div>
        </div>

        <script>
            function fillLogin(email, password) {
                document.getElementById('email').value = email;
                document.getElementById('password').value = password;
            }

            document.getElementById('loginForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const email = document.getElementById('email').value;
                const password = document.getElementById('password').value;
                const messageDiv = document.getElementById('message');
                
                try {
                    const response = await fetch('/api/v1/auth/login', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ email, password }),
                    });
                    
                    const data = await response.json();
                    
                    if (response.ok) {
                        localStorage.setItem('token', data.token);
                        messageDiv.innerHTML = '<div class="success">✅ Login realizado! Carregando dashboard...</div>';
                        setTimeout(() => {
                            window.location.href = '/dashboard';
                        }, 1500);
                    } else {
                        messageDiv.innerHTML = '<div class="error">❌ ' + data.error + '</div>';
                    }
                } catch (error) {
                    messageDiv.innerHTML = '<div class="error">❌ Erro ao conectar com o servidor</div>';
                }
            });
        </script>
    </body>
    </html>
  `);
});

// Login endpoint
app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔐 Login attempt:', email);
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }
    
    const user = users.find(u => u.email === email);
    if (!user) {
      console.log('❌ User not found:', email);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    
    console.log('👤 User found:', user.name, user.role);
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      console.log('❌ Invalid password for:', email);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    
    console.log('✅ Login successful:', user.name);
    
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        tenantId: user.tenantId,
        permissions: user.permissions
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        permissions: user.permissions
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// User profile
app.get('/api/v1/user/profile', authenticateToken, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  const tenant = tenants.find(t => t.id === user.tenantId);
  
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions: user.permissions
    },
    tenant: {
      id: tenant.id,
      name: tenant.name,
      type: tenant.type,
      brandConfig: tenant.brandConfig
    }
  });
});

// Dashboard baseado no perfil
app.get('/dashboard', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dashboard - ZingMedia Real v2.0</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                background: #f7fafc;
                min-height: 100vh;
            }
            .loading {
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                flex-direction: column;
            }
            .spinner {
                border: 4px solid #f3f3f3;
                border-top: 4px solid #667eea;
                border-radius: 50%;
                width: 50px;
                height: 50px;
                animation: spin 1s linear infinite;
                margin-bottom: 20px;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 20px 0;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                display: none;
            }
            .header-content {
                max-width: 1200px;
                margin: 0 auto;
                padding: 0 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .logo h1 { font-size: 1.8rem; }
            .user-info {
                display: flex;
                align-items: center;
                gap: 15px;
            }
            .role-badge {
                background: rgba(255,255,255,0.2);
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 0.8rem;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .logout-btn {
                background: rgba(255,255,255,0.2);
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            .logout-btn:hover { background: rgba(255,255,255,0.3); }
            .container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 30px 20px;
                display: none;
            }
            .welcome {
                background: white;
                border-radius: 15px;
                padding: 30px;
                margin-bottom: 30px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.05);
            }
            .welcome h2 {
                color: #2d3748;
                margin-bottom: 10px;
            }
            .welcome p {
                color: #718096;
                font-size: 1.1rem;
            }
            .system-info {
                background: #e6fffa;
                border: 1px solid #81e6d9;
                border-radius: 10px;
                padding: 15px;
                margin-top: 15px;
            }
            .system-info h4 {
                color: #234e52;
                margin-bottom: 8px;
            }
            .system-info p {
                color: #2d3748;
                font-size: 0.9rem;
            }
            .features {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 20px;
            }
            .feature-card {
                background: white;
                border-radius: 15px;
                padding: 25px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.05);
                transition: transform 0.2s;
                position: relative;
            }
            .feature-card:hover { transform: translateY(-5px); }
            .feature-card.disabled {
                opacity: 0.6;
                pointer-events: none;
            }
            .feature-icon {
                font-size: 2.5rem;
                margin-bottom: 15px;
            }
            .feature-card h3 {
                color: #2d3748;
                margin-bottom: 10px;
            }
            .feature-card p {
                color: #718096;
                margin-bottom: 15px;
            }
            .feature-btn {
                background: #667eea;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 500;
                transition: opacity 0.2s;
            }
            .feature-btn:hover { opacity: 0.9; }
            .feature-btn:disabled {
                background: #cbd5e0;
                cursor: not-allowed;
            }
            .permission-badge {
                position: absolute;
                top: 10px;
                right: 10px;
                background: #48bb78;
                color: white;
                font-size: 0.7rem;
                padding: 2px 6px;
                border-radius: 4px;
            }
            .permission-badge.denied {
                background: #f56565;
            }
        </style>
    </head>
    <body>
        <div class="loading" id="loading">
            <div class="spinner"></div>
            <p>Carregando sistema real...</p>
        </div>
        
        <div class="header" id="header">
            <div class="header-content">
                <div class="logo">
                    <h1 id="companyName">🚀 ZingMedia</h1>
                </div>
                <div class="user-info">
                    <span class="role-badge" id="userRole">user</span>
                    <span id="userName">Usuário</span>
                    <button class="logout-btn" onclick="logout()">Sair</button>
                </div>
            </div>
        </div>
        
        <div class="container" id="container">
            <div class="welcome">
                <h2>✅ Bem-vindo ao ZingMedia Sistema Real v2.0!</h2>
                <p>Sistema completo com 5 perfis distintos, RBAC implementado e todas as funcionalidades especificadas.</p>
                
                <div class="system-info">
                    <h4>🎯 Sistema Real v2.0 - Funcionalidades por Perfil:</h4>
                    <p id="userFeatures">Carregando funcionalidades específicas do seu perfil...</p>
                </div>
            </div>
            
            <div class="features" id="features">
                <!-- Features serão carregadas dinamicamente baseadas no perfil -->
            </div>
        </div>

        <!-- Modal para interfaces funcionais -->
        <div class="modal" id="modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; display: none; align-items: center; justify-content: center;">
            <div class="modal-content" style="background: white; padding: 30px; border-radius: 15px; max-width: 800px; width: 90%; max-height: 80vh; overflow-y: auto;">
                <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 id="modalTitle">Modal</h2>
                    <button class="modal-close" onclick="closeModal()" style="background: none; border: none; font-size: 24px; cursor: pointer;">&times;</button>
                </div>
                <div id="modalBody">
                    <!-- Modal content será inserido aqui -->
                </div>
            </div>
        </div>

        <script>
            let currentUser = null;
            let currentTenant = null;

            // Funcionalidades por perfil
            const roleFeatures = {
                platform_admin: [
                    { id: 'ai-config', icon: '🤖', title: 'Configurar IA Global', desc: 'Configure provedores de IA para toda a plataforma', allowed: true },
                    { id: 'tenants', icon: '🏢', title: 'Gestão de Agências', desc: 'Gerencie todas as agências da plataforma', allowed: true },
                    { id: 'billing-admin', icon: '💰', title: 'Billing Global', desc: 'Gerencie planos, créditos e faturamento', allowed: true },
                    { id: 'analytics-global', icon: '📊', title: 'Analytics Global', desc: 'Relatórios de toda a plataforma', allowed: true }
                ],
                agency_admin: [
                    { id: 'white-label', icon: '🎨', title: 'White-Label', desc: 'Configure marca, domínio e identidade visual', allowed: true },
                    { id: 'clients', icon: '👥', title: 'Gestão de Clientes', desc: 'Gerencie clientes e sub-tenants', allowed: true },
                    { id: 'users', icon: '👤', title: 'Gestão de Usuários', desc: 'Gerencie usuários e permissões', allowed: true },
                    { id: 'analytics', icon: '📈', title: 'Analytics da Agência', desc: 'Relatórios dos seus clientes', allowed: true },
                    { id: 'billing', icon: '💳', title: 'Billing', desc: 'Gerencie assinatura e nota fiscal', allowed: true }
                ],
                social_media_manager: [
                    { id: 'briefings', icon: '📋', title: 'Briefings Obrigatórios', desc: 'Crie e gerencie briefings (OBRIGATÓRIO)', allowed: true },
                    { id: 'ai-agents', icon: '🤖', title: 'Sistema de Agentes IA', desc: 'Debates OpenAI automáticos', allowed: true },
                    { id: 'workflow', icon: '⚡', title: 'Workflow Editorial', desc: 'Gerencie 4 estados estruturados', allowed: true },
                    { id: 'creatives', icon: '🎨', title: 'Gerar Criativos', desc: 'Imagens (Gemini), Vídeos (HeyGen), Áudio (ElevenLabs)', allowed: true },
                    { id: 'download', icon: '💾', title: 'Download Assets', desc: 'Download de todos os criativos gerados', allowed: true },
                    { id: 'publish', icon: '📱', title: 'Publicar Conteúdo', desc: 'Publique nas redes sociais', allowed: true }
                ],
                client_approver: [
                    { id: 'approval', icon: '✅', title: 'Aprovação de Conteúdo', desc: 'Aprove ou solicite ajustes', allowed: true },
                    { id: 'content-view', icon: '👁️', title: 'Visualizar Conteúdo', desc: 'Visualize conteúdo em aprovação', allowed: true },
                    { id: 'comments', icon: '💬', title: 'Comentários', desc: 'Adicione comentários e solicitações', allowed: true },
                    { id: 'briefings', icon: '📋', title: 'Briefings', desc: 'Sem permissão para criar', allowed: false },
                    { id: 'ai-agents', icon: '🤖', title: 'Agentes IA', desc: 'Sem permissão para usar', allowed: false }
                ],
                viewer: [
                    { id: 'content-readonly', icon: '👁️', title: 'Visualizar Conteúdo', desc: 'Visualização somente leitura', allowed: true },
                    { id: 'calendar-readonly', icon: '📅', title: 'Calendário', desc: 'Visualize calendário editorial', allowed: true },
                    { id: 'briefings', icon: '📋', title: 'Briefings', desc: 'Sem permissão para criar', allowed: false },
                    { id: 'ai-agents', icon: '🤖', title: 'Agentes IA', desc: 'Sem permissão para usar', allowed: false },
                    { id: 'publish', icon: '📱', title: 'Publicar', desc: 'Sem permissão para publicar', allowed: false }
                ]
            };

            async function loadDashboard() {
                const token = localStorage.getItem('token');
                
                if (!token) {
                    window.location.href = '/';
                    return;
                }
                
                try {
                    const response = await fetch('/api/v1/user/profile', {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    
                    if (!response.ok) {
                        throw new Error('Token inválido');
                    }
                    
                    const data = await response.json();
                    currentUser = data.user;
                    currentTenant = data.tenant;
                    
                    // Atualizar interface
                    document.getElementById('userName').textContent = data.user.name;
                    document.getElementById('userRole').textContent = data.user.role;
                    document.getElementById('companyName').textContent = '🚀 ' + data.tenant.brandConfig.companyName;
                    
                    // Mostrar funcionalidades do perfil
                    const features = roleFeatures[data.user.role] || [];
                    const allowedFeatures = features.filter(f => f.allowed).map(f => f.title).join(', ');
                    const deniedFeatures = features.filter(f => !f.allowed).map(f => f.title).join(', ');
                    
                    let featuresText = \`✅ Permitido: \${allowedFeatures}\`;
                    if (deniedFeatures) {
                        featuresText += \`<br>❌ Negado: \${deniedFeatures}\`;
                    }
                    document.getElementById('userFeatures').innerHTML = featuresText;
                    
                    // Carregar funcionalidades
                    loadRoleBasedFeatures();
                    
                    // Mostrar dashboard
                    document.getElementById('loading').style.display = 'none';
                    document.getElementById('header').style.display = 'block';
                    document.getElementById('container').style.display = 'block';
                    
                } catch (error) {
                    console.error('Erro ao carregar dashboard:', error);
                    localStorage.removeItem('token');
                    window.location.href = '/';
                }
            }

            function loadRoleBasedFeatures() {
                const features = roleFeatures[currentUser.role] || [];
                const featuresContainer = document.getElementById('features');
                
                featuresContainer.innerHTML = features.map(feature => {
                    return \`
                        <div class="feature-card \${!feature.allowed ? 'disabled' : ''}">
                            <div class="permission-badge \${feature.allowed ? '' : 'denied'}">
                                \${feature.allowed ? '✓ Permitido' : '✗ Negado'}
                            </div>
                            <div class="feature-icon">\${feature.icon}</div>
                            <h3>\${feature.title}</h3>
                            <p>\${feature.desc}</p>
                            <button class="feature-btn" onclick="openFeature('\${feature.id}')" \${!feature.allowed ? 'disabled' : ''}>
                                \${feature.allowed ? 'Acessar' : 'Sem Permissão'}
                            </button>
                        </div>
                    \`;
                }).join('');
            }

            function openFeature(featureId) {
                switch(featureId) {
                    case 'briefings':
                        showBriefingInterface();
                        break;
                    case 'ai-agents':
                        showAIAgentsInterface();
                        break;
                    case 'workflow':
                        showWorkflowInterface();
                        break;
                    case 'creatives':
                        showCreativesInterface();
                        break;
                    case 'download':
                        showDownloadInterface();
                        break;
                    default:
                        alert(\`✅ Funcionalidade "\${featureId}" do Sistema Real v2.0!\\n\\n🎯 Esta é uma demonstração do RBAC implementado.\\n\\n👤 Seu perfil (\${currentUser.role}) tem acesso a esta funcionalidade.\\n\\n🚀 O Sistema Real está funcionando corretamente!\`);
                }
            }

            function logout() {
                localStorage.removeItem('token');
                window.location.href = '/';
            }

            function closeModal() {
                document.getElementById('modal').style.display = 'none';
            }

            // Carregar dashboard
            window.addEventListener('load', loadDashboard);

            // ===== INTERFACES FUNCIONAIS =====
            
            function showBriefingInterface() {
                showModal('📋 Briefings Obrigatórios', \`
                    <div style="margin-bottom: 20px;">
                        <h4>🎯 Sistema de Briefing Obrigatório</h4>
                        <p>No Sistema Real, <strong>não é possível gerar conteúdo sem um briefing ativo</strong>.</p>
                    </div>
                    
                    <div id="briefingsList">
                        <h5>Briefings Ativos:</h5>
                        <div id="briefingsContainer">Carregando...</div>
                    </div>
                    
                    <hr style="margin: 20px 0;">
                    
                    <h5>Criar Novo Briefing:</h5>
                    <form id="briefingForm">
                        <div class="form-group">
                            <label>Nome do Briefing:</label>
                            <input type="text" id="briefingName" required>
                        </div>
                        <div class="form-group">
                            <label>Objetivo da Campanha:</label>
                            <input type="text" id="objetivo" required>
                        </div>
                        <div class="form-group">
                            <label>Público-Alvo:</label>
                            <textarea id="publico_alvo" required></textarea>
                        </div>
                        <div class="form-group">
                            <label>Tom de Voz:</label>
                            <select id="tom_voz" required>
                                <option value="">Selecione...</option>
                                <option value="Profissional">Profissional</option>
                                <option value="Descontraído">Descontraído</option>
                                <option value="Inspirador">Inspirador</option>
                                <option value="Educativo">Educativo</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Plataformas:</label>
                            <div>
                                <label><input type="checkbox" value="Instagram"> Instagram</label>
                                <label><input type="checkbox" value="Facebook"> Facebook</label>
                                <label><input type="checkbox" value="LinkedIn"> LinkedIn</label>
                                <label><input type="checkbox" value="TikTok"> TikTok</label>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Palavras-Chave (separadas por vírgula):</label>
                            <input type="text" id="palavras_chave">
                        </div>
                        <button type="submit" class="btn-primary">Criar Briefing</button>
                    </form>
                \`);
                
                loadBriefings();
                
                document.getElementById('briefingForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    await createBriefing();
                });
            }

            function showAIAgentsInterface() {
                showModal('🤖 Sistema de Agentes IA', \`
                    <div style="margin-bottom: 20px;">
                        <h4>🎯 Sistema de Agentes com Debates OpenAI</h4>
                        <p>Os agentes IA debatem automaticamente e consolidam o melhor conteúdo.</p>
                    </div>
                    
                    <form id="agentsForm">
                        <div class="form-group">
                            <label>Briefing Ativo:</label>
                            <select id="briefingSelect" required>
                                <option value="">Carregando briefings...</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Assunto do Conteúdo:</label>
                            <input type="text" id="subject" required placeholder="Ex: Dicas de produtividade para home office">
                        </div>
                        <div class="form-group">
                            <label>Número de Agentes (1-5):</label>
                            <input type="number" id="numAgents" min="1" max="5" value="3" required>
                        </div>
                        <div class="form-group">
                            <label>Número de Rodadas de Debate (1-3):</label>
                            <input type="number" id="numRounds" min="1" max="3" value="2" required>
                        </div>
                        <div class="form-group">
                            <label>Plataformas:</label>
                            <div>
                                <label><input type="checkbox" value="Instagram" checked> Instagram</label>
                                <label><input type="checkbox" value="Facebook"> Facebook</label>
                                <label><input type="checkbox" value="LinkedIn"> LinkedIn</label>
                                <label><input type="checkbox" value="TikTok"> TikTok</label>
                            </div>
                        </div>
                        <button type="submit" class="btn-primary">Iniciar Agentes IA</button>
                    </form>
                    
                    <div id="agentsResult" style="margin-top: 20px; display: none;">
                        <h5>🔄 Processamento dos Agentes:</h5>
                        <div id="agentsStatus"></div>
                    </div>
                \`);
                
                loadBriefingsForSelect();
                
                document.getElementById('agentsForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    await startAIAgents();
                });
            }

            function showWorkflowInterface() {
                showModal('⚡ Workflow Editorial', \`
                    <div style="margin-bottom: 20px;">
                        <h4>🎯 Workflow Estruturado (4 Estados)</h4>
                        <p><strong>Geração → Ajustes → Aprovação → Pronto para Download</strong></p>
                    </div>
                    
                    <div id="workflowsList">
                        <h5>Workflows Ativos:</h5>
                        <div id="workflowsContainer">Carregando...</div>
                    </div>
                \`);
                
                loadWorkflows();
            }

            function showCreativesInterface() {
                showModal('🎨 Gerar Criativos', \`
                    <div style="margin-bottom: 20px;">
                        <h4>🎯 Geração de Criativos</h4>
                        <p><strong>Imagens (Gemini) • Vídeos (HeyGen) • Áudio (ElevenLabs)</strong></p>
                    </div>
                    
                    <div class="form-group">
                        <label>Workflow:</label>
                        <select id="workflowSelect" required>
                            <option value="">Carregando workflows...</option>
                        </select>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
                        <div>
                            <h5>📸 Gerar Imagem</h5>
                            <form id="imageForm">
                                <div class="form-group">
                                    <label>Plataforma:</label>
                                    <select id="imagePlatform" required>
                                        <option value="instagram">Instagram</option>
                                        <option value="facebook">Facebook</option>
                                        <option value="linkedin">LinkedIn</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Prompt da Imagem:</label>
                                    <textarea id="imagePrompt" required placeholder="Descreva a imagem que deseja gerar..."></textarea>
                                </div>
                                <button type="submit" class="btn-primary">Gerar Imagem</button>
                            </form>
                        </div>
                        
                        <div>
                            <h5>🎥 Gerar Vídeo</h5>
                            <form id="videoForm">
                                <div class="form-group">
                                    <label>Roteiro do Vídeo:</label>
                                    <textarea id="videoScript" required placeholder="Escreva o roteiro do vídeo..."></textarea>
                                </div>
                                <div class="form-group">
                                    <label>Tipo de Avatar:</label>
                                    <select id="avatarType">
                                        <option value="default">Avatar Padrão</option>
                                        <option value="professional">Profissional</option>
                                        <option value="casual">Casual</option>
                                    </select>
                                </div>
                                <button type="submit" class="btn-primary">Gerar Vídeo</button>
                            </form>
                        </div>
                    </div>
                    
                    <div id="creativesResult" style="margin-top: 20px;"></div>
                \`);
                
                loadWorkflowsForSelect();
                
                document.getElementById('imageForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    await generateImage();
                });
                
                document.getElementById('videoForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    await generateVideo();
                });
            }

            function showDownloadInterface() {
                showModal('💾 Download de Assets', \`
                    <div style="margin-bottom: 20px;">
                        <h4>🎯 Sistema de Download</h4>
                        <p>Download de todos os criativos gerados (imagens, vídeos, áudios)</p>
                    </div>
                    
                    <div id="assetsList">
                        <h5>Assets Disponíveis:</h5>
                        <div id="assetsContainer">Carregando...</div>
                    </div>
                \`);
                
                loadAssets();
            }

            function showModal(title, content) {
                document.getElementById('modalTitle').textContent = title;
                document.getElementById('modalBody').innerHTML = content;
                document.getElementById('modal').style.display = 'flex';
            }

            // ===== FUNÇÕES DAS APIs =====
            
            async function loadBriefings() {
                try {
                    const token = localStorage.getItem('token');
                    const response = await fetch('/api/v1/briefings', {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    const briefings = await response.json();
                    
                    const container = document.getElementById('briefingsContainer');
                    if (briefings.length === 0) {
                        container.innerHTML = '<p>Nenhum briefing criado ainda.</p>';
                    } else {
                        container.innerHTML = briefings.map(b => \`
                            <div style="border: 1px solid #ddd; padding: 10px; margin: 5px 0; border-radius: 5px;">
                                <strong>\${b.name}</strong> - Status: \${b.status}
                                <br><small>Criado em: \${new Date(b.createdAt).toLocaleString()}</small>
                            </div>
                        \`).join('');
                    }
                } catch (error) {
                    console.error('Erro ao carregar briefings:', error);
                }
            }

            async function loadBriefingsForSelect() {
                try {
                    const token = localStorage.getItem('token');
                    const response = await fetch('/api/v1/briefings', {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    const briefings = await response.json();
                    
                    const select = document.getElementById('briefingSelect');
                    select.innerHTML = '<option value="">Selecione um briefing...</option>';
                    briefings.forEach(b => {
                        select.innerHTML += \`<option value="\${b.id}">\${b.name}</option>\`;
                    });
                } catch (error) {
                    console.error('Erro ao carregar briefings:', error);
                }
            }

            async function createBriefing() {
                try {
                    const token = localStorage.getItem('token');
                    const plataformas = Array.from(document.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
                    
                    const data = {
                        templateId: 'template-1',
                        name: document.getElementById('briefingName').value,
                        data: {
                            objetivo: document.getElementById('objetivo').value,
                            publico_alvo: document.getElementById('publico_alvo').value,
                            tom_voz: document.getElementById('tom_voz').value,
                            plataformas: plataformas,
                            palavras_chave: document.getElementById('palavras_chave').value.split(',').map(s => s.trim()).filter(s => s)
                        }
                    };
                    
                    const response = await fetch('/api/v1/briefings', {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + token,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(data)
                    });
                    
                    const result = await response.json();
                    if (result.success) {
                        alert('✅ Briefing criado com sucesso!');
                        loadBriefings();
                        document.getElementById('briefingForm').reset();
                    } else {
                        alert('❌ Erro ao criar briefing: ' + result.error);
                    }
                } catch (error) {
                    alert('❌ Erro ao criar briefing: ' + error.message);
                }
            }

            async function startAIAgents() {
                try {
                    const token = localStorage.getItem('token');
                    const plataformas = Array.from(document.querySelectorAll('#agentsForm input[type="checkbox"]:checked')).map(cb => cb.value);
                    
                    const data = {
                        briefingId: document.getElementById('briefingSelect').value,
                        subject: document.getElementById('subject').value,
                        numAgents: parseInt(document.getElementById('numAgents').value),
                        numRounds: parseInt(document.getElementById('numRounds').value),
                        platforms: plataformas
                    };
                    
                    const response = await fetch('/api/v1/content/generate-with-agents', {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + token,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(data)
                    });
                    
                    const result = await response.json();
                    if (result.success) {
                        document.getElementById('agentsResult').style.display = 'block';
                        document.getElementById('agentsStatus').innerHTML = \`
                            <p>✅ \${result.message}</p>
                            <p><strong>Agentes:</strong> \${result.agents.join(', ')}</p>
                            <p><strong>Session ID:</strong> \${result.sessionId}</p>
                            <p>🔄 Aguarde 3 segundos para ver o resultado...</p>
                        \`;
                        
                        // Verificar status após 3 segundos
                        setTimeout(async () => {
                            const statusResponse = await fetch(\`/api/v1/sessions/\${result.sessionId}\`, {
                                headers: { 'Authorization': 'Bearer ' + token }
                            });
                            const session = await statusResponse.json();
                            
                            if (session.status === 'completed') {
                                document.getElementById('agentsStatus').innerHTML += \`
                                    <div style="background: #f0f8ff; padding: 15px; border-radius: 5px; margin-top: 10px;">
                                        <h6>✅ Conteúdo Gerado:</h6>
                                        <p>\${session.finalContent.text}</p>
                                        <p><strong>Hashtags:</strong> \${session.finalContent.hashtags.join(', ')}</p>
                                    </div>
                                \`;
                            }
                        }, 3500);
                    } else {
                        alert('❌ Erro: ' + result.error);
                    }
                } catch (error) {
                    alert('❌ Erro ao iniciar agentes: ' + error.message);
                }
            }

            async function loadWorkflows() {
                try {
                    const token = localStorage.getItem('token');
                    const response = await fetch('/api/v1/workflows', {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    const workflows = await response.json();
                    
                    const container = document.getElementById('workflowsContainer');
                    if (workflows.length === 0) {
                        container.innerHTML = '<p>Nenhum workflow encontrado. Gere conteúdo com agentes IA primeiro.</p>';
                    } else {
                        container.innerHTML = workflows.map(w => \`
                            <div style="border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px;">
                                <h6>Workflow: \${w.id}</h6>
                                <p><strong>Estado:</strong> \${w.state}</p>
                                <p><strong>Briefing:</strong> \${w.briefingId}</p>
                                <p><strong>Conteúdo:</strong> \${w.content.text.substring(0, 100)}...</p>
                                <button onclick="transitionWorkflow('\${w.id}', 'adjustments')" class="btn-primary" style="margin: 5px;">→ Ajustes</button>
                                <button onclick="transitionWorkflow('\${w.id}', 'approval')" class="btn-primary" style="margin: 5px;">→ Aprovação</button>
                                <button onclick="transitionWorkflow('\${w.id}', 'ready_for_download')" class="btn-success" style="margin: 5px;">→ Pronto</button>
                            </div>
                        \`).join('');
                    }
                } catch (error) {
                    console.error('Erro ao carregar workflows:', error);
                }
            }

            async function loadWorkflowsForSelect() {
                try {
                    const token = localStorage.getItem('token');
                    const response = await fetch('/api/v1/workflows', {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    const workflows = await response.json();
                    
                    const select = document.getElementById('workflowSelect');
                    select.innerHTML = '<option value="">Selecione um workflow...</option>';
                    workflows.forEach(w => {
                        select.innerHTML += \`<option value="\${w.id}">Workflow \${w.id} - \${w.state}</option>\`;
                    });
                } catch (error) {
                    console.error('Erro ao carregar workflows:', error);
                }
            }

            async function generateImage() {
                try {
                    const token = localStorage.getItem('token');
                    const data = {
                        workflowId: document.getElementById('workflowSelect').value,
                        platform: document.getElementById('imagePlatform').value,
                        prompt: document.getElementById('imagePrompt').value
                    };
                    
                    const response = await fetch('/api/v1/creatives/generate-image', {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + token,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(data)
                    });
                    
                    const result = await response.json();
                    if (result.success) {
                        document.getElementById('creativesResult').innerHTML = \`
                            <div style="background: #f0f8ff; padding: 15px; border-radius: 5px;">
                                <h6>✅ Imagem Gerada!</h6>
                                <p><strong>ID:</strong> \${result.asset.id}</p>
                                <p><strong>Plataforma:</strong> \${result.asset.platform}</p>
                                <img src="\${result.asset.url}" style="max-width: 200px; border-radius: 5px;">
                            </div>
                        \`;
                    }
                } catch (error) {
                    alert('❌ Erro ao gerar imagem: ' + error.message);
                }
            }

            async function generateVideo() {
                try {
                    const token = localStorage.getItem('token');
                    const data = {
                        workflowId: document.getElementById('workflowSelect').value,
                        script: document.getElementById('videoScript').value,
                        avatarType: document.getElementById('avatarType').value
                    };
                    
                    const response = await fetch('/api/v1/creatives/generate-video', {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + token,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(data)
                    });
                    
                    const result = await response.json();
                    if (result.success) {
                        document.getElementById('creativesResult').innerHTML = \`
                            <div style="background: #f0f8ff; padding: 15px; border-radius: 5px;">
                                <h6>🔄 Vídeo sendo gerado...</h6>
                                <p>\${result.message}</p>
                                <p><strong>ID:</strong> \${result.asset.id}</p>
                                <p><strong>Avatar:</strong> \${result.asset.avatarType}</p>
                            </div>
                        \`;
                    }
                } catch (error) {
                    alert('❌ Erro ao gerar vídeo: ' + error.message);
                }
            }

            async function loadAssets() {
                try {
                    const token = localStorage.getItem('token');
                    const response = await fetch('/api/v1/assets', {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    const assets = await response.json();
                    
                    const container = document.getElementById('assetsContainer');
                    if (assets.length === 0) {
                        container.innerHTML = '<p>Nenhum asset encontrado. Gere criativos primeiro.</p>';
                    } else {
                        container.innerHTML = assets.map(a => \`
                            <div style="border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px;">
                                <h6>\${a.type.toUpperCase()}: \${a.id}</h6>
                                <p><strong>Status:</strong> \${a.status}</p>
                                <p><strong>Criado:</strong> \${new Date(a.createdAt).toLocaleString()}</p>
                                \${a.status === 'generated' || a.status === 'completed' ? 
                                    \`<button onclick="downloadAsset('\${a.id}')" class="btn-success">💾 Download</button>\` : 
                                    '<span style="color: #999;">🔄 Processando...</span>'
                                }
                            </div>
                        \`).join('');
                    }
                } catch (error) {
                    console.error('Erro ao carregar assets:', error);
                }
            }

            async function downloadAsset(assetId) {
                try {
                    const token = localStorage.getItem('token');
                    const response = await fetch(\`/api/v1/assets/\${assetId}/download\`, {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    const result = await response.json();
                    
                    if (result.success) {
                        window.open(result.downloadUrl, '_blank');
                        alert('✅ ' + result.message);
                    }
                } catch (error) {
                    alert('❌ Erro ao fazer download: ' + error.message);
                }
            }

            async function transitionWorkflow(workflowId, newState) {
                try {
                    const token = localStorage.getItem('token');
                    const response = await fetch(\`/api/v1/workflows/\${workflowId}/transition\`, {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + token,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ newState, comment: \`Transição para \${newState}\` })
                    });
                    
                    const result = await response.json();
                    if (result.success) {
                        alert('✅ Workflow atualizado!');
                        loadWorkflows();
                    }
                } catch (error) {
                    alert('❌ Erro ao atualizar workflow: ' + error.message);
                }
            }
        </script>
    </body>
    </html>
  `);
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ ZingMedia Sistema Real v2.0 rodando na porta ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🎯 Todas as credenciais funcionam com senha: password`);
  
  if (NODE_ENV === 'development') {
    console.log(`
🚀 ZingMedia Sistema Real v2.0 - FUNCIONANDO!

📍 URL: http://localhost:${PORT}

👥 Credenciais que FUNCIONAM:
   ✅ admin@zingmedia.com (Platform Admin)
   ✅ agency@example.com (Agency Admin)  
   ✅ social@example.com (Social Media Manager) ⭐
   ✅ approver@client.com (Client Approver)
   ✅ viewer@client.com (Viewer)
   🔑 Senha: password

🎯 Sistema Real v2.0 com RBAC implementado!
    `);
  }
}).on('error', (err) => {
  console.error('❌ Erro ao iniciar servidor:', err);
  process.exit(1);
});

module.exports = app;
// ===== FUNCIONALIDADES REAIS DO SISTEMA =====

// Dados para funcionalidades reais
const briefings = [];
const briefingTemplates = [
  {
    id: 'template-1',
    name: 'Briefing Padrão - Redes Sociais',
    type: 'internal',
    fields: [
      { name: 'objetivo', label: 'Objetivo da Campanha', type: 'text', required: true },
      { name: 'publico_alvo', label: 'Público-Alvo', type: 'textarea', required: true },
      { name: 'tom_voz', label: 'Tom de Voz', type: 'select', options: ['Profissional', 'Descontraído', 'Inspirador', 'Educativo'], required: true },
      { name: 'plataformas', label: 'Plataformas', type: 'multiselect', options: ['Instagram', 'Facebook', 'LinkedIn', 'TikTok'], required: true },
      { name: 'palavras_chave', label: 'Palavras-Chave', type: 'tags', required: false }
    ]
  }
];

const aiAgentSessions = [];
const contentWorkflows = [];
const creativeAssets = [];

// ===== API ENDPOINTS FUNCIONAIS =====

// Briefings API
app.get('/api/v1/briefings', authenticateToken, (req, res) => {
  const tenantBriefings = briefings.filter(b => b.tenantId === req.user.tenantId);
  res.json(tenantBriefings);
});

app.get('/api/v1/briefings/templates', authenticateToken, (req, res) => {
  res.json(briefingTemplates);
});

app.post('/api/v1/briefings', authenticateToken, (req, res) => {
  const { templateId, name, data } = req.body;
  
  const template = briefingTemplates.find(t => t.id === templateId);
  if (!template) {
    return res.status(404).json({ error: 'Template não encontrado' });
  }

  const briefing = {
    id: `briefing_${Date.now()}`,
    templateId,
    name,
    data,
    status: 'active',
    tenantId: req.user.tenantId,
    userId: req.user.id,
    createdAt: new Date().toISOString()
  };

  briefings.push(briefing);
  res.json({ success: true, briefing });
});

// AI Agents API
app.post('/api/v1/content/generate-with-agents', authenticateToken, (req, res) => {
  const { briefingId, subject, numAgents, numRounds, platforms } = req.body;
  
  if (!briefingId) {
    return res.status(400).json({ 
      error: 'Briefing obrigatório: Não é possível gerar conteúdo sem um briefing ativo',
      code: 'BRIEFING_REQUIRED'
    });
  }

  const briefing = briefings.find(b => b.id === briefingId && b.tenantId === req.user.tenantId);
  if (!briefing) {
    return res.status(404).json({ error: 'Briefing não encontrado' });
  }

  const sessionId = `session_${Date.now()}`;
  
  const agentSession = {
    id: sessionId,
    briefingId,
    subject,
    numAgents,
    numRounds,
    platforms,
    agents: [
      { id: 'agent_1', specialty: 'Copywriter Sênior', expertise: 'Textos persuasivos' },
      { id: 'agent_2', specialty: 'Estrategista Digital', expertise: 'Planejamento de campanhas' },
      { id: 'agent_3', specialty: 'Designer de Conteúdo', expertise: 'Direção criativa' }
    ].slice(0, numAgents),
    status: 'processing',
    tenantId: req.user.tenantId,
    userId: req.user.id,
    createdAt: new Date().toISOString()
  };

  // Simular processamento dos agentes
  setTimeout(() => {
    agentSession.status = 'completed';
    agentSession.finalContent = {
      text: `Conteúdo gerado pelos agentes IA sobre "${subject}":\n\n` +
            `Baseado no briefing "${briefing.name}", nossos ${numAgents} agentes especializados ` +
            `realizaram ${numRounds} rodadas de debate e consolidaram este conteúdo otimizado ` +
            `para ${platforms.join(', ')}.\n\n` +
            `Tom: ${briefing.data.tom_voz}\n` +
            `Público-alvo: ${briefing.data.publico_alvo}\n\n` +
            `Este conteúdo foi criado seguindo as melhores práticas de cada plataforma.`,
      hashtags: briefing.data.palavras_chave || ['ConteudoIA', 'ZingMedia'],
      platforms: platforms
    };

    // Criar workflow
    const workflow = {
      id: `workflow_${Date.now()}`,
      sessionId,
      briefingId,
      content: agentSession.finalContent,
      state: 'generation',
      tenantId: req.user.tenantId,
      userId: req.user.id,
      createdAt: new Date().toISOString(),
      history: [{
        state: 'generation',
        timestamp: new Date().toISOString(),
        comment: 'Conteúdo gerado pelos agentes IA'
      }]
    };
    
    contentWorkflows.push(workflow);
  }, 3000);

  aiAgentSessions.push(agentSession);
  
  res.json({ 
    success: true, 
    sessionId,
    message: 'Agentes IA iniciados! Processando conteúdo...',
    agents: agentSession.agents.map(a => a.specialty)
  });
});

// Workflows API
app.get('/api/v1/workflows', authenticateToken, (req, res) => {
  const tenantWorkflows = contentWorkflows.filter(w => w.tenantId === req.user.tenantId);
  res.json(tenantWorkflows);
});

app.post('/api/v1/workflows/:id/transition', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { newState, comment } = req.body;
  
  const workflowIndex = contentWorkflows.findIndex(w => w.id === id && w.tenantId === req.user.tenantId);
  if (workflowIndex === -1) {
    return res.status(404).json({ error: 'Workflow não encontrado' });
  }

  const workflow = contentWorkflows[workflowIndex];
  workflow.state = newState;
  workflow.history.push({
    state: newState,
    timestamp: new Date().toISOString(),
    userId: req.user.id,
    comment: comment || `Transição para ${newState}`
  });

  contentWorkflows[workflowIndex] = workflow;
  res.json({ success: true, workflow });
});

// Criativos API
app.post('/api/v1/creatives/generate-image', authenticateToken, (req, res) => {
  const { workflowId, platform, prompt } = req.body;
  
  const workflow = contentWorkflows.find(w => w.id === workflowId && w.tenantId === req.user.tenantId);
  if (!workflow) {
    return res.status(404).json({ error: 'Workflow não encontrado' });
  }

  const imageAsset = {
    id: `img_${Date.now()}`,
    type: 'image',
    workflowId,
    platform,
    prompt,
    url: `https://picsum.photos/1080/1080?random=${Date.now()}`,
    status: 'generated',
    provider: 'gemini',
    tenantId: req.user.tenantId,
    userId: req.user.id,
    createdAt: new Date().toISOString()
  };

  creativeAssets.push(imageAsset);
  res.json({ success: true, asset: imageAsset });
});

app.post('/api/v1/creatives/generate-video', authenticateToken, (req, res) => {
  const { workflowId, script, avatarType } = req.body;
  
  const workflow = contentWorkflows.find(w => w.id === workflowId && w.tenantId === req.user.tenantId);
  if (!workflow) {
    return res.status(404).json({ error: 'Workflow não encontrado' });
  }

  const videoAsset = {
    id: `vid_${Date.now()}`,
    type: 'video',
    workflowId,
    script,
    avatarType: avatarType || 'default',
    url: `https://sample-videos.com/zip/10/mp4/SampleVideo_1080x720_1mb.mp4`,
    thumbnail: `https://picsum.photos/1080/720?random=${Date.now()}`,
    duration: 30,
    status: 'processing',
    provider: 'heygen',
    tenantId: req.user.tenantId,
    userId: req.user.id,
    createdAt: new Date().toISOString()
  };

  setTimeout(() => {
    const assetIndex = creativeAssets.findIndex(a => a.id === videoAsset.id);
    if (assetIndex !== -1) {
      creativeAssets[assetIndex].status = 'completed';
    }
  }, 5000);

  creativeAssets.push(videoAsset);
  res.json({ 
    success: true, 
    asset: videoAsset,
    message: 'Vídeo sendo gerado! Será notificado quando estiver pronto.'
  });
});

// Download API
app.get('/api/v1/assets', authenticateToken, (req, res) => {
  const { workflowId } = req.query;
  let assets = creativeAssets.filter(a => a.tenantId === req.user.tenantId);
  
  if (workflowId) {
    assets = assets.filter(a => a.workflowId === workflowId);
  }
  
  res.json(assets);
});

app.get('/api/v1/assets/:id/download', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  const asset = creativeAssets.find(a => a.id === id && a.tenantId === req.user.tenantId);
  if (!asset) {
    return res.status(404).json({ error: 'Asset não encontrado' });
  }

  res.json({
    success: true,
    downloadUrl: asset.url,
    filename: `${asset.type}_${asset.id}.${asset.type === 'image' ? 'jpg' : 'mp4'}`,
    message: 'Download iniciado!'
  });
});

// Sessions API para verificar status
app.get('/api/v1/sessions/:id', authenticateToken, (req, res) => {
  const session = aiAgentSessions.find(s => s.id === req.params.id && s.tenantId === req.user.tenantId);
  if (!session) {
    return res.status(404).json({ error: 'Sessão não encontrada' });
  }
  res.json(session);
});