document.addEventListener("DOMContentLoaded", async () => {
  // 1. Bảo mật: Kiểm tra xem người dùng có phải là Phụ Huynh (PH) không
  if (typeof auth !== "undefined") {
    if (!auth.checkAccess("PH")) return;

    // Hiển thị tên Phụ huynh tự động
    const user = auth.getUser();
    const parentNameEl = document.getElementById("parentName");
    if (parentNameEl && user) {
      parentNameEl.innerText = user.fullName || "Phụ huynh";
    }
  }

  initLogout();
  initToggleSidebar();
  initMenuRouting();

  if (typeof window.loadSubPage === "function") {
    const firstMenuLink = document.querySelector(".sidebar-menu a[data-page]");

    if (firstMenuLink) {
      const defaultPage = firstMenuLink.getAttribute("data-page");

      loadSubPage(defaultPage);

      document
        .querySelectorAll(".sidebar-menu a")
        .forEach((m) => m.classList.remove("active"));
      firstMenuLink.classList.add("active");
    }
  }
});

function initLogout() {
  const btnLogout = document.getElementById("btnLogout");
  if (btnLogout) {
    btnLogout.addEventListener("click", async function (e) {
      e.preventDefault();

      const isConfirmed = await utils.confirm(
        "Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?",
        {
          title: "Đăng xuất",
          confirmText: "Đăng xuất",
          cancelText: "Hủy",
          type: "warning",
        },
      );

      if (isConfirmed) {
        if (typeof auth !== "undefined") {
          auth.logout();
        } else {
          localStorage.clear();
          window.location.href = "/login.html";
        }
      }
    });
  }
}

function initToggleSidebar() {
  const toggleSidebar = document.getElementById("toggleSidebar");
  const sidebar = document.getElementById("sidebar");
  const mainWrapper = document.getElementById("mainWrapper");

  if (toggleSidebar && sidebar && mainWrapper) {
    toggleSidebar.addEventListener("click", function () {
      sidebar.classList.toggle("collapsed");
      mainWrapper.classList.toggle("expanded");
    });
  }
}

function initMenuRouting() {
  const menuLinks = document.querySelectorAll(".sidebar-menu a[data-page]");

  menuLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();

      menuLinks.forEach((m) => m.classList.remove("active"));
      e.currentTarget.classList.add("active");

      const targetPage = e.currentTarget.getAttribute("data-page");
      window.loadSubPage(targetPage);
    });
  });
}

window.loadSubPage = async function (pageFile) {
  if (typeof router !== "undefined") {
    await router.loadPage(`/core/parent/${pageFile}`, "main-content");
    localStorage.setItem("lastPage", pageFile);
  } else {
    console.error("Router chưa được khởi tạo!");
  }
};
