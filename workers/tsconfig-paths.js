const tsConfigPaths = require('tsconfig-paths');
const path = require('path');

// Em produção, os caminhos são relativos à pasta dist
const baseUrl = __dirname;
const paths = {
  '@shared/*': [path.join(__dirname, '../src/*')]
};

tsConfigPaths.register({
  baseUrl,
  paths
});
