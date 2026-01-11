#!/usr/bin/env node

const http = require('http');

const testEndpoints = [
  '/health',
  '/api/v1/health', 
  '/ping',
  '/_health'
];

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

console.log(`🔍 Testando endpoints de saúde em ${HOST}:${PORT}`);

function testEndpoint(path) {
  return new Promise((resolve) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: path,
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          path,
          status: res.statusCode,
          success: res.statusCode === 200,
          response: data
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        path,
        status: 'ERROR',
        success: false,
        error: err.message
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        path,
        status: 'TIMEOUT',
        success: false,
        error: 'Request timeout'
      });
    });

    req.end();
  });
}

async function runTests() {
  console.log('\n📋 Resultados dos testes:\n');
  
  for (const endpoint of testEndpoints) {
    const result = await testEndpoint(endpoint);
    
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${endpoint} - Status: ${result.status}`);
    
    if (result.error) {
      console.log(`   Erro: ${result.error}`);
    } else if (result.response && result.response.length < 200) {
      console.log(`   Resposta: ${result.response.substring(0, 100)}`);
    }
  }
  
  console.log('\n🏁 Teste concluído!');
}

runTests().catch(console.error);