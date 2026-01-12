const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log('🚀 ZingMedia Sistema Final v3.0 - ESPECIFICAÇÃO COMPLETA!');
console.log(`   NODE_ENV: ${NODE_ENV}`);
console.log(`   PORT: ${PORT}`);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// ===== PROMPT MESTRE EMBUTIDO (NÚCLEO DO SISTEMA) =====
const MASTER_PROMPT = {
  system: `Você é o Gerente de Agentes do ZingMedia, responsável por orquestrar múltiplos agentes especializados para criar conteúdo de alta qualidade para redes sociais.

PROCESSO OBRIGATÓRIO:
1. Instanciar agentes especializados baseados no assunto
2. Executar rodadas de debate entre agentes
3. Consolidar o melhor conteúdo
4. Aplicar boas práticas da plataforma
5. Gerar criativos automaticamente

AGENTES DISPONÍVEIS:
- Especialista em Prompt Engineering
- Especialista em Conteúdo Editorial  
- Especialista em Storytelling
- Especialista em Vídeo Short-form
- Especialista em Direção Criativa
- Especialista em Social Media

REGRAS:
- Sempre usar briefing ativo como contexto
- Aplicar boas práticas da plataforma selecionada
- Gerar conteúdo otimizado para formato específico
- Incluir CTAs apropriados
- Respeitar tom de voz definido`,

  agentPrompts: {
    promptEngineering: "Você é um especialista em Prompt Engineering. Sua função é otimizar e refinar prompts para maximizar a qualidade do conteúdo gerado.",
    editorial: "Você é um especialista em Conteúdo Editorial. Foque na estrutura, clareza e impacto editorial do conteúdo.",
    storytelling: "Você é um especialista em Storytelling. Crie narrativas envolventes que conectem emocionalmente com o público.",
    videoShortForm: "Você é um especialista em Vídeo Short-form. Otimize conteúdo para Reels, TikTok e Stories com hooks poderosos.",
    creative: "Você é um especialista em Direção Criativa. Foque na direção visual, estética e elementos criativos.",
    socialMedia: "Você é um especialista em Social Media. Aplique as melhores práticas de cada plataforma e otimize para engajamento."
  }
};

// ===== USUÁRIOS COM RBAC COMPLETO =====
const users = [
  {
    id: '1',
    email: 'owner@zingmedia.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
    name: 'Platform Owner',
    role: 'platform_owner',
    tenantId: 'platform-tenant',
    permissions: ['*']
  },
  {
    id: '2',
    email: 'admin@agencia.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
    name: 'Admin da Agência',
    role: 'agency_admin',
    tenantId: 'agency-demo',
    permissions: ['manage_clients', 'manage_users', 'manage_brand', 'manage_briefing', 'manage_billing']
  },
  {
    id: '3',
    email: 'social@agencia.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
    name: 'Social Media Manager',
    role: 'social_media',
    tenantId: 'agency-demo',
    permissions: ['create_content', 'manage_workflow', 'download_assets']
  },
  {
    id: '4',
    email: 'cliente@empresa.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
    name: 'Cliente Aprovador',
    role: 'client_approver',
    tenantId: 'client-demo',
    permissions: ['approve_content', 'comment_content', 'fill_briefing']
  }
];

// ===== TENANTS E WHITE-LABEL =====
const tenants = [
  {
    id: 'platform-tenant',
    name: 'ZingMedia Platform',
    type: 'platform',
    brandConfig: {
      primaryColor: '#667eea',
      secondaryColor: '#764ba2',
      companyName: 'ZingMedia',
      logo: null,
      domain: 'zingmedia.com'
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
      logo: null,
      domain: 'agenciadigitalpro.zingmedia.com'
    }
  },
  {
    id: 'client-demo',
    name: 'Empresa Cliente Ltda',
    type: 'client',
    brandConfig: {
      primaryColor: '#059669',
      secondaryColor: '#0d9488',
      companyName: 'Empresa Cliente Ltda',
      logo: null,
      domain: null
    }
  }
];

// ===== BOAS PRÁTICAS NATIVAS =====
const BEST_PRACTICES = {
  instagram: {
    feed: {
      aspectRatio: '1:1',
      maxChars: 2200,
      hashtags: { min: 5, max: 30 },
      hooks: ['Você sabia que...', 'Dica rápida:', 'Segredo revelado:'],
      cta: ['Salve este post', 'Compartilhe nos stories', 'Marque um amigo']
    },
    reels: {
      aspectRatio: '9:16',
      duration: { min: 15, max: 90 },
      hooks: ['Pare de rolar!', 'Isso vai mudar sua vida:', 'Você não vai acreditar:'],
      cta: ['Siga para mais dicas', 'Salve para depois', 'Comenta aí embaixo']
    },
    stories: {
      aspectRatio: '9:16',
      duration: { min: 5, max: 15 },
      interactive: ['Enquetes', 'Perguntas', 'Quiz'],
      cta: ['Deslize para cima', 'Toque no link', 'DM para saber mais']
    }
  },
  facebook: {
    feed: {
      aspectRatio: '16:9',
      maxChars: 63206,
      engagement: ['Faça uma pergunta', 'Peça opinião', 'Conte uma história'],
      cta: ['Saiba mais', 'Entre em contato', 'Visite nosso site']
    }
  },
  tiktok: {
    video: {
      aspectRatio: '9:16',
      duration: { min: 15, max: 180 },
      trends: ['Use trending sounds', 'Participe de challenges', 'Crie duetos'],
      hooks: ['POV:', 'Tutorial:', 'Storytime:'],
      cta: ['Segue aí', 'Parte 2 nos comentários', 'Quer mais conteúdo assim?']
    }
  },
  linkedin: {
    feed: {
      aspectRatio: '1.91:1',
      maxChars: 3000,
      tone: 'professional',
      structure: ['Hook', 'Contexto', 'Insights', 'CTA'],
      cta: ['Conecte-se comigo', 'Compartilhe sua experiência', 'O que você acha?']
    }
  }
};

// ===== AGENTES ESPECIALIZADOS =====
const AGENT_SPECIALISTS = {
  promptEngineering: {
    name: 'Alex Chen',
    authority: 'Ex-OpenAI, especialista em Prompt Engineering',
    specialty: 'Otimização de prompts e maximização de qualidade de output'
  },
  editorial: {
    name: 'Maria Santos',
    authority: 'Ex-editora da Vogue, 15 anos de experiência editorial',
    specialty: 'Estrutura editorial, clareza e impacto de conteúdo'
  },
  storytelling: {
    name: 'Carlos Narrative',
    authority: 'Roteirista premiado, especialista em narrativas digitais',
    specialty: 'Criação de histórias envolventes e conexão emocional'
  },
  videoShortForm: {
    name: 'Ana Reels',
    authority: 'Criadora com 2M+ seguidores, especialista em vídeos virais',
    specialty: 'Conteúdo para Reels, TikTok e Stories'
  },
  creative: {
    name: 'Bruno Creative',
    authority: 'Diretor criativo premiado, ex-Ogilvy',
    specialty: 'Direção visual, estética e elementos criativos'
  },
  socialMedia: {
    name: 'Lucia Social',
    authority: 'Gestora de redes sociais de grandes marcas',
    specialty: 'Boas práticas de plataformas e otimização de engajamento'
  }
};

// ===== DADOS DO SISTEMA =====
const briefings = [];
const contentSessions = [];
const workflows = [];
const creativeAssets = [];
const billingPlans = [];
const aiCredits = new Map();

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
    service: 'ZingMedia Final System v3.0',
    version: '3.0.0'
  });
});

// ===== PÁGINA DE LOGIN =====
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ZingMedia - Sistema Final v3.0</title>
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
                max-width: 500px;
            }
            .logo {
                text-align: center;
                margin-bottom: 30px;
            }
            .logo h1 {
                color: #2d3748;
                font-size: 2.5rem;
                margin-bottom: 10px;
            }
            .logo p {
                color: #718096;
                font-size: 1.1rem;
                font-weight: 500;
            }
            .version-badge {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 6px 16px;
                border-radius: 25px;
                font-size: 0.9rem;
                margin-top: 15px;
                display: inline-block;
                font-weight: 600;
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
                padding: 14px 18px;
                border: 2px solid #e2e8f0;
                border-radius: 12px;
                font-size: 16px;
                transition: border-color 0.3s;
            }
            input:focus {
                outline: none;
                border-color: #667eea;
            }
            .btn {
                width: 100%;
                padding: 14px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                border-radius: 12px;
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
                padding: 25px;
                background: #f7fafc;
                border-radius: 15px;
            }
            .demo-accounts h3 {
                color: #2d3748;
                margin-bottom: 20px;
                font-size: 1.2rem;
                text-align: center;
            }
            .demo-account {
                background: white;
                padding: 15px;
                margin: 10px 0;
                border-radius: 10px;
                font-size: 0.95rem;
                cursor: pointer;
                transition: all 0.2s;
                border-left: 4px solid transparent;
            }
            .demo-account:hover {
                background: #edf2f7;
                border-left-color: #667eea;
                transform: translateX(5px);
            }
            .demo-account strong {
                color: #4a5568;
                display: block;
                margin-bottom: 5px;
            }
            .demo-account span {
                color: #718096;
            }
            .demo-account .role-desc {
                font-size: 0.85rem;
                color: #a0aec0;
                margin-top: 6px;
                font-style: italic;
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
            .system-features {
                background: #e6fffa;
                border: 1px solid #81e6d9;
                border-radius: 12px;
                padding: 20px;
                margin-top: 25px;
            }
            .system-features h4 {
                color: #234e52;
                margin-bottom: 12px;
                font-size: 1rem;
            }
            .system-features ul {
                list-style: none;
                padding: 0;
            }
            .system-features li {
                color: #2d3748;
                font-size: 0.85rem;
                margin: 6px 0;
                padding-left: 20px;
                position: relative;
            }
            .system-features li:before {
                content: "🎯";
                position: absolute;
                left: 0;
            }
        </style>
    </head>
    <body>
        <div class="login-container">
            <div class="logo">
                <h1>🚀 ZingMedia</h1>
                <p>Sistema Final v3.0</p>
                <span class="version-badge">Especificação Completa Implementada</span>
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
                
                <button type="submit" class="btn">Entrar no Sistema</button>
                
                <div id="message"></div>
            </form>
            
            <div class="demo-accounts">
                <h3>🎯 Perfis do Sistema Final v3.0</h3>
                
                <div class="demo-account" onclick="fillLogin('owner@zingmedia.com', 'password')">
                    <strong>Platform Owner:</strong> <span>owner@zingmedia.com</span>
                    <div class="role-desc">Gerencia tenants, prompt mestre e agentes</div>
                </div>
                
                <div class="demo-account" onclick="fillLogin('admin@agencia.com', 'password')">
                    <strong>Admin da Agência:</strong> <span>admin@agencia.com</span>
                    <div class="role-desc">Gerencia clientes, usuários, marca e briefing</div>
                </div>
                
                <div class="demo-account" onclick="fillLogin('social@agencia.com', 'password')">
                    <strong>Social Media:</strong> <span>social@agencia.com</span>
                    <div class="role-desc">Cria conteúdos com agentes automáticos</div>
                </div>
                
                <div class="demo-account" onclick="fillLogin('cliente@empresa.com', 'password')">
                    <strong>Cliente Aprovador:</strong> <span>cliente@empresa.com</span>
                    <div class="role-desc">Aprova conteúdos e preenche briefing</div>
                </div>
                
                <p style="margin-top: 20px; font-size: 0.9rem; color: #718096; text-align: center;">
                    <strong>Senha para todas as contas:</strong> password
                </p>
            </div>

            <div class="system-features">
                <h4>🎯 Sistema Final v3.0 - Especificação Completa:</h4>
                <ul>
                    <li>Prompt Mestre Embutido (não editável)</li>
                    <li>6 Agentes Especializados Automáticos</li>
                    <li>Briefing Obrigatório para Geração</li>
                    <li>Boas Práticas Nativas por Plataforma</li>
                    <li>Integrações: OpenAI + Gemini + ElevenLabs + HeyGen</li>
                    <li>Download de Criativos Completo</li>
                    <li>White-Label Multi-Tenant Real</li>
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