window.teacherManager = (() => {
  let teachersList = [];
  let modalInstance = null;
  let currentPage = 1;
  let totalPages = 1;
  let isLoading = false;

  let currentKeyword = "";
  let currentStatus = "";
  let searchTimeout = null;

  let selectedIds = new Set();
  let isSelectionMode = false;
  let pressTimer = null;
  let didLongPress = false;

  // ĐÃ BỔ SUNG: Khai báo biến này để tránh lỗi trong hàm generateTeacherPass
  let currentEditingId = null;

  const esc = (str) =>
    String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const EMAIL_REGEX = /^[^\s@]+@gmail\.com$/;
  const PHONE_REGEX = /^(0[3|5|7|8|9])[0-9]{8}$/;

  // ── ĐIỀU CHỈNH CHIỀU CAO BẢNG THEO CỬA SỔ ────────────────────────────────
  const BOTTOM_GAP = 32;

  function adjustTableHeight() {
    const wrapper = document.querySelector(".table-responsive");
    const pagination = document.getElementById("teachers-pagination");
    if (!wrapper) return;

    const top = wrapper.getBoundingClientRect().top;
    const paginationHeight = pagination ? pagination.offsetHeight : 0;
    const available = window.innerHeight - top - paginationHeight - BOTTOM_GAP;

    wrapper.style.maxHeight = Math.max(available, 150) + "px";
    wrapper.style.height = "auto";
  }

  window.addEventListener("resize", adjustTableHeight);

  function onSearchInput(val) {
    const keyword =
      val !== undefined
        ? val
        : document.getElementById("search-tearchers")?.value || "";
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentKeyword = keyword.trim();
      loadData(1);
    }, 500);
  }

  function onStatusChange(value) {
    const select = document.getElementById("filter-status");
    currentStatus = select ? select.value : "";
    loadData(1);
  }

  function generateTeacherPass(dobValue) {
    const passInput = document.getElementById("gv_password");
    // Giả định hàm generatePassFromDob có tồn tại trong utils
    const generatedPass = utils.generatePassFromDob
      ? utils.generatePassFromDob(dobValue)
      : dobValue.replace(/-/g, "");

    if (generatedPass) {
      passInput.value = generatedPass;
      // validateField("gv_password", "password"); // Tạm ẩn nếu validateField chưa được khai báo
    } else {
      if (!currentEditingId) passInput.value = "";
    }
  }

  // ── LOGIC CHỌN NHIỀU (CHỈ KÍCH HOẠT KHI NHẤN GIỮ VÀO Ô MÃ GV) ──
  function startPress(id) {
    if (isSelectionMode) return;
    didLongPress = false;
    pressTimer = setTimeout(() => {
      didLongPress = true;
      isSelectionMode = true;
      toggleSelection(id);
      if (navigator.vibrate) navigator.vibrate(50);
    }, 500);
  }

  function cancelPress() {
    if (pressTimer) clearTimeout(pressTimer);
  }

  function toggleSelectIfMode(id) {
    if (didLongPress) {
      didLongPress = false;
      return;
    }
    if (isSelectionMode) toggleSelection(id);
  }

  function toggleSelection(id) {
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);

    if (selectedIds.size === 0) isSelectionMode = false;
    updateBulkDeleteUI();
    updateRowVisuals(id);
  }

  function toggleSelectAll(isChecked) {
    if (isChecked) {
      isSelectionMode = true;
      teachersList.forEach((t) => selectedIds.add(t.id));
    } else {
      teachersList.forEach((t) => selectedIds.delete(t.id));
      isSelectionMode = false;
    }
    updateBulkDeleteUI();
    teachersList.forEach((t) => updateRowVisuals(t.id));
  }

  function updateRowVisuals(id) {
    const row = document.getElementById(`row-gv-${id}`);
    const checkbox = document.getElementById(`cb-gv-${id}`);
    if (!row) return;
    if (selectedIds.has(id)) {
      row.classList.add("table-danger");
      if (checkbox) checkbox.checked = true;
    } else {
      row.classList.remove("table-danger");
      if (checkbox) checkbox.checked = false;
    }
  }

  function updateBulkDeleteUI() {
    const tbody = document.getElementById("teachers-tbody");
    const btn = document.getElementById("btn-bulk-delete");
    const countSpan = document.getElementById("selected-count");
    const cbSelectAll = document.getElementById("cb-select-all");

    if (tbody) {
      if (isSelectionMode) tbody.classList.add("selection-mode");
      else tbody.classList.remove("selection-mode");
    }

    if (btn && countSpan) {
      if (selectedIds.size > 0) {
        btn.classList.remove("d-none");
        countSpan.innerText = selectedIds.size;
      } else {
        btn.classList.add("d-none");
      }
    }

    if (cbSelectAll) {
      const allSelected =
        teachersList.length > 0 &&
        teachersList.every((t) => selectedIds.has(t.id));
      cbSelectAll.checked = allSelected;
      cbSelectAll.style.setProperty(
        "display",
        isSelectionMode ? "block" : "none",
        "important",
      );
    }
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return;

    const ok = await utils.confirm(
      `Bạn có chắc chắn muốn xóa ${selectedIds.size} giáo viên đã chọn? Hành động này không thể hoàn tác.`,
      {
        title: "Xóa nhiều giáo viên?",
        confirmText: "Xóa tất cả",
        cancelText: "Hủy bỏ",
        type: "danger",
      },
    );
    if (!ok) return;

    const btn = document.getElementById("btn-bulk-delete");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Đang xóa...`;

    try {
      const deletePromises = Array.from(selectedIds).map((id) =>
        api.fetch(`/teachers/${id}`, { method: "DELETE" }),
      );
      await Promise.all(deletePromises);

      utils.showToast(
        `Đã xóa thành công ${selectedIds.size} giáo viên!`,
        "success",
      );
      selectedIds.clear();
      isSelectionMode = false;
      await loadData(currentPage);
    } catch (error) {
      console.error("Lỗi khi xóa nhiều:", error);
      utils.showToast("Có lỗi xảy ra khi xóa một số giáo viên!", "danger");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-trash-can me-1"></i> Xóa (<span id="selected-count">0</span>)`;
        btn.classList.add("d-none");
      }
      updateBulkDeleteUI();
    }
  }

  // ── 1. TẢI DỮ LIỆU (GET) ──────────────────────────────────────────────────
  async function loadData(page = 1) {
    if (isLoading) return;
    isLoading = true;

    selectedIds.clear();
    isSelectionMode = false;
    updateBulkDeleteUI();

    const tbody = document.getElementById("teachers-tbody");
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4"><span class="spinner-border spinner-border-sm text-danger me-2"></span> Đang tải...</td></tr>`;

    try {
      const queryParams = new URLSearchParams({
        page: page,
        limit: 10,
        keyword: currentKeyword,
        status: currentStatus,
      }).toString();
      const response = await api.fetch(`/teachers?${queryParams}`);
      if (!response?.data || !response?.pagination)
        throw new Error("Dữ liệu trả về không hợp lệ");

      teachersList = response.data;
      currentPage = response.pagination.page;
      totalPages = response.pagination.totalPages;

      renderTable(teachersList);
      renderPagination(response.pagination);
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger py-4">Lỗi kết nối máy chủ!</td></tr>`;
    } finally {
      isLoading = false;
    }
  }

  // ── 2. RENDER BẢNG ────────────────────────────────────────────────────────
  function renderTable(data) {
    const tbody = document.getElementById("teachers-tbody");
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4">Không tìm thấy giáo viên.</td></tr>`;
      return;
    }
    tbody.innerHTML = data.map(renderRow).join("");

    setTimeout(adjustTableHeight, 50);
  }

  function renderRow(t) {
    const genderStr =
      t.gender === "male" ? "Nam" : t.gender === "female" ? "Nữ" : "Khác";
    const salaryHtml = t.monthlySalary
      ? utils.formatCurrency(t.monthlySalary)
      : "0 đ";
    const isActive = t.status === "active";

    return `
      <tr id="row-gv-${t.id}" class="${selectedIds.has(t.id) ? "table-danger" : ""}" style="transition: background-color 0.2s;">
        <td class="ps-4"
            onmousedown="window.teacherManager.startPress(${t.id})"
            onmouseup="window.teacherManager.cancelPress()"
            onmouseleave="window.teacherManager.cancelPress()"
            ontouchstart="window.teacherManager.startPress(${t.id})"
            ontouchend="window.teacherManager.cancelPress()"
            onclick="window.teacherManager.toggleSelectIfMode(${t.id})"
            style="user-select: none; cursor: pointer; min-width: 120px;"
        >
          <div class="d-flex align-items-center gap-2">
            <input type="checkbox" id="cb-gv-${t.id}" class="select-checkbox m-0"
                   ${selectedIds.has(t.id) ? "checked" : ""}
                   onclick="event.stopPropagation(); window.teacherManager.toggleSelection(${t.id})" />
            <span class="badge bg-light text-dark border">${esc(t.teacherCode) || "---"}</span>
          </div>
        </td>
        <td class="cell-text"><span class="fw-semibold text-dark">${esc(t.fullName)}</span></td>
        <td class="cell-text">${esc(t.email)}</td>
        <td class="cell-text">${t.phone ? esc(t.phone) : '<span class="text-muted small">Chưa cập nhật</span>'}</td>
        <td class="cell-text">${genderStr}</td>
        <td class="cell-text">${
          t.currentClasses
            ? `<div class="fw-semibold text-dark small">${esc(t.currentClasses)}</div>`
            : `<span class="text-muted small">Chưa phân công</span>`
        }</td>
        <td class="cell-text fw-semibold text-success">${salaryHtml}</td>
        <td>
          <span class="badge ${isActive ? "bg-success" : "bg-danger"} bg-opacity-75">${isActive ? "Hoạt động" : "Đã khóa"}</span>
        </td>
        <td class="text-end pe-4">
          <button class="btn btn-sm btn-light border text-primary shadow-sm" onclick="event.stopPropagation(); window.teacherManager.openModal(${t.id})" title="Sửa thông tin">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn btn-sm btn-light border text-${isActive ? "danger" : "success"} shadow-sm ms-1" onclick="event.stopPropagation(); window.teacherManager.toggleStatus(${t.id})" title="${isActive ? "Khóa tài khoản" : "Mở khóa tài khoản"}">
            <i class="fa-solid fa-${isActive ? "lock" : "unlock"}"></i>
          </button>
        </td>
      </tr>`;
  }

  // ── 3. PHÂN TRANG ─────────────────────────────────────────────────────────
  function renderPagination({ page, total, totalPages, limit }) {
    const container = document.getElementById("teachers-pagination");
    if (!container) return;
    const from = total === 0 ? 0 : (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);

    container.innerHTML = `
      <div class="d-flex justify-content-between align-items-center px-4 py-3 border-top bg-white">
        <span class="text-muted small">Hiển thị <strong>${from}–${to}</strong> / <strong>${total}</strong> giáo viên</span>
        <ul class="pagination pagination-sm mb-0 gap-1">
          <li class="page-item ${page <= 1 ? "disabled" : ""}"><button class="page-link rounded" onclick="window.teacherManager.goToPage(${page - 1})"><i class="fa-solid fa-chevron-left"></i></button></li>
          ${buildPageButtons(page, totalPages)}
          <li class="page-item ${page >= totalPages ? "disabled" : ""}"><button class="page-link rounded" onclick="window.teacherManager.goToPage(${page + 1})"><i class="fa-solid fa-chevron-right"></i></button></li>
        </ul>
      </div>`;

    adjustTableHeight();
  }

  function buildPageButtons(page, totalPages) {
    const delta = 2;
    const rangeStart = Math.max(1, page - delta);
    const rangeEnd = Math.min(totalPages, page + delta);
    let html = "";
    if (rangeStart > 1) {
      html += buildPageBtn(1);
      if (rangeStart > 2)
        html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
    }
    for (let i = rangeStart; i <= rangeEnd; i++)
      html += buildPageBtn(i, i === page);
    if (rangeEnd < totalPages) {
      if (rangeEnd < totalPages - 1)
        html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
      html += buildPageBtn(totalPages);
    }
    return html;
  }

  function buildPageBtn(p, isActive = false) {
    return `<li class="page-item ${isActive ? "active" : ""}"><button class="page-link rounded ${isActive ? "bg-danger border-danger" : ""}" onclick="window.teacherManager.goToPage(${p})">${p}</button></li>`;
  }

  function goToPage(page) {
    if (page < 1 || page > totalPages || isLoading) return;
    loadData(page);
  }

  // ── 4. MODAL ──────────────────────────────────────────────────────────────
  function openModal(id = null) {
    const modalEl = document.getElementById("teacherModal");
    if (!modalEl) return;
    modalInstance ??= new bootstrap.Modal(modalEl);
    document.getElementById("teacherForm").reset();
    document.getElementById("gv_id").value = "";

    const codeContainer = document.getElementById("gv_code_container");
    const passContainer = document.getElementById("password_container");
    const codeInput = document.getElementById("gv_code");
    const passInput = document.getElementById("gv_password");
    const passLabel = document.querySelector("#password_container label");

    // ĐÃ BỔ SUNG: Gán ID hiện tại đang sửa vào biến toàn cục
    currentEditingId = id;

    if (id) {
      const t = teachersList.find((x) => x.id === id);
      if (!t) return;
      document.getElementById("teacherModalTitle").innerText =
        "Cập nhật thông tin Giáo viên";
      document.getElementById("gv_id").value = t.id;
      document.getElementById("gv_fullName").value = t.fullName;
      document.getElementById("gv_email").value = t.email;
      document.getElementById("gv_phone").value = t.phone || "";
      document.getElementById("gv_salary").value = t.monthlySalary || 0;
      document.getElementById("gv_gender").value = t.gender || "male";
      const dob = (t.dob || t.dateOfBirth || "").split("T")[0];
      if (dob) document.getElementById("gv_dob").value = dob;

      codeInput.value = t.teacherCode || "";
      codeInput.setAttribute("readonly", true);
      codeInput.classList.add("bg-light", "text-muted");

      // MỞ KHÓA MẬT KHẨU KHI SỬA
      passLabel.innerHTML = `Đặt lại mật khẩu <span class="text-muted fw-normal">(để trống nếu không đổi)</span>`;
      passInput.placeholder = "Nhập mật khẩu mới để cấp lại...";
      passInput.required = false;
      passInput.removeAttribute("readonly");
      passInput.classList.remove("bg-light", "text-muted");

      codeContainer.style.display = "block";
    } else {
      document.getElementById("teacherModalTitle").innerText =
        "Thêm Giáo viên Mới";
      document.getElementById("gv_salary").value = "200000";

      codeInput.removeAttribute("readonly");
      codeInput.classList.remove("bg-light", "text-muted");

      // KHÓA MẬT KHẨU KHI TẠO MỚI (CHỈ TẠO TỪ NGÀY SINH)
      passLabel.innerHTML = `Mật khẩu (Tự động) <span class="text-danger">*</span>`;
      passInput.placeholder = "Tự động tạo theo ngày sinh...";
      passInput.required = true;
      passInput.setAttribute("readonly", true);
      passInput.classList.add("bg-light", "text-muted");

      codeContainer.style.display = "none";
    }
    modalInstance.show();
  }

  // ── 5. LƯU DỮ LIỆU ───────────────────────────────────────────────────────
  async function saveData() {
    const id = document.getElementById("gv_id").value;
    const payload = {
      fullName: document.getElementById("gv_fullName").value.trim(),
      email: document.getElementById("gv_email").value.trim(),
      phone: document.getElementById("gv_phone").value.trim(),
      dateOfBirth: document.getElementById("gv_dob").value,
      gender: document.getElementById("gv_gender").value,
      monthlySalary:
        parseFloat(document.getElementById("gv_salary").value) || 0,
    };

    if (
      !payload.fullName ||
      !payload.email ||
      !payload.phone ||
      !payload.dateOfBirth ||
      !payload.gender
    )
      return utils.showToast("Vui lòng điền đủ thông tin!", "warning");
    if (!EMAIL_REGEX.test(payload.email))
      return utils.showToast("Email không hợp lệ!", "warning");
    if (!PHONE_REGEX.test(payload.phone))
      return utils.showToast("Số điện thoại không hợp lệ!", "warning");
    if (payload.monthlySalary <= 0)
      return utils.showToast("Lương phải lớn hơn 0!", "warning");
    if (utils.calculateAge && utils.calculateAge(payload.dateOfBirth) < 18)
      return utils.showToast("Giáo viên phải từ 18 tuổi trở lên!", "warning");

    const password = document.getElementById("gv_password").value.trim();
    if (id) {
      if (password) {
        if (password.length < 6)
          return utils.showToast(
            "Mật khẩu phải có ít nhất 6 ký tự!",
            "warning",
          );
        payload.password = password;
      }
    } else {
      if (!password || password.length < 6)
        return utils.showToast(
          "Vui lòng nhập ngày sinh để tạo mật khẩu!",
          "warning",
        );
      payload.password = password;
    }

    try {
      if (id) {
        await api.fetch(`/teachers/${id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        utils.showToast("Cập nhật thành công!", "success");
      } else {
        const response = await api.fetch("/teachers/create", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (response?.message && !response?.data)
          return utils.showToast(response.message, "danger");
        utils.showToast(
          response?.message || "Thêm giáo viên thành công!",
          "success",
        );
      }
      modalInstance.hide();
      await loadData(currentPage);
    } catch (error) {
      utils.showToast("Có lỗi xảy ra trong quá trình lưu dữ liệu!", "danger");
    }
  }

  // ── 6. THAY ĐỔI TRẠNG THÁI ───────────────────────────────────────────────
  async function toggleStatus(id) {
    const t = teachersList.find((x) => x.id === id);
    if (!t) return;
    const ok = await utils.confirm(
      "Thay đổi trạng thái đăng nhập của giáo viên?",
      { title: "Xác nhận", type: "danger" },
    );
    if (!ok) return;

    const newStatus = t.status === "active" ? "inactive" : "active";
    try {
      await api.fetch(`/teachers/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      t.status = newStatus;
      renderTable(teachersList);
      utils.showToast("Đã thay đổi trạng thái!", "success");
    } catch (error) {
      utils.showToast("Lỗi cập nhật trạng thái!", "danger");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      adjustTableHeight();
      loadData(1);
    });
  } else {
    adjustTableHeight();
    loadData(1);
  }

  return {
    loadData,
    goToPage,
    openModal,
    saveData,
    toggleStatus,
    onSearchInput,
    onStatusChange,
    startPress,
    cancelPress,
    toggleSelectIfMode,
    toggleSelection,
    toggleSelectAll,
    deleteSelected,
    generateTeacherPass,
  };
})();
