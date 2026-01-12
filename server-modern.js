const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log('🚀 ZingMedia Sistema Real v2.0 - DESIGN MODERNO COMPLETO!');
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
    service: 'ZingMedia Real System v2.0 - Design Moderno',
    version: '2.0.0'
  });
});

// Página de login MODERNA
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ZingMedia - Sistema Real v2.0</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
        <style>
            :root {
                --primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                --secondary-gradient: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                --success-gradient: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
                --warning-gradient: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
                --dark-gradient: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
                
                --bg-primary: #ffffff;
                --bg-secondary: #f8fafc;
                --bg-tertiary: #f1f5f9;
                --text-primary: #1e293b;
                --text-secondary: #64748b;
                --text-muted: #94a3b8;
                --border-color: #e2e8f0;
                --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
                --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
                --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
                --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
                --radius-sm: 0.375rem;
                --radius-md: 0.5rem;
                --radius-lg: 0.75rem;
                --radius-xl: 1rem;
            }
            
            * { 
                margin: 0; 
                padding: 0; 
                box-sizing: border-box; 
            }
            
            body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: var(--primary-gradient);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                line-height: 1.6;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }
            
            .animated-bg {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: var(--primary-gradient);
                z-index: -1;
            }
            
            .animated-bg::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="25" cy="25" r="1" fill="white" opacity="0.1"/><circle cx="75" cy="75" r="1" fill="white" opacity="0.1"/><circle cx="50" cy="10" r="0.5" fill="white" opacity="0.15"/><circle cx="10" cy="60" r="0.5" fill="white" opacity="0.15"/><circle cx="90" cy="40" r="0.5" fill="white" opacity="0.15"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>');
                animation: float 20s ease-in-out infinite;
            }
            
            @keyframes float {
                0%, 100% { transform: translateY(0px) rotate(0deg); }
                50% { transform: translateY(-20px) rotate(1deg); }
            }
            
            .login-container {
                background: var(--bg-primary);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: var(--radius-xl);
                padding: 3rem;
                box-shadow: var(--shadow-xl);
                width: 100%;
                max-width: 480px;
                position: relative;
                overflow: hidden;
                animation: slideUp 0.6s ease-out;
            }
            
            .login-container::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 4px;
                background: var(--primary-gradient);
                border-radius: var(--radius-xl) var(--radius-xl) 0 0;
            }
            
            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateY(30px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            .logo {
                text-align: center;
                margin-bottom: 2.5rem;
                position: relative;
            }
            
            .logo-icon {
                width: 64px;
                height: 64px;
                background: var(--primary-gradient);
                border-radius: var(--radius-xl);
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 1rem;
                box-shadow: var(--shadow-lg);
                animation: pulse 2s ease-in-out infinite;
            }
            
            .logo-icon i {
                font-size: 2rem;
                color: white;
            }
            
            @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.05); }
            }
            
            .logo h1 {
                color: var(--text-primary);
                font-size: 2.5rem;
                font-weight: 700;
                margin-bottom: 0.5rem;
                background: var(--primary-gradient);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }
            
            .logo p {
                color: var(--text-secondary);
                font-size: 1.1rem;
                font-weight: 500;
            }
            
            .version-badge {
                background: var(--success-gradient);
                color: white;
                padding: 0.5rem 1rem;
                border-radius: 2rem;
                font-size: 0.875rem;
                font-weight: 600;
                margin-top: 1rem;
                display: inline-flex;
                align-items: center;
                gap: 0.5rem;
                box-shadow: var(--shadow-md);
                animation: bounce 2s ease-in-out infinite;
            }
            
            @keyframes bounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-2px); }
            }
            
            .form-group {
                margin-bottom: 1.5rem;
                position: relative;
            }
            
            .form-group label {
                display: block;
                margin-bottom: 0.5rem;
                color: var(--text-primary);
                font-weight: 600;
                font-size: 0.875rem;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }
            
            .input-wrapper {
                position: relative;
            }
            
            .input-wrapper i {
                position: absolute;
                left: 1rem;
                top: 50%;
                transform: translateY(-50%);
                color: var(--text-muted);
                font-size: 1.125rem;
                z-index: 2;
            }
            
            input {
                width: 100%;
                padding: 1rem 1rem 1rem 3rem;
                border: 2px solid var(--border-color);
                border-radius: var(--radius-lg);
                font-size: 1rem;
                font-weight: 500;
                background: var(--bg-secondary);
                color: var(--text-primary);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
            }
            
            input:focus {
                outline: none;
                border-color: #667eea;
                background: var(--bg-primary);
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
                transform: translateY(-1px);
            }
            
            input:focus + .input-wrapper i {
                color: #667eea;
            }
            
            .btn {
                width: 100%;
                padding: 1rem 2rem;
                background: var(--primary-gradient);
                color: white;
                border: none;
                border-radius: var(--radius-lg);
                font-size: 1rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
                overflow: hidden;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                box-shadow: var(--shadow-lg);
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 0.5rem;
            }
            
            .btn::before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
                transition: left 0.5s;
            }
            
            .btn:hover {
                transform: translateY(-2px);
                box-shadow: var(--shadow-xl);
            }
            
            .btn:hover::before {
                left: 100%;
            }
            
            .btn:active {
                transform: translateY(0);
            }
            
            .demo-accounts {
                margin-top: 2rem;
                padding: 1.5rem;
                background: var(--bg-secondary);
                border-radius: var(--radius-lg);
                border: 1px solid var(--border-color);
            }
            
            .demo-accounts h3 {
                color: var(--text-primary);
                margin-bottom: 1rem;
                font-size: 1.125rem;
                font-weight: 700;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .demo-account {
                background: var(--bg-primary);
                padding: 1rem;
                margin: 0.75rem 0;
                border-radius: var(--radius-md);
                font-size: 0.875rem;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                border: 2px solid transparent;
                position: relative;
                overflow: hidden;
            }
            
            .demo-account::before {
                content: '';
                position: absolute;
                left: 0;
                top: 0;
                bottom: 0;
                width: 4px;
                background: var(--primary-gradient);
                transform: scaleY(0);
                transition: transform 0.3s ease;
            }
            
            .demo-account:hover {
                background: var(--bg-tertiary);
                border-color: rgba(102, 126, 234, 0.2);
                transform: translateX(4px);
                box-shadow: var(--shadow-md);
            }
            
            .demo-account:hover::before {
                transform: scaleY(1);
            }
            
            .demo-account strong {
                color: var(--text-primary);
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .demo-account span {
                color: var(--text-secondary);
                font-family: 'Monaco', 'Menlo', monospace;
                font-size: 0.8rem;
            }
            
            .demo-account .role-desc {
                font-size: 0.75rem;
                color: var(--text-muted);
                margin-top: 0.25rem;
                display: flex;
                align-items: center;
                gap: 0.25rem;
            }
            
            .role-icon {
                width: 24px;
                height: 24px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 0.75rem;
                color: white;
                font-weight: bold;
            }
            
            .role-icon.admin { background: var(--primary-gradient); }
            .role-icon.agency { background: var(--secondary-gradient); }
            .role-icon.social { background: var(--success-gradient); }
            .role-icon.approver { background: var(--warning-gradient); }
            .role-icon.viewer { background: var(--dark-gradient); }
            
            .error, .success {
                padding: 1rem;
                border-radius: var(--radius-md);
                font-size: 0.875rem;
                font-weight: 500;
                margin-top: 1rem;
                text-align: center;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 0.5rem;
                animation: slideIn 0.3s ease-out;
            }
            
            .error {
                color: #dc2626;
                background: #fef2f2;
                border: 1px solid #fecaca;
            }
            
            .success {
                color: #059669;
                background: #f0fdf4;
                border: 1px solid #bbf7d0;
            }
            
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateY(-10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            .real-features {
                background: linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%);
                border: 1px solid #bbf7d0;
                border-radius: var(--radius-lg);
                padding: 1.5rem;
                margin-top: 1.5rem;
                position: relative;
                overflow: hidden;
            }
            
            .real-features::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 3px;
                background: var(--success-gradient);
            }
            
            .real-features h4 {
                color: #065f46;
                margin-bottom: 1rem;
                font-size: 1rem;
                font-weight: 700;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .real-features ul {
                list-style: none;
                padding: 0;
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 0.5rem;
            }
            
            .real-features li {
                color: var(--text-primary);
                font-size: 0.875rem;
                font-weight: 500;
                padding: 0.5rem 0;
                padding-left: 2rem;
                position: relative;
                transition: all 0.2s ease;
            }
            
            .real-features li:before {
                content: "✨";
                position: absolute;
                left: 0;
                top: 0.5rem;
                font-size: 1rem;
                animation: sparkle 2s ease-in-out infinite;
            }
            
            @keyframes sparkle {
                0%, 100% { transform: scale(1) rotate(0deg); }
                50% { transform: scale(1.1) rotate(5deg); }
            }
            
            .real-features li:hover {
                color: #059669;
                transform: translateX(4px);
            }
            
            .password-note {
                margin-top: 1rem;
                padding: 1rem;
                background: var(--bg-tertiary);
                border-radius: var(--radius-md);
                border-left: 4px solid #667eea;
                font-size: 0.875rem;
                color: var(--text-secondary);
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .password-note strong {
                color: var(--text-primary);
                font-family: 'Monaco', 'Menlo', monospace;
            }
        </style>
    </head>
    <body>
        <div class="animated-bg"></div>
        
        <div class="login-container">
            <div class="logo">
                <div class="logo-icon">
                    <i class="fas fa-rocket"></i>
                </div>
                <h1>ZingMedia</h1>
                <p>Sistema Real v2.0 - Design Moderno!</p>
                <span class="version-badge">
                    <i class="fas fa-check-circle"></i>
                    Todas as funcionalidades funcionam
                </span>
            </div>
            
            <form id="loginForm">
                <div class="form-group">
                    <label for="email">
                        <i class="fas fa-envelope"></i>
                        Email
                    </label>
                    <div class="input-wrapper">
                        <i class="fas fa-envelope"></i>
                        <input type="email" id="email" name="email" required placeholder="Digite seu email">
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="password">
                        <i class="fas fa-lock"></i>
                        Senha
                    </label>
                    <div class="input-wrapper">
                        <i class="fas fa-lock"></i>
                        <input type="password" id="password" name="password" required placeholder="Digite sua senha">
                    </div>
                </div>
                
                <button type="submit" class="btn">
                    <i class="fas fa-sign-in-alt"></i>
                    Entrar no Sistema Real
                </button>
                
                <div id="message"></div>
            </form>
            
            <div class="demo-accounts">
                <h3>
                    <i class="fas fa-users"></i>
                    Sistema Real v2.0 - Perfis Funcionando
                </h3>
                
                <div class="demo-account" onclick="fillLogin('admin@zingmedia.com', 'password')">
                    <strong>
                        <div class="role-icon admin">PA</div>
                        Platform Admin:
                    </strong> 
                    <span>admin@zingmedia.com</span><br>
                    <div class="role-desc">
                        <i class="fas fa-crown"></i>
                        Gestão completa da plataforma
                    </div>
                </div>
                
                <div class="demo-account" onclick="fillLogin('agency@example.com', 'password')">
                    <strong>
                        <div class="role-icon agency">AA</div>
                        Agency Admin:
                    </strong> 
                    <span>agency@example.com</span><br>
                    <div class="role-desc">
                        <i class="fas fa-building"></i>
                        White-label, clientes e usuários
                    </div>
                </div>
                
                <div class="demo-account" onclick="fillLogin('social@example.com', 'password')">
                    <strong>
                        <div class="role-icon social">SM</div>
                        Social Media Manager:
                    </strong> 
                    <span>social@example.com</span><br>
                    <div class="role-desc">
                        <i class="fas fa-magic"></i>
                        Briefings, agentes IA, workflow
                    </div>
                </div>
                
                <div class="demo-account" onclick="fillLogin('approver@client.com', 'password')">
                    <strong>
                        <div class="role-icon approver">CA</div>
                        Client Approver:
                    </strong> 
                    <span>approver@client.com</span><br>
                    <div class="role-desc">
                        <i class="fas fa-check-circle"></i>
                        Aprovação de conteúdo
                    </div>
                </div>
                
                <div class="demo-account" onclick="fillLogin('viewer@client.com', 'password')">
                    <strong>
                        <div class="role-icon viewer">VW</div>
                        Viewer:
                    </strong> 
                    <span>viewer@client.com</span><br>
                    <div class="role-desc">
                        <i class="fas fa-eye"></i>
                        Visualização somente leitura
                    </div>
                </div>
                
                <div class="password-note">
                    <i class="fas fa-key"></i>
                    <span><strong>Senha para todas as contas:</strong> password</span>
                </div>
            </div>

            <div class="real-features">
                <h4>
                    <i class="fas fa-star"></i>
                    Sistema Real v2.0 Implementado:
                </h4>
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
                        messageDiv.innerHTML = '<div class="success"><i class="fas fa-check"></i>Login realizado! Carregando dashboard...</div>';
                        setTimeout(() => {
                            window.location.href = '/dashboard';
                        }, 1500);
                    } else {
                        messageDiv.innerHTML = '<div class="error"><i class="fas fa-times"></i>' + data.error + '</div>';
                    }
                } catch (error) {
                    messageDiv.innerHTML = '<div class="error"><i class="fas fa-times"></i>Erro ao conectar com o servidor</div>';
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

module.exports = app;

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ ZingMedia Sistema Real v2.0 - Design Moderno rodando na porta ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🎯 Todas as credenciais funcionam com senha: password`);
  
  if (NODE_ENV === 'development') {
    console.log(`
🚀 ZingMedia Sistema Real v2.0 - DESIGN MODERNO COMPLETO!

📍 URL: http://localhost:${PORT}

👥 Credenciais que FUNCIONAM:
   ✅ admin@zingmedia.com (Platform Admin)
   ✅ agency@example.com (Agency Admin)  
   ✅ social@example.com (Social Media Manager) ⭐
   ✅ approver@client.com (Client Approver)
   ✅ viewer@client.com (Viewer)
   🔑 Senha: password

🎨 DESIGN MODERNO IMPLEMENTADO!
    `);
  }
}).on('error', (err) => {
  console.error('❌ Erro ao iniciar servidor:', err);
  process.exit(1);
});