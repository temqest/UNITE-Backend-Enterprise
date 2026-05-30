const fs = require('fs');
let f = fs.readFileSync('src/services/auth/rbac.constants.ts', 'utf8');

f = f.replace(
  /  'settings\.update',\r?\n\] as const;/g,
  "  'settings.update',\n  'coverage.read',\n  'coverage.create',\n  'coverage.update',\n  'coverage.delete',\n] as const;"
);

f = f.replace(
  /    'settings\.update',\r?\n  \],/g,
  "    'settings.update',\n    'coverage.read',\n    'coverage.create',\n    'coverage.update',\n    'coverage.delete',\n  ],"
);

f = f.replace(
  /    'reports\.read',\r?\n  \],/g,
  "    'reports.read',\n    'coverage.read',\n    'coverage.create',\n    'coverage.update',\n    'coverage.delete',\n  ],"
);

f = f.replace(
  /    'documents\.read',\r?\n  \],/g,
  "    'documents.read',\n    'coverage.read',\n  ],"
);

fs.writeFileSync('src/services/auth/rbac.constants.ts', f);
console.log('Done');
