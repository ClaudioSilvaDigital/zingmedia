const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Log environment info for debugging
console.log('🔧 Environment Info:');
console.log(`   NODE_ENV: ${NODE_ENV}`);
console.log(`   PORT: ${PORT}`);
console.log(`   Railway Environment: ${process.env.RAILWAY_ENVIRONMENT || 'not detected'}`);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Simulação de banco de dados em memória
const users = [
  {
    id: '1',
    email: 'admin@zingmedia.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
    name: 'Administrador ZingMedia',
    role: 'admin',
    tenantId: 'platform-tenant'
  },
  {
    id: '2',
    email: 'agency@example.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
    name: 'Agência Demo',
    role: 'agency_admin',
    tenantId: 'agency-demo'
  },
  {
    id: '3',
    email: 'user@example.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
    name: 'Usuário Demo',
    role: 'user',
    tenantId: 'agency-demo'
  }
];

const tenants = [
  {
    id: 'platform-tenant',
    name: 'ZingMedia',
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
    name: 'Agência Demo',
    type: 'agency',
    brandConfig: {
      primaryColor: '#4f46e5',
      secondaryColor: '#7c3aed',
      companyName: 'Agência Demo',
      logo: null
    }
  }
];

// Simulação de banco de dados para configurações
const aiConfigs = new Map();
const socialCredentials = new Map();
const contentPosts = [];
const campaigns = [];
const analytics = [];
const workflows = [];

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

// Health check endpoints for Railway
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'ZingMedia'
  });
});

app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'ZingMedia',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    services: {
      authentication: 'ok',
      database: 'simulated',
      ai_providers: 'ready',
      social_media: 'ready',
      content_generation: 'ready',
      publishing: 'ready'
    }
  });
});

// Additional health endpoints
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

app.get('/_health', (req, res) => {
  res.status(200).send('OK');
});

// Rota principal - página de login
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ZingMedia - Login</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
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
                max-width: 400px;
            }
            
            .logo {
                text-align: center;
                margin-bottom: 30px;
            }
            
            .logo h1 {
                color: #2d3748;
                font-size: 2rem;
                margin-bottom: 10px;
            }
            
            .logo p {
                color: #718096;
                font-size: 0.9rem;
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
                padding: 10px;
                margin: 8px 0;
                border-radius: 8px;
                font-size: 0.9rem;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            
            .demo-account:hover {
                background: #edf2f7;
            }
            
            .demo-account strong {
                color: #4a5568;
            }
            
            .demo-account span {
                color: #718096;
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
        </style>
    </head>
    <body>
        <div class="login-container">
            <div class="logo">
                <h1>🚀 ZingMedia</h1>
                <p>Plataforma Completa de Automação de Conteúdo</p>
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
                
                <button type="submit" class="btn">Entrar</button>
                
                <div id="message"></div>
            </form>
            
            <div class="demo-accounts">
                <h3>🎯 Contas de Demonstração</h3>
                <div class="demo-account" onclick="fillLogin('admin@zingmedia.com', 'password')">
                    <strong>Administrador:</strong> <span>admin@zingmedia.com</span><br>
                    <small>Acesso completo - Configurações e gestão</small>
                </div>
                <div class="demo-account" onclick="fillLogin('agency@example.com', 'password')">
                    <strong>Agência:</strong> <span>agency@example.com</span><br>
                    <small>Gerenciar clientes e campanhas</small>
                </div>
                <div class="demo-account" onclick="fillLogin('user@example.com', 'password')">
                    <strong>Usuário:</strong> <span>user@example.com</span><br>
                    <small>Criar e publicar conteúdo</small>
                </div>
                <p style="margin-top: 15px; font-size: 0.8rem; color: #718096;">
                    <strong>Senha para todas as contas:</strong> password
                </p>
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
                        messageDiv.innerHTML = '<div class="success">Login realizado com sucesso! Redirecionando...</div>';
                        setTimeout(() => {
                            window.location.href = '/dashboard';
                        }, 1500);
                    } else {
                        messageDiv.innerHTML = '<div class="error">' + data.error + '</div>';
                    }
                } catch (error) {
                    messageDiv.innerHTML = '<div class="error">Erro ao conectar com o servidor</div>';
                }
            });
        </script>
    </body>
    </html>
  `);
});

// Rota de login
app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }
    
    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        tenantId: user.tenantId 
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
        tenantId: user.tenantId
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});
// Dashboard completo com todas as funcionalidades
app.get('/dashboard', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dashboard - ZingMedia</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
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
            
            .logo h1 {
                font-size: 1.8rem;
            }
            
            .user-info {
                display: flex;
                align-items: center;
                gap: 15px;
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
            
            .logout-btn:hover {
                background: rgba(255,255,255,0.3);
            }
            
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
            
            .stats {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 20px;
                margin-bottom: 30px;
            }
            
            .stat-card {
                background: white;
                border-radius: 15px;
                padding: 25px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.05);
                border-left: 4px solid #667eea;
            }
            
            .stat-number {
                font-size: 2.5rem;
                font-weight: bold;
                color: #667eea;
                margin-bottom: 5px;
            }
            
            .stat-label {
                color: #718096;
                font-size: 0.9rem;
                text-transform: uppercase;
                letter-spacing: 0.5px;
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
            }
            
            .feature-card:hover {
                transform: translateY(-5px);
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
            
            .feature-btn:hover {
                opacity: 0.9;
            }
            
            .role-badge {
                background: rgba(255,255,255,0.2);
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 0.8rem;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            /* Modal Styles */
            .modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                z-index: 1000;
                display: none;
                align-items: center;
                justify-content: center;
            }

            .modal-content {
                background: white;
                padding: 30px;
                border-radius: 15px;
                max-width: 600px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
            }

            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }

            .modal-close {
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
            }

            .form-group {
                margin-bottom: 15px;
            }

            .form-group label {
                display: block;
                margin-bottom: 5px;
                font-weight: 500;
                color: #2d3748;
            }

            .form-group input,
            .form-group textarea,
            .form-group select {
                width: 100%;
                padding: 8px 12px;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                font-size: 14px;
            }

            .form-group textarea {
                height: 80px;
                resize: vertical;
            }

            .btn-primary {
                background: #667eea;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 500;
                margin-right: 10px;
            }

            .btn-success {
                background: #28a745;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 500;
                margin-right: 10px;
            }

            .btn-danger {
                background: #dc3545;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 500;
            }

            .content-preview {
                border: 1px solid #e2e8f0;
                padding: 15px;
                border-radius: 8px;
                background: #f9f9f9;
                margin: 15px 0;
            }

            .post-item {
                border: 1px solid #e2e8f0;
                padding: 15px;
                margin: 10px 0;
                border-radius: 8px;
                background: white;
            }

            .post-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }

            .platform-badge {
                background: #667eea;
                color: white;
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 12px;
                text-transform: uppercase;
            }

            .config-section {
                background: #f8f9fa;
                padding: 20px;
                border-radius: 8px;
                margin: 15px 0;
            }

            .config-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 0;
                border-bottom: 1px solid #e9ecef;
            }

            .config-item:last-child {
                border-bottom: none;
            }

            .status-indicator {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                display: inline-block;
                margin-right: 8px;
            }

            .status-connected {
                background: #28a745;
            }

            .status-disconnected {
                background: #dc3545;
            }
        </style>
    </head>
    <body>
        <div class="loading" id="loading">
            <div class="spinner"></div>
            <p>Carregando dashboard...</p>
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
                <h2>Bem-vindo ao ZingMedia!</h2>
                <p>Plataforma completa de automação de conteúdo para redes sociais.</p>
            </div>
            
            <div class="stats">
                <div class="stat-card">
                    <div class="stat-number" id="contentCount">0</div>
                    <div class="stat-label">Conteúdos Criados</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number" id="publishedCount">0</div>
                    <div class="stat-label">Publicações Realizadas</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number" id="platformCount">0</div>
                    <div class="stat-label">Plataformas Conectadas</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number" id="campaignCount">0</div>
                    <div class="stat-label">Campanhas Ativas</div>
                </div>
            </div>
            
            <div class="features">
                <div class="feature-card">
                    <div class="feature-icon">🤖</div>
                    <h3>Configurar IA</h3>
                    <p>Configure provedores de IA (OpenAI, Claude, Gemini) para geração de conteúdo</p>
                    <button class="feature-btn" onclick="showAIConfig()">Configurar</button>
                </div>
                
                <div class="feature-card">
                    <div class="feature-icon">📱</div>
                    <h3>Redes Sociais</h3>
                    <p>Conecte suas contas do Instagram, Facebook, LinkedIn e TikTok</p>
                    <button class="feature-btn" onclick="showSocialConfig()">Conectar</button>
                </div>
                
                <div class="feature-card">
                    <div class="feature-icon">📝</div>
                    <h3>Criar Conteúdo</h3>
                    <p>Use IA para gerar conteúdo otimizado para suas redes sociais</p>
                    <button class="feature-btn" onclick="showContentCreator()">Criar Agora</button>
                </div>
                
                <div class="feature-card">
                    <div class="feature-icon">📅</div>
                    <h3>Calendário Editorial</h3>
                    <p>Planeje e agende suas publicações com inteligência</p>
                    <button class="feature-btn" onclick="showCalendar()">Ver Calendário</button>
                </div>
                
                <div class="feature-card">
                    <div class="feature-icon">📊</div>
                    <h3>Analytics</h3>
                    <p>Acompanhe o desempenho e otimize sua estratégia</p>
                    <button class="feature-btn" onclick="showAnalytics()">Ver Relatórios</button>
                </div>
                
                <div class="feature-card">
                    <div class="feature-icon">🎯</div>
                    <h3>Campanhas</h3>
                    <p>Gerencie campanhas multi-plataforma de forma integrada</p>
                    <button class="feature-btn" onclick="showCampaigns()">Gerenciar</button>
                </div>

                <div class="feature-card">
                    <div class="feature-icon">📋</div>
                    <h3>Posts Publicados</h3>
                    <p>Visualize histórico de publicações e resultados</p>
                    <button class="feature-btn" onclick="showPublishedPosts()">Ver Posts</button>
                </div>

                <div class="feature-card">
                    <div class="feature-icon">⚙️</div>
                    <h3>Configurações</h3>
                    <p>Personalize sua experiência e gerencie configurações</p>
                    <button class="feature-btn" onclick="showSettings()">Configurar</button>
                </div>
            </div>
        </div>

        <!-- Modal Container -->
        <div class="modal" id="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 id="modalTitle">Modal</h2>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div id="modalBody">
                    <!-- Modal content will be inserted here -->
                </div>
            </div>
        </div>

        <script>
            let currentUser = null;
            let currentTenant = null;

            async function loadDashboard() {
                const token = localStorage.getItem('token');
                
                if (!token) {
                    window.location.href = '/';
                    return;
                }
                
                try {
                    const response = await fetch('/api/v1/user/profile', {
                        headers: {
                            'Authorization': 'Bearer ' + token
                        }
                    });
                    
                    if (!response.ok) {
                        throw new Error('Token inválido');
                    }
                    
                    const data = await response.json();
                    currentUser = data.user;
                    currentTenant = data.tenant;
                    
                    // Atualizar interface com dados do usuário
                    document.getElementById('userName').textContent = data.user.name;
                    document.getElementById('userRole').textContent = data.user.role;
                    document.getElementById('companyName').textContent = '🚀 ' + data.tenant.brandConfig.companyName;
                    
                    // Aplicar cores da marca
                    const primaryColor = data.tenant.brandConfig.primaryColor;
                    const secondaryColor = data.tenant.brandConfig.secondaryColor;
                    
                    document.querySelector('.header').style.background = 
                        \`linear-gradient(135deg, \${primaryColor} 0%, \${secondaryColor} 100%)\`;
                    
                    // Atualizar cores dos cards
                    document.querySelectorAll('.stat-card').forEach(card => {
                        card.style.borderLeftColor = primaryColor;
                    });
                    
                    document.querySelectorAll('.stat-number').forEach(number => {
                        number.style.color = primaryColor;
                    });
                    
                    document.querySelectorAll('.feature-btn').forEach(btn => {
                        btn.style.backgroundColor = primaryColor;
                    });

                    // Carregar estatísticas
                    await loadStats();
                    
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

            async function loadStats() {
                try {
                    const token = localStorage.getItem('token');
                    
                    // Carregar posts publicados
                    const postsResponse = await fetch('/api/v1/content/posts', {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    const posts = await postsResponse.json();
                    document.getElementById('publishedCount').textContent = posts.length;

                    // Carregar configurações de redes sociais
                    const socialResponse = await fetch('/api/v1/social/credentials', {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    const socialCreds = await socialResponse.json();
                    const connectedPlatforms = Object.values(socialCreds).filter(cred => cred.accessToken).length;
                    document.getElementById('platformCount').textContent = connectedPlatforms;

                    // Carregar campanhas
                    const campaignsResponse = await fetch('/api/v1/campaigns', {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    const campaigns = await campaignsResponse.json();
                    document.getElementById('campaignCount').textContent = campaigns.length;

                    // Simular contagem de conteúdos
                    document.getElementById('contentCount').textContent = posts.length + Math.floor(Math.random() * 10);

                } catch (error) {
                    console.error('Erro ao carregar estatísticas:', error);
                }
            }
            
            function logout() {
                localStorage.removeItem('token');
                window.location.href = '/';
            }

            function showModal(title, content) {
                document.getElementById('modalTitle').textContent = title;
                document.getElementById('modalBody').innerHTML = content;
                document.getElementById('modal').style.display = 'flex';
            }

            function closeModal() {
                document.getElementById('modal').style.display = 'none';
            }

            // Carregar dashboard quando a página carregar
            window.addEventListener('load', loadDashboard);
        </script>
        <script src="/dashboard-functions.js"></script>
    </body>
    </html>
  `);
});
// API Routes protegidas
app.get('/api/v1/user/profile', authenticateToken, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  const tenant = tenants.find(t => t.id === user.tenantId);
  
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    },
    tenant: {
      id: tenant.id,
      name: tenant.name,
      type: tenant.type,
      brandConfig: tenant.brandConfig
    }
  });
});

// Configurações de IA
app.get('/api/v1/ai/config', authenticateToken, (req, res) => {
  const config = aiConfigs.get(req.user.tenantId) || {
    openai: { apiKey: '', model: 'gpt-4', status: 'disconnected' },
    claude: { apiKey: '', model: 'claude-3-sonnet', status: 'disconnected' },
    gemini: { apiKey: '', model: 'gemini-pro', status: 'disconnected' }
  };
  
  res.json(config);
});

app.post('/api/v1/ai/config', authenticateToken, (req, res) => {
  const { provider, apiKey, model } = req.body;
  
  let config = aiConfigs.get(req.user.tenantId) || {};
  config[provider] = { 
    apiKey, 
    model, 
    status: apiKey ? 'connected' : 'disconnected',
    lastUpdated: new Date().toISOString()
  };
  aiConfigs.set(req.user.tenantId, config);
  
  res.json({ success: true, message: `${provider} configurado com sucesso!` });
});

// Credenciais das redes sociais
app.get('/api/v1/social/credentials', authenticateToken, (req, res) => {
  const credentials = socialCredentials.get(req.user.tenantId) || {
    instagram: { accessToken: '', appId: '', appSecret: '', status: 'disconnected' },
    facebook: { accessToken: '', appId: '', appSecret: '', status: 'disconnected' },
    linkedin: { accessToken: '', clientId: '', clientSecret: '', status: 'disconnected' },
    tiktok: { accessToken: '', appId: '', appSecret: '', status: 'disconnected' }
  };
  
  res.json(credentials);
});

app.post('/api/v1/social/credentials', authenticateToken, (req, res) => {
  const { platform, accessToken, appId, appSecret, clientId, clientSecret } = req.body;
  
  let credentials = socialCredentials.get(req.user.tenantId) || {};
  credentials[platform] = { 
    accessToken, 
    appId: appId || clientId, 
    appSecret: appSecret || clientSecret,
    status: accessToken ? 'connected' : 'disconnected',
    lastUpdated: new Date().toISOString()
  };
  socialCredentials.set(req.user.tenantId, credentials);
  
  res.json({ success: true, message: `${platform} configurado com sucesso!` });
});

// Geração de conteúdo com IA
app.post('/api/v1/content/generate', authenticateToken, (req, res) => {
  const { prompt, platform, contentType } = req.body;
  
  // Verificar se tem configuração de IA
  const aiConfig = aiConfigs.get(req.user.tenantId);
  if (!aiConfig || !Object.values(aiConfig).some(config => config.status === 'connected')) {
    return res.status(400).json({ 
      success: false, 
      error: 'Configure pelo menos um provedor de IA antes de gerar conteúdo!' 
    });
  }
  
  // Simulação de geração de conteúdo baseada no prompt
  const templates = {
    instagram: {
      marketing: `🚀 ${prompt}

✨ Transforme sua presença digital com estratégias inovadoras!

💡 Dicas essenciais:
• Conteúdo autêntico gera mais engajamento
• Consistência é a chave do sucesso
• Interaja genuinamente com sua audiência

#Marketing #DigitalMarketing #SocialMedia #Estrategia`,
      
      lifestyle: `🌟 ${prompt}

Cada momento é uma oportunidade de crescer e inspirar! 

💫 Lembre-se:
• A jornada é tão importante quanto o destino
• Pequenos passos levam a grandes conquistas
• Sua autenticidade é seu maior diferencial

#Lifestyle #Inspiracao #Motivacao #VidaReal`,
      
      business: `💼 ${prompt}

🎯 No mundo dos negócios, a inovação é fundamental!

📈 Estratégias que funcionam:
• Foque na experiência do cliente
• Invista em relacionamentos duradouros
• Mantenha-se sempre atualizado

#Business #Empreendedorismo #Inovacao #Sucesso`
    },
    
    linkedin: {
      professional: `${prompt}

Como profissionais, devemos sempre buscar a excelência e o crescimento contínuo.

Principais insights:
→ Networking genuíno abre portas
→ Aprendizado constante é essencial
→ Compartilhar conhecimento fortalece a comunidade

Qual sua experiência com esse tema? Compartilhe nos comentários!

#LinkedIn #Carreira #Desenvolvimento #Networking`,
      
      business: `${prompt}

A transformação digital não é mais uma opção, é uma necessidade.

Pontos-chave para o sucesso:
• Adaptabilidade às mudanças do mercado
• Investimento em tecnologia e pessoas
• Cultura de inovação e experimentação

Como sua empresa está se preparando para o futuro?

#TransformacaoDigital #Inovacao #Lideranca #Futuro`
    },
    
    facebook: {
      community: `${prompt}

👥 Nossa comunidade é nossa maior força!

Juntos somos mais fortes e podemos alcançar objetivos incríveis. Cada membro traz algo único e valioso.

💪 Vamos continuar construindo algo especial juntos!

O que você mais valoriza em nossa comunidade? Conte pra gente! 👇

#Comunidade #Juntos #Forca #Uniao`,
      
      engagement: `${prompt}

🤔 E você, o que pensa sobre isso?

Adoramos ouvir diferentes perspectivas e experiências. Sua opinião é muito importante para nós!

💬 Deixe seu comentário e vamos conversar!
👍 Curta se concordar
🔄 Compartilhe com seus amigos

#Opiniao #Conversa #Comunidade #Engajamento`
    }
  };
  
  // Selecionar template baseado na plataforma e tipo de conteúdo
  const platformTemplates = templates[platform] || templates.instagram;
  const templateKeys = Object.keys(platformTemplates);
  const randomTemplate = platformTemplates[templateKeys[Math.floor(Math.random() * templateKeys.length)]];
  
  // Gerar hashtags relevantes
  const hashtagSets = {
    marketing: ['#MarketingDigital', '#SocialMedia', '#Estrategia', '#Branding', '#Conteudo'],
    business: ['#Negocios', '#Empreendedorismo', '#Inovacao', '#Lideranca', '#Sucesso'],
    lifestyle: ['#Lifestyle', '#Inspiracao', '#Motivacao', '#BemEstar', '#VidaReal'],
    tech: ['#Tecnologia', '#Inovacao', '#Digital', '#Futuro', '#Tech'],
    education: ['#Educacao', '#Aprendizado', '#Conhecimento', '#Desenvolvimento', '#Crescimento']
  };
  
  const randomHashtagSet = hashtagSets[Object.keys(hashtagSets)[Math.floor(Math.random() * Object.keys(hashtagSets).length)]];
  
  const generatedContent = {
    text: randomTemplate,
    hashtags: randomHashtagSet,
    suggestedTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    platforms: [platform],
    aiProvider: 'simulated',
    contentType: contentType || 'post'
  };
  
  res.json({ success: true, content: generatedContent });
});

// Publicação de conteúdo
app.post('/api/v1/content/publish', authenticateToken, (req, res) => {
  const { content, platforms, scheduledTime } = req.body;
  
  // Verificar se tem credenciais configuradas
  const credentials = socialCredentials.get(req.user.tenantId);
  if (!credentials) {
    return res.status(400).json({ 
      success: false, 
      error: 'Configure as credenciais das redes sociais primeiro!' 
    });
  }
  
  // Simular publicação
  const publishResults = platforms.map(platform => {
    const hasCredentials = credentials[platform] && credentials[platform].accessToken;
    
    if (!hasCredentials) {
      return {
        platform,
        status: 'failed',
        error: `Credenciais do ${platform} não configuradas`
      };
    }
    
    // Simular sucesso na publicação
    const postId = `${platform}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newPost = {
      id: postId,
      platform,
      content: content.text,
      hashtags: content.hashtags,
      publishedAt: scheduledTime || new Date().toISOString(),
      tenantId: req.user.tenantId,
      userId: req.user.id,
      status: 'published',
      engagement: {
        likes: Math.floor(Math.random() * 100),
        comments: Math.floor(Math.random() * 20),
        shares: Math.floor(Math.random() * 10)
      }
    };
    
    contentPosts.push(newPost);
    
    return {
      platform,
      status: 'success',
      postId,
      url: `https://${platform}.com/p/${postId}`,
      publishedAt: scheduledTime || new Date().toISOString()
    };
  });
  
  res.json({ success: true, results: publishResults });
});

// Listar posts publicados
app.get('/api/v1/content/posts', authenticateToken, (req, res) => {
  const tenantPosts = contentPosts.filter(post => post.tenantId === req.user.tenantId);
  res.json(tenantPosts);
});

// Campanhas
app.get('/api/v1/campaigns', authenticateToken, (req, res) => {
  const tenantCampaigns = campaigns.filter(campaign => campaign.tenantId === req.user.tenantId);
  res.json(tenantCampaigns);
});

app.post('/api/v1/campaigns', authenticateToken, (req, res) => {
  const { name, description, platforms, startDate, endDate } = req.body;
  
  const campaign = {
    id: `campaign_${Date.now()}`,
    name,
    description,
    platforms,
    startDate,
    endDate,
    status: 'active',
    tenantId: req.user.tenantId,
    userId: req.user.id,
    createdAt: new Date().toISOString(),
    posts: [],
    metrics: {
      totalPosts: 0,
      totalReach: 0,
      totalEngagement: 0
    }
  };
  
  campaigns.push(campaign);
  res.json({ success: true, campaign });
});

// Analytics
app.get('/api/v1/analytics', authenticateToken, (req, res) => {
  const tenantPosts = contentPosts.filter(post => post.tenantId === req.user.tenantId);
  
  const analyticsData = {
    overview: {
      totalPosts: tenantPosts.length,
      totalLikes: tenantPosts.reduce((sum, post) => sum + (post.engagement?.likes || 0), 0),
      totalComments: tenantPosts.reduce((sum, post) => sum + (post.engagement?.comments || 0), 0),
      totalShares: tenantPosts.reduce((sum, post) => sum + (post.engagement?.shares || 0), 0),
      avgEngagement: tenantPosts.length > 0 ? 
        tenantPosts.reduce((sum, post) => sum + ((post.engagement?.likes || 0) + (post.engagement?.comments || 0) + (post.engagement?.shares || 0)), 0) / tenantPosts.length : 0
    },
    byPlatform: {},
    timeline: [],
    topPosts: tenantPosts
      .sort((a, b) => ((b.engagement?.likes || 0) + (b.engagement?.comments || 0)) - ((a.engagement?.likes || 0) + (a.engagement?.comments || 0)))
      .slice(0, 5)
  };
  
  // Agrupar por plataforma
  tenantPosts.forEach(post => {
    if (!analyticsData.byPlatform[post.platform]) {
      analyticsData.byPlatform[post.platform] = {
        posts: 0,
        likes: 0,
        comments: 0,
        shares: 0
      };
    }
    
    analyticsData.byPlatform[post.platform].posts++;
    analyticsData.byPlatform[post.platform].likes += post.engagement?.likes || 0;
    analyticsData.byPlatform[post.platform].comments += post.engagement?.comments || 0;
    analyticsData.byPlatform[post.platform].shares += post.engagement?.shares || 0;
  });
  
  res.json(analyticsData);
});

// Calendário
app.get('/api/v1/calendar', authenticateToken, (req, res) => {
  const { month, year } = req.query;
  
  // Simular eventos do calendário
  const calendarEvents = contentPosts
    .filter(post => post.tenantId === req.user.tenantId)
    .map(post => ({
      id: post.id,
      title: `Post ${post.platform}`,
      date: post.publishedAt,
      platform: post.platform,
      status: post.status,
      content: post.content.substring(0, 50) + '...'
    }));
  
  res.json(calendarEvents);
});

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Middleware para rotas não encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 ZingMedia server started successfully on port ${PORT}`);
  console.log(`📍 Health check available at: http://localhost:${PORT}/health`);
  
  if (NODE_ENV === 'development') {
    console.log(`
🚀 ZingMedia Plataforma Completa está rodando!

📍 URL: http://localhost:${PORT}
🌐 Para acessar de outros dispositivos: http://${getLocalIP()}:${PORT}

👤 Contas de demonstração:
   📧 admin@zingmedia.com (Administrador Completo)
   📧 agency@example.com (Agência)  
   📧 user@example.com (Usuário)
   🔑 Senha: password

✨ Funcionalidades disponíveis:
   🤖 Configuração de IA (OpenAI, Claude, Gemini)
   📱 Integração com redes sociais
   📝 Geração de conteúdo com IA
   📊 Analytics e relatórios
   📅 Calendário editorial
   🎯 Gestão de campanhas
   📋 Histórico de publicações

🎯 Faça login como administrador para acessar todas as configurações!
    `);
  } else {
    console.log(`🚀 ZingMedia rodando na porta ${PORT} em modo ${NODE_ENV}`);
  }
}).on('error', (err) => {
  console.error('❌ Erro ao iniciar servidor:', err);
  process.exit(1);
});

// Tratamento de sinais para graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

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

// Exportar o app para uso em serverless
module.exports = app;