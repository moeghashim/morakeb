#!/usr/bin/env bun
import { randomBytes } from 'node:crypto';

/**
 * Generate a secure encryption key for the ENCRYPTION_KEY environment variable
 * 
 * Usage: bun run scripts/generate-encryption-key.ts
 */

const key = randomBytes(32).toString('base64');
console.log('\nGenerated Encryption Key:');
console.log('='.repeat(60));
console.log(key);
console.log('='.repeat(60));
console.log('\nAdd this to your .env file:');
console.log(`ENCRYPTION_KEY=${key}`);
console.log('\n⚠️  IMPORTANT: Keep this key secure and never commit it to git!');
console.log('   The .env file is already in .gitignore.\n');
