# Content Automation Platform

A comprehensive AI-powered multi-tenant SaaS platform for automating content creation, approval workflows, and multi-platform publishing.

## Features

- **Multi-Tenant Architecture**: Hierarchical tenancy with complete data isolation (Platform > Agency > Client)
- **White-Label Customization**: Complete brand customization per agency
- **AI Integration Hub**: Unified interface for multiple AI providers
- **Workflow Management**: 9-state editorial workflow with approval processes
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