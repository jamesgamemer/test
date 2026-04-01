/* ============================================================
   7DS ORIGIN - MIGRATION SCRIPT
   Import existing character data from data/characters.json
   into Supabase database.
   
   HOW TO USE:
   1. Open your website in browser
   2. Open browser console (F12 -> Console)
   3. Make sure you are logged in as admin
   4. Copy and paste this entire script into the console
   5. Press Enter to run
   6. Wait for all characters to be imported
   ============================================================ */

(async function migrateToSupabase() {
  console.log('=== 7DS Origin Migration Script ===');
  console.log('Starting migration from local JSON to Supabase...\n');

  // Check if SupaDB is available and connected
  if (typeof SupaDB === 'undefined' || !SupaDB.isConnected()) {
    console.error('ERROR: SupaDB is not available or not connected.');
    console.error('Make sure supabase-config.js has correct SUPABASE_URL and SUPABASE_ANON_KEY');
    return;
  }

  // Check if logged in
  var loggedIn = await SupaDB.isLoggedIn();
  if (!loggedIn) {
    console.error('ERROR: You must be logged in as admin to run migration.');
    console.error('Go to login.html and sign in first.');
    return;
  }

  // Load local JSON data
  console.log('Loading local character data...');
  var response = await fetch('data/characters.json');
  var characters = await response.json();
  console.log('Found ' + characters.length + ' characters in local data.\n');

  var success = 0;
  var failed = 0;
  var errors = [];

  for (var i = 0; i < characters.length; i++) {
    var c = characters[i];
    var name = c.name || 'Unknown';
    console.log('[' + (i + 1) + '/' + characters.length + '] Importing: ' + name);

    try {
      // Generate slug from name
      var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      // Prepare character data for Supabase
      var charData = {
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

      var result = await SupaDB.createCharacter(charData);

      if (result.error) {
        // Check if it's a duplicate slug error
        if (result.error.message && result.error.message.indexOf('duplicate') !== -1) {
          console.log('  -> Already exists, updating instead...');
          // Try to update by slug
          var existing = await SupaDB.fetchBySlug(slug);
          if (existing) {
            var updateResult = await SupaDB.updateCharacter(existing.id, charData);
            if (updateResult.error) {
              throw new Error(updateResult.error.message);
            }
            console.log('  -> Updated successfully');
            success++;
          } else {
            throw new Error('Could not find existing character to update');
          }
        } else {
          throw new Error(result.error.message);
        }
      } else {
        console.log('  -> Imported successfully');
        success++;
      }
    } catch (err) {
      console.error('  -> FAILED: ' + err.message);
      errors.push({ name: name, error: err.message });
      failed++;
    }

    // Small delay to avoid rate limiting
    await new Promise(function(resolve) { setTimeout(resolve, 200); });
  }

  console.log('\n=== Migration Complete ===');
  console.log('Success: ' + success);
  console.log('Failed: ' + failed);
  if (errors.length > 0) {
    console.log('\nFailed characters:');
    errors.forEach(function(e) {
      console.log('  - ' + e.name + ': ' + e.error);
    });
  }
  console.log('\nRefresh the page to see imported characters.');
})();
