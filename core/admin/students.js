window.studentManager = (() => {
  let studentsList = [];
  let modalInstance = null;
  let currentStep = 1;
  let parentTab = "new";
  let selectedParentId = null;
  let currentPage = 1;
  let totalPages = 1;
  let isLoading = false;
  let currentEditingId = null;
  let currentKeyword = "";
  let currentStatus = "";
  let searchTimeout = null;
  let parentSearchTimer = null;

  // ── BIẾN CHO CHỌN NHIỀU ──
  let selectedIds = new Set();
  let isSelectionMode = false;
  let pressTimer = null;
  let didLongPress = false;

  // ── ESCAPE HTML ───────────────────────────────────
  const esc = (str) =>
    String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  // ── VALIDATION RULES MỚI (Dùng chung cho Toast) ──
  const RULES = {
    fullName: {
      test: (v) =>
        v.trim().split(/\s+/).length >= 2 && /^[\p{L}\s]+$/u.test(v.trim()),
      msg: "Vui lòng nhập đầy đủ thông tin",
    },
    phone: {
      test: (v) => /^0\d{9}$/.test(v.trim()),
      msg: "Số điện thoại không hợp lệ",
    },
    email: {
      test: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
      msg: "Email không hợp lệ",
    },
    password: {
      test: (v) => v.length >= 6,
      msg: "Mật khẩu phải có ít nhất 6 ký tự",
    },
    dob: {
      test: (v) => {
        if (!v) return false;
        const birth = new Date(v);
        const limit = new Date();
        limit.setFullYear(limit.getFullYear() - 3);
        return birth <= limit;
      },
      msg: "Học sinh phải từ 3 tuổi trở lên",
    },
    gender: {
      test: (v) => v !== "",
      msg: "Vui lòng chọn giới tính",
    },
  };

  // ── ĐIỀU CHỈNH CHIỀU CAO BẢNG THEO CỬA SỔ ────────────────────────────────
  const BOTTOM_GAP = 32;

  function adjustTableHeight() {
    const wrapper = document.querySelector(".table-responsive");
    const pagination = document.getElementById("students-pagination");
    if (!wrapper) return;

    const top = wrapper.getBoundingClientRect().top;
    const paginationHeight = pagination ? pagination.offsetHeight : 0;
    const available = window.innerHeight - top - paginationHeight - BOTTOM_GAP;

    wrapper.style.maxHeight = Math.max(available, 150) + "px";
    wrapper.style.height = "auto";
  }

  // ── TỰ ĐỘNG TẠO MẬT KHẨU TỪ NGÀY SINH ──
  function generatePasswordFromDob(dobValue) {
    const passInput = document.getElementById("hs_password");

    const generatedPass = utils.generatePassFromDob(dobValue);

    if (generatedPass) {
      passInput.value = generatedPass;
      validateField("hs_password", "password");
    } else {
      if (!currentEditingId) passInput.value = "";
    }
  }

  window.addEventListener("resize", adjustTableHeight);

  // ── LOGIC CHỌN NHIỀU (CHỈ KÍCH HOẠT KHI NHẤN GIỮ VÀO Ô MÃ HS) ──
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
      studentsList.forEach((s) => selectedIds.add(s.id));
    } else {
      studentsList.forEach((s) => selectedIds.delete(s.id));
      isSelectionMode = false;
    }
    updateBulkDeleteUI();
    studentsList.forEach((s) => updateRowVisuals(s.id));
  }

  function updateRowVisuals(id) {
    const row = document.getElementById(`row-hs-${id}`);
    const checkbox = document.getElementById(`cb-hs-${id}`);
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
    const tbody = document.getElementById("students-tbody");
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
        studentsList.length > 0 &&
        studentsList.every((s) => selectedIds.has(s.id));
      cbSelectAll.checked = allSelected;
      cbSelectAll.style.setProperty(
        "display",
        isSelectionMode ? "inline-block" : "none",
        "important",
      );
    }
  }

  // ── XÓA HÀNG LOẠT ──
  async function deleteSelected() {
    if (selectedIds.size === 0) return;

    const ok = await utils.confirm(
      `Bạn có chắc chắn muốn xóa ${selectedIds.size} học sinh đã chọn? Hành động này không thể hoàn tác.`,
      {
        title: "Xóa học sinh?",
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
        api.fetch(`/students/${id}`, { method: "DELETE" }),
      );
      await Promise.all(deletePromises);

      utils.showToast(
        `Đã xóa thành công ${selectedIds.size} học sinh!`,
        "success",
      );

      selectedIds.clear();
      isSelectionMode = false;
      await loadData(currentPage);
    } catch (error) {
      console.error("Lỗi khi xóa:", error);
      utils.showToast("Có lỗi xảy ra khi xóa học sinh!", "danger");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-trash-can me-1"></i> Xóa (<span id="selected-count">0</span>)`;
        btn.classList.add("d-none");
      }
      updateBulkDeleteUI();
    }
  }

  // ── 1. TẢI DỮ LIỆU ──────────────────────────────
  async function loadData(page = 1) {
    if (isLoading) return;
    isLoading = true;

    selectedIds.clear();
    isSelectionMode = false;
    updateBulkDeleteUI();

    const tbody = document.getElementById("students-tbody");
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4"><span class="spinner-border spinner-border-sm text-danger me-2"></span> Đang tải...</td></tr>`;

    try {
      const queryParams = new URLSearchParams({
        page: page,
        limit: 10,
        keyword: currentKeyword,
        status: currentStatus,
      }).toString();
      const res = await api.fetch(`/students?${queryParams}`);
      if (!res?.data || !res?.pagination)
        throw new Error("Dữ liệu trả về không hợp lệ");

      studentsList = res.data;
      currentPage = res.pagination.page;
      totalPages = res.pagination.totalPages;

      renderTable(studentsList);
      renderPagination(res.pagination);
    } catch (err) {
      console.error("Lỗi tải danh sách:", err);
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">Có lỗi kết nối máy chủ!</td></tr>`;
    } finally {
      isLoading = false;
    }
  }

  // ── 2. RENDER BẢNG ────────────────────────────────
  function renderTable(data) {
    const tbody = document.getElementById("students-tbody");
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">Chưa có học sinh nào trong hệ thống.</td></tr>`;
      return;
    }
    tbody.innerHTML = data.map(renderRow).join("");

    setTimeout(adjustTableHeight, 50);
  }

  function renderRow(s) {
    const isActive = s.status === "active";
    const parentsHtml =
      s.parents && s.parents.length > 0
        ? s.parents
            .map(
              (p) => `
          <div class="mb-1">
            <div class="fw-medium small text-dark"><span class="text-muted">(${esc(p.relationship)})</span> ${esc(p.fullName)}</div>
            <div class="text-muted small"><i class="fa-solid fa-phone me-1" style="font-size: 10px;"></i>${esc(p.phone || "")}</div>
          </div>`,
            )
            .join("")
        : `<span class="text-muted small">Chưa có phụ huynh</span>`;

    // Hiển thị lớp đang học: lấy từ mảng s.classes (1 học sinh có thể học nhiều lớp)
    const classesHtml =
      s.classes && s.classes.length > 0
        ? s.classes
            .map(
              (c) =>
                `<div class="fw-semibold text-dark small">${esc(c.className)}</div>`,
            )
            .join("")
        : `<span class="text-muted small">Chưa phân lớp</span>`;

    return `
      <tr id="row-hs-${s.id}" class="${selectedIds.has(s.id) ? "table-danger" : ""}" style="transition: background-color 0.2s;">
        <td class="ps-4"
            onmousedown="window.studentManager.startPress(${s.id})"
            onmouseup="window.studentManager.cancelPress()"
            onmouseleave="window.studentManager.cancelPress()"
            ontouchstart="window.studentManager.startPress(${s.id})"
            ontouchend="window.studentManager.cancelPress()"
            onclick="window.studentManager.toggleSelectIfMode(${s.id})"
            style="user-select: none; cursor: pointer; min-width: 120px;"
        >
          <div class="d-flex align-items-center gap-2">
            <input type="checkbox" id="cb-hs-${s.id}" class="select-checkbox m-0"
                   ${selectedIds.has(s.id) ? "checked" : ""}
                   onclick="event.stopPropagation(); window.studentManager.toggleSelection(${s.id})" />
            <span class="badge bg-light text-dark border">${esc(s.studentCode || s.student_code)}</span>
          </div>
        </td>
        <td class="cell-text"><div class="fw-semibold text-dark">${esc(s.fullName || s.full_name)}</div></td>
        <td class="cell-text">${esc(s.phone || "") || '<span class="text-muted small">Chưa cập nhật</span>'}</td>
        <td class="cell-text">${classesHtml}</td>
        <td class="cell-text">${parentsHtml}</td>
        <td><span class="badge ${isActive ? "bg-success" : "bg-danger"} bg-opacity-75">${isActive ? "Hoạt động" : "Đã khóa"}</span></td>
        <td class="text-end pe-4">
          <button class="btn btn-sm btn-light border text-primary shadow-sm" onclick="event.stopPropagation(); window.studentManager.openModal(${s.id})" title="Sửa hồ sơ">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn btn-sm btn-light border text-${isActive ? "danger" : "success"} shadow-sm ms-1" onclick="event.stopPropagation(); window.studentManager.toggleStatus(${s.id})" title="${isActive ? "Khóa tài khoản" : "Mở khóa tài khoản"}">
            <i class="fa-solid fa-${isActive ? "lock" : "unlock"}"></i>
          </button>
        </td>
      </tr>`;
  }

  // ── 3. PHÂN TRANG ─────────────────────────────────
  function renderPagination({ page, total, totalPages, limit }) {
    const container = document.getElementById("students-pagination");
    if (!container) return;
    const from = total === 0 ? 0 : (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);

    container.innerHTML = `
      <div class="d-flex justify-content-between align-items-center px-4 py-3 border-top bg-white">
        <span class="text-muted small">Hiển thị <strong>${from}–${to}</strong> / <strong>${total}</strong> học sinh</span>
        <ul class="pagination pagination-sm mb-0 gap-1">
          <li class="page-item ${page <= 1 ? "disabled" : ""}"><button class="page-link rounded" onclick="window.studentManager.goToPage(${page - 1})"><i class="fa-solid fa-chevron-left"></i></button></li>
          ${buildPageButtons(page, totalPages)}
          <li class="page-item ${page >= totalPages ? "disabled" : ""}"><button class="page-link rounded" onclick="window.studentManager.goToPage(${page + 1})"><i class="fa-solid fa-chevron-right"></i></button></li>
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
    return `<li class="page-item ${isActive ? "active" : ""}"><button class="page-link rounded ${isActive ? "bg-danger border-danger" : ""}" onclick="window.studentManager.goToPage(${p})">${p}</button></li>`;
  }

  function goToPage(p) {
    if (p < 1 || p > totalPages || isLoading) return;
    loadData(p);
  }

  // ── 4. MODAL & LOGIC CẬP NHẬT ─────────────────────
  function openModal(id = null) {
    const modalEl = document.getElementById("studentModal");
    if (!modalEl) return;
    modalInstance ??= new bootstrap.Modal(modalEl);
    resetModal();

    currentEditingId = id;
    const passLabel =
      document.getElementById("hs_password").previousElementSibling;
    const passInput = document.getElementById("hs_password");

    if (id) {
      const s = studentsList.find((x) => x.id === id);
      if (!s) return;
      document.querySelector("#studentModal .modal-title").textContent =
        "Cập nhật Hồ sơ Học sinh";
      document.getElementById("hs_fullName").value =
        s.fullName || s.full_name || "";
      document.getElementById("hs_email").value = s.email || "";
      document.getElementById("hs_phone").value = s.phone || "";
      document.getElementById("hs_gender").value = s.gender || "";
      const dob = (s.dob || s.dateOfBirth || "").split("T")[0];
      if (dob) document.getElementById("hs_dob").value = dob;

      if (passLabel)
        passLabel.innerHTML = `Đặt lại mật khẩu <span class="text-muted fw-normal">(để trống nếu không đổi)</span>`;

      passInput.removeAttribute("readonly");
      passInput.classList.remove("bg-light");
      passInput.placeholder = "Nhập mật khẩu mới để cấp lại...";

      const stepperContainer = document.getElementById("modal-stepper");
      if (stepperContainer) stepperContainer.style.display = "none";
      document
        .getElementById("step2-ind")
        .style.setProperty("display", "none", "important");
      document.getElementById("step-line").style.display = "none";
      document.getElementById("btn-next-step").style.display = "none";
      document.getElementById("btn-save-student").style.display =
        "inline-block";
    } else {
      document.querySelector("#studentModal .modal-title").textContent =
        "Thêm Học sinh mới";
      if (passLabel)
        passLabel.innerHTML = `Mật khẩu khởi tạo <span class="text-danger">*</span>`;

      passInput.setAttribute("readonly", true);
      passInput.classList.add("bg-light");
      passInput.placeholder = "Tự động tạo từ ngày sinh...";

      const stepperContainer = document.getElementById("modal-stepper");
      if (stepperContainer) stepperContainer.style.display = "block";
      document.getElementById("step2-ind").style.removeProperty("display");
      document.getElementById("step-line").style.display = "block";
      document.getElementById("btn-next-step").style.display = "inline-block";
      document.getElementById("btn-save-student").style.display = "none";
    }

    const maxDob = new Date();
    maxDob.setFullYear(maxDob.getFullYear() - 3);
    document.getElementById("hs_dob").max = maxDob.toISOString().split("T")[0];

    modalInstance.show();
  }

  function resetModal() {
    currentStep = 1;
    parentTab = "new";
    selectedParentId = null;
    currentEditingId = null;
    [
      "hs_fullName",
      "hs_dob",
      "hs_phone",
      "hs_email",
      "hs_password",
      "ph_fullName",
      "ph_phone",
      "ph_email",
      "ph_password",
      "ph_searchInput",
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const genderEl = document.getElementById("hs_gender");
    if (genderEl) genderEl.value = "";

    // Reset khung tìm kiếm và quan hệ
    document.getElementById("ph_searchResults").innerHTML = "";
    document.getElementById("ph_selectedInfo").innerHTML = "";
    const relContainer = document.getElementById(
      "ph_search_relationship_container",
    );
    if (relContainer) relContainer.style.display = "none";
    const relSelect = document.getElementById("ph_search_relationship");
    if (relSelect) relSelect.value = "Bố";

    document.getElementById("panel-student").style.display = "block";
    document.getElementById("panel-parent").style.display = "none";
    document.getElementById("btn-back-step").style.display = "none";
    setStep(1);
    switchParentTab("new");
  }

  function setStep(step) {
    const isStep1 = step === 1;
    document.getElementById("sc1").className = isStep1
      ? "step-circle active"
      : "step-circle done";
    document.getElementById("sc1").innerHTML = isStep1
      ? "1"
      : '<i class="fa-solid fa-check" style="font-size:11px"></i>';
    document.getElementById("sc2").className = isStep1
      ? "step-circle"
      : "step-circle active";
    document.getElementById("step-line").className = isStep1
      ? "step-line mx-3"
      : "step-line mx-3 done";
    document
      .getElementById("step1-ind")
      .querySelector(".step-label").className = isStep1
      ? "step-label fw-semibold small"
      : "step-label text-muted small";
    document
      .getElementById("step2-ind")
      .querySelector(".step-label").className = isStep1
      ? "step-label text-muted small"
      : "step-label fw-semibold small";
  }

  function goNext() {
    const fullName = document.getElementById("hs_fullName").value;
    const dob = document.getElementById("hs_dob").value;
    const gender = document.getElementById("hs_gender").value;
    const phone = document.getElementById("hs_phone").value;
    const email = document.getElementById("hs_email").value;
    const password = document.getElementById("hs_password").value;

    if (!RULES.fullName.test(fullName))
      return utils.showToast(RULES.fullName.msg, "warning");
    if (!RULES.dob.test(dob)) return utils.showToast(RULES.dob.msg, "warning");
    if (!RULES.gender.test(gender))
      return utils.showToast(RULES.gender.msg, "warning");
    if (!RULES.phone.test(phone))
      return utils.showToast(RULES.phone.msg, "warning");
    if (!RULES.email.test(email))
      return utils.showToast(RULES.email.msg, "warning");
    if (!currentEditingId && !RULES.password.test(password))
      return utils.showToast(
        "Vui lòng chọn ngày sinh để tạo mật khẩu",
        "warning",
      );

    currentStep = 2;
    document.getElementById("panel-student").style.display = "none";
    document.getElementById("panel-parent").style.display = "block";
    document.getElementById("btn-back-step").style.display = "inline-block";
    document.getElementById("btn-next-step").style.display = "none";
    document.getElementById("btn-save-student").style.display = "inline-block";
    setStep(2);
  }

  function goBack() {
    currentStep = 1;
    document.getElementById("panel-student").style.display = "block";
    document.getElementById("panel-parent").style.display = "none";
    document.getElementById("btn-back-step").style.display = "none";
    document.getElementById("btn-next-step").style.display = "inline-block";
    document.getElementById("btn-save-student").style.display = "none";
    setStep(1);
  }

  function switchParentTab(tab) {
    parentTab = tab;
    selectedParentId = null;

    // Ẩn khung chọn quan hệ khi đổi tab
    const relContainer = document.getElementById(
      "ph_search_relationship_container",
    );
    if (relContainer) relContainer.style.display = "none";
    document.getElementById("ph_searchResults").innerHTML = "";
    document.getElementById("ph_selectedInfo").innerHTML = "";

    document.getElementById("pane-new").style.display =
      tab === "new" ? "block" : "none";
    document.getElementById("pane-search").style.display =
      tab === "search" ? "block" : "none";
    document.getElementById("tab-new-btn").className =
      tab === "new"
        ? "btn btn-sm btn-danger"
        : "btn btn-sm btn-outline-secondary";
    document.getElementById("tab-search-btn").className =
      tab === "search"
        ? "btn btn-sm btn-danger"
        : "btn btn-sm btn-outline-secondary";
  }

  // ── 7. TÌM KIẾM HỌC SINH ────────────────
  function onSearchInput(val) {
    const keyword =
      val !== undefined
        ? val
        : document.getElementById("search-students")?.value || "";
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

  async function searchParent(val) {
    clearTimeout(parentSearchTimer);
    const resultsEl = document.getElementById("ph_searchResults");

    if (!val.trim()) {
      resultsEl.innerHTML = "";
      document.getElementById("ph_selectedInfo").innerHTML = "";
      selectedParentId = null;

      // Kiểm tra an toàn trước khi ẩn (tránh lỗi crash JS)
      const relContainer = document.getElementById(
        "ph_search_relationship_container",
      );
      if (relContainer) relContainer.style.display = "none";
      return;
    }

    resultsEl.innerHTML = `<div class="p-3 text-center text-muted small"><span class="spinner-border spinner-border-sm me-2"></span> Đang tìm kiếm...</div>`;

    parentSearchTimer = setTimeout(async () => {
      try {
        // 👈 ĐÃ SỬA: Dùng đúng đường dẫn API của bạn (/parents?keyword=...)
        const res = await api.fetch(
          `/parents?keyword=${encodeURIComponent(val.trim())}`,
        );
        const list = res?.data || [];

        if (!list.length) {
          resultsEl.innerHTML = `<div class="p-3 text-center text-muted small">Không tìm thấy phụ huynh.</div>`;
        } else {
          resultsEl.innerHTML = list
            .map(
              (p) => `
            <div class="search-result-item" id="sri-${p.id}" onclick="window.studentManager.selectParent(${p.id}, '${esc(p.fullName)}', '${esc(p.phone)}')">
              <div class="ph-avatar">${p.fullName.charAt(0).toUpperCase()}</div>
              <div class="flex-grow-1">
                <div class="fw-semibold small text-dark">${esc(p.fullName)} <span class="badge bg-light text-dark border ms-1">${esc(p.parentCode || "")}</span></div>
                <div class="text-muted" style="font-size:11px;">
                  <i class="fa-solid fa-phone me-1"></i>${esc(p.phone)}
                </div>
              </div>
            </div>
          `,
            )
            .join("");
        }
      } catch (err) {
        console.error("Lỗi tìm kiếm phụ huynh:", err);
        resultsEl.innerHTML = `<div class="p-3 text-center text-danger small">Lỗi kết nối khi tìm kiếm.</div>`;
      }
    }, 400); // Debounce 400ms
  }

  // ── HIỂN THỊ THÔNG TIN PHỤ HUYNH ĐƯỢC CHỌN ──
  function selectParent(id, name, phone) {
    selectedParentId = id;
    document
      .querySelectorAll(".search-result-item")
      .forEach((el) => el.classList.remove("selected"));
    const el = document.getElementById("sri-" + id);
    if (el) el.classList.add("selected");

    document.getElementById("ph_selectedInfo").innerHTML = `
      <div class="alert alert-success py-2 mt-2 mb-0 d-flex align-items-center gap-2 border border-success-subtle">
        <i class="fa-solid fa-circle-check fs-4 text-success"></i> 
        <div>
          <div class="fw-bold text-dark small mb-1">Đã chọn phụ huynh:</div>
          <div class="small text-dark mb-0"><strong>${name}</strong> — ${phone}</div>
        </div>
      </div>`;

    // Kiểm tra an toàn trước khi hiện
    const relContainer = document.getElementById(
      "ph_search_relationship_container",
    );
    if (relContainer) relContainer.style.display = "block";
  }

  // ── 8. LƯU DỮ LIỆU (CREATE & UPDATE) ─────────────
  async function saveData() {
    if (currentEditingId) {
      const fullName = document.getElementById("hs_fullName").value;
      const dob = document.getElementById("hs_dob").value;
      const gender = document.getElementById("hs_gender").value;
      const phone = document.getElementById("hs_phone").value;
      const email = document.getElementById("hs_email").value;

      if (!RULES.fullName.test(fullName))
        return utils.showToast(RULES.fullName.msg, "warning");
      if (!RULES.dob.test(dob))
        return utils.showToast(RULES.dob.msg, "warning");
      if (!RULES.gender.test(gender))
        return utils.showToast(RULES.gender.msg, "warning");
      if (!RULES.phone.test(phone))
        return utils.showToast(RULES.phone.msg, "warning");
      if (!RULES.email.test(email))
        return utils.showToast(RULES.email.msg, "warning");

      const payload = {
        fullName: document.getElementById("hs_fullName").value.trim(),
        email: document.getElementById("hs_email").value.trim(),
        phone: document.getElementById("hs_phone").value.trim(),
        gender: document.getElementById("hs_gender").value,
        dateOfBirth: document.getElementById("hs_dob").value,
      };
      const password = document.getElementById("hs_password").value.trim();
      if (password) {
        if (!RULES.password.test(password))
          return utils.showToast(RULES.password.msg, "warning");
        payload.password = password;
      }

      const btnSave = document.getElementById("btn-save-student");
      const originalText = btnSave.innerHTML;
      btnSave.disabled = true;
      btnSave.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Đang lưu...`;

      try {
        await api.fetch(`/students/${currentEditingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        await loadData(currentPage);
        modalInstance.hide();
        utils.showToast("Cập nhật học sinh thành công!", "success");
      } catch (err) {
        console.error("Lỗi khi cập nhật học sinh:", err);
        utils.showToast("Có lỗi xảy ra khi cập nhật!", "danger");
      } finally {
        btnSave.disabled = false;
        btnSave.innerHTML = originalText;
      }
      return;
    }

    if (parentTab === "new") {
      const phFullName = document.getElementById("ph_fullName").value;
      const phPhone = document.getElementById("ph_phone").value;
      const phEmail = document.getElementById("ph_email").value;
      const phPassword = document.getElementById("ph_password").value;

      if (!RULES.fullName.test(phFullName))
        return utils.showToast("Tên phụ huynh không hợp lệ", "warning");
      if (!RULES.phone.test(phPhone))
        return utils.showToast(RULES.phone.msg, "warning");
      if (!RULES.email.test(phEmail))
        return utils.showToast(RULES.email.msg, "warning");
      if (!RULES.password.test(phPassword))
        return utils.showToast(RULES.password.msg, "warning");
    } else {
      if (!selectedParentId)
        return utils.showToast(
          "Vui lòng chọn phụ huynh từ danh sách!",
          "warning",
        );
    }

    // XÁC ĐỊNH MỐI QUAN HỆ TÙY THUỘC VÀO TAB NÀO ĐANG ĐƯỢC CHỌN
    const relationshipVal =
      parentTab === "new"
        ? document.getElementById("ph_relationship")?.value || "Bố"
        : document.getElementById("ph_search_relationship")?.value || "Bố";

    const payload = {
      fullName: document.getElementById("hs_fullName").value.trim(),
      email: document.getElementById("hs_email").value.trim(),
      password: document.getElementById("hs_password").value,
      phone: document.getElementById("hs_phone").value.trim(),
      gender: document.getElementById("hs_gender").value,
      dateOfBirth: document.getElementById("hs_dob").value,
      parentMode: parentTab === "search" ? "existing" : "new",
      relationship: relationshipVal,
    };

    if (parentTab === "new") {
      payload.parentFullName = document
        .getElementById("ph_fullName")
        .value.trim();
      payload.parentPhone = document.getElementById("ph_phone").value.trim();
      payload.parentEmail = document.getElementById("ph_email").value.trim();
      payload.parentPassword = document.getElementById("ph_password").value;
    } else {
      payload.parentId = selectedParentId;
    }

    const btnSave = document.getElementById("btn-save-student");
    const originalText = btnSave.innerHTML;
    btnSave.disabled = true;
    btnSave.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Đang lưu...`;

    try {
      const res = await api.fetch("/students/create", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (res?.message && !res?.data)
        return utils.showToast(res.message, "danger");
      await loadData(1);
      modalInstance.hide();
      utils.showToast(res?.message || "Thêm học sinh thành công!", "success");
    } catch (err) {
      console.error("Lỗi thêm học sinh:", err);
      utils.showToast("Có lỗi xảy ra khi tạo học sinh!", "danger");
    } finally {
      btnSave.disabled = false;
      btnSave.innerHTML = originalText;
    }
  }

  // ── 9. TOGGLE STATUS ──────────────────────────────
  async function toggleStatus(id) {
    const s = studentsList.find((x) => x.id === id);
    if (!s) return;
    const ok = await utils.confirm(
      "Tài khoản học sinh sẽ bị thay đổi trạng thái đăng nhập.",
      {
        title: "Thay đổi trạng thái?",
        confirmText: "Xác nhận",
        cancelText: "Hủy bỏ",
        type: "danger",
      },
    );
    if (!ok) return;
    const newStatus = s.status === "active" ? "inactive" : "active";
    try {
      await api.fetch(`/students/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      s.status = newStatus;
      renderTable(studentsList);
      utils.showToast(
        `Đã ${newStatus === "active" ? "mở khóa" : "khóa"} tài khoản học sinh!`,
        "success",
      );
    } catch (err) {
      console.error("Lỗi đổi trạng thái:", err);
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
    goNext,
    goBack,
    switchParentTab,
    onSearchInput,
    onStatusChange,
    searchParent,
    selectParent,
    saveData,
    toggleStatus,
    startPress,
    cancelPress,
    toggleSelectIfMode,
    toggleSelection,
    toggleSelectAll,
    deleteSelected,
    generatePasswordFromDob,
  };
})();
