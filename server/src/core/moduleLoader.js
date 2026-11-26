import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { authenticate, requireStore, requireRole } from './auth.js';
import { registerPermissions } from './permissions.js';

const modulesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'modules');

/**
 * Every folder in src/modules/ with a module.js is a feature module:
 *
 *   export default {
 *     name: 'products',            // unique id
 *     path: 'products',            // mounted at /api/products
 *     scope: 'store',              // 'public' | 'store' | 'platform'
 *     dependsOn: ['categories'],   // optional – other module names that must exist
 *     permissions: [{ key, label, group }],
 *     router,                      // express.Router()
 *   }
 *
 * Nothing else has to be edited to add a module.
 */
export async function loadModules(app) {
  const dirs = fs
    .readdirSync(modulesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(modulesDir, d.name, 'module.js')))
    .map((d) => d.name)
    .sort();

  const loaded = [];
  for (const dir of dirs) {
    const mod = (await import(pathToFileURL(path.join(modulesDir, dir, 'module.js')).href)).default;
    if (!mod?.name || !mod?.router) throw new Error(`Module "${dir}" must export { name, router }`);
    loaded.push(mod);
  }

  const names = new Set(loaded.map((m) => m.name));
  for (const m of loaded) {
    for (const dep of m.dependsOn || []) {
      if (!names.has(dep)) throw new Error(`Module "${m.name}" depends on missing module "${dep}"`);
    }
  }

  for (const mod of loaded) {
    registerPermissions(mod.permissions, mod.label || mod.name);
    const scope = mod.scope || 'store';
    const guards =
      scope === 'public'
        ? []
        : scope === 'platform'
          ? [authenticate, requireRole('SUPER_ADMIN')]
          : [authenticate, requireStore];
    app.use(`/api/${mod.path || mod.name}`, ...guards, mod.router);
  }

  return loaded;
}
