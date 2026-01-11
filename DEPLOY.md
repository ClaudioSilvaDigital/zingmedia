# 🚀 Guia de Deploy - Content Automation Platform

Este guia contém instruções detalhadas para fazer deploy da plataforma em diferentes serviços de hospedagem.

## 📋 Pré-requisitos

- Conta no serviço de hospedagem escolhido
- Git instalado
- Código da aplicação pronto

## 🎯 Opções de Hospedagem

### 1. 🟢 **Railway** (Recomendado - Mais Fácil)

**Vantagens:**
- Deploy automático via Git
- Domínio gratuito incluído
- Configuração zero
- Suporte nativo ao Node.js

**Passos:**
1. Acesse [railway.app](https://railway.app)
2. Faça login com GitHub
3. Clique em "New Project"
4. Selecione "Deploy from GitHub repo"
5. Escolha seu repositório
6. Railway detectará automaticamente o Node.js
7. Deploy será feito automaticamente!

**URL final:** `https://seu-projeto.up.railway.app`

---

### 2. 🔵 **Render** (Gratuito com Limitações)

**Vantagens:**
- Plano gratuito disponível
- SSL automático
- Deploy via Git

**Limitações do plano gratuito:**
- Aplicação "dorme" após 15 min de inatividade
- 750 horas/mês

**Passos:**
1. Acesse [render.com](https://render.com)
2. Conecte sua conta GitHub
3. Clique em "New +" → "Web Service"
4. Conecte seu repositório
5. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `node server-full.js`
6. Clique em "Create Web Service"

**URL final:** `https://seu-app.onrender.com`

---

### 3. 🟣 **Vercel** (Serverless)

**Vantagens:**
- Deploy extremamente rápido
- CDN global
- Domínio personalizado gratuito

**Passos:**
1. Instale Vercel CLI: `npm i -g vercel`
2. No terminal, na pasta do projeto: `vercel`
3. Siga as instruções no terminal
4. Deploy automático!

**URL final:** `https://seu-projeto.vercel.app`

---

### 4. 🟠 **Netlify** (Com Functions)

**Vantagens:**
- Integração com Git
- Deploy automático
- Domínio personalizado

**Passos:**
1. Acesse [netlify.com](https://netlify.com)
2. Conecte com GitHub
3. Selecione seu repositório
4. Configure:
   - **Build command:** `npm install`
   - **Publish directory:** `public`
5. Deploy automático!

---

### 5. 🔴 **Heroku** (Pago)

**Nota:** Heroku não tem mais plano gratuito, mas é muito confiável.

**Passos:**
1. Instale Heroku CLI
2. `heroku login`
3. `heroku create seu-app-name`
4. `git push heroku main`

---

## 🔧 Configurações Importantes

### Variáveis de Ambiente

Configure estas variáveis no seu serviço de hospedagem:

```bash
NODE_ENV=production
PORT=3000
JWT_SECRET=seu-jwt-secret-super-seguro-aqui
```

### Domínio Personalizado

Após o deploy, você pode configurar um domínio personalizado:
- **Railway:** Vá em Settings → Domains
- **Render:** Vá em Settings → Custom Domains  
- **Vercel:** Vá em Settings → Domains
- **Netlify:** Vá em Domain Settings

## 🎨 Contas de Demonstração

Após o deploy, use estas contas para testar:

- **Admin:** admin@contentplatform.com / password
- **Agência:** agency@example.com / password  
- **Usuário:** user@example.com / password

## 🔍 Verificação do Deploy

Após o deploy, teste:
1. Acesse a URL da aplicação
2. Teste o login com as contas demo
3. Verifique se o dashboard carrega
4. Teste a API: `https://sua-url/api/v1/health`

## 🆘 Solução de Problemas

### Erro de Build
- Verifique se todas as dependências estão no `package.json`
- Confirme se o comando de start está correto

### Erro 500
- Verifique os logs da aplicação
- Confirme se as variáveis de ambiente estão configuradas

### Aplicação não carrega
- Verifique se a porta está configurada corretamente
- Confirme se o health check está funcionando

## 📞 Suporte

Se encontrar problemas:
1. Verifique os logs da aplicação
2. Confirme as configurações de ambiente
3. Teste localmente primeiro com `npm start`

---

**🎉 Parabéns! Sua plataforma está online!**