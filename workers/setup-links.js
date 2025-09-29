const fs = require('fs');
const path = require('path');

// Verifica se estamos em produção
const isProduction = process.env.NODE_ENV === 'production';

// Cria links simbólicos para os arquivos necessários em produção
if (isProduction) {
  try {
    const projectRoot = '/opt/render/project/src';
    const projectSrc = path.join(projectRoot, 'src');
    const currentDir = __dirname;
    
    // Cria a estrutura de diretórios se não existir
    ['types'].forEach(dir => {
      const dirPath = path.join(currentDir, 'src', dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    });

    // Copia os arquivos de tipos necessários
    const typesFiles = ['pipeline.ts'];
    typesFiles.forEach(file => {
      const sourcePath = path.join(projectSrc, 'types', file);
      const targetPath = path.join(currentDir, 'src', 'types', file);
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, targetPath);
      }
    });
  } catch (error) {
    console.error('Error setting up production environment:', error);
    process.exit(1);
  }
}
