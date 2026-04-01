/**
 * Centralized Image URL Configuration
 * Migrated from Supabase Storage to Cloudflare R2
 * 
 * Base URL: https://pub-4188d0f981804327a6bbe882b9c693dd.r2.dev/images/
 */

const IMAGE_CONFIG = {
  BASE_URL: "https://pub-4188d0f981804327a6bbe882b9c693dd.r2.dev/images/",
  
  /**
   * Get full image URL from filename
   * @param {string} filename - Image filename (e.g., "Ban.png")
   * @returns {string} Full image URL
   */
  getImageUrl: function(filename) {
    if (!filename) return this.BASE_URL + "placeholder.png";
    return this.BASE_URL + filename;
  },
  
  /**
   * Get character image URL
   * @param {string} characterName - Character name (e.g., "Ban")
   * @returns {string} Full character image URL
   */
  getCharacterImage: function(characterName) {
    if (!characterName) return this.BASE_URL + "placeholder.png";
    return this.BASE_URL + characterName + ".png";
  },
  
  /**
   * Get guide image URL
   * @param {string} filename - Guide image filename
   * @returns {string} Full guide image URL
   */
  getGuideImage: function(filename) {
    if (!filename) return this.BASE_URL + "guides/default.jpg";
    if (filename.startsWith("guides/")) {
      return this.BASE_URL + filename;
    }
    return this.BASE_URL + "guides/" + filename;
  }
};

// Export for use in different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = IMAGE_CONFIG;
}
