// Reconstrói os itens que sumiram das lojas por causa do bug de colisão de SKU
// (a PK antiga era só (sku), então a loja que cadastrasse por último "roubava" o item).
//
// Compara os backups do painel admin (xlsx, uma aba por loja) com o estado ATUAL e
// gera, para cada loja, uma planilha pronta para reimportar em /cadastro.
//
// Estado atual: usa DATABASE_URL se estiver definida (mais preciso); senão usa o
// backup mais recente encontrado.
//
// Uso:
//   node scripts/recuperar-itens-perdidos.js
//   DATABASE_URL="postgres://..." node scripts/recuperar-itens-perdidos.js
//   BACKUPS_DIR="C:/caminho/dos/backups" node scripts/recuperar-itens-perdidos.js
//
// IMPORTANTE: só reimporte DEPOIS que a correção da chave (sku, unidade) estiver em
// produção. Antes disso, reimportar colide de novo e rouba os itens das lojas atuais.
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { getAllUnits } = require('../src/config/unitsHelper');

const BACKUPS_DIR = process.env.BACKUPS_DIR || path.join(require('os').homedir(), 'Downloads');
const OUT_DIR = path.join(__dirname, '..', 'recuperacao');
const HOJE = new Date().toISOString().slice(0, 10);

const units = getAllUnits();
const idByName = new Map(units.map(u => [u.name, u.id]));
const nameById = new Map(units.map(u => [u.id, u.name]));

// ---- Lê um backup: retorna Map(unitId -> Map(sku -> {nome, validade})) ----
function loadBackup(file) {
  const full = path.join(BACKUPS_DIR, file);
  const wb = XLSX.readFile(full);
  const byUnit = new Map();
  for (const sheetName of wb.SheetNames) {
    const unitId = idByName.get(sheetName);
    if (!unitId) {
      console.warn(`  ! aba "${sheetName}" não corresponde a nenhuma unidade em units.json — ignorada`);
      continue;
    }
    const items = new Map();
    for (const r of XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })) {
      const sku = String(r.SKU ?? '').trim();
      if (!sku) continue;
      items.set(sku, {
        nome: String(r.Nome ?? '').trim(),
        validade: String(r.Validade ?? '').trim()
      });
    }
    byUnit.set(unitId, items);
  }
  return { file, mtime: fs.statSync(full).mtime, byUnit };
}

async function loadCurrentFromDb() {
  const { getPool } = require('../src/storage/pgPool');
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT sku, nome, unidade, to_char(validade, 'YYYY-MM-DD') AS validade FROM products`
  );
  await pool.end();

  const byUnit = new Map();
  for (const r of rows) {
    if (!byUnit.has(r.unidade)) byUnit.set(r.unidade, new Map());
    byUnit.get(r.unidade).set(String(r.sku).trim(), { nome: r.nome, validade: r.validade });
  }
  return { file: 'BANCO DE DADOS (DATABASE_URL)', mtime: new Date(), byUnit };
}

(async () => {
  const files = fs.readdirSync(BACKUPS_DIR).filter(f => /backup-validades.*\.xlsx$/i.test(f));
  if (!files.length) {
    console.error(`Nenhum backup encontrado em ${BACKUPS_DIR}`);
    process.exit(1);
  }

  const snaps = files.map(loadBackup).sort((a, b) => a.mtime - b.mtime);

  let current, olds;
  if (process.env.DATABASE_URL) {
    current = await loadCurrentFromDb();
    olds = snaps;
  } else {
    current = snaps[snaps.length - 1];
    olds = snaps.slice(0, -1);
    console.warn('AVISO: DATABASE_URL não definida — usando o backup mais recente como estado atual.\n');
  }

  console.log(`Backups lidos: ${snaps.length} (de ${BACKUPS_DIR})`);
  console.log(`Estado atual : ${current.file}\n`);

  // Quem tem cada SKU hoje (para provar a colisão)
  const donoAtual = new Map(); // sku -> [unitId]
  for (const [unitId, items] of current.byUnit) {
    for (const sku of items.keys()) {
      if (!donoAtual.has(sku)) donoAtual.set(sku, []);
      donoAtual.get(sku).push(unitId);
    }
  }

  // Itens que estavam numa loja e hoje não estão mais nela
  const perdidos = new Map(); // `${unitId}||${sku}` -> {...}
  for (const snap of olds) {
    for (const [unitId, items] of snap.byUnit) {
      for (const [sku, info] of items) {
        if (current.byUnit.get(unitId)?.has(sku)) continue;

        const key = `${unitId}||${sku}`;
        const anterior = perdidos.get(key);
        if (anterior && anterior.visto >= snap.mtime) continue;

        perdidos.set(key, {
          unitId, sku, nome: info.nome, validade: info.validade,
          visto: snap.mtime,
          agoraEm: (donoAtual.get(sku) || []).filter(u => u !== unitId)
        });
      }
    }
  }

  const todos = [...perdidos.values()];
  const comProva = todos.filter(x => x.agoraEm.length > 0);
  const semRastro = todos.filter(x => x.agoraEm.length === 0);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const porLoja = {};
  for (const x of comProva) (porLoja[x.unitId] ||= []).push(x);

  console.log('='.repeat(72));
  console.log('PLANILHAS DE RECUPERAÇÃO (itens com prova de colisão)');
  console.log('='.repeat(72));

  for (const [unitId, items] of Object.entries(porLoja)) {
    const validos = items.filter(x => x.validade >= HOJE).sort((a, b) => a.validade.localeCompare(b.validade));
    const vencidos = items.filter(x => x.validade < HOJE).sort((a, b) => a.validade.localeCompare(b.validade));

    const wb = XLSX.utils.book_new();

    // 1ª aba = a que o importador lê
    const aoa = [['SKU', 'Nome', 'Validade']];
    for (const x of validos) aoa.push([x.sku, x.nome, x.validade]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    for (let i = 2; i <= aoa.length; i++) if (ws['A' + i]) ws['A' + i].t = 's';
    ws['!cols'] = [{ wch: 12 }, { wch: 46 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Recuperar');

    if (vencidos.length) {
      const aoa2 = [['SKU', 'Nome', 'Validade', 'Observacao']];
      for (const x of vencidos) aoa2.push([x.sku, x.nome, x.validade, 'ja vencido - conferir antes de importar']);
      const ws2 = XLSX.utils.aoa_to_sheet(aoa2);
      for (let i = 2; i <= aoa2.length; i++) if (ws2['A' + i]) ws2['A' + i].t = 's';
      ws2['!cols'] = [{ wch: 12 }, { wch: 46 }, { wch: 12 }, { wch: 38 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'Ja vencidos');
    }

    const out = path.join(OUT_DIR, `recuperar-${unitId}.xlsx`);
    XLSX.writeFile(wb, out);
    console.log(`\n${nameById.get(unitId)}`);
    console.log(`  ${validos.length} item(ns) para reimportar${vencidos.length ? ` (+${vencidos.length} já vencidos, em aba separada)` : ''}`);
    console.log(`  -> ${out}`);
  }

  if (semRastro.length) {
    console.log('\n' + '='.repeat(72));
    console.log(`SEM RASTRO — ${semRastro.length} item(ns) que sumiram e hoje não estão em NENHUMA loja`);
    console.log('Podem ser exclusões manuais legítimas. Confira antes de recadastrar:');
    console.log('='.repeat(72));
    for (const x of semRastro) {
      console.log(`  ${(nameById.get(x.unitId) || x.unitId).padEnd(26)} SKU ${x.sku.padEnd(8)} ${x.nome.slice(0, 34).padEnd(34)} val ${x.validade}`);
    }
  }

  console.log(`\nTOTAL com prova de colisão: ${comProva.length} | sem rastro: ${semRastro.length}`);
  console.log('\nSó importe DEPOIS que a correção (sku, unidade) estiver em produção.');
})().catch(err => { console.error('ERRO:', err.message); process.exit(1); });
