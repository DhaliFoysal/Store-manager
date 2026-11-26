// Permission registry. Every module declares the permissions it adds; the loader
// registers them here, so a new module's permissions automatically show up in the
// user-management screen.
const registry = new Map(); // key -> { key, label, group }

export function registerPermissions(list = [], group = 'General') {
  for (const p of list) registry.set(p.key, { group, ...p });
}

export const allPermissions = () => [...registry.values()];
export const allPermissionKeys = () => [...registry.keys()];

// Role -> effective permission keys
export function resolvePermissions(user) {
  switch (user.role) {
    case 'SUPER_ADMIN':
      return ['platform.manage'];
    case 'OWNER':
      return allPermissionKeys();
    case 'ADMIN':
      return allPermissionKeys().filter((k) => k !== 'store.manage');
    default: {
      const granted = Array.isArray(user.permissions) ? user.permissions : [];
      return granted.filter((k) => registry.has(k));
    }
  }
}
