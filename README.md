# 🚀 ZingMedia

**Plataforma SaaS de Automação Inteligente de Conteúdo Multi-Plataforma**

ZingMedia é uma plataforma AI-first, multi-tenant que automatiza completamente a criação, aprovação e publicação de conteúdo em redes sociais (Instagram, TikTok, Facebook, LinkedIn), com intervenção humana apenas para aprovação e ajustes.

## ✨ Funcionalidades

- **🏢 Arquitetura Multi-Tenant**: Isolamento completo de dados (Plataforma > Agência > Cliente)
- **🎨 White-Label**: Personalização completa da marca por agência
- **🤖 Hub de IA**: Interface unificada para múltiplos provedores de IA
- **📋 Gestão de Workflow**: Fluxo editorial com 9 estados e processos de aprovação
- **📱 Publicação Multi-Plataforma**: Instagram, TikTok, Facebook, LinkedIn
- **📊 Analytics Avançado**: Métricas e recomendações automáticas
- **🔒 Segurança & Compliance**: LGPD, criptografia, auditoria completa
- **💰 Sistema de Billing**: Créditos, assinaturas, Nota Fiscal brasileira

## 🚀 Demonstração Online

**Contas de teste:**
- **Admin:** admin@contentplatform.com / password
- **Agência:** agency@example.com / password  
- **Usuário:** user@example.com / password
- **Multi-Platform Publishing**: Automated publishing to Instagram, TikTok, Facebook, LinkedIn
- **Role-Based Access Control**: Granular permissions system
- **Analytics & Performance Tracking**: Comprehensive metrics and optimization

## Technology Stack

- **Backend**: Node.js with TypeScript, Express.js
- **Database**: PostgreSQL with multi-tenant schema isolation
- **Cache/Queue**: Redis for job queuing and caching
- **Authentication**: JWT with OAuth2 integration
- **Testing**: Vitest with property-based testing (fast-check)

## Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- Redis 6+

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. Initialize the database:
   ```bash
   # Create database and run initialization script
   psql -U postgres -c "CREATE DATABASE content_automation_platform;"
   psql -U postgres -d content_automation_platform -f src/database/init.sql
   ```

5. Start Redis server:
   ```bash
   redis-server
   ```

## Development

```bash
# Start development server
npm run dev

# Run tests
npm test

# Run property-based tests
npm run test:pbt

# Build for production
npm run build

# Start production server
npm start
```

## Project Structure

```
src/
├── config/          # Database and Redis configuration
├── middleware/      # Express middleware (auth, tenant context)
├── services/        # Business logic services
├── types/           # TypeScript type definitions
├── tests/           # Test files including property-based tests
├── database/        # Database initialization scripts
└── index.ts         # Application entry point
```

## API Endpoints

- `GET /health` - Health check
- `GET /api/v1/status` - API status
- `GET /api/v1/protected/profile` - User profile (requires authentication)

## Multi-Tenant Architecture

The platform implements a Bridge Model with:
- **Shared Database**: Single PostgreSQL instance
- **Schema-per-Tenant**: Each agency gets its own schema
- **Row-Level Security**: Client isolation within agency schemas

## Testing

The project includes comprehensive testing with:
- **Unit Tests**: Specific functionality testing
- **Property-Based Tests**: Universal correctness properties using fast-check
- **Integration Tests**: End-to-end workflow testing

Property tests validate critical system properties like:
- Hierarchical tenant data isolation
- Permission enforcement
- Workflow state transitions
- Content adaptation consistency

## Security

- JWT-based authentication with refresh tokens
- RBAC with granular permissions
- Data encryption at rest and in transit
- Comprehensive audit logging
- LGPD compliance features

## License

MIT License