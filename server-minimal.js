const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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
      ai_providers: 'ready'
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
                max-width: 400px;
            }
            .logo { text-align: center; margin-bottom: 30px; }
            .logo h1 { color: #2d3748; font-size: 2rem; margin-bottom: 10px; }
            .logo p { color: #718096; font-size: 0.9rem; }
            .form-group { margin-bottom: 20px; }
            label { display: block; margin-bottom: 8px; color: #2d3748; font-weight: 500; }
            input {
                width: 100%; padding: 12px 16px; border: 2px solid #e2e8f0;
                border-radius: 10px; font-size: 16px; transition: border-color 0.3s;
            }
            input:focus { outline: none; border-color: #667eea; }
            .btn {
                width: 100%; padding: 12px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white; border: none; border-radius: 10px;
                font-size: 16px; font-weight: 600; cursor: pointer;
                transition: transform 0.2s;
            }
            .btn:hover { transform: translateY(-2px); }
            .demo-accounts {
                margin-top: 30px; padding: 20px;
                background: #f7fafc; border-radius: 10px;
            }
            .demo-accounts h3 { color: #2d3748; margin-bottom: 15px; font-size: 1.1rem; }
            .demo-account {
                background: white; padding: 10px; margin: 8px 0;
                border-radius: 8px; font-size: 0.9rem; cursor: pointer;
                transition: background-color 0.2s;
            }
            .demo-account:hover { background: #edf2f7; }
            .error { color: #e53e3e; font-size: 0.9rem; margin-top: 10px; text-align: center; }
            .success { color: #38a169; font-size: 0.9rem; margin-top: 10px; text-align: center; }
        </style>
    </head>
    <body>
        <div class="login-container">
            <div class="logo">
                <h1>🚀 ZingMedia</h1>
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
                <div class="demo-account" onclick="fillLogin('admin@zingmedia.com', 'password')">
                    <strong>Administrador:</strong> admin@zingmedia.com<br>
                    <small>Acesso completo à plataforma</small>
                </div>
                <div class="demo-account" onclick="fillLogin('agency@example.com', 'password')">
                    <strong>Agência:</strong> agency@example.com<br>
                    <small>Gerenciar clientes e conteúdo</small>
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
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, password }),
                    });
                    
                    const data = await response.json();
                    
                    if (response.ok) {
                        localStorage.setItem('token', data.token);
                        messageDiv.innerHTML = '<div class="success">Login realizado com sucesso! Redirecionando...</div>';
                        setTimeout(() => { window.location.href = '/dashboard'; }, 1500);
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

// Dashboard básico
app.get('/dashboard', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dashboard - ZingMedia</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                background: #f7fafc;
                min-height: 100vh;
            }
            .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 20px 0;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .header-content {
                max-width: 1200px;
                margin: 0 auto;
                padding: 0 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 30px 20px;
            }
            .welcome {
                background: white;
                border-radius: 15px;
                padding: 30px;
                margin-bottom: 30px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.05);
            }
            .status {
                background: #e6fffa;
                border: 1px solid #38d9a9;
                border-radius: 10px;
                padding: 20px;
                margin: 20px 0;
            }
            .logout-btn {
                background: rgba(255,255,255,0.2);
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="header-content">
                <h1>🚀 ZingMedia</h1>
                <button class="logout-btn" onclick="logout()">Sair</button>
            </div>
        </div>
        
        <div class="container">
            <div class="welcome">
                <h2>✅ ZingMedia está funcionando!</h2>
                <p>Plataforma de automação de conteúdo operacional.</p>
                
                <div class="status">
                    <h3>🎯 Status do Sistema</h3>
                    <p>✅ Autenticação: Funcionando</p>
                    <p>✅ Dashboard: Carregado</p>
                    <p>✅ API: Disponível</p>
                    <p>✅ Health Check: OK</p>
                </div>
                
                <p><strong>Próximos passos:</strong></p>
                <ul>
                    <li>Configurar tokens de IA (OpenAI, Claude, Gemini)</li>
                    <li>Conectar credenciais das redes sociais</li>
                    <li>Testar geração e publicação de conteúdo</li>
                </ul>
            </div>
        </div>

        <script>
            function logout() {
                localStorage.removeItem('token');
                window.location.href = '/';
            }
        </script>
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
🚀 ZingMedia está rodando!

📍 URL: http://localhost:${PORT}
🌐 Para acessar de outros dispositivos: http://${getLocalIP()}:${PORT}

👤 Contas de demonstração:
   📧 admin@zingmedia.com (Administrador)
   📧 agency@example.com (Agência)  
   🔑 Senha: password

✨ Abra seu navegador e faça login para acessar o dashboard!
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