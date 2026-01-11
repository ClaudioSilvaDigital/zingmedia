#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 Preparando projeto para deploy...\n');

// Verificar se os arquivos necessários existem
const requiredFiles = [
  'server-full.js',
  'package.json',
  'Dockerfile',
  'vercel.json',
  'railway.json',
  'render.yaml',
  'Procfile'
];

console.log('✅ Verificando arquivos necessários:');
requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`   ✓ ${file}`);
  } else {
    console.log(`   ✗ ${file} - FALTANDO!`);
  }
});

// Verificar package.json
console.log('\n📦 Verificando package.json:');
try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  
  if (pkg.scripts && pkg.scripts.start) {
    console.log('   ✓ Script "start" configurado');
  } else {
    console.log('   ✗ Script "start" não encontrado');
  }
  
  if (pkg.dependencies && pkg.dependencies.express) {
    console.log('   ✓ Express instalado');
  } else {
    console.log('   ✗ Express não encontrado');
  }
  
  if (pkg.dependencies && pkg.dependencies['serverless-http']) {
    console.log('   ✓ Serverless-http instalado');
  } else {
    console.log('   ⚠ Serverless-http não encontrado (necessário para Netlify/Vercel)');
  }
} catch (error) {
  console.log('   ✗ Erro ao ler package.json');
}

// Verificar server-full.js
console.log('\n🖥️ Verificando server-full.js:');
try {
  const serverContent = fs.readFileSync('server-full.js', 'utf8');
  
  if (serverContent.includes('module.exports = app')) {
    console.log('   ✓ App exportado para serverless');
  } else {
    console.log('   ⚠ App não exportado (pode causar problemas em serverless)');
  }
  
  if (serverContent.includes('process.env.PORT')) {
    console.log('   ✓ Porta configurada via environment');
  } else {
    console.log('   ✗ Porta não configurada via environment');
  }
} catch (error) {
  console.log('   ✗ Erro ao ler server-full.js');
}

// Criar .gitignore se não existir
if (!fs.existsSync('.gitignore')) {
  console.log('\n📝 Criando .gitignore...');
  const gitignoreContent = `node_modules/
.env
.env.local
.env.production
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.DS_Store
dist/
coverage/
.nyc_output/
*.log`;
  
  fs.writeFileSync('.gitignore', gitignoreContent);
  console.log('   ✓ .gitignore criado');
}

console.log('\n🎯 Próximos passos:');
console.log('1. Faça commit de todos os arquivos:');
console.log('   git add .');
console.log('   git commit -m "Preparar para deploy"');
console.log('');
console.log('2. Faça push para seu repositório:');
console.log('   git push origin main');
console.log('');
console.log('3. Escolha uma plataforma de deploy:');
console.log('   • Railway (recomendado): https://railway.app');
console.log('   • Render: https://render.com');
console.log('   • Vercel: https://vercel.com');
console.log('   • Netlify: https://netlify.com');
console.log('');
console.log('4. Leia o arquivo DEPLOY.md para instruções detalhadas');
console.log('');
console.log('🎉 Projeto pronto para deploy!');