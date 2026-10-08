window.courseManager = (() => {
  let coursesList = [];
  let modalInstance = null;
  let currentPage = 1;
  let totalPages = 1;
  let isLoading = false;
  let typingTimer = null;

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

  const showErr = (err) => {
    const msg =
      typeof err === "string" ? err : err?.message || "Có lỗi xảy ra!";
    if (window.utils) utils.showToast(msg, "danger");
    else alert(msg);
  };

  const showSuccess = (msg) => {
    if (window.utils) utils.showToast(msg, "success");
  };

  // ── ĐIỀU CHỈNH CHIỀU CAO BẢNG ───────────────────────────────────────────
  const BOTTOM_GAP = 32;

  function adjustTableHeight() {
    const wrapper = document.querySelector(".table-responsive");
    const pagination = document.getElementById("course-pagination");
    if (!wrapper) return;
    const top = wrapper.getBoundingClientRect().top;
    const paginationHeight = pagination ? pagination.offsetHeight : 0;
    const available = window.innerHeight - top - paginationHeight - BOTTOM_GAP;
    wrapper.style.maxHeight = Math.max(available, 150) + "px";
    wrapper.style.height = "auto";
  }

  window.addEventListener("resize", adjustTableHeight);

  // ── TÍNH FEE / BUỔI ─────────────────────────────────────────────────────
  function calcFeePerSession(item) {
    const standardFee = Number(item.standardFee || item.fee_per_session || 0);
    const totalFee = Number(item.totalFee || 0);
    const totalSessions = Number(
      item.totalSessions || item.total_sessions || 1,
    );

    if (standardFee > 0) return standardFee;
    if (totalFee > 0 && totalSessions > 0)
      return Math.round(totalFee / totalSessions);
    return 0;
  }

  // ── TÍNH STATUS HIỂN THỊ (không gọi API) ────────────────────────────────
  function computeDisplayStatus(course) {
    const dbStatus = (course.status || "").toLowerCase();
    if (dbStatus === "upcoming") {
      const rawDate = course.startDate || course.start_date;
      if (rawDate) {
        const start = new Date(rawDate);
        start.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (start <= today) return "ongoing";
      }
    }
    return dbStatus;
  }

  // ── FORMAT NGÀY AN TOÀN (tránh timezone) ────────────────────────────────
  function formatDateVN(rawDate) {
    if (!rawDate) return null;
    // Nếu là string ISO có timezone → lấy phần date trước T
    const dateStr = typeof rawDate === "string" ? rawDate.slice(0, 10) : null;
    if (dateStr) {
      const [y, m, d] = dateStr.split("-");
      return `${d}/${m}/${y}`;
    }
    const d = new Date(rawDate);
    if (isNaN(d)) return null;
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }

  function toInputDate(rawDate) {
    if (!rawDate) return "";
    if (typeof rawDate === "string" && rawDate.length >= 10)
      return rawDate.slice(0, 10);
    const d = new Date(rawDate);
    if (isNaN(d)) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // ── LOGIC CHỌN NHIỀU ────────────────────────────────────────────────────
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
      coursesList.forEach((c) => selectedIds.add(c.id));
    } else {
      coursesList.forEach((c) => selectedIds.delete(c.id));
      isSelectionMode = false;
    }
    updateBulkDeleteUI();
    coursesList.forEach((c) => updateRowVisuals(c.id));
  }

  function updateRowVisuals(id) {
    const row = document.getElementById(`row-course-${id}`);
    const checkbox = document.getElementById(`cb-course-${id}`);
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
    const tbody = document.getElementById("course-table-body");
    const btn = document.getElementById("btn-bulk-delete");
    const countSpan = document.getElementById("selected-count");
    const cbSelectAll = document.getElementById("cb-select-all");

    if (tbody) {
      tbody.classList.toggle("selection-mode", isSelectionMode);
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
      cbSelectAll.checked =
        coursesList.length > 0 &&
        coursesList.every((c) => selectedIds.has(c.id));
      cbSelectAll.style.setProperty(
        "display",
        isSelectionMode ? "block" : "none",
        "important",
      );
    }
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return;
    const ok = window.utils
      ? await utils.confirm(
          `Bạn có chắc chắn muốn xóa ${selectedIds.size} khóa học đã chọn?`,
          { title: "Xóa nhiều", confirmText: "Xóa tất cả", type: "danger" },
        )
      : confirm("Xóa tất cả?");
    if (!ok) return;

    const btn = document.getElementById("btn-bulk-delete");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Đang xóa...`;

    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          api.fetch(`/courses/${id}`, { method: "DELETE" }),
        ),
      );
      showSuccess(`Đã xóa thành công ${selectedIds.size} khóa học!`);
      selectedIds.clear();
      isSelectionMode = false;
      loadData(currentPage);
    } catch {
      showErr("Có lỗi xảy ra khi xóa một số khóa học!");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-trash-can me-1"></i> Xóa (<span id="selected-count">0</span>)`;
        btn.classList.add("d-none");
      }
      updateBulkDeleteUI();
    }
  }

  // ── TẢI DỮ LIỆU ─────────────────────────────────────────────────────────
  async function loadData(page = 1) {
    if (isLoading) return;
    isLoading = true;

    selectedIds.clear();
    isSelectionMode = false;
    updateBulkDeleteUI();

    const tbody = document.getElementById("course-table-body");
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4">
      <span class="spinner-border spinner-border-sm text-danger me-2"></span> Đang tải dữ liệu...
    </td></tr>`;

    const keyword = document.getElementById("search-course").value.trim();
    const status = document.getElementById("filter-status").value;

    try {
      const query = new URLSearchParams({
        page,
        limit: 10,
        keyword,
        status,
      }).toString();
      const res = await api.fetch(`/courses?${query}`);

      if (res?.message && !res?.data) throw new Error(res.message);
      if (!res?.data) throw new Error(res?.message || "Dữ liệu không hợp lệ");

      coursesList = res.data;
      currentPage = res.pagination.page;
      totalPages = res.pagination.totalPages;

      renderTable(coursesList);
      renderPagination(res.pagination);
    } catch (error) {
      showErr(error);
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">Có lỗi kết nối máy chủ!</td></tr>`;
    } finally {
      isLoading = false;
    }
  }

  // ── RENDER BẢNG ──────────────────────────────────────────────────────────
  function renderTable(data) {
    const tbody = document.getElementById("course-table-body");
    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">Chưa có dữ liệu khóa học nào.</td></tr>`;
      return;
    }

    const BADGE_MAP = {
      upcoming:
        '<span class="badge bg-info text-dark bg-opacity-75">Chưa bắt đầu</span>',
      ongoing: '<span class="badge bg-success bg-opacity-75">Đang học</span>',
      finished:
        '<span class="badge bg-secondary bg-opacity-75">Đã kết thúc</span>',
      cancelled: '<span class="badge bg-danger bg-opacity-75">Đã hủy</span>',
    };

    tbody.innerHTML = data
      .map((item) => {
        const id = item.id;
        const status = computeDisplayStatus(item);
        const fee = Number(
          item.totalFee || item.standardFee || 0,
        ).toLocaleString("vi-VN");

        const dateVN = formatDateVN(item.startDate || item.start_date);
        const formattedDate = dateVN
          ? `<span class="fw-medium text-dark"><i class="fa-regular fa-calendar text-muted me-1"></i>${dateVN}</span>`
          : "<span class='text-muted fst-italic'>Chưa có</span>";

        const badgeStatus =
          BADGE_MAP[status] ||
          `<span class="badge bg-light text-dark border">${status}</span>`;

        return `
        <tr id="row-course-${id}"
          class="${selectedIds.has(id) ? "table-danger" : ""}"
          style="transition: background-color 0.2s;"
        >
          <td class="ps-4"
            onmousedown="window.courseManager.startPress(${id})"
            onmouseup="window.courseManager.cancelPress()"
            onmouseleave="window.courseManager.cancelPress()"
            ontouchstart="window.courseManager.startPress(${id})"
            ontouchend="window.courseManager.cancelPress()"
            onclick="window.courseManager.toggleSelectIfMode(${id})"
            style="user-select:none; cursor:pointer; min-width:130px;"
          >
            <div class="d-flex align-items-center gap-2">
              <input type="checkbox" id="cb-course-${id}" class="select-checkbox m-0"
                ${selectedIds.has(id) ? "checked" : ""}
                onclick="event.stopPropagation(); window.courseManager.toggleSelection(${id})"
              />
              <span class="badge bg-light text-dark border fw-bold">
                ${esc(item.courseCode || item.course_code)}
              </span>
            </div>
          </td>

          <td class="cell-text">
            <div class="fw-semibold text-dark mb-1">${esc(item.courseName || item.course_name)}</div>
            <div class="text-truncate text-muted fst-italic"
              style="max-width:250px; font-size:12px;"
              title="${esc(item.description || "")}"
            >${esc(item.description || "")}</div>
          </td>

          <td class="cell-text text-center">
            <span class="badge bg-danger bg-opacity-10 text-danger border border-danger-subtle">
              ${item.totalSessions || item.total_sessions || 0} Buổi
            </span>
          </td>

          <td class="cell-text">${formattedDate}</td>

          <td class="cell-text fw-semibold text-success">${fee} đ</td>

          <td class="cell-text">${badgeStatus}</td>

          <td class="text-end pe-4">
            <button class="btn btn-sm btn-light border text-primary shadow-sm me-1"
              onclick="event.stopPropagation(); window.courseManager.openModal(${id})"
              title="Sửa khóa học">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-sm btn-light border text-danger shadow-sm ms-1"
              onclick="event.stopPropagation(); window.courseManager.deleteCourse(${id})"
              title="Hủy / Xóa">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </td>
        </tr>
      `;
      })
      .join("");

    setTimeout(adjustTableHeight, 50);
  }

  // ── PHÂN TRANG ───────────────────────────────────────────────────────────
  function renderPagination({ page, total, totalPages, limit = 10 }) {
    const container = document.getElementById("course-pagination");
    if (!container) return;
    if (total === 0) {
      container.innerHTML = "";
      return;
    }

    const from = (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);
    const delta = 2;
    const rangeStart = Math.max(1, page - delta);
    const rangeEnd = Math.min(totalPages, page + delta);

    let pageBtns = "";
    if (rangeStart > 1) {
      pageBtns += buildPageBtn(1, page);
      if (rangeStart > 2)
        pageBtns += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
    }
    for (let i = rangeStart; i <= rangeEnd; i++)
      pageBtns += buildPageBtn(i, page);
    if (rangeEnd < totalPages) {
      if (rangeEnd < totalPages - 1)
        pageBtns += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
      pageBtns += buildPageBtn(totalPages, page);
    }

    container.innerHTML = `
      <div class="d-flex justify-content-between align-items-center px-4 py-3 border-top bg-white">
        <span class="text-muted small">
          Hiển thị <strong>${from}–${to}</strong> / <strong>${total}</strong> khóa học
        </span>
        <ul class="pagination pagination-sm mb-0 gap-1">
          <li class="page-item ${page <= 1 ? "disabled" : ""}">
            <button class="page-link rounded" onclick="window.courseManager.goToPage(${page - 1})">
              <i class="fa-solid fa-chevron-left"></i>
            </button>
          </li>
          ${pageBtns}
          <li class="page-item ${page >= totalPages ? "disabled" : ""}">
            <button class="page-link rounded" onclick="window.courseManager.goToPage(${page + 1})">
              <i class="fa-solid fa-chevron-right"></i>
            </button>
          </li>
        </ul>
      </div>
    `;

    adjustTableHeight();
  }

  function buildPageBtn(p, current) {
    const isActive = p === current;
    return `<li class="page-item ${isActive ? "active" : ""}">
      <button class="page-link rounded ${isActive ? "bg-danger border-danger text-white" : "text-dark"}"
        onclick="window.courseManager.goToPage(${p})">${p}
      </button>
    </li>`;
  }

  function goToPage(page) {
    if (page < 1 || page > totalPages || isLoading) return;
    loadData(page);
  }

  function handleSearch() {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => loadData(1), 500);
  }

  // ── MODAL THÊM / SỬA ────────────────────────────────────────────────────
  function openModal(id = null) {
    const modalEl = document.getElementById("courseModal");
    if (!modalEl) return;
    modalInstance ??= new bootstrap.Modal(modalEl);

    // Reset form
    document.getElementById("course-form").reset();
    document.getElementById("course-id").value = "";
    document.getElementById("start-date").value = "";

    const statusContainer = document.getElementById("course-status-container");
    const startDateInput = document.getElementById("start-date");

    // Ẩn trạng thái trong cả 2 trường hợp
    if (statusContainer) statusContainer.classList.add("d-none");

    if (id) {
      // ── Chế độ SỬA ───────────────────────────────────────────────
      document.getElementById("modal-title").textContent = "Cập Nhật Khóa Học";
      if (startDateInput) startDateInput.removeAttribute("min");

      const item = coursesList.find((c) => c.id === id);
      if (item) {
        document.getElementById("course-id").value = item.id;
        document.getElementById("course-code").value =
          item.courseCode || item.course_code || "";
        document.getElementById("course-name").value =
          item.courseName || item.course_name || "";
        document.getElementById("total-sessions").value =
          item.totalSessions || item.total_sessions || "";
        document.getElementById("course-description").value =
          item.description || item.note || "";
        document.getElementById("standard-fee").value = calcFeePerSession(item);
        startDateInput.value = toInputDate(item.startDate || item.start_date);
      }
    } else {
      // ── Chế độ THÊM MỚI ──────────────────────────────────────────
      document.getElementById("modal-title").textContent = "Thêm Khóa Học Mới";

      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      if (startDateInput) startDateInput.setAttribute("min", todayStr);
    }

    modalInstance.show();
  }

  // ── LƯU DỮ LIỆU ─────────────────────────────────────────────────────────
  async function saveData() {
    if (!document.getElementById("course-form").checkValidity()) {
      document.getElementById("course-form").reportValidity();
      return;
    }

    const id = document.getElementById("course-id").value;
    const btnSave = document.getElementById("btn-save");
    const startDateVal = document.getElementById("start-date").value;

    // Validate ngày khi thêm mới
    if (!id) {
      const selectedDate = new Date(startDateVal);
      selectedDate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        showErr(
          "Thời gian bắt đầu khóa học mới phải ở hiện tại hoặc tương lai!",
        );
        return;
      }
    }

    const payload = {
      courseCode: document.getElementById("course-code").value.trim(),
      courseName: document.getElementById("course-name").value.trim(),
      totalSessions: Number(document.getElementById("total-sessions").value),
      startDate: startDateVal,
      standardFee: Number(document.getElementById("standard-fee").value),
      description: document.getElementById("course-description").value.trim(),
    };

    try {
      btnSave.disabled = true;
      btnSave.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Đang xử lý...`;

      const endpoint = id ? `/courses/${id}` : "/courses/create";
      const method = id ? "PUT" : "POST";

      const res = await api.fetch(endpoint, {
        method,
        body: JSON.stringify(payload),
      });

      if (
        res?.message &&
        !res?.data &&
        res.status !== 200 &&
        res.status !== 201
      ) {
        throw new Error(res.message);
      }

      modalInstance.hide();
      showSuccess(
        id ? "Cập nhật khóa học thành công!" : "Tạo khóa học thành công!",
      );
      loadData(id ? currentPage : 1);
    } catch (error) {
      showErr(error);
    } finally {
      btnSave.disabled = false;
      btnSave.innerHTML = `<i class="fa-solid fa-check me-1"></i> Lưu khóa học`;
    }
  }

  // ── XÓA KHÓA HỌC ────────────────────────────────────────────────────────
  async function deleteCourse(id) {
    const ok = window.utils
      ? await utils.confirm(
          "Bạn có chắc chắn muốn xóa/hủy khóa học này không?",
          { title: "Cảnh báo", type: "danger" },
        )
      : confirm("Xóa khóa học?");
    if (!ok) return;

    try {
      const res = await api.fetch(`/courses/${id}`, { method: "DELETE" });
      if (res?.message && !res?.data && res.status !== 200)
        throw new Error(res.message);
      showSuccess("Đã xóa khóa học thành công!");
      loadData(currentPage);
    } catch (error) {
      showErr(error);
    }
  }

  // ── KHỞI CHẠY ───────────────────────────────────────────────────────────
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
    handleSearch,
    handleFilter: () => loadData(1),
    openModal,
    saveData,
    deleteCourse,
    startPress,
    cancelPress,
    toggleSelectIfMode,
    toggleSelection,
    toggleSelectAll,
    deleteSelected,
  };
})();
