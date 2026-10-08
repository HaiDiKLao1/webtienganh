const utils = {
  // Format tiền Việt Nam (VNĐ)
  formatCurrency(amount) {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(amount);
  },

  // Format ngày tháng (DD/MM/YYYY)
  formatDate(dateString) {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("vi-VN");
  },

  // Hiển thị ngày giờ chi tiết
  formatDateTime(dateString) {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleString("vi-VN");
  },

  showToast(message, type = "success", duration = 3500) {
    const CONFIG = {
      success: { icon: "fa-circle-check", title: "Thành công" },
      danger: { icon: "fa-circle-xmark", title: "Lỗi" },
      warning: { icon: "fa-triangle-exclamation", title: "Cảnh báo" },
      info: { icon: "fa-circle-info", title: "Thông tin" },
    };

    const COLORS = {
      success: { bar: "#1D9E75", icon: "#0F6E56" },
      danger: { bar: "#E24B4A", icon: "#A32D2D" },
      warning: { bar: "#EF9F27", icon: "#854F0B" },
      info: { bar: "#378ADD", icon: "#185FA5" },
    };

    // Tạo container nếu chưa có
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      Object.assign(container.style, {
        position: "fixed",
        top: "20px",
        right: "20px",
        zIndex: "9999",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        pointerEvents: "none",
      });

      // Inject CSS một lần duy nhất
      const style = document.createElement("style");
      style.textContent = `
                  .ut-toast {
                      display: flex; align-items: flex-start; gap: 12px;
                      padding: 14px 16px;
                      border-radius: 12px;
                      background: #fff;
                      border: 0.5px solid rgba(0,0,0,0.10);
                      box-shadow: 0 4px 16px rgba(0,0,0,0.10);
                      min-width: 280px; max-width: 360px;
                      pointer-events: all;
                      position: relative; overflow: hidden;
                      transform: translateX(120%); opacity: 0;
                      transition: transform 0.32s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease;
                  }
                  .ut-toast.show  { transform: translateX(0); opacity: 1; }
                  .ut-toast.hide  { transform: translateX(120%); opacity: 0;
                                    transition: transform 0.25s ease, opacity 0.2s ease; }
                  .ut-toast-icon  { font-size: 20px; flex-shrink: 0; margin-top: 1px; }
                  .ut-toast-body  { flex: 1; min-width: 0; }
                  .ut-toast-title { font-size: 14px; font-weight: 600; color: #111; margin: 0 0 2px; }
                  .ut-toast-msg   { font-size: 13px; color: #555; margin: 0; line-height: 1.5; }
                  .ut-toast-close { background: none; border: none; padding: 0; cursor: pointer;
                                    font-size: 16px; color: #aaa; flex-shrink: 0; line-height: 1; }
                  .ut-toast-close:hover { color: #333; }
                  .ut-toast-bar   { position: absolute; bottom: 0; left: 0; height: 3px;
                                    animation: utProgress linear forwards; }
                  @keyframes utProgress { from { width: 100%; } to { width: 0%; } }
              `;
      document.head.appendChild(style);
      document.body.appendChild(container);
    }

    const cfg = CONFIG[type] || CONFIG.info;
    const colors = COLORS[type] || COLORS.info;

    // Tách title | message nếu có dấu "|"
    const parts = message.split("|");
    const title = parts.length > 1 ? parts[0].trim() : cfg.title;
    const msg = parts.length > 1 ? parts[1].trim() : parts[0].trim();

    const el = document.createElement("div");
    el.className = "ut-toast";
    el.setAttribute("role", "alert");
    el.innerHTML = `
              <i class="fa-solid ${cfg.icon} ut-toast-icon" style="color:${colors.icon}" aria-hidden="true"></i>
              <div class="ut-toast-body">
                  <p class="ut-toast-title">${title}</p>
                  <p class="ut-toast-msg">${msg}</p>
              </div>
              <button class="ut-toast-close" aria-label="Đóng">
                  <i class="fa-solid fa-xmark"></i>
              </button>
              <div class="ut-toast-bar" style="background:${colors.bar}; animation-duration:${duration}ms"></div>
          `;

    container.appendChild(el);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => el.classList.add("show")),
    );

    const dismiss = () => {
      el.classList.replace("show", "hide");
      el.addEventListener("transitionend", () => el.remove(), { once: true });
    };

    el.querySelector(".ut-toast-close").addEventListener("click", dismiss);
    setTimeout(dismiss, duration);
  },

  confirm(message, options = {}) {
    return new Promise((resolve) => {
      const {
        title = "Xác nhận",
        confirmText = "Xác nhận",
        cancelText = "Hủy bỏ",
        type = "danger",
      } = options;

      const COLORS = {
        danger: {
          icon: "fa-triangle-exclamation",
          iconColor: "#A32D2D",
          bg: "#FCEBEB",
          btnClass: "btn-danger",
        },
        warning: {
          icon: "fa-circle-exclamation",
          iconColor: "#854F0B",
          bg: "#FAEEDA",
          btnClass: "btn-warning",
        },
        info: {
          icon: "fa-circle-question",
          iconColor: "#185FA5",
          bg: "#E6F1FB",
          btnClass: "btn-primary",
        },
      };

      const cfg = COLORS[type] || COLORS.danger;

      // Inject CSS một lần
      if (!document.getElementById("ut-confirm-style")) {
        const style = document.createElement("style");
        style.id = "ut-confirm-style";
        style.textContent = `
          .ut-confirm-overlay {
            position: fixed; inset: 0; z-index: 99999;
            background: rgba(0,0,0,0.35);
            display: flex; align-items: center; justify-content: center;
            opacity: 0; transition: opacity 0.2s ease;
          }
          .ut-confirm-overlay.show { opacity: 1; }
          .ut-confirm-box {
            background: #fff;
            border-radius: 16px;
            padding: 28px 28px 24px;
            width: 100%; max-width: 380px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.15);
            transform: scale(0.92) translateY(12px);
            transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease;
            opacity: 0;
          }
          .ut-confirm-overlay.show .ut-confirm-box {
            transform: scale(1) translateY(0);
            opacity: 1;
          }
          .ut-confirm-icon-wrap {
            width: 52px; height: 52px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            margin: 0 auto 16px; font-size: 22px;
          }
          .ut-confirm-title {
            font-size: 16px; font-weight: 600; color: #111;
            text-align: center; margin: 0 0 8px;
          }
          .ut-confirm-msg {
            font-size: 14px; color: #666; text-align: center;
            margin: 0 0 24px; line-height: 1.6;
          }
          .ut-confirm-actions {
            display: flex; gap: 10px;
          }
          .ut-confirm-actions button {
            flex: 1; padding: 10px;
            border-radius: 8px; border: none;
            font-size: 14px; font-weight: 500;
            cursor: pointer; transition: opacity 0.15s, transform 0.1s;
          }
          .ut-confirm-actions button:active { transform: scale(0.97); }
          .ut-confirm-btn-cancel {
            background: #f1f1f1; color: #444;
          }
          .ut-confirm-btn-cancel:hover { background: #e5e5e5; }
          .ut-confirm-btn-confirm {
            color: #fff;
          }
          .ut-confirm-btn-confirm:hover { opacity: 0.88; }
        `;
        document.head.appendChild(style);
      }

      // Tạo overlay
      const overlay = document.createElement("div");
      overlay.className = "ut-confirm-overlay";
      overlay.innerHTML = `
        <div class="ut-confirm-box">
          <div class="ut-confirm-icon-wrap" style="background:${cfg.bg}">
            <i class="fa-solid ${cfg.icon}" style="color:${cfg.iconColor}"></i>
          </div>
          <p class="ut-confirm-title">${title}</p>
          <p class="ut-confirm-msg">${message}</p>
          <div class="ut-confirm-actions">
            <button class="ut-confirm-btn-cancel">${cancelText}</button>
            <button class="ut-confirm-btn-confirm" style="background:${cfg.iconColor}">${confirmText}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => overlay.classList.add("show")),
      );

      const close = (result) => {
        overlay.classList.remove("show");
        overlay.addEventListener(
          "transitionend",
          () => {
            overlay.remove();
            resolve(result);
          },
          { once: true },
        );
      };

      overlay
        .querySelector(".ut-confirm-btn-cancel")
        .addEventListener("click", () => close(false));
      overlay
        .querySelector(".ut-confirm-btn-confirm")
        .addEventListener("click", () => close(true));

      // Click ra ngoài để hủy
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close(false);
      });
    });
  },

  calculateAge(dateOfBirth) {
    const today = new Date();
    const dob = new Date(dateOfBirth);
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  },

  generatePassFromDob: (dobValue) => {
    if (!dobValue) return "";
    const parts = dobValue.split("-");
    if (parts.length === 3) {
      const [year, month, day] = parts;
      return `${day}${month}${year}`;
    }
    return "";
  },
};
