document.addEventListener("DOMContentLoaded", async () => {
  if (!auth.checkAccess("AD") && !auth.checkAccess("OWNER")) return;

  const user = auth.getUser();

  const priority = ["OWNER", "AD", "GV", "HS", "PH"];
  const currentRole = priority.find((code) =>
    user.roles.some((r) => r.code === code),
  );

  try {
    const [sidebarRes, headerRes] = await Promise.all([
      fetch("/public/components/sidebar.html"),
      fetch("/public/components/header.html"),
    ]);

    document.getElementById("sidebar-container").innerHTML =
      await sidebarRes.text();
    document.getElementById("header-container").innerHTML =
      await headerRes.text();

    const userNameSpan = document.getElementById("user-display-name");
    if (userNameSpan) userNameSpan.innerText = `Admin: , ${user.fullName}`;

    // =================================================================
    // TỰ ĐỘNG XÓA MENU MARKETING VÀ THÔNG BÁO ZALO KHỎI GIAO DIỆN
    // =================================================================
    const marketingMenu = document.querySelector('.sidebar-menu a[data-page="marketing.html"]');
    if (marketingMenu) {
        const liItem = marketingMenu.closest('li');
        if (liItem) liItem.remove(); 
        else marketingMenu.remove();
    }

    const zaloMenu = document.querySelector('.sidebar-menu a[data-page="notifications.html"]');
    if (zaloMenu) {
        const liItem = zaloMenu.closest('li');
        if (liItem) liItem.remove();
        else zaloMenu.remove();
    }
    // =================================================================

    filterSidebarMenu(currentRole);
    initMenuRouting();
    initToggleSidebar();
    loadSubPage("courses.html");
  } catch (error) {
    console.error("Lỗi khởi tạo Layout Admin:", error);
    document.getElementById("main-content").innerHTML = `
            <div class="alert alert-danger m-4">Gặp lỗi trong quá trình cấu hình hệ thống. Vui lòng thử lại!</div>
        `;
  }
});

// Hàm lọc menu dựa trên thuộc tính data-role
function filterSidebarMenu(roleCode) {
  // Duyệt qua tất cả các phần tử có gắn data-role (bao gồm cả menu-item và menu-heading)
  const elements = document.querySelectorAll(".sidebar-menu [data-role]");

  elements.forEach((el) => {
    const allowedRoles = el.getAttribute("data-role").split(",");

    // Nếu vai trò hiện tại không nằm trong danh sách được cho phép -> Ẩn phần tử đó đi bằng lớp của Bootstrap
    if (!allowedRoles.includes(roleCode)) {
      el.classList.add("d-none");
    }
  });
}

// Gắn sự kiện click đổi nội dung SPA
function initMenuRouting() {
  const menuLinks = document.querySelectorAll(".sidebar-menu a[data-page]");

  menuLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();

      // Xóa trạng thái active cũ, cập nhật trạng thái active mới
      menuLinks.forEach((m) => m.classList.remove("active"));
      e.currentTarget.classList.add("active");

      // Đọc file cần chuyển hướng và nạp nội dung vào thẻ <main>
      const targetPage = e.currentTarget.getAttribute("data-page");
      window.loadSubPage(targetPage);
    });
  });
}

window.loadSubPage = async function (pageFile) {
  await router.loadPage(`/core/admin/${pageFile}`, "main-content");

  localStorage.setItem("lastPage", pageFile);

  initFloatingScroll();

  if (pageFile === "finance.html" || pageFile === "finance") {
    if (typeof window.initFinanceDashboard === "function") {
      window.initFinanceDashboard();
    } else {
      console.warn(
        "Cảnh báo: Hàm initFinanceDashboard chưa được nạp vào hệ thống toàn cục.",
      );
    }
  }
};

// Hàm khởi tạo chức năng thu gọn/mở rộng Sidebar
function initToggleSidebar() {
  const toggleBtn = document.getElementById("toggle-sidebar-btn");
  const sidebarContainer = document.getElementById("sidebar-container");

  if (toggleBtn && sidebarContainer) {
    toggleBtn.addEventListener("click", function () {
      sidebarContainer.classList.toggle("collapsed");
      // trigger reposition of floating scrollbars after layout change
      setTimeout(() => initFloatingScroll(), 320);
    });
  }
}

// Initialize floating/sticky horizontal scrollbar like Google Sheets
function initFloatingScroll() {
  const container = document.getElementById("main-content");
  if (!container) return;

  const wrappers = container.querySelectorAll(".card-body .table-responsive");
  wrappers.forEach((wrap) => {
    if (wrap.dataset.hScrollReady) return; // avoid double-init

    const table = wrap.querySelector("table");
    if (!table) return;

    // Create floating scrollbar element appended to body
    const hscroll = document.createElement("div");
    hscroll.className = "h-scroll floating-scroll hidden";
    const inner = document.createElement("div");
    inner.className = "h-scroll-inner";
    hscroll.appendChild(inner);
    document.body.appendChild(hscroll);

    // Sync widths
    function syncSize() {
      try {
        const rect = wrap.getBoundingClientRect();
        hscroll.style.left = rect.left + "px";
        hscroll.style.width = rect.width + "px";
        inner.style.width = table.scrollWidth + "px";
      } catch (e) {
        /* ignore */
      }
    }

    // Sync scroll positions
    hscroll.addEventListener("scroll", () => {
      wrap.scrollLeft = hscroll.scrollLeft;
    });
    wrap.addEventListener("scroll", () => {
      hscroll.scrollLeft = wrap.scrollLeft;
    });

    // Show/hide logic: show when wrapper is hovered or when table is in viewport
    let hideTimer = null;
    function show() {
      clearTimeout(hideTimer);
      hscroll.classList.remove("hidden");
      hscroll.classList.add("visible");
    }
    function hideSoon() {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        hscroll.classList.remove("visible");
        hscroll.classList.add("hidden");
      }, 700);
    }

    wrap.addEventListener("mouseenter", show);
    wrap.addEventListener("mouseleave", hideSoon);
    hscroll.addEventListener("mouseenter", show);
    hscroll.addEventListener("mouseleave", hideSoon);

    // Observe visibility in viewport
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            show();
            syncSize();
          } else hideSoon();
        });
      },
      { root: null, threshold: 0.01 },
    );
    io.observe(wrap);

    // Update on resize and mutations
    window.addEventListener("resize", syncSize);
    const mo = new MutationObserver(syncSize);
    mo.observe(table, { childList: true, subtree: true, characterData: true });

    // initial sync
    syncSize();

    wrap.dataset.hScrollReady = "1";
  });
}