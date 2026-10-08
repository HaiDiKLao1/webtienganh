const auth = {
  saveTokens(data) {
    localStorage.setItem("accessToken", data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken);
    localStorage.setItem("user", JSON.stringify(data.user));
  },

  getUser() {
    const user = localStorage.getItem("user");
    return user ? JSON.parse(user) : null;
  },

  hasRole(roleCode) {
    const user = this.getUser();
    if (!user || !Array.isArray(user.roles)) return false;
    return user.roles.some((r) => r.code === roleCode);
  },

  checkAccess(requiredRoleCode) {
    const user = this.getUser();

    if (!user) {
      window.location.href = "/login.html";
      return false;
    }

    if (requiredRoleCode && !this.hasRole(requiredRoleCode)) {
      alert("Bạn không có quyền truy cập!");
      this.redirectByRole();
      return false;
    }

    return true;
  },

  redirectByRole() {
    const user = this.getUser();
    if (!user || !Array.isArray(user.roles)) {
      window.location.href = "/login.html";
      return;
    }

    const roleMap = {
      OWNER: "/core/admin/admin-layout.html",
      AD: "/core/admin/admin-layout.html",
      GV: "/core/teacher/teacher-layout.html",
      HS: "/core/student/student-layout.html",
      PH: "/core/parent/parent-layout.html",
    };

    const priority = ["OWNER", "AD", "GV", "HS", "PH"];

    const topRole = priority.find((code) => this.hasRole(code));

    window.location.href = roleMap[topRole] || "/index.html";
  },

  logout() {
    localStorage.clear();
    window.location.href = "/index.html";
  },
};
