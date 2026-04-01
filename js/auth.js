/* ============================================================
   7DS ORIGIN - ADMIN AUTH MODULE
   Handles ADMIN authentication only.
   Regular users (Google/Discord/Email signup) should NOT
   have access to admin features.
   ============================================================ */

var Auth = (function () {

  /* ── Check if email is in admin whitelist ── */
  function _isAdminEmail(email) {
    if (!email) return false;
    if (typeof ADMIN_EMAILS !== 'undefined' && Array.isArray(ADMIN_EMAILS)) {
      return ADMIN_EMAILS.some(function (ae) {
        return ae.toLowerCase() === email.toLowerCase();
      });
    }
    // Fallback: if no admin list defined, allow all (backward compat)
    return true;
  }

  /* ── Check if current session is admin ── */
  async function _getAdminSession() {
    var session = await SupaDB.getSession();
    if (!session || !session.user) return null;

    var email = session.user.email || '';
    var provider = (session.user.app_metadata && session.user.app_metadata.provider) || 'email';

    // Admin must be email/password login AND in admin whitelist
    // Google/Discord OAuth users are NOT admin
    if (provider !== 'email') return null;
    if (!_isAdminEmail(email)) return null;

    return session;
  }

  async function login(email, password) {
    // Check admin whitelist BEFORE attempting login
    if (!_isAdminEmail(email)) {
      return { error: { message: 'This email is not authorized for admin access.' } };
    }

    const result = await SupaDB.login(email, password);
    if (!result.error) {
      console.log("[Auth] Admin login successful, redirecting to admin.html");
      window.location.href = 'admin.html';
      return true;
    } else {
      console.error("[Auth] Login failure reason:", result.error.message);
      return result;
    }
  }

  async function logout() {
    await SupaDB.logout();
    window.location.href = 'login.html';
  }

  /* ── isLoggedIn now checks admin status, not just session ── */
  async function isLoggedIn() {
    var adminSession = await _getAdminSession();
    return adminSession !== null;
  }

  /* ── Get admin email (for display) ── */
  async function getAdminEmail() {
    var adminSession = await _getAdminSession();
    if (adminSession && adminSession.user) {
      return adminSession.user.email || '';
    }
    return '';
  }

  async function requireAdmin(redirectUrl) {
    redirectUrl = redirectUrl || 'login.html';
    const admin = await isLoggedIn();
    if (!admin) {
      console.warn("[Auth] Admin access required, redirecting to:", redirectUrl);
      window.location.href = redirectUrl;
      return false;
    }
    return true;
  }

  async function updateAdminUI() {
    const admin = await isLoggedIn();
    const adminBar = document.getElementById('adminBar');
    const adminOnlyEls = document.querySelectorAll('.admin-only');

    if (adminBar) {
      adminBar.style.display = admin ? 'flex' : 'none';
    }
    adminOnlyEls.forEach(function (el) {
      el.style.display = admin ? '' : 'none';
    });

    const pageContent = document.querySelector('.page-content');
    if (pageContent) {
      pageContent.style.paddingTop = admin ? '104px' : '64px';
    }
    return admin;
  }

  return {
    login: login,
    logout: logout,
    isLoggedIn: isLoggedIn,
    getAdminEmail: getAdminEmail,
    requireAdmin: requireAdmin,
    updateAdminUI: updateAdminUI,
    isAdminEmail: _isAdminEmail
  };
})();

// Ensure Supabase initializes when the page loads
document.addEventListener("DOMContentLoaded", () => {
  SupaDB.init();
});
