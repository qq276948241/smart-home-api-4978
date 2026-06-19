const { v4: uuidv4 } = require('uuid');

const parseState = (stateStr) => {
  if (!stateStr) return {};
  try {
    return typeof stateStr === 'string' ? JSON.parse(stateStr) : stateStr;
  } catch {
    return {};
  }
};

const stringifyState = (state) => {
  return typeof state === 'string' ? state : JSON.stringify(state || {});
};

const generateSerialNumber = () => {
  return 'SH-' + uuidv4().replace(/-/g, '').substring(0, 16).toUpperCase();
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const parseActionParams = (paramsStr) => {
  if (!paramsStr) return {};
  try {
    return typeof paramsStr === 'string' ? JSON.parse(paramsStr) : paramsStr;
  } catch {
    return {};
  }
};

module.exports = { parseState, stringifyState, generateSerialNumber, delay, parseActionParams };
