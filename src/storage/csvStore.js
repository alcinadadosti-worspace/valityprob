const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const DATA_DIR = path.join(__dirname, '../../data');
const FILE_PATH = path.join(DATA_DIR, 'products.csv');

// Garante que o arquivo existe
const ensureFile = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(FILE_PATH)) {
    const columns = ['SKU', 'NOME', 'VALIDADE', 'MANAGER_ID'];
    fs.writeFileSync(FILE_PATH, columns.join(',') + '\n');
  }
};

const listProducts = () => {
  ensureFile();
  const fileContent = fs.readFileSync(FILE_PATH, 'utf-8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
  return records;
};

const addProduct = ({ sku, nome, validade, managerId }) => {
  ensureFile();
  const currentProducts = listProducts();
  
  // Adiciona novo produto
  currentProducts.push({
    SKU: sku,
    NOME: nome,
    VALIDADE: validade,
    MANAGER_ID: managerId
  });

  const output = stringify(currentProducts, {
    header: true,
    columns: ['SKU', 'NOME', 'VALIDADE', 'MANAGER_ID']
  });

  fs.writeFileSync(FILE_PATH, output);
  return true;
};

module.exports = {
  listProducts,
  addProduct
};