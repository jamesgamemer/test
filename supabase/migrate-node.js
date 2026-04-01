/* ============================================================
   7DS ORIGIN - NODE.JS MIGRATION SCRIPT
   Import existing character data from data/characters.json
   into Supabase database using REST API.
   
   HOW TO USE:
   1. Install Node.js if not already installed
   2. npm install @supabase/supabase-js
   3. Set environment variables:
      export SUPABASE_URL="https://your-project.supabase.co"
      export SUPABASE_SERVICE_KEY="your-service-role-key"
   4. Run: node migrate-node.js
   
   NOTE: Use the SERVICE ROLE key (not anon key) for migration
         to bypass RLS policies.
   ============================================================ */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables');
  console.error('Example:');
  console.error('  export SUPABASE_URL="https://your-project.supabase.co"');
  console.error('  export SUPABASE_SERVICE_KEY="your-service-role-key"');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function migrate() {
  console.log('=== 7DS Origin Migration Script (Node.js) ===\n');

  // Load local JSON data
  const jsonPath = path.join(__dirname, '..', 'data', 'characters.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('ERROR: data/characters.json not found at:', jsonPath);
    process.exit(1);
  }

  const characters = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log(`Found ${characters.length} characters in local data.\n`);

  let success = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < characters.length; i++) {
    const c = characters[i];
    const name = c.name || 'Unknown';
    process.stdout.write(`[${i + 1}/${characters.length}] ${name}... `);

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const charData = {
      name: c.name || '',
      slug: slug,
      rarity: c.rarity || 'SR',
      description: c.description || '',
      image: c.image || '',
      types: c.types || [],
      skills: c.skills || {},
      potentials: c.potentials || {},
      costumes: c.costumes || [],
      tier: c.tier || 'B',
      is_published: true
    };

    try {
      // Try upsert (insert or update on conflict)
      const { data, error } = await supabase
        .from('characters')
        .upsert(charData, { onConflict: 'slug' })
        .select();

      if (error) {
        throw new Error(error.message);
      }

      console.log('OK');
      success++;
    } catch (err) {
      console.log('FAILED - ' + err.message);
      errors.push({ name, error: err.message });
      failed++;
    }

    // Small delay
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n=== Migration Complete ===');
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);
  if (errors.length > 0) {
    console.log('\nFailed characters:');
    errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
  }
}

migrate().catch(console.error);
