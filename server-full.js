const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Simulação de banco de dados em memória
const users = [
  {
    id: '1',
    email: 'admin@contentplatform.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
    name: 'Administrador',
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
    name: 'Platform',
    type: 'platform',
    brandConfig: {
      primaryColor: '#667eea',
      secondaryColor: '#764ba2',
      companyName: 'Content Platform',
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

// Rota principal - página de login
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Content Automation Platform - Login</title>
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
                <h1>🚀 Content Platform</h1>
                <p>Automação Inteligente de Conteúdo</p>
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
                <div class="demo-account" onclick="fillLogin('admin@contentplatform.com', 'password')">
                    <strong>Administrador:</strong> <span>admin@contentplatform.com</span><br>
                    <small>Acesso completo à plataforma</small>
                </div>
                <div class="demo-account" onclick="fillLogin('agency@example.com', 'password')">
                    <strong>Agência:</strong> <span>agency@example.com</span><br>
                    <small>Gerenciar clientes e conteúdo</small>
                </div>
                <div class="demo-account" onclick="fillLogin('user@example.com', 'password')">
                    <strong>Usuário:</strong> <span>user@example.com</span><br>
                    <small>Criar e gerenciar conteúdo</small>
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

// Dashboard protegido
app.get('/dashboard', (req, res) => {
  // Esta página será carregada e o JavaScript verificará o token
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dashboard - Content Platform</title>
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
                    <h1 id="companyName">🚀 Content Platform</h1>
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
                <h2>Bem-vindo ao Dashboard!</h2>
                <p>Gerencie seu conteúdo e automatize suas publicações em redes sociais.</p>
            </div>
            
            <div class="stats">
                <div class="stat-card">
                    <div class="stat-number">24</div>
                    <div class="stat-label">Conteúdos Criados</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">12</div>
                    <div class="stat-label">Publicações Agendadas</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">4</div>
                    <div class="stat-label">Plataformas Conectadas</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">89%</div>
                    <div class="stat-label">Taxa de Engajamento</div>
                </div>
            </div>
            
            <div class="features">
                <div class="feature-card">
                    <div class="feature-icon">📝</div>
                    <h3>Criar Conteúdo</h3>
                    <p>Use IA para gerar conteúdo otimizado para suas redes sociais</p>
                    <button class="feature-btn" onclick="showFeature('content')">Criar Agora</button>
                </div>
                
                <div class="feature-card">
                    <div class="feature-icon">📅</div>
                    <h3>Calendário Editorial</h3>
                    <p>Planeje e agende suas publicações com inteligência</p>
                    <button class="feature-btn" onclick="showFeature('calendar')">Ver Calendário</button>
                </div>
                
                <div class="feature-card">
                    <div class="feature-icon">📊</div>
                    <h3>Analytics</h3>
                    <p>Acompanhe o desempenho e otimize sua estratégia</p>
                    <button class="feature-btn" onclick="showFeature('analytics')">Ver Relatórios</button>
                </div>
                
                <div class="feature-card">
                    <div class="feature-icon">🎯</div>
                    <h3>Campanhas</h3>
                    <p>Gerencie campanhas multi-plataforma de forma integrada</p>
                    <button class="feature-btn" onclick="showFeature('campaigns')">Gerenciar</button>
                </div>
                
                <div class="feature-card">
                    <div class="feature-icon">🤖</div>
                    <h3>IA Assistente</h3>
                    <p>Configure provedores de IA e otimize a geração de conteúdo</p>
                    <button class="feature-btn" onclick="showFeature('ai')">Configurar</button>
                </div>
                
                <div class="feature-card">
                    <div class="feature-icon">⚙️</div>
                    <h3>Configurações</h3>
                    <p>Personalize sua experiência e conecte suas redes sociais</p>
                    <button class="feature-btn" onclick="showFeature('settings')">Configurar</button>
                </div>
            </div>
        </div>

        <script>
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
                    
                    // Atualizar interface com dados do usuário
                    document.getElementById('userName').textContent = 'Olá, ' + data.user.name + '!';
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
            
            function logout() {
                localStorage.removeItem('token');
                window.location.href = '/';
            }
            
            function showFeature(feature) {
                alert('Funcionalidade "' + feature + '" será implementada em breve!\\n\\nEsta é uma versão de demonstração da plataforma.');
            }
            
            // Carregar dashboard quando a página carregar
            window.addEventListener('load', loadDashboard);
        </script>
    </body>
    </html>
  `);
});

// Middleware para verificar token em rotas protegidas
app.use('/dashboard', (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || 
                req.query.token || 
                req.body.token;
  
  if (!token) {
    return res.redirect('/');
  }
  
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.redirect('/');
    }
    req.user = decoded;
    next();
  });
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

app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      authentication: 'ok',
      database: 'simulated',
      ai_providers: 'ready'
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  if (NODE_ENV === 'development') {
    console.log(`
🚀 Content Automation Platform (Versão Completa) está rodando!

📍 URL: http://localhost:${PORT}
🌐 Para acessar de outros dispositivos: http://${getLocalIP()}:${PORT}

👤 Contas de demonstração:
   📧 admin@contentplatform.com (Administrador)
   📧 agency@example.com (Agência)  
   📧 user@example.com (Usuário)
   🔑 Senha: password

✨ Abra seu navegador e faça login para acessar o dashboard!
    `);
  } else {
    console.log(`🚀 Content Automation Platform rodando na porta ${PORT}`);
  }
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