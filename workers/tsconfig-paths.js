const tsConfigPaths = require('tsconfig-paths');
const path = require('path');

// Determina se estamos em produção
const isProduction = process.env.NODE_ENV === 'production';

// Em produção, os caminhos são relativos à pasta atual
const baseUrl = __dirname;
const paths = {
  '@shared/*': [path.join(baseUrl, './src/*')]
};

tsConfigPaths.register({
  baseUrl,
  paths
});
