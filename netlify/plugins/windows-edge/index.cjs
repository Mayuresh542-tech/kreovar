/* CommonJS is required by the Netlify build plugin loader. */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');

// The adapter's CJS shim assumes POSIX paths even during Windows CLI bundling.
// Fix only the generated build artifact; Linux deploys keep its original behavior.
module.exports = {
  onBuild() {
    // The Next adapter copies dotenv files independently of route tracing.
    // Production must use the approved hosted environment, never a local key pool.
    const handler = path.join(process.cwd(), '.netlify', 'functions-internal', '___netlify-server-handler');
    const root = path.resolve(process.cwd(), '.netlify', 'functions-internal');
    if (!path.resolve(handler).startsWith(root + path.sep)) throw new Error('Unexpected function output directory.');
    let removed = 0;
    for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
      const generated = path.join(handler, name);
      if (fs.existsSync(generated)) { fs.unlinkSync(generated); removed++; }
    }
    console.log('Excluded ' + removed + ' local dotenv files from the generated server function.');
    if (process.platform !== 'win32') return;
    const file = path.join(process.cwd(), '.netlify', 'edge-functions', '___netlify-edge-handler-node-middleware', 'edge-runtime', 'lib', 'cjs.ts');
    if (!fs.existsSync(file)) throw new Error('Netlify middleware artifact missing; review the Windows compatibility plugin.');
    const source = fs.readFileSync(file, 'utf8');
    const before = 'pathToFileURL(filepath, { windows: false })';
    if (!source.includes(before)) throw new Error('Netlify adapter changed; review the Windows compatibility plugin.');
    fs.writeFileSync(file, source.replace(before, 'pathToFileURL(filepath, { windows: /^[A-Za-z]:[\\\\/]/.test(filepath) })'));
    console.log('Applied Windows file URL compatibility to the generated middleware shim.');
  },
};
