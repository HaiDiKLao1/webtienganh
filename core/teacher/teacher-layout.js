document.addEventListener("DOMContentLoaded", async () => {
  // 1. KIỂM TRA QUYỀN TRUY CẬP: Chặn nếu không phải Giáo viên ('GV')
  if (!auth.checkAccess("GV")) return;

  const user = auth.getUser();
  const currentRole = user.roles.find((r) => r.code === "GV")?.code ?? "";

  try {
    // 2. FETCH CÁC COMPONENT DÙNG CHUNG
    const [sidebarRes, headerRes] = await Promise.all([
      fetch("/public/components/sidebar.html"),
      fetch("/public/components/header.html"),
    ]);

    document.getElementById("sidebar-container").innerHTML =
      await sidebarRes.text();
    document.getElementById("header-container").innerHTML =
      await headerRes.text();

    // 3. HIỂN THỊ THÔNG TIN USER
    const userNameSpan = document.getElementById("user-display-name");
    if (userNameSpan) userNameSpan.innerText = `Giáo viên: ${user.fullName}`;

    // 4. BỘ LỌC MENU: Ẩn các chức năng của Admin, chỉ hiện mục của GV
    filterSidebarMenu(currentRole);

    // 5. KÍCH HOẠT ĐIỀU HƯỚNG SPA
    initMenuRouting();

    // 5.5. KÍCH HOẠT TOGGLE SIDEBAR
    initToggleSidebar();

    // 6. TẢI TRANG MẶC ĐỊNH
    const defaultPage = "calendar.html";
    loadSubPage(defaultPage);

    // Tự động bôi đậm menu Lịch dạy trên thanh bên trái
    const activeLink = document.querySelector(
      `.sidebar-menu a[data-page="${defaultPage}"]`,
    );
    if (activeLink) {
      document
        .querySelectorAll(".sidebar-menu a")
        .forEach((m) => m.classList.remove("active"));
      activeLink.classList.add("active");
    }
  } catch (error) {
    console.error("Lỗi khởi tạo Layout Teacher:", error);
    document.getElementById("main-content").innerHTML = `
            <div class="alert alert-danger m-4">Lỗi tải dữ liệu khung hệ thống. Vui lòng thử lại!</div>
        `;
  }
});

function filterSidebarMenu(roleCode) {
  const elements = document.querySelectorAll(".sidebar-menu [data-role]");
  elements.forEach((el) => {
    const allowedRoles = el.getAttribute("data-role").split(",");
    if (!allowedRoles.includes(roleCode)) {
      el.classList.add("d-none");
    }
  });
}

function initMenuRouting() {
  const menuLinks = document.querySelectorAll(".sidebar-menu a[data-page]");

  menuLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();

      menuLinks.forEach((m) => m.classList.remove("active"));
      e.currentTarget.classList.add("active");

      const targetPage = e.currentTarget.getAttribute("data-page");
      loadSubPage(targetPage);
    });
  });
}

// Gọi file HTML con từ thư mục của giáo viên
function loadSubPage(pageFile) {
  router.loadPage(`/core/teacher/${pageFile}`, "main-content");
}

// Hàm khởi tạo chức năng thu gọn/mở rộng Sidebar
function initToggleSidebar() {
  const toggleBtn = document.getElementById("toggle-sidebar-btn");
  const sidebar = document.getElementById("sidebar-container");

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener("click", function () {
      sidebar.classList.toggle("collapsed");
    });
  }
}
