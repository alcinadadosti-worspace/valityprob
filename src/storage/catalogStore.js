// Catálogo de produtos (estoque.csv) — SEMPRE em CSV, independente de usar Postgres.
// Colunas: Produto (SKU) ; Descrição (nome). Separador ';'. ~90k linhas.
// Código compartilhado por csvStore e postgresStore (antes era duplicado nos dois).
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const DATA_DIR = path.join(__dirname, '../../data');
const CATALOG_FILE = path.join(DATA_DIR, 'estoque.csv');

const ensureDir = () => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
};

const ensureCatalogFile = () => {
  ensureDir();
  if (!fs.existsSync(CATALOG_FILE)) fs.writeFileSync(CATALOG_FILE, 'Produto;Descrição\n');
};

const readCsv = (filePath, delimiter = ';') => {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  return parse(fileContent, { columns: true, skip_empty_lines: true, trim: true, delimiter });
};

// Detecta o fim-de-linha do arquivo (LF em produção/Linux, CRLF no Windows). O append
// PRECISA usar o mesmo EOL: misturar LF e CRLF faz o csv-parse "grudar" as linhas novas
// numa só e corromper o cache do catálogo no próximo restart.
const detectEol = () => {
  const fd = fs.openSync(CATALOG_FILE, 'r');
  try {
    const buf = Buffer.alloc(65536);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    return buf.slice(0, n).includes('\r\n') ? '\r\n' : '\n';
  } finally {
    fs.closeSync(fd);
  }
};

// Último byte do arquivo é uma quebra de linha? (evita colar o append na última linha)
const fileEndsWithNewline = () => {
  const { size } = fs.statSync(CATALOG_FILE);
  if (size === 0) return true;
  const fd = fs.openSync(CATALOG_FILE, 'r');
  try {
    const buf = Buffer.alloc(1);
    fs.readSync(fd, buf, 0, 1, size - 1);
    return buf[0] === 0x0a; // '\n'
  } finally {
    fs.closeSync(fd);
  }
};

// CACHE em memória para busca O(1) (o arquivo tem ~90k linhas).
let catalogCache = null;
let catalogDescKey = null;

const loadCatalogCache = () => {
  if (catalogCache) return;

  ensureCatalogFile();
  const products = readCsv(CATALOG_FILE, ';');
  catalogCache = new Map();

  if (products.length > 0) {
    catalogDescKey = Object.keys(products[0]).find(k => k.includes('Descri')) || 'Descrição';
    for (const p of products) {
      const sku = String(p.Produto ?? '').trim();
      if (sku && !catalogCache.has(sku)) catalogCache.set(sku, p[catalogDescKey] || '');
    }
  }

  console.log(`📦 Catálogo carregado: ${catalogCache.size} produtos únicos`);
};

const getProductFromCatalog = (sku) => {
  loadCatalogCache();
  const key = String(sku ?? '').trim();
  if (catalogCache.has(key)) return { sku: key, nome: catalogCache.get(key) };
  return null;
};

const addProductToCatalog = ({ sku, nome }) => {
  loadCatalogCache();
  const key = String(sku ?? '').trim();
  if (!key) return false;

  const isNew = !catalogCache.has(key);
  catalogCache.set(key, nome);
  ensureCatalogFile();
  const descKey = catalogDescKey || 'Descrição';

  if (isNew) {
    // Caminho quente (cadastro/importação): só ACRESCENTA uma linha. Antes reescrevia o
    // arquivo inteiro de ~7MB a cada SKU novo — lento e causava HTTP 500 sob concorrência
    // (o writeFileSync falhava ao abrir o arquivo já em uso). O append é O(1) e atômico.
    const eol = detectEol();
    const line = stringify([{ Produto: key, [descKey]: nome }], {
      header: false, columns: ['Produto', descKey], delimiter: ';', record_delimiter: eol
    });
    const prefix = fileEndsWithNewline() ? '' : eol;
    fs.appendFileSync(CATALOG_FILE, prefix + line);
  } else {
    // SKU já existe (ex.: edição de nome): reescreve para refletir o novo nome. Caminho raro.
    const eol = detectEol();
    const products = readCsv(CATALOG_FILE, ';').filter(p => String(p.Produto ?? '').trim() !== key);
    products.push({ Produto: key, [descKey]: nome });
    fs.writeFileSync(CATALOG_FILE, stringify(products, {
      header: true, columns: ['Produto', descKey], delimiter: ';', record_delimiter: eol
    }));
  }
  return true;
};

const listCatalog = () => {
  loadCatalogCache();
  const result = [];
  for (const [sku, nome] of catalogCache) result.push({ sku, nome });
  return result;
};

module.exports = { getProductFromCatalog, addProductToCatalog, listCatalog };
