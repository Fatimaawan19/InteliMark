// Ollama client configuration for llama3:latest
const axios = require('axios');

const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3:latest';

const ollamaClient = axios.create({
  baseURL: OLLAMA_API_URL,
  timeout: 15000,
});

module.exports = {
  ollamaClient,
  OLLAMA_MODEL,
};
