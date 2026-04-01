/* ============================================================
   7DS ORIGIN - LOCAL ADMIN AUTHENTICATION
   Simple hardcoded admin login system (no Supabase)
   ============================================================ */

const AdminAuth = (function() {
  // Hardcoded admin credentials
  const ADMIN_USERNAME = 'admin';
  const ADMIN_PASSWORD = '1234';
  const SESSION_KEY = '7ds_admin_session';
  const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Check if user is currently logged in
   */
  function isLoggedIn() {
    const session = localStorage.getItem(SESSION_KEY);
    if (!session) return false;

    try {
      const data = JSON.parse(session);
      const now = Date.now();
      
      // Check if session has expired
      if (data.expiresAt && now > data.expiresAt) {
        logout();
        return false;
      }
      
      return true;
    } catch (error) {
      console.error("[AdminAuth] Error checking session:", error);
      return false;
    }
  }

  /**
   * Login with username and password
   */
  function login(username, password) {
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      const session = {
        username: username,
        loginTime: Date.now(),
        expiresAt: Date.now() + SESSION_TIMEOUT
      };
      
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      console.log("[AdminAuth] Login successful");
      return true;
    } else {
      console.error("[AdminAuth] Invalid credentials");
      return false;
    }
  }

  /**
   * Logout current user
   */
  function logout() {
    localStorage.removeItem(SESSION_KEY);
    console.log("[AdminAuth] Logged out");
  }

  /**
   * Get current session info
   */
  function getSession() {
    const session = localStorage.getItem(SESSION_KEY);
    if (!session) return null;

    try {
      return JSON.parse(session);
    } catch (error) {
      console.error("[AdminAuth] Error parsing session:", error);
      return null;
    }
  }

  /**
   * Redirect to login if not authenticated
   */
  function requireLogin() {
    if (!isLoggedIn()) {
      window.location.href = 'login.html';
      return false;
    }
    return true;
  }

  /**
   * Check if user is admin (always true for this simple system)
   */
  function isAdmin() {
    return isLoggedIn();
  }

  return {
    isLoggedIn: isLoggedIn,
    login: login,
    logout: logout,
    getSession: getSession,
    requireLogin: requireLogin,
    isAdmin: isAdmin
  };
})();

// Auto-check login status on page load
document.addEventListener('DOMContentLoaded', function() {
  console.log("[AdminAuth] Initialized. Logged in:", AdminAuth.isLoggedIn());
});
