// ===== REAL SYSTEM DATABASE SIMULATION =====
// Users with proper RBAC roles (5 distinct profiles)
const users = [
  {
    id: '1',
    email: 'admin@zingmedia.com',
    password: '$2a$10$6fJDhRnEp5LuqAcXfarbgukaMty5hBmNUb3ZufT/UHLROQCTvMit.', // password
    name: 'Platform Administrator',
    role: 'platform_admin',
    tenantId: 'platform-tenant',
    permissions: ['*'] // All permissions
  },
  {
    id: '2',
    email: 'agency@example.com',
    password: '$2a$10$6fJDhRnEp5LuqAcXfarbgukaMty5hBmNUb3ZufT/UHLROQCTvMit.', // password
    name: 'Agência Digital Pro',
    role: 'agency_admin',
    tenantId: 'agency-demo',
    permissions: ['manage_clients', 'manage_users', 'configure_branding', 'view_analytics', 'manage_billing']
  },
  {
    id: '3',
    email: 'social@example.com',
    password: '$2a$10$6fJDhRnEp5LuqAcXfarbgukaMty5hBmNUb3ZufT/UHLROQCTvMit.', // password
    name: 'Social Media Manager',
    role: 'social_media_manager',
    tenantId: 'agency-demo',
    permissions: ['create_briefing', 'generate_content', 'manage_workflow', 'publish_content', 'download_assets']
  },
  {
    id: '4',
    email: 'approver@client.com',
    password: '$2a$10$6fJDhRnEp5LuqAcXfarbgukaMty5hBmNUb3ZufT/UHLROQCTvMit.', // password
    name: 'Client Approver',
    role: 'client_approver',
    tenantId: 'client-demo',
    permissions: ['approve_content', 'request_adjustments', 'view_content']
  },
  {
    id: '5',
    email: 'viewer@client.com',
    password: '$2a$10$6fJDhRnEp5LuqAcXfarbgukaMty5hBmNUb3ZufT/UHLROQCTvMit.', // password
    name: 'Content Viewer',
    role: 'viewer',
    tenantId: 'client-demo',
    permissions: ['view_content', 'view_calendar']
  }
];