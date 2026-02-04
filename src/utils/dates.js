const { DateTime } = require('luxon');

const TIMEZONE = process.env.TZ || 'America/Maceio';

// Retorna a data de hoje (início do dia) no timezone configurado
const getToday = () => {
  return DateTime.now().setZone(TIMEZONE).startOf('day');
};

// Faz o parse de uma string YYYY-MM-DD para objeto DateTime
const parseDate = (dateString) => {
  return DateTime.fromISO(dateString, { zone: TIMEZONE }).startOf('day');
};

// Calcula a diferença em dias entre duas datas
const daysUntil = (targetDateObj) => {
  const today = getToday();
  const diff = targetDateObj.diff(today, 'days');
  return Math.floor(diff.days);
};

// Verifica se a string está no formato YYYY-MM-DD
const isValidDateString = (dateString) => {
  return DateTime.fromFormat(dateString, 'yyyy-MM-dd').isValid;
};

module.exports = {
  getToday,
  parseDate,
  daysUntil,
  isValidDateString,
  TIMEZONE
};