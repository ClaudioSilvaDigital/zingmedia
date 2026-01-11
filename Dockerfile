# Dockerfile para ZingMedia
FROM node:18-alpine

# Instalar dependências do sistema
RUN apk add --no-cache python3 make g++

# Criar diretório da aplicação
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production

# Copiar código da aplicação
COPY . .

# Compilar TypeScript (se necessário)
RUN npm run build 2>/dev/null || echo "Build step skipped"

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Mudar ownership dos arquivos
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expor porta
EXPOSE 3000

# Comando para iniciar a aplicação
CMD ["node", "server-full.js"]