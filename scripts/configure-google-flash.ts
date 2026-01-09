#!/usr/bin/env bun
import { readFileSync, existsSync } from 'node:fs';
import { DB } from '../src/db';
import { verifyProviderWithAISDK } from '../src/lib/ai/verify-aisdk';

// Load .env file manually
function loadEnv() {
  const envPath = '.env';
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          process.env[key.trim()] = valueParts.join('=').trim();
        }
      }
    }
  }
}

loadEnv();

const dbPath = process.env.DATABASE_PATH || './data/changes.db';
const db = new DB(dbPath);

// Ensure AI providers and models are initialized
db.ensureDefaultAIData();

console.log('Configuring Google Flash LLM for summaries...\n');

// Get API key from environment
const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
if (!apiKey) {
  console.error('✗ No GOOGLE_GENERATIVE_AI_API_KEY found in environment.');
  console.error('Please add GOOGLE_GENERATIVE_AI_API_KEY to your .env file.');
  process.exit(1);
}

// Store the API key in the database
db.setAIProviderKey('google', apiKey);
console.log('✓ Stored Google API key');

// Set provider to Google
db.setSetting('ai_provider', 'google');
console.log('✓ Set AI provider to Google');

// Set model to gemini-2.5-flash
const modelId = 'gemini-2.5-flash';
db.setSetting('ai_model', modelId);
db.setSetting('ai_model_google', modelId);
console.log(`✓ Set AI model to ${modelId}`);

// Verify the API key
console.log('\nVerifying API key...');
const verification = await verifyProviderWithAISDK(db, 'google', modelId);
if (verification.ok) {
  db.setAIProviderVerified('google', true);
  console.log('✓ API key verified successfully');
  console.log('\nConfiguration complete! Google Flash is now set as your AI provider.');
} else {
  db.setAIProviderVerified('google', false);
  console.error(`✗ API key verification failed: ${verification.error}`);
  console.error('Please check your API key and try again.');
  process.exit(1);
}
