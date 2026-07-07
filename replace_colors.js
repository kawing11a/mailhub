const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('./src');

files.forEach(file => {
  // Exclude PreferencesPage because we need the raw colors there for previews
  if (file.replace(/\\/g, '/').includes('/settings/preferences/page.tsx')) {
    return;
  }

  let content = fs.readFileSync(file, 'utf8');
  let newContent = content
    .replace(/\b(text|bg|border|ring|shadow)-blue-([0-9]{2,3})\b/g, '$1-accent-$2')
    .replace(/\bhover:(text|bg|border|ring)-blue-([0-9]{2,3})\b/g, 'hover:$1-accent-$2')
    .replace(/\bfocus:(ring|border)-blue-([0-9]{2,3})\b/g, 'focus:$1-accent-$2');
    
  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log(`Updated ${file}`);
  }
});
