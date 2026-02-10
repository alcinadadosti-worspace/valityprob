const unitsConfig = require('./units.json');

/**
 * Retorna todas as unidades
 */
const getAllUnits = () => {
  return unitsConfig.units;
};

/**
 * Busca unidade por ID
 */
const getUnitById = (unitId) => {
  return unitsConfig.units.find(u => u.id === unitId);
};

/**
 * Busca unidade pelo Slack ID de um membro
 */
const getUnitBySlackId = (slackId) => {
  return unitsConfig.units.find(u =>
    u.members.some(m => m.slackId === slackId)
  );
};

/**
 * Retorna todos os Slack IDs dos membros de uma unidade
 * Em modo de teste, retorna apenas o usuário de teste
 */
const getMemberSlackIds = (unitId) => {
  if (unitsConfig.testMode) {
    return [unitsConfig.testUserId];
  }

  const unit = getUnitById(unitId);
  if (!unit) return [];
  return unit.members.map(m => m.slackId);
};

/**
 * Retorna opções para select HTML
 */
const getUnitOptions = () => {
  return unitsConfig.units.map(u => ({
    id: u.id,
    name: u.name
  }));
};

/**
 * Verifica se está em modo de teste
 */
const isTestMode = () => {
  return unitsConfig.testMode === true;
};

/**
 * Retorna o ID do usuário de teste
 */
const getTestUserId = () => {
  return unitsConfig.testUserId;
};

module.exports = {
  getAllUnits,
  getUnitById,
  getUnitBySlackId,
  getMemberSlackIds,
  getUnitOptions,
  isTestMode,
  getTestUserId
};
