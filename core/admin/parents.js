window.parentManager = (() => {
  let parentsList = [];
  let modalInstance = null;
  let linkModalInstance = null;
  let currentPage = 1;
  let totalPages = 1;
  let isLoading = false;
  let currentKeyword = "";
  let currentStatus = "";
  let searchTimeout = null;
  let studentSearchTimer = null; // Debounce tìm kiếm học sinh

  // Biến lưu trữ học sinh đang được chọn để liên kết
  let selectedStudentId_main = null;
  let selectedStudentId_quick = null;

  // ── BIẾN CHO CHỌN NHIỀU ──
  let selectedIds = new Set();
  let isSelectionMode = false;
  let pressTimer = null;
  let didLongPress = false;

  const esc = (str) =>
    String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_REGEX = /^0\d{9}$/;

  // ── ĐIỀU CHỈNH CHIỀU CAO BẢNG ─────────────────────────────────────────────
  const BOTTOM_GAP = 32;

  function adjustTableHeight() {
    const wrapper = document.querySelector(".table-responsive");
    const pagination = document.getElementById("parents-pagination");
    if (!wrapper) return;
    const top = wrapper.getBoundingClientRect().top;
    const paginationHeight = pagination ? pagination.offsetHeight : 0;
    const available = window.innerHeight - top - paginationHeight - BOTTOM_GAP;
    wrapper.style.maxHeight = Math.max(available, 150) + "px";
    wrapper.style.height = "auto";
  }

  window.addEventListener("resize", adjustTableHeight);

  // ── LOGIC CHỌN NHIỀU ──────────────────────────────────────────────────────
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
      parentsList.forEach((p) => selectedIds.add(p.id));
    } else {
      parentsList.forEach((p) => selectedIds.delete(p.id));
      isSelectionMode = false;
    }
    updateBulkDeleteUI();
    parentsList.forEach((p) => updateRowVisuals(p.id));
  }

  function updateRowVisuals(id) {
    const row = document.getElementById(`row-ph-${id}`);
    const checkbox = document.getElementById(`cb-ph-${id}`);
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
    const tbody = document.getElementById("parents-tbody");
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
        parentsList.length > 0 &&
        parentsList.every((p) => selectedIds.has(p.id));
      cbSelectAll.checked = allSelected;
      cbSelectAll.style.setProperty(
        "display",
        isSelectionMode ? "inline-block" : "none",
        "important",
      );
    }
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return;
    const ok = await utils.confirm(
      `Bạn có chắc chắn muốn xóa ${selectedIds.size} phụ huynh đã chọn? Hành động này không thể hoàn tác.`,
      {
        title: "Xóa nhiều phụ huynh?",
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
        api.fetch(`/parents/${id}`, { method: "DELETE" }),
      );
      await Promise.all(deletePromises);
      utils.showToast(
        `Đã xóa thành công ${selectedIds.size} phụ huynh!`,
        "success",
      );
      selectedIds.clear();
      isSelectionMode = false;
      await loadData(currentPage);
    } catch (error) {
      utils.showToast("Có lỗi xảy ra khi xóa một số phụ huynh!", "danger");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-trash-can me-1"></i> Xóa (<span id="selected-count">0</span>)`;
        btn.classList.add("d-none");
      }
      updateBulkDeleteUI();
    }
  }

  // ── 1. TẢI DỮ LIỆU BẢNG ───────────────────────────────────────────────────
  async function loadData(page = 1) {
    if (isLoading) return;
    isLoading = true;
    selectedIds.clear();
    isSelectionMode = false;
    updateBulkDeleteUI();

    const tbody = document.getElementById("parents-tbody");
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4"><span class="spinner-border spinner-border-sm text-danger me-2"></span> Đang tải...</td></tr>`;

    try {
      const queryParams = new URLSearchParams({
        page: page,
        limit: 10,
        keyword: currentKeyword,
        status: currentStatus,
      }).toString();
      const response = await api.fetch(`/parents?${queryParams}`);
      if (!response?.data || !response?.pagination)
        throw new Error("Dữ liệu trả về không hợp lệ");

      parentsList = response.data;
      currentPage = response.pagination.page;
      totalPages = response.pagination.totalPages;

      renderTable(parentsList);
      renderPagination(response.pagination);
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">Lỗi kết nối máy chủ!</td></tr>`;
    } finally {
      isLoading = false;
    }
  }

  function onSearchInput(val) {
    const keyword =
      val !== undefined
        ? val
        : document.getElementById("search-parents")?.value || "";
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

  function renderTable(data) {
    const tbody = document.getElementById("parents-tbody");
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">Chưa có dữ liệu phụ huynh trong hệ thống.</td></tr>`;
      return;
    }
    tbody.innerHTML = data.map(renderRow).join("");
    setTimeout(adjustTableHeight, 50);
  }

  function renderRow(p) {
    const isActive = p.status === "active";
    const studentsHtml =
      p.students && p.students.length
        ? p.students
            .map(
              (s) => `
          <div class="mb-1">
            <div class="fw-medium small text-dark">${esc(s.fullName)}</div>
            <div class="text-muted small">${esc(s.studentCode)}</div>
          </div>`,
            )
            .join("")
        : `<span class="text-muted small">Chưa liên kết</span>`;

    return `
      <tr id="row-ph-${p.id}" class="${selectedIds.has(p.id) ? "table-danger" : ""}" style="transition: background-color 0.2s;">
        <td class="ps-4"
            onmousedown="window.parentManager.startPress(${p.id})"
            onmouseup="window.parentManager.cancelPress()"
            onmouseleave="window.parentManager.cancelPress()"
            ontouchstart="window.parentManager.startPress(${p.id})"
            ontouchend="window.parentManager.cancelPress()"
            onclick="window.parentManager.toggleSelectIfMode(${p.id})"
            style="user-select: none; cursor: pointer; min-width: 120px;"
        >
          <div class="d-flex align-items-center gap-2">
            <input type="checkbox" id="cb-ph-${p.id}" class="select-checkbox m-0" ${selectedIds.has(p.id) ? "checked" : ""} onclick="event.stopPropagation(); window.parentManager.toggleSelection(${p.id})"/>
            <span class="badge bg-light text-dark border">${esc(p.parentCode) || "---"}</span>
          </div>
        </td>
        <td class="cell-text">
          <span class="fw-semibold text-dark">${esc(p.fullName)}</span>
          ${p.occupation ? `<div class="text-muted small">${esc(p.occupation)}</div>` : ""}
        </td>
        <td class="cell-text">${p.phone ? esc(p.phone) : '<span class="text-muted small">Chưa cập nhật</span>'}</td>
        <td class="cell-text"><span class="text-muted small">${esc(p.email)}</span></td>
        <td class="cell-text">${studentsHtml}</td>
        <td><span class="badge ${isActive ? "bg-success" : "bg-danger"} bg-opacity-75">${isActive ? "Hoạt động" : "Đã khóa"}</span></td>
        <td class="text-end pe-4">
          <button class="btn btn-sm btn-light border text-info shadow-sm" onclick="event.stopPropagation(); window.parentManager.openLinkModal(${p.id}, '${esc(p.fullName)}')" title="Liên kết thêm Học sinh">
            <i class="fa-solid fa-link"></i>
          </button>
          <button class="btn btn-sm btn-light border text-primary shadow-sm ms-1" onclick="event.stopPropagation(); window.parentManager.openModal(${p.id})" title="Sửa thông tin">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn btn-sm btn-light border text-${isActive ? "danger" : "success"} shadow-sm ms-1" onclick="event.stopPropagation(); window.parentManager.toggleStatus(${p.id})" title="${isActive ? "Khóa tài khoản" : "Mở khóa tài khoản"}">
            <i class="fa-solid fa-${isActive ? "lock" : "unlock"}"></i>
          </button>
        </td>
      </tr>`;
  }

  function renderPagination({ page, total, totalPages, limit }) {
    const container = document.getElementById("parents-pagination");
    if (!container) return;
    const from = total === 0 ? 0 : (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);
    container.innerHTML = `
      <div class="d-flex justify-content-between align-items-center px-4 py-3 border-top bg-white">
        <span class="text-muted small">Hiển thị <strong>${from}–${to}</strong> / <strong>${total}</strong> phụ huynh</span>
        <ul class="pagination pagination-sm mb-0 gap-1">
          <li class="page-item ${page <= 1 ? "disabled" : ""}"><button class="page-link rounded" onclick="window.parentManager.goToPage(${page - 1})"><i class="fa-solid fa-chevron-left"></i></button></li>
          ${buildPageButtons(page, totalPages)}
          <li class="page-item ${page >= totalPages ? "disabled" : ""}"><button class="page-link rounded" onclick="window.parentManager.goToPage(${page + 1})"><i class="fa-solid fa-chevron-right"></i></button></li>
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
    return `<li class="page-item ${isActive ? "active" : ""}"><button class="page-link rounded ${isActive ? "bg-danger border-danger" : ""}" onclick="window.parentManager.goToPage(${p})">${p}</button></li>`;
  }

  function goToPage(page) {
    if (page < 1 || page > totalPages || isLoading) return;
    loadData(page);
  }

  // ── 2. API TÌM KIẾM VÀ CHỌN HỌC SINH ──────────────────────────────────────
  async function searchStudent(val, context) {
    clearTimeout(studentSearchTimer);
    const resultsEl = document.getElementById(`hs_searchResults_${context}`);

    if (!val.trim()) {
      resultsEl.innerHTML = "";
      document.getElementById(`hs_selectedInfo_${context}`).innerHTML = "";
      if (context === "main") selectedStudentId_main = null;
      else selectedStudentId_quick = null;
      document.getElementById(
        `hs_relationship_container_${context}`,
      ).style.display = "none";
      return;
    }

    resultsEl.innerHTML = `<div class="p-3 text-center text-muted small"><span class="spinner-border spinner-border-sm me-2"></span> Đang tìm kiếm...</div>`;

    studentSearchTimer = setTimeout(async () => {
      try {
        const res = await api.fetch(
          `/students?keyword=${encodeURIComponent(val.trim())}`,
        );
        const list = res?.data || [];

        if (!list.length) {
          resultsEl.innerHTML = `<div class="p-3 text-center text-muted small">Không tìm thấy học sinh.</div>`;
        } else {
          resultsEl.innerHTML = list
            .map(
              (s) => `
            <div class="search-result-item" id="sri_${context}_${s.id}" onclick="window.parentManager.selectStudent(${s.id}, '${esc(s.fullName)}', '${esc(s.studentCode || s.student_code)}', '${context}')">
              <div class="hs-avatar">${esc(s.fullName).charAt(0).toUpperCase()}</div>
              <div class="flex-grow-1">
                <div class="fw-semibold small text-dark">${esc(s.fullName)} <span class="badge bg-light text-dark border ms-1">${esc(s.studentCode || s.student_code || "")}</span></div>
                <div class="text-muted" style="font-size:11px;">
                  <i class="fa-solid fa-cake-candles me-1"></i>${s.dateOfBirth ? esc(s.dateOfBirth).split("T")[0] : "N/A"}
                </div>
              </div>
            </div>
          `,
            )
            .join("");
        }
      } catch (err) {
        resultsEl.innerHTML = `<div class="p-3 text-center text-danger small">Lỗi kết nối khi tìm kiếm.</div>`;
      }
    }, 400);
  }

  function selectStudent(id, name, code, context) {
    if (context === "main") selectedStudentId_main = id;
    else selectedStudentId_quick = id;

    // Highlight
    document
      .querySelectorAll(`#hs_searchResults_${context} .search-result-item`)
      .forEach((el) => el.classList.remove("selected"));
    const el = document.getElementById(`sri_${context}_${id}`);
    if (el) el.classList.add("selected");

    // Info
    document.getElementById(`hs_selectedInfo_${context}`).innerHTML = `
      <div class="alert alert-success py-2 mt-2 mb-0 d-flex align-items-center gap-2 border border-success-subtle">
        <i class="fa-solid fa-circle-check fs-4 text-success"></i> 
        <div>
          <div class="fw-bold text-dark small mb-1">Đã chọn Học sinh:</div>
          <div class="small text-dark mb-0"><strong>${name}</strong> — Mã HS: ${code}</div>
        </div>
      </div>`;

    // Hiện khung chọn quan hệ
    document.getElementById(
      `hs_relationship_container_${context}`,
    ).style.display = "block";
  }

  // ── 3. MODAL THÊM / SỬA CHÍNH ─────────────────────────────────────────────
  function openModal(id = null) {
    const modalEl = document.getElementById("parentModal");
    if (!modalEl) return;
    modalInstance ??= new bootstrap.Modal(modalEl);

    document.getElementById("parentForm").reset();
    document.getElementById("ph_id").value = "";

    // Reset khung tìm kiếm học sinh
    selectedStudentId_main = null;
    document.getElementById("hs_searchInput_main").value = "";
    document.getElementById("hs_searchResults_main").innerHTML = "";
    document.getElementById("hs_selectedInfo_main").innerHTML = "";
    document.getElementById("hs_relationship_container_main").style.display =
      "none";
    document.getElementById("ph_relationship_main").value = "Bố";

    const passContainer = document.getElementById("ph_password_container");
    const passLabel = document.getElementById("ph_password_label");
    const passInput = document.getElementById("ph_password");

    // Lấy container của phần liên kết học sinh
    const linkStudentSection = document.getElementById(
      "section_link_student_main",
    );

    if (id) {
      // CHẾ ĐỘ SỬA HỒ SƠ
      const p = parentsList.find((x) => x.id === id);
      if (!p) return;
      document.getElementById("parentModalTitle").innerText =
        "Sửa hồ sơ phụ huynh";
      document.getElementById("ph_id").value = p.id;
      document.getElementById("ph_fullName").value = p.fullName;
      document.getElementById("ph_email").value = p.email;
      document.getElementById("ph_phone").value = p.phone || "";
      document.getElementById("ph_occupation").value = p.occupation || "";
      document.getElementById("ph_address").value = p.address || "";

      passLabel.innerHTML = `Đặt lại mật khẩu <span class="text-muted fw-normal">(để trống nếu không đổi)</span>`;
      passInput.placeholder = "Nhập mật khẩu mới...";

      // Ẩn phần liên kết học sinh khi sửa
      if (linkStudentSection) linkStudentSection.style.display = "none";
    } else {
      // CHẾ ĐỘ THÊM MỚI
      document.getElementById("parentModalTitle").innerText =
        "Thêm phụ huynh mới";
      passLabel.innerHTML = `Mật khẩu khởi tạo <span class="text-danger">*</span>`;
      passInput.placeholder = "Mật khẩu ban đầu";

      // Hiện phần liên kết học sinh khi thêm mới
      if (linkStudentSection) linkStudentSection.style.display = "block";
    }
    modalInstance.show();
  }

  async function saveData() {
    const id = document.getElementById("ph_id").value;
    const payload = {
      fullName: document.getElementById("ph_fullName").value.trim(),
      email: document.getElementById("ph_email").value.trim(),
      phone: document.getElementById("ph_phone").value.trim(),
      occupation: document.getElementById("ph_occupation").value.trim() || null,
      address: document.getElementById("ph_address").value.trim() || null,
    };

    if (!payload.fullName || !payload.email || !payload.phone)
      return utils.showToast("Vui lòng điền đủ thông tin bắt buộc!", "warning");
    if (payload.fullName.split(/\s+/).length < 2)
      return utils.showToast(
        "Vui lòng nhập họ tên đầy đủ (ít nhất 2 từ)!",
        "warning",
      );
    if (!EMAIL_REGEX.test(payload.email))
      return utils.showToast("Email không hợp lệ!", "warning");
    if (!PHONE_REGEX.test(payload.phone))
      return utils.showToast("Số điện thoại không hợp lệ!", "warning");

    const password = document.getElementById("ph_password").value.trim();
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
      if (!password)
        return utils.showToast("Vui lòng nhập mật khẩu!", "warning");
      if (password.length < 6)
        return utils.showToast("Mật khẩu phải có ít nhất 6 ký tự!", "warning");
      payload.password = password;
    }

    // Đẩy thêm thông tin liên kết học sinh nếu có (chỉ có tác dụng khi thêm mới vì khi sửa đã bị ẩn)
    if (!id && selectedStudentId_main) {
      payload.studentId = selectedStudentId_main;
      payload.relationship = document.getElementById(
        "ph_relationship_main",
      ).value;
    }

    const btnSave = document.getElementById("btn-save-parent");
    btnSave.disabled = true;
    btnSave.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Đang lưu...`;

    try {
      if (id) {
        await api.fetch(`/parents/${id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        utils.showToast("Cập nhật thành công!", "success");
      } else {
        const response = await api.fetch("/parents/create", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (response?.message && !response?.data)
          return utils.showToast(response.message, "danger");
        utils.showToast(
          response?.message || "Thêm phụ huynh thành công!",
          "success",
        );
      }
      modalInstance.hide();
      await loadData(currentPage);
    } catch (error) {
      utils.showToast("Lỗi hệ thống khi lưu dữ liệu!", "danger");
    } finally {
      btnSave.disabled = false;
      btnSave.innerHTML = `<i class="fa-solid fa-check me-1"></i> Lưu phụ huynh`;
    }
  }

  // ── 4. MODAL LIÊN KẾT NHANH ───────────────────────────────────────────────
  function openLinkModal(parentId, parentName) {
    const modalEl = document.getElementById("linkStudentModal");
    if (!modalEl) return;
    linkModalInstance ??= new bootstrap.Modal(modalEl);

    document.getElementById("link_ph_id").value = parentId;
    document.getElementById("link_ph_name").textContent = parentName;

    // Reset khung
    selectedStudentId_quick = null;
    document.getElementById("hs_searchInput_quick").value = "";
    document.getElementById("hs_searchResults_quick").innerHTML = "";
    document.getElementById("hs_selectedInfo_quick").innerHTML = "";
    document.getElementById("hs_relationship_container_quick").style.display =
      "none";
    document.getElementById("ph_relationship_quick").value = "Bố";

    linkModalInstance.show();
  }

  async function saveQuickLink() {
    const parentId = document.getElementById("link_ph_id").value;
    const relationship = document.getElementById("ph_relationship_quick").value;

    if (!selectedStudentId_quick)
      return utils.showToast(
        "Vui lòng chọn một học sinh để liên kết!",
        "warning",
      );

    const btnSave = document.getElementById("btn-save-quick-link");
    btnSave.disabled = true;
    btnSave.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Đang lưu...`;

    try {
      await api.fetch(`/parents/link-student`, {
        method: "POST",
        body: JSON.stringify({
          parentId: parentId,
          studentId: selectedStudentId_quick,
          relationship: relationship,
        }),
      });
      utils.showToast("Liên kết học sinh thành công!", "success");
      linkModalInstance.hide();
      loadData(currentPage);
    } catch (err) {
      utils.showToast("Có lỗi xảy ra khi liên kết!", "danger");
    } finally {
      btnSave.disabled = false;
      btnSave.innerHTML = `<i class="fa-solid fa-link me-1"></i> Lưu Liên Kết`;
    }
  }

  // ── 5. THAY ĐỔI TRẠNG THÁI ───────────────────────────────────────────────
  async function toggleStatus(id) {
    const p = parentsList.find((x) => x.id === id);
    if (!p) return;
    const ok = await utils.confirm(
      "Tài khoản phụ huynh sẽ bị thay đổi trạng thái đăng nhập.",
      {
        title: "Thay đổi trạng thái?",
        confirmText: "Xác nhận",
        cancelText: "Hủy bỏ",
        type: "danger",
      },
    );
    if (!ok) return;

    const newStatus = p.status === "active" ? "inactive" : "active";
    try {
      await api.fetch(`/parents/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      p.status = newStatus;
      renderTable(parentsList);
      utils.showToast(
        `Đã ${newStatus === "active" ? "mở khóa" : "khóa"} tài khoản phụ huynh!`,
        "success",
      );
    } catch (error) {
      utils.showToast(
        "Có lỗi xảy ra, không thể thay đổi trạng thái!",
        "danger",
      );
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
    searchStudent,
    selectStudent,
    openLinkModal,
    saveQuickLink,
  };
})();
