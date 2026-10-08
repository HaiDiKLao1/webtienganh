window.classManager = (() => {
  let classesList = [];
  let modalInstance = null;
  let currentPage = 1;
  let totalPages = 1;
  let isLoading = false;
  let typingTimer = null;
  let courseSearchTimer = null;

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

  const BOTTOM_GAP = 32;

  function adjustTableHeight() {
    const wrapper = document.querySelector(".table-responsive");
    const pagination = document.getElementById("class-pagination");
    if (!wrapper) return;
    const top = wrapper.getBoundingClientRect().top;
    const paginationHeight = pagination ? pagination.offsetHeight : 0;
    const available = window.innerHeight - top - paginationHeight - BOTTOM_GAP;
    wrapper.style.maxHeight = Math.max(available, 150) + "px";
    wrapper.style.height = "auto";
  }

  window.addEventListener("resize", adjustTableHeight);

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
      classesList.forEach((c) => selectedIds.add(c.id));
    } else {
      classesList.forEach((c) => selectedIds.delete(c.id));
      isSelectionMode = false;
    }
    updateBulkDeleteUI();
    classesList.forEach((c) => updateRowVisuals(c.id));
  }

  function updateRowVisuals(id) {
    const row = document.getElementById(`row-class-${id}`);
    const checkbox = document.getElementById(`cb-class-${id}`);
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
    const tbody = document.getElementById("class-table-body");
    const btn = document.getElementById("btn-bulk-delete");
    const countSpan = document.getElementById("selected-count");
    const cbSelectAll = document.getElementById("cb-select-all");

    if (tbody) tbody.classList.toggle("selection-mode", isSelectionMode);

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
        classesList.length > 0 &&
        classesList.every((c) => selectedIds.has(c.id));
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
      `Bạn có chắc chắn muốn xóa/đóng ${selectedIds.size} lớp học đã chọn? Hành động này không thể hoàn tác.`,
      {
        title: "Xóa nhiều lớp học?",
        confirmText: "Xóa tất cả",
        cancelText: "Hủy bỏ",
        type: "danger",
      },
    );
    if (!ok) return;

    const btn = document.getElementById("btn-bulk-delete");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Đang xử lý...`;

    try {
      const deletePromises = Array.from(selectedIds).map((id) =>
        api.fetch(`/classes/${id}`, { method: "DELETE" }),
      );
      await Promise.all(deletePromises);

      utils.showToast(
        `Đã xử lý thành công ${selectedIds.size} lớp học!`,
        "success",
      );
      selectedIds.clear();
      isSelectionMode = false;
      await loadData(currentPage);
    } catch (error) {
      console.error("Lỗi khi xóa nhiều:", error);
      utils.showToast("Có lỗi xảy ra khi xử lý một số lớp!", "danger");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-trash-can me-1"></i> Xóa (<span id="selected-count">0</span>)`;
        btn.classList.add("d-none");
      }
      updateBulkDeleteUI();
    }
  }

  async function loadData(page = 1) {
    if (isLoading) return;
    isLoading = true;

    selectedIds.clear();
    isSelectionMode = false;
    updateBulkDeleteUI();

    const tbody = document.getElementById("class-table-body");
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4"><span class="spinner-border spinner-border-sm text-danger me-2"></span> Đang tải dữ liệu...</td></tr>`;

    const keyword = document.getElementById("search-class").value.trim();
    const status = document.getElementById("filter-status").value;

    let queryParams = `?page=${page}&limit=10`;
    if (keyword) queryParams += `&keyword=${encodeURIComponent(keyword)}`;
    if (status) queryParams += `&status=${status}`;

    try {
      const res = await api.fetch(`/classes${queryParams}`);
      if (!res?.data || !res?.pagination)
        throw new Error("Dữ liệu trả về không hợp lệ");

      classesList = res.data;
      currentPage = res.pagination.page || res.pagination.currentPage;
      totalPages = res.pagination.totalPages;

      renderTable(classesList);
      renderPagination(res.pagination);
    } catch (error) {
      console.error("Lỗi tải danh sách:", error);
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">Có lỗi kết nối máy chủ!</td></tr>`;
    } finally {
      isLoading = false;
    }
  }

  function renderTable(data) {
    const tbody = document.getElementById("class-table-body");
    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">Chưa có dữ liệu lớp học nào.</td></tr>`;
      return;
    }

    tbody.innerHTML = data
      .map((item) => {
        const id = item.id;
        const current = item.currentStudents || 0;
        const max = item.maxStudents || 1;

        const courseData =
          item.courses && item.courses.length > 0 ? item.courses[0] : null;
        const rawCourseName =
          item.courseName || courseData?.courseName || courseData?.course_name;

        const displayCourseName = rawCourseName
          ? esc(rawCourseName)
          : "Chưa liên kết";
        const courseCssClass = rawCourseName
          ? "text-dark fw-semibold"
          : "text-muted fst-italic small";

        const classFee = Number(
          item.feePerSession ||
            item.fee ||
            courseData?.totalFee ||
            courseData?.total_fee ||
            courseData?.standardFee ||
            courseData?.standard_fee ||
            0,
        );

        const badgeStatus =
          item.status === "open"
            ? '<span class="badge bg-success bg-opacity-75">Đang mở</span>'
            : item.status === "closed"
              ? '<span class="badge bg-secondary bg-opacity-75">Đã đóng</span>'
              : '<span class="badge bg-warning text-dark bg-opacity-75">Đang chờ</span>';

        return `
                <tr id="row-class-${id}" class="${selectedIds.has(id) ? "table-danger" : ""}" style="transition: background-color 0.2s;">
                    <td class="ps-4"
                        onmousedown="window.classManager.startPress(${id})"
                        onmouseup="window.classManager.cancelPress()"
                        onmouseleave="window.classManager.cancelPress()"
                        ontouchstart="window.classManager.startPress(${id})"
                        ontouchend="window.classManager.cancelPress()"
                        onclick="window.classManager.toggleSelectIfMode(${id})"
                        style="user-select: none; cursor: pointer;"
                    >
                        <div class="d-flex align-items-center gap-2">
                            <input type="checkbox" id="cb-class-${id}" class="select-checkbox m-0"
                                   ${selectedIds.has(id) ? "checked" : ""}
                                   onclick="event.stopPropagation(); window.classManager.toggleSelection(${id})" />
                            
                            <span class="badge bg-light text-primary border class-code-link d-inline-block text-truncate" 
                                  style="max-width: 90px; vertical-align: middle;"
                                  onclick="event.stopPropagation(); window.classManager.goToDetail(${id})" 
                                  title="${esc(item.classCode)}">
                                ${esc(item.classCode)}
                            </span>
                        </div>
                    </td>
                    <td class="cell-text"><div class="fw-semibold text-dark">${esc(item.className)}</div></td>
                    
                    <td class="cell-text">
                        <span class="${courseCssClass}">${displayCourseName}</span>
                    </td>

                    <td class="cell-text">
                        <span class="fw-medium small text-dark">Khối ${item.grade}</span><br>
                        <span class="text-muted" style="font-size:12px">${esc(item.academicYear)}</span>
                    </td>
                    
                    <td class="cell-text">
                        <span class="small fw-semibold text-dark"><i class="fa-solid fa-users text-muted me-1"></i>${current} / ${max}</span>
                    </td>

                    <td class="cell-text"><span class="fw-semibold text-success">${classFee.toLocaleString("vi-VN")} đ</span></td>
                    <td class="cell-text">${badgeStatus}</td>
                    
                    <td class="text-end pe-4">
                        <button class="btn btn-sm btn-light border text-primary shadow-sm me-1" onclick="event.stopPropagation(); window.classManager.openModal(${id})" title="Cập nhật thông tin cơ bản">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn btn-sm btn-light border text-danger shadow-sm" onclick="event.stopPropagation(); window.classManager.deleteClass(${id})" title="Khóa / Đóng lớp">
                            <i class="fa-solid fa-lock"></i>
                        </button>
                    </td>
                </tr>
            `;
      })
      .join("");

    setTimeout(adjustTableHeight, 50);
  }

  function renderPagination(paginationData) {
    const container = document.getElementById("class-pagination");
    if (!container) return;

    const page = paginationData.page || paginationData.currentPage || 1;
    const totalPages = paginationData.totalPages || 1;
    const total = paginationData.total || paginationData.totalRecords || 0;
    const limit = paginationData.limit || 10;

    const from = total === 0 ? 0 : (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);

    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center px-4 py-3 border-top bg-white">
            <span class="text-muted small">Hiển thị <strong>${from}–${to}</strong> / <strong>${total}</strong> lớp học</span>
            <ul class="pagination pagination-sm mb-0 gap-1">
                <li class="page-item ${page <= 1 ? "disabled" : ""}"><button class="page-link rounded" onclick="window.classManager.goToPage(${page - 1})"><i class="fa-solid fa-chevron-left"></i></button></li>
                ${buildPageButtons(page, totalPages)}
                <li class="page-item ${page >= totalPages ? "disabled" : ""}"><button class="page-link rounded" onclick="window.classManager.goToPage(${page + 1})"><i class="fa-solid fa-chevron-right"></i></button></li>
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
    return `<li class="page-item ${isActive ? "active" : ""}"><button class="page-link rounded ${isActive ? "bg-danger border-danger text-white" : "text-dark"}" onclick="window.classManager.goToPage(${p})">${p}</button></li>`;
  }

  function goToPage(page) {
    if (page < 1 || page > totalPages || isLoading) return;
    loadData(page);
  }

  function handleSearch() {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      loadData(1);
    }, 500);
  }

  function handleFilter() {
    loadData(1);
  }

  function goToDetail(id) {
    localStorage.setItem("currentClassDetailId", id);
    if (typeof window.loadSubPage === "function") {
      window.loadSubPage("class-detail.html");
    } else {
      console.error(
        "Lỗi: Không tìm thấy cơ chế chuyển trang window.loadSubPage",
      );
    }
  }

  function searchCourses(keyword) {
    clearTimeout(courseSearchTimer);
    const resultsEl = document.getElementById("course-search-results");
    resultsEl.classList.remove("d-none");

    resultsEl.innerHTML = `<div class="text-center text-muted small py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tìm...</div>`;

    courseSearchTimer = setTimeout(async () => {
      try {
        const res = await api.fetch(
          `/courses?keyword=${encodeURIComponent(keyword.trim())}&status=upcoming&limit=10`,
        );
        const list = res?.data?.items || res?.data || [];

        if (list.length === 0) {
          resultsEl.innerHTML = `<div class="text-center text-danger small py-3">Không tìm thấy khóa học sắp khai giảng!</div>`;
          return;
        }

        resultsEl.innerHTML = list
          .map(
            (c) => `
                <div class="p-2 border-bottom hover-bg-light" style="cursor:pointer;" onclick='window.classManager.selectCourse(${c.id}, ${JSON.stringify(c.courseName || c.course_name).replace(/'/g, "&apos;")})'>
                    <div class="fw-semibold text-dark small">${esc(c.courseName || c.course_name)}</div>
                    <div class="text-muted" style="font-size: 11px;">Mã: ${esc(c.courseCode || c.course_code)} | ${c.totalSessions || c.total_sessions} buổi</div>
                </div>
            `,
          )
          .join("");
      } catch (e) {
        resultsEl.innerHTML = `<div class="text-center text-danger small py-3">Lỗi tìm kiếm khóa học!</div>`;
      }
    }, 400);
  }

  function selectCourse(id, name) {
    document.getElementById("selected-course-id").value = id;
    document.getElementById("course-search-input").value = name;
    document.getElementById("course-search-results").classList.add("d-none");
  }

  function clearCourseSelection() {
    document.getElementById("selected-course-id").value = "";
    document.getElementById("course-search-input").value = "";
    document.getElementById("course-search-input").focus();
  }

  async function openModal(id = null) {
    const modalEl = document.getElementById("classModal");
    if (!modalEl) return;
    modalInstance ??= new bootstrap.Modal(modalEl);

    document.getElementById("class-form").reset();
    document.getElementById("class-id").value = "";
    document.getElementById("class-status").value = "open";
    clearCourseSelection();

    const statusContainer = document.getElementById("class-status-container");

    if (id) {
      document.getElementById("modal-title").textContent =
        "Cập Nhật Thông Tin Cơ Bản";
      if (statusContainer) statusContainer.classList.remove("d-none");

      const item = classesList.find((c) => c.id === id);
      if (item) {
        // ĐÃ SỬA: Map data khóa học vào form nếu đang ở chế độ sửa
        const courseData =
          item.courses && item.courses.length > 0 ? item.courses[0] : null;

        document.getElementById("class-id").value = item.id;
        document.getElementById("class-name").value = item.className;
        document.getElementById("selected-course-id").value =
          item.courseId || item.course_id || courseData?.id || "";
        document.getElementById("course-search-input").value =
          item.courseName ||
          courseData?.courseName ||
          courseData?.course_name ||
          "";
        document.getElementById("class-grade").value = item.grade;
        document.getElementById("academic-year").value = item.academicYear;
        document.getElementById("max-students").value = item.maxStudents;
        document.getElementById("class-description").value =
          item.description || "";
        document.getElementById("class-status").value = item.status || "open";
      }
    } else {
      document.getElementById("modal-title").textContent = "Thêm Lớp Học Mới";
      if (statusContainer) statusContainer.classList.add("d-none");
    }

    modalInstance.show();
  }

  async function saveData() {
    if (!document.getElementById("class-form").checkValidity()) {
      document.getElementById("class-form").reportValidity();
      return;
    }

    const selectedCourseId =
      document.getElementById("selected-course-id").value;
    if (!selectedCourseId) {
      if (window.utils)
        utils.showToast(
          "Vui lòng tìm và chọn một khóa học liên kết!",
          "warning",
        );
      return;
    }

    const id = document.getElementById("class-id").value;
    const btnSave = document.getElementById("btn-save");

    const payload = {
      className: document.getElementById("class-name").value.trim(),
      courseId: Number(selectedCourseId),
      grade: Number(document.getElementById("class-grade").value),
      academicYear: document.getElementById("academic-year").value.trim(),
      maxStudents: Number(document.getElementById("max-students").value) || 30,
      description:
        document.getElementById("class-description").value.trim() || null,
      status: document.getElementById("class-status").value,
    };

    try {
      btnSave.disabled = true;
      btnSave.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Đang xử lý...`;

      const endpoint = id ? `/classes/${id}` : "/classes/create";
      const method = id ? "PUT" : "POST";

      const res = await api.fetch(endpoint, {
        method: method,
        body: JSON.stringify(payload),
      });

      const isSuccess =
        res?.message && res.message.toLowerCase().includes("thành công");
      if (res && res.message && !isSuccess) {
        if (window.utils) utils.showToast(res.message, "warning");
        return;
      }

      modalInstance.hide();
      if (window.utils)
        utils.showToast(
          res.message || (id ? "Cập nhật thành công!" : "Tạo lớp thành công!"),
          "success",
        );
      await loadData(id ? currentPage : 1);
    } catch (error) {
      console.error("Lỗi lưu:", error);
      if (window.utils)
        utils.showToast(error.message || "Lỗi hệ thống!", "danger");
    } finally {
      btnSave.disabled = false;
      btnSave.innerHTML = `<i class="fa-solid fa-check me-1"></i> Lưu lớp học`;
    }
  }

  async function deleteClass(id) {
    if (window.utils) {
      const confirm = await utils.confirm(
        "Bạn có chắc chắn muốn khóa/đóng lớp học này không?",
        { title: "Khóa Lớp Học", confirmText: "Khóa Lớp", type: "danger" },
      );
      if (!confirm) return;
    } else {
      if (!window.confirm("Bạn có chắc chắn muốn đóng lớp này?")) return;
    }

    try {
      const res = await api.fetch(`/classes/${id}`, { method: "DELETE" });
      if (window.utils)
        utils.showToast(res?.message || "Đóng lớp học thành công!", "success");
      loadData(currentPage);
    } catch (error) {
      console.error("Lỗi đóng lớp:", error);
      if (window.utils) utils.showToast("Lỗi khi đóng lớp học!", "danger");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      adjustTableHeight();
      loadData(1);
      document.addEventListener("click", (e) => {
        const resultsEl = document.getElementById("course-search-results");
        const inputEl = document.getElementById("course-search-input");
        if (
          resultsEl &&
          !resultsEl.contains(e.target) &&
          e.target !== inputEl
        ) {
          resultsEl.classList.add("d-none");
        }
      });
    });
  } else {
    adjustTableHeight();
    loadData(1);
  }

  return {
    loadData,
    goToPage,
    handleSearch,
    handleFilter,
    openModal,
    goToDetail,
    saveData,
    deleteClass,
    startPress,
    cancelPress,
    toggleSelectIfMode,
    toggleSelection,
    toggleSelectAll,
    deleteSelected,
    searchCourses,
    selectCourse,
    clearCourseSelection,
  };
})();
