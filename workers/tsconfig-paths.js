const tsConfigPaths = require('tsconfig-paths');
const path = require('path');

// Determina se estamos em produção olhando para a estrutura do caminho
const isProduction = __dirname.includes('/dist');

// Em produção, os caminhos são relativos à pasta dist
const baseUrl = __dirname;
const paths = {
  '@shared/*': [path.join(__dirname, isProduction ? './src/*' : '../src/*')]
};

tsConfigPaths.register({
  baseUrl,
  paths
});
