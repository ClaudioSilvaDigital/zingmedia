// Funções do Dashboard ZingMedia

// Configuração de IA
function showAIConfig() {
    const content = `
        <div class="config-section">
            <h3>🤖 Configuração de Provedores de IA</h3>
            <p>Configure suas chaves de API para gerar conteúdo automaticamente:</p>
        </div>
        
        <div class="form-group">
            <label><strong>OpenAI (GPT-4):</strong></label>
            <input type="password" id="openai-key" placeholder="sk-..." style="width: 100%; padding: 8px; margin-top: 5px;">
            <small>Obtenha em: platform.openai.com</small>
        </div>
        
        <div class="form-group">
            <label><strong>Claude (Anthropic):</strong></label>
            <input type="password" id="claude-key" placeholder="sk-ant-..." style="width: 100%; padding: 8px; margin-top: 5px;">
            <small>Obtenha em: console.anthropic.com</small>
        </div>
        
        <div class="form-group">
            <label><strong>Gemini (Google):</strong></label>
            <input type="password" id="gemini-key" placeholder="AIza..." style="width: 100%; padding: 8px; margin-top: 5px;">
            <small>Obtenha em: makersuite.google.com</small>
        </div>
        
        <div style="margin-top: 20px;">
            <button class="btn-primary" onclick="saveAIConfig()">Salvar Configurações</button>
            <button class="btn-primary" onclick="loadAIConfig()">Carregar Existentes</button>
        </div>
        
        <div id="ai-status" style="margin-top: 20px;"></div>
    `;
    
    showModal('Configurar IA', content);
    loadAIConfig();
}

async function saveAIConfig() {
    const openaiKey = document.getElementById('openai-key').value;
    const claudeKey = document.getElementById('claude-key').value;
    const geminiKey = document.getElementById('gemini-key').value;
    
    const token = localStorage.getItem('token');
    
    try {
        const promises = [];
        
        if (openaiKey) {
            promises.push(fetch('/api/v1/ai/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ provider: 'openai', apiKey: openaiKey, model: 'gpt-4' })
            }));
        }
        
        if (claudeKey) {
            promises.push(fetch('/api/v1/ai/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ provider: 'claude', apiKey: claudeKey, model: 'claude-3-sonnet' })
            }));
        }
        
        if (geminiKey) {
            promises.push(fetch('/api/v1/ai/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ provider: 'gemini', apiKey: geminiKey, model: 'gemini-pro' })
            }));
        }
        
        await Promise.all(promises);
        
        alert('✅ Configurações de IA salvas com sucesso!');
        loadAIConfig();
        loadStats(); // Atualizar estatísticas
    } catch (error) {
        alert('❌ Erro ao salvar configurações: ' + error.message);
    }
}

async function loadAIConfig() {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch('/api/v1/ai/config', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        const config = await response.json();
        
        // Mostrar status das configurações
        const statusDiv = document.getElementById('ai-status');
        if (statusDiv) {
            let statusHtml = '<h4>Status das Configurações:</h4>';
            
            Object.entries(config).forEach(([provider, settings]) => {
                const status = settings.status === 'connected' ? 'connected' : 'disconnected';
                const statusText = status === 'connected' ? 'Conectado' : 'Desconectado';
                
                statusHtml += `
                    <div class="config-item">
                        <span><span class="status-indicator status-${status}"></span>${provider.toUpperCase()}</span>
                        <span>${statusText}</span>
                    </div>
                `;
            });
            
            statusDiv.innerHTML = statusHtml;
        }
        
    } catch (error) {
        console.error('Erro ao carregar configurações de IA:', error);
    }
}

// Configuração de Redes Sociais
function showSocialConfig() {
    const content = `
        <div class="config-section">
            <h3>📱 Credenciais das Redes Sociais</h3>
            <p>Configure os tokens de acesso para publicar automaticamente:</p>
        </div>
        
        <div class="form-group">
            <label><strong>Instagram Access Token:</strong></label>
            <input type="password" id="instagram-token" placeholder="IGQVJ..." style="width: 100%; padding: 8px; margin-top: 5px;">
            <small>Obtenha em: developers.facebook.com</small>
        </div>
        
        <div class="form-group">
            <label><strong>Facebook Access Token:</strong></label>
            <input type="password" id="facebook-token" placeholder="EAAG..." style="width: 100%; padding: 8px; margin-top: 5px;">
            <small>Obtenha em: developers.facebook.com</small>
        </div>
        
        <div class="form-group">
            <label><strong>LinkedIn Access Token:</strong></label>
            <input type="password" id="linkedin-token" placeholder="AQV..." style="width: 100%; padding: 8px; margin-top: 5px;">
            <small>Obtenha em: developer.linkedin.com</small>
        </div>
        
        <div class="form-group">
            <label><strong>TikTok Access Token:</strong></label>
            <input type="password" id="tiktok-token" placeholder="act..." style="width: 100%; padding: 8px; margin-top: 5px;">
            <small>Obtenha em: developers.tiktok.com</small>
        </div>
        
        <div style="margin-top: 20px;">
            <button class="btn-primary" onclick="saveSocialConfig()">Salvar Credenciais</button>
            <button class="btn-primary" onclick="loadSocialConfig()">Carregar Existentes</button>
        </div>
        
        <div id="social-status" style="margin-top: 20px;"></div>
    `;
    
    showModal('Configurar Redes Sociais', content);
    loadSocialConfig();
}

async function saveSocialConfig() {
    const instagramToken = document.getElementById('instagram-token').value;
    const facebookToken = document.getElementById('facebook-token').value;
    const linkedinToken = document.getElementById('linkedin-token').value;
    const tiktokToken = document.getElementById('tiktok-token').value;
    
    const token = localStorage.getItem('token');
    
    try {
        const promises = [];
        
        if (instagramToken) {
            promises.push(fetch('/api/v1/social/credentials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ platform: 'instagram', accessToken: instagramToken })
            }));
        }
        
        if (facebookToken) {
            promises.push(fetch('/api/v1/social/credentials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ platform: 'facebook', accessToken: facebookToken })
            }));
        }
        
        if (linkedinToken) {
            promises.push(fetch('/api/v1/social/credentials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ platform: 'linkedin', accessToken: linkedinToken })
            }));
        }
        
        if (tiktokToken) {
            promises.push(fetch('/api/v1/social/credentials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ platform: 'tiktok', accessToken: tiktokToken })
            }));
        }
        
        await Promise.all(promises);
        
        alert('✅ Credenciais das redes sociais salvas com sucesso!');
        loadSocialConfig();
        loadStats(); // Atualizar estatísticas
    } catch (error) {
        alert('❌ Erro ao salvar credenciais: ' + error.message);
    }
}

async function loadSocialConfig() {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch('/api/v1/social/credentials', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        const credentials = await response.json();
        
        // Mostrar status das configurações
        const statusDiv = document.getElementById('social-status');
        if (statusDiv) {
            let statusHtml = '<h4>Status das Conexões:</h4>';
            
            Object.entries(credentials).forEach(([platform, settings]) => {
                const status = settings.status === 'connected' ? 'connected' : 'disconnected';
                const statusText = status === 'connected' ? 'Conectado' : 'Desconectado';
                
                statusHtml += `
                    <div class="config-item">
                        <span><span class="status-indicator status-${status}"></span>${platform.toUpperCase()}</span>
                        <span>${statusText}</span>
                    </div>
                `;
            });
            
            statusDiv.innerHTML = statusHtml;
        }
        
    } catch (error) {
        console.error('Erro ao carregar configurações sociais:', error);
    }
}

// Criador de Conteúdo
let generatedContentData = null;

function showContentCreator() {
    const content = `
        <div class="config-section">
            <h3>✨ Gerador de Conteúdo com IA</h3>
            <p>Crie conteúdo otimizado para suas redes sociais usando inteligência artificial.</p>
        </div>
        
        <div class="form-group">
            <label><strong>Prompt para IA:</strong></label>
            <textarea id="content-prompt" placeholder="Ex: Crie um post sobre os benefícios do marketing digital para pequenas empresas..." style="width: 100%; height: 80px; padding: 8px; margin-top: 5px;"></textarea>
        </div>
        
        <div class="form-group">
            <label><strong>Plataforma:</strong></label>
            <select id="content-platform" style="width: 100%; padding: 8px; margin-top: 5px;">
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="linkedin">LinkedIn</option>
                <option value="tiktok">TikTok</option>
            </select>
        </div>
        
        <div class="form-group">
            <label><strong>Tipo de Conteúdo:</strong></label>
            <select id="content-type" style="width: 100%; padding: 8px; margin-top: 5px;">
                <option value="post">Post Regular</option>
                <option value="story">Story</option>
                <option value="reel">Reel/Vídeo Curto</option>
                <option value="carousel">Carrossel</option>
            </select>
        </div>
        
        <div style="margin-top: 20px;">
            <button class="btn-success" onclick="generateContent()">🤖 Gerar com IA</button>
            <button class="btn-danger" onclick="publishContent()" id="publish-btn" disabled>📱 Publicar Agora</button>
        </div>
        
        <div id="generated-content" style="margin-top: 20px;"></div>
    `;
    
    showModal('Criar Conteúdo', content);
}

async function generateContent() {
    const prompt = document.getElementById('content-prompt').value;
    const platform = document.getElementById('content-platform').value;
    const contentType = document.getElementById('content-type').value;
    
    if (!prompt) {
        alert('Por favor, digite um prompt para gerar o conteúdo!');
        return;
    }
    
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch('/api/v1/content/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ prompt, platform, contentType })
        });
        
        const result = await response.json();
        
        if (result.success) {
            generatedContentData = result.content;
            document.getElementById('generated-content').innerHTML = `
                <div class="content-preview">
                    <h4>✨ Conteúdo Gerado:</h4>
                    <div style="white-space: pre-wrap; margin: 10px 0; padding: 15px; background: white; border-radius: 8px;">${result.content.text}</div>
                    <p><strong>Hashtags:</strong> ${result.content.hashtags.join(' ')}</p>
                    <p><strong>Plataforma:</strong> ${platform.toUpperCase()}</p>
                    <p><strong>Tipo:</strong> ${contentType}</p>
                    <p><strong>Sugestão de horário:</strong> ${new Date(result.content.suggestedTime).toLocaleString()}</p>
                </div>
            `;
            
            // Habilitar botão de publicar
            document.getElementById('publish-btn').disabled = false;
        } else {
            alert('❌ Erro ao gerar conteúdo: ' + result.error);
        }
    } catch (error) {
        alert('❌ Erro ao gerar conteúdo: ' + error.message);
    }
}

async function publishContent() {
    if (!generatedContentData) {
        alert('Primeiro gere um conteúdo com IA!');
        return;
    }
    
    const platform = document.getElementById('content-platform').value;
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch('/api/v1/content/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ 
                content: generatedContentData, 
                platforms: [platform],
                scheduledTime: null 
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            const publishResult = result.results[0];
            if (publishResult.status === 'success') {
                alert(`✅ Conteúdo publicado com sucesso no ${platform.toUpperCase()}!

Post ID: ${publishResult.postId}
URL: ${publishResult.url}`);
                
                // Limpar formulário
                generatedContentData = null;
                document.getElementById('content-prompt').value = '';
                document.getElementById('generated-content').innerHTML = '';
                document.getElementById('publish-btn').disabled = true;
                
                // Atualizar estatísticas
                loadStats();
            } else {
                alert(`❌ Erro na publicação: ${publishResult.error}`);
            }
        } else {
            alert('❌ Erro ao publicar: ' + result.error);
        }
    } catch (error) {
        alert('❌ Erro ao publicar: ' + error.message);
    }
}

// Posts Publicados
function showPublishedPosts() {
    const content = `
        <div class="config-section">
            <h3>📊 Histórico de Publicações</h3>
            <button class="btn-primary" onclick="loadPublishedPosts()">🔄 Atualizar</button>
        </div>
        
        <div id="posts-list">
            <p>Carregando posts...</p>
        </div>
    `;
    
    showModal('Posts Publicados', content);
    loadPublishedPosts();
}

async function loadPublishedPosts() {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch('/api/v1/content/posts', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        const posts = await response.json();
        
        const postsListDiv = document.getElementById('posts-list');
        
        if (posts.length === 0) {
            postsListDiv.innerHTML = '<p>Nenhum post publicado ainda.</p>';
            return;
        }
        
        const postsHtml = posts.map(post => `
            <div class="post-item">
                <div class="post-header">
                    <span class="platform-badge">${post.platform.toUpperCase()}</span>
                    <span style="color: #666; font-size: 0.9em;">${new Date(post.publishedAt).toLocaleString()}</span>
                </div>
                <div style="margin: 10px 0;">${post.content.substring(0, 200)}${post.content.length > 200 ? '...' : ''}</div>
                <div style="display: flex; gap: 15px; font-size: 0.9em; color: #666;">
                    <span>👍 ${post.engagement?.likes || 0} likes</span>
                    <span>💬 ${post.engagement?.comments || 0} comentários</span>
                    <span>🔄 ${post.engagement?.shares || 0} compartilhamentos</span>
                </div>
                <div style="color: #667eea; font-size: 0.8em; margin-top: 5px;">ID: ${post.id}</div>
            </div>
        `).join('');
        
        postsListDiv.innerHTML = postsHtml;
    } catch (error) {
        document.getElementById('posts-list').innerHTML = '<p>❌ Erro ao carregar posts: ' + error.message + '</p>';
    }
}

// Analytics
function showAnalytics() {
    const content = `
        <div class="config-section">
            <h3>📊 Analytics e Relatórios</h3>
            <button class="btn-primary" onclick="loadAnalytics()">🔄 Atualizar Dados</button>
        </div>
        
        <div id="analytics-content">
            <p>Carregando analytics...</p>
        </div>
    `;
    
    showModal('Analytics', content);
    loadAnalytics();
}

async function loadAnalytics() {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch('/api/v1/analytics', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        const analytics = await response.json();
        
        const analyticsDiv = document.getElementById('analytics-content');
        
        let analyticsHtml = `
            <div class="config-section">
                <h4>📈 Visão Geral</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <div class="stat-card" style="text-align: center;">
                        <div style="font-size: 1.5rem; font-weight: bold; color: #667eea;">${analytics.overview.totalPosts}</div>
                        <div style="font-size: 0.8rem; color: #666;">Total de Posts</div>
                    </div>
                    <div class="stat-card" style="text-align: center;">
                        <div style="font-size: 1.5rem; font-weight: bold; color: #667eea;">${analytics.overview.totalLikes}</div>
                        <div style="font-size: 0.8rem; color: #666;">Total de Likes</div>
                    </div>
                    <div class="stat-card" style="text-align: center;">
                        <div style="font-size: 1.5rem; font-weight: bold; color: #667eea;">${analytics.overview.totalComments}</div>
                        <div style="font-size: 0.8rem; color: #666;">Total de Comentários</div>
                    </div>
                    <div class="stat-card" style="text-align: center;">
                        <div style="font-size: 1.5rem; font-weight: bold; color: #667eea;">${Math.round(analytics.overview.avgEngagement)}</div>
                        <div style="font-size: 0.8rem; color: #666;">Engajamento Médio</div>
                    </div>
                </div>
            </div>
        `;
        
        // Por plataforma
        if (Object.keys(analytics.byPlatform).length > 0) {
            analyticsHtml += `
                <div class="config-section">
                    <h4>📱 Por Plataforma</h4>
            `;
            
            Object.entries(analytics.byPlatform).forEach(([platform, data]) => {
                analyticsHtml += `
                    <div class="config-item">
                        <span><strong>${platform.toUpperCase()}</strong></span>
                        <span>${data.posts} posts | ${data.likes} likes | ${data.comments} comentários</span>
                    </div>
                `;
            });
            
            analyticsHtml += '</div>';
        }
        
        // Top posts
        if (analytics.topPosts.length > 0) {
            analyticsHtml += `
                <div class="config-section">
                    <h4>🏆 Top Posts</h4>
            `;
            
            analytics.topPosts.forEach((post, index) => {
                const totalEngagement = (post.engagement?.likes || 0) + (post.engagement?.comments || 0) + (post.engagement?.shares || 0);
                analyticsHtml += `
                    <div class="post-item">
                        <div class="post-header">
                            <span>#${index + 1} - <span class="platform-badge">${post.platform.toUpperCase()}</span></span>
                            <span>${totalEngagement} engajamentos</span>
                        </div>
                        <div>${post.content.substring(0, 100)}...</div>
                    </div>
                `;
            });
            
            analyticsHtml += '</div>';
        }
        
        analyticsDiv.innerHTML = analyticsHtml;
        
    } catch (error) {
        document.getElementById('analytics-content').innerHTML = '<p>❌ Erro ao carregar analytics: ' + error.message + '</p>';
    }
}

// Campanhas
function showCampaigns() {
    const content = `
        <div class="config-section">
            <h3>🎯 Gestão de Campanhas</h3>
            <button class="btn-primary" onclick="showCreateCampaign()">➕ Nova Campanha</button>
            <button class="btn-primary" onclick="loadCampaigns()">🔄 Atualizar</button>
        </div>
        
        <div id="campaigns-list">
            <p>Carregando campanhas...</p>
        </div>
    `;
    
    showModal('Campanhas', content);
    loadCampaigns();
}

function showCreateCampaign() {
    const content = `
        <div class="config-section">
            <h3>➕ Nova Campanha</h3>
        </div>
        
        <div class="form-group">
            <label><strong>Nome da Campanha:</strong></label>
            <input type="text" id="campaign-name" placeholder="Ex: Lançamento Produto X" style="width: 100%; padding: 8px;">
        </div>
        
        <div class="form-group">
            <label><strong>Descrição:</strong></label>
            <textarea id="campaign-description" placeholder="Descreva os objetivos da campanha..." style="width: 100%; height: 60px; padding: 8px;"></textarea>
        </div>
        
        <div class="form-group">
            <label><strong>Plataformas:</strong></label>
            <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 5px;">
                <label><input type="checkbox" value="instagram"> Instagram</label>
                <label><input type="checkbox" value="facebook"> Facebook</label>
                <label><input type="checkbox" value="linkedin"> LinkedIn</label>
                <label><input type="checkbox" value="tiktok"> TikTok</label>
            </div>
        </div>
        
        <div style="display: flex; gap: 15px;">
            <div class="form-group" style="flex: 1;">
                <label><strong>Data de Início:</strong></label>
                <input type="date" id="campaign-start" style="width: 100%; padding: 8px;">
            </div>
            <div class="form-group" style="flex: 1;">
                <label><strong>Data de Fim:</strong></label>
                <input type="date" id="campaign-end" style="width: 100%; padding: 8px;">
            </div>
        </div>
        
        <div style="margin-top: 20px;">
            <button class="btn-success" onclick="createCampaign()">Criar Campanha</button>
            <button class="btn-primary" onclick="showCampaigns()">Voltar</button>
        </div>
    `;
    
    showModal('Nova Campanha', content);
}

async function createCampaign() {
    const name = document.getElementById('campaign-name').value;
    const description = document.getElementById('campaign-description').value;
    const startDate = document.getElementById('campaign-start').value;
    const endDate = document.getElementById('campaign-end').value;
    
    const platformCheckboxes = document.querySelectorAll('input[type="checkbox"]:checked');
    const platforms = Array.from(platformCheckboxes).map(cb => cb.value);
    
    if (!name || !description || platforms.length === 0) {
        alert('Preencha todos os campos obrigatórios!');
        return;
    }
    
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch('/api/v1/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ name, description, platforms, startDate, endDate })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('✅ Campanha criada com sucesso!');
            showCampaigns();
            loadStats();
        } else {
            alert('❌ Erro ao criar campanha: ' + result.error);
        }
    } catch (error) {
        alert('❌ Erro ao criar campanha: ' + error.message);
    }
}

async function loadCampaigns() {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch('/api/v1/campaigns', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        const campaigns = await response.json();
        
        const campaignsDiv = document.getElementById('campaigns-list');
        
        if (campaigns.length === 0) {
            campaignsDiv.innerHTML = '<p>Nenhuma campanha criada ainda.</p>';
            return;
        }
        
        const campaignsHtml = campaigns.map(campaign => `
            <div class="post-item">
                <div class="post-header">
                    <strong>${campaign.name}</strong>
                    <span class="platform-badge">${campaign.status.toUpperCase()}</span>
                </div>
                <div style="margin: 10px 0;">${campaign.description}</div>
                <div style="font-size: 0.9em; color: #666;">
                    <strong>Plataformas:</strong> ${campaign.platforms.join(', ')}
                </div>
                <div style="font-size: 0.9em; color: #666;">
                    <strong>Período:</strong> ${new Date(campaign.startDate).toLocaleDateString()} - ${new Date(campaign.endDate).toLocaleDateString()}
                </div>
                <div style="margin-top: 10px; font-size: 0.9em;">
                    📊 ${campaign.metrics.totalPosts} posts | 👥 ${campaign.metrics.totalReach} alcance | 💬 ${campaign.metrics.totalEngagement} engajamento
                </div>
            </div>
        `).join('');
        
        campaignsDiv.innerHTML = campaignsHtml;
        
    } catch (error) {
        document.getElementById('campaigns-list').innerHTML = '<p>❌ Erro ao carregar campanhas: ' + error.message + '</p>';
    }
}

// Calendário
function showCalendar() {
    const content = `
        <div class="config-section">
            <h3>📅 Calendário Editorial</h3>
            <p>Visualize e gerencie suas publicações programadas.</p>
        </div>
        
        <div id="calendar-content">
            <p>Carregando calendário...</p>
        </div>
    `;
    
    showModal('Calendário Editorial', content);
    loadCalendar();
}

async function loadCalendar() {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch('/api/v1/calendar', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        const events = await response.json();
        
        const calendarDiv = document.getElementById('calendar-content');
        
        if (events.length === 0) {
            calendarDiv.innerHTML = '<p>Nenhum evento no calendário.</p>';
            return;
        }
        
        // Agrupar eventos por data
        const eventsByDate = {};
        events.forEach(event => {
            const date = new Date(event.date).toDateString();
            if (!eventsByDate[date]) {
                eventsByDate[date] = [];
            }
            eventsByDate[date].push(event);
        });
        
        let calendarHtml = '';
        Object.entries(eventsByDate).forEach(([date, dayEvents]) => {
            calendarHtml += `
                <div class="config-section">
                    <h4>📅 ${new Date(date).toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h4>
            `;
            
            dayEvents.forEach(event => {
                calendarHtml += `
                    <div class="config-item">
                        <span>
                            <span class="platform-badge">${event.platform.toUpperCase()}</span>
                            ${event.title}
                        </span>
                        <span>${new Date(event.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                `;
            });
            
            calendarHtml += '</div>';
        });
        
        calendarDiv.innerHTML = calendarHtml;
        
    } catch (error) {
        document.getElementById('calendar-content').innerHTML = '<p>❌ Erro ao carregar calendário: ' + error.message + '</p>';
    }
}

// Configurações Gerais
function showSettings() {
    const content = `
        <div class="config-section">
            <h3>⚙️ Configurações Gerais</h3>
            <p>Personalize sua experiência na plataforma.</p>
        </div>
        
        <div class="config-section">
            <h4>👤 Informações do Usuário</h4>
            <div class="config-item">
                <span><strong>Nome:</strong></span>
                <span>${currentUser?.name || 'N/A'}</span>
            </div>
            <div class="config-item">
                <span><strong>Email:</strong></span>
                <span>${currentUser?.email || 'N/A'}</span>
            </div>
            <div class="config-item">
                <span><strong>Função:</strong></span>
                <span>${currentUser?.role || 'N/A'}</span>
            </div>
        </div>
        
        <div class="config-section">
            <h4>🏢 Informações da Empresa</h4>
            <div class="config-item">
                <span><strong>Nome:</strong></span>
                <span>${currentTenant?.brandConfig?.companyName || 'N/A'}</span>
            </div>
            <div class="config-item">
                <span><strong>Tipo:</strong></span>
                <span>${currentTenant?.type || 'N/A'}</span>
            </div>
            <div class="config-item">
                <span><strong>Cor Primária:</strong></span>
                <span style="display: flex; align-items: center; gap: 10px;">
                    ${currentTenant?.brandConfig?.primaryColor || 'N/A'}
                    <div style="width: 20px; height: 20px; background: ${currentTenant?.brandConfig?.primaryColor}; border-radius: 4px;"></div>
                </span>
            </div>
        </div>
        
        <div class="config-section">
            <h4>🔧 Ações</h4>
            <button class="btn-primary" onclick="showAIConfig()">Configurar IA</button>
            <button class="btn-primary" onclick="showSocialConfig()">Configurar Redes Sociais</button>
            <button class="btn-danger" onclick="logout()">Sair da Conta</button>
        </div>
    `;
    
    showModal('Configurações', content);
}