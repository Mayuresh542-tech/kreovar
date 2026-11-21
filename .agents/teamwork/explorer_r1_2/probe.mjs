import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve('.');

// Read scripts/test-chat-tool-routing.mjs and see what fails in clientFixture
const raw = fs.readFileSync(path.join(root, 'scripts/test-chat-tool-routing.mjs'), 'utf8');

// Let's execute clientFixture to inspect error
const fixtureRegex = /async function clientFixture[\s\S]*?return \{job,store,requests,observed,prepares:[\s\S]*?\};?\s*\}/;
console.log('Extracting test-chat-tool-routing clientFixture...');
