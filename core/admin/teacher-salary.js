window.salaryManager = (() => {
  // ── BIẾN QUẢN LÝ TRẠNG THÁI (STATE) ──
  let salaryList = [];
  let modalInstance = null;
  let calcModalInstance = null;
  let updateModalInstance = null;
  let confirmEarlyModalInstance = null; 
  let currentPage = 1;
  let totalPages = 1;
  let isLoading = false;
  let typingTimer = null;

  // ── BIẾN CHO TÍNH NĂNG CHỌN NHIỀU (BULK SELECTION) ──
  let selectedIds = new Set();
  let isSelectionMode = false;
  let pressTimer = null;
  let didLongPress = false;

  // Hàm escape HTML chống tấn công XSS
  const esc = (str) =>
    String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  // ── TỰ ĐỘNG ĐIỀU CHỈNH CHIỀU CAO BẢNG ──
  const BOTTOM_GAP = 32;
  function adjustTableHeight() {
    const wrapper = document.querySelector(".table-responsive");
    const pagination = document.getElementById("salary-pagination");
    if (!wrapper) return;

    const top = wrapper.getBoundingClientRect().top;
    const paginationHeight = pagination ? pagination.offsetHeight : 0;
    const available = window.innerHeight - top - paginationHeight - BOTTOM_GAP;

    wrapper.style.maxHeight = Math.max(available, 150) + "px";
    wrapper.style.height = "auto";
  }
  window.addEventListener("resize", adjustTableHeight);

  // ── LOGIC CHỌN NHIỀU DÒNG (LONG PRESS / CLICK) ──
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
      salaryList.forEach((s) => selectedIds.add(s.id));
    } else {
      salaryList.forEach((s) => selectedIds.delete(s.id));
      isSelectionMode = false;
    }
    updateBulkDeleteUI();
    salaryList.forEach((s) => updateRowVisuals(s.id));
  }

  function updateRowVisuals(id) {
    const row = document.getElementById(`row-sal-${id}`);
    const checkbox = document.getElementById(`cb-sal-${id}`);
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
    const tbody = document.getElementById("salary-table-body");
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
      const allSelected = salaryList.length > 0 && salaryList.every((s) => selectedIds.has(s.id));
      cbSelectAll.checked = allSelected;
      cbSelectAll.style.setProperty("display", isSelectionMode ? "inline-block" : "none", "important");
    }
  }

  async function deleteSelected() {
    if (window.utils) utils.showToast("Tính năng xóa đang được quản trị hệ thống nâng cấp!", "info");
  }

  // ── 1. TẢI DỮ LIỆU BẢNG LƯƠNG TỪ API ──
  async function loadData(page = 1) {
    if (isLoading) return;
    isLoading = true;

    selectedIds.clear();
    isSelectionMode = false;
    updateBulkDeleteUI();

    const tbody = document.getElementById("salary-table-body");
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4"><span class="spinner-border spinner-border-sm text-danger me-2"></span> Đang tải dữ liệu...</td></tr>`;

    const keyword = document.getElementById("search-salary").value.trim();
    const salaryMonth = document.getElementById("filter-month").value; 
    const status = document.getElementById("filter-status").value;

    let queryParams = `?page=${page}&limit=10`;
    if (keyword) queryParams += `&keyword=${encodeURIComponent(keyword)}`;
    if (status) queryParams += `&status=${status}`;
    if (salaryMonth) queryParams += `&salaryMonth=${salaryMonth}`;

    try {
      const res = await api.fetch(`/teachers/salaries${queryParams}`);
      if (!res?.data || !res?.pagination) throw new Error("Dữ liệu trả về không hợp lệ");

      salaryList = res.data;
      currentPage = res.pagination.page;
      totalPages = res.pagination.totalPages;

      renderTable(salaryList, res.pagination);
      renderPagination(res.pagination);
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4"><i class="fa-solid fa-triangle-exclamation me-1"></i> Có lỗi kết nối lấy dữ liệu lương!</td></tr>`;
    } finally {
      isLoading = false;
    }
  }

  function renderTable(data, pagination) {
    const tbody = document.getElementById("salary-table-body");
    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">Chưa có dữ liệu bảng lương trong kỳ.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map((item, index) => {
        const id = item.id;
        const stt = (pagination.page - 1) * pagination.limit + index + 1;
        const isPaid = String(item.status).toLowerCase() === "paid";
        
        const badgeStatus = isPaid
          ? '<span class="badge bg-success bg-opacity-10 text-success border border-success-subtle"><i class="fa-solid fa-check-double me-1"></i>Đã trả</span>'
          : '<span class="badge bg-warning bg-opacity-10 text-warning border border-warning-subtle"><i class="fa-regular fa-clock me-1"></i>Chờ chi</span>';

        const baseSalary = Number(item.salarySnapshot || item.snapshot_base_salary || 0);
        const deduction = Number(item.leaveDeductionAmount || item.leave_deduction_amount || item.deduction || 0);
        const netAmount = Number(item.netSalary || item.net_salary || item.finalAmount || 0);

        return `
        <tr id="row-sal-${id}" class="${selectedIds.has(id) ? "table-danger" : ""}" style="transition: background-color 0.2s;">
            <td class="ps-4"
                onmousedown="window.salaryManager.startPress(${id})"
                onmouseup="window.salaryManager.cancelPress()"
                onmouseleave="window.salaryManager.cancelPress()"
                ontouchstart="window.salaryManager.startPress(${id})"
                ontouchend="window.salaryManager.cancelPress()"
                onclick="window.salaryManager.toggleSelectIfMode(${id})"
                style="user-select: none; cursor: pointer; min-width: 80px;"
            >
                <div class="d-flex align-items-center gap-2">
                    <input type="checkbox" id="cb-sal-${id}" class="select-checkbox m-0"
                           ${selectedIds.has(id) ? "checked" : ""}
                           onclick="event.stopPropagation(); window.salaryManager.toggleSelection(${id})" />
                    <span class="text-muted fw-bold">${stt}</span>
                </div>
            </td>
            <td class="cell-text">
                <div class="fw-semibold text-dark">${esc(item.fullName)}</div>
                <div class="text-muted small">${esc(item.teacherCode)}</div>
            </td>
            <td class="cell-text fw-medium">${esc(item.salaryMonth || item.salary_month)}</td>
            <td class="cell-text text-dark">${baseSalary.toLocaleString("vi-VN")} đ</td>
            <td class="cell-text text-danger">-${deduction.toLocaleString("vi-VN")} đ</td>
            <td class="cell-text fw-bold text-success fs-6">${netAmount.toLocaleString("vi-VN")} đ</td>
            <td class="cell-text">${badgeStatus}</td>
            <td class="text-end pe-4">
                <button class="btn btn-sm btn-light border text-primary shadow-sm" onclick="event.stopPropagation(); window.salaryManager.openDetail(${id})" title="Xem chi tiết & Thanh toán">
                    <i class="fa-solid fa-file-invoice"></i> Chi tiết
                </button>
            </td>
        </tr>
      `;
      }).join("");

    setTimeout(adjustTableHeight, 50);
  }

  function renderPagination({ page, total, totalPages, limit }) {
    const container = document.getElementById("salary-pagination");
    if (!container) return;
    const from = total === 0 ? 0 : (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);
    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center px-4 py-3 border-top bg-white">
            <span class="text-muted small">Hiển thị <strong>${from}–${to}</strong> / <strong>${total}</strong> phiếu</span>
            <ul class="pagination pagination-sm mb-0 gap-1">
                <li class="page-item ${page <= 1 ? "disabled" : ""}"><button class="page-link rounded" onclick="window.salaryManager.goToPage(${page - 1})"><i class="fa-solid fa-chevron-left"></i></button></li>
                ${buildPageButtons(page, totalPages)}
                <li class="page-item ${page >= totalPages ? "disabled" : ""}"><button class="page-link rounded" onclick="window.salaryManager.goToPage(${page + 1})"><i class="fa-solid fa-chevron-right"></i></button></li>
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
      if (rangeStart > 2) html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
    }
    for (let i = rangeStart; i <= rangeEnd; i++) html += buildPageBtn(i, i === page);
    if (rangeEnd < totalPages) {
      if (rangeEnd < totalPages - 1) html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
      html += buildPageBtn(totalPages);
    }
    return html;
  }

  function buildPageBtn(p, isActive = false) {
    return `<li class="page-item ${isActive ? "active" : ""}"><button class="page-link rounded ${isActive ? "bg-danger border-danger" : ""}" onclick="window.salaryManager.goToPage(${p})">${p}</button></li>`;
  }

  function goToPage(page) {
    if (page < 1 || page > totalPages || isLoading) return;
    loadData(page);
  }

  function handleFilter() {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      loadData(1);
    }, 500);
  }

  // ── 2. XEM CHI TIẾT & THANH TOÁN LƯƠNG ──
  async function openDetail(id) {
    const modalEl = document.getElementById("salaryDetailModal");
    if (!modalEl) return;
    if (!modalInstance) modalInstance = new bootstrap.Modal(modalEl);

    const item = salaryList.find((s) => s.id === id);
    if (!item) return;

    document.getElementById("current-salary-id").value = id;
    document.getElementById("detail-teacher-name").textContent = item.fullName;
    document.getElementById("detail-teacher-code").textContent = `Mã GV: ${item.teacherCode}`;
    document.getElementById("detail-month").textContent = item.salaryMonth || item.salary_month;

    const baseSalary = Number(item.salarySnapshot || item.snapshot_base_salary || 0);
    const deduction = Number(item.leaveDeductionAmount || item.leave_deduction_amount || item.deduction || 0);
    const netAmount = Number(item.netSalary || item.net_salary || item.finalAmount || 0);
    
    const employedDaysText = (item.payableDays !== undefined || item.payable_days !== undefined) ? `${item.payableDays || item.payable_days} ngày` : "---";
    const unpaidLeavesText = (item.unpaidLeaveDays !== undefined || item.unpaid_leave_days !== undefined) ? `${item.unpaidLeaveDays || item.unpaid_leave_days} ngày` : "---";

    document.getElementById("detail-snapshot-salary").textContent = `${baseSalary.toLocaleString("vi-VN")} đ`;
    
    const elEmployed = document.getElementById("detail-employed-days");
    if(elEmployed) elEmployed.textContent = employedDaysText;
    
    const elUnpaid = document.getElementById("detail-unpaid-leaves");
    if(elUnpaid) elUnpaid.textContent = unpaidLeavesText;

    document.getElementById("detail-deduction").textContent = `${deduction.toLocaleString("vi-VN")} đ`;
    document.getElementById("detail-final-amount").textContent = `${netAmount.toLocaleString("vi-VN")} đ`;

    const statusBadge = document.getElementById("detail-status-badge");
    const btnPay = document.getElementById("btn-pay");

    if (String(item.status).toLowerCase() === "paid") {
      statusBadge.innerHTML = `<span class="badge bg-success"><i class="fa-solid fa-check-double me-1"></i>Đã thanh toán</span>`;
      btnPay.style.display = "none";
    } else {
      statusBadge.innerHTML = `<span class="badge bg-warning text-dark"><i class="fa-regular fa-clock me-1"></i>Chưa thanh toán</span>`;
      btnPay.style.display = "inline-block";
    }

    modalInstance.show();
  }

  async function markAsPaid() {
    const id = document.getElementById("current-salary-id").value;
    const btnPay = document.getElementById("btn-pay");

    try {
      btnPay.disabled = true;
      btnPay.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Đang xử lý...`;

      await api.fetch(`/teachers/salaries/${id}/pay`, {
        method: "PUT"
      });

      if (window.utils) utils.showToast("Đã ghi nhận thanh toán lương thành công!", "success");
      modalInstance.hide();
      loadData(currentPage);
    } catch (error) {
      if (window.utils) utils.showToast(error.message || "Lỗi hệ thống khi chốt thanh toán!", "danger");
    } finally {
      btnPay.disabled = false;
      btnPay.innerHTML = `<i class="fa-solid fa-check-double me-1"></i> Xác nhận Đã thanh toán`;
    }
  }

  // ── 3. CHỐT TÍNH LƯƠNG ĐỒNG LOẠT (TÍNH NĂNG CHÍNH ĐƯỢC YÊU CẦU) ──
  function openCalculateModal() {
    const modalEl = document.getElementById("calculateSalaryModal");
    if (!calcModalInstance) calcModalInstance = new bootstrap.Modal(modalEl);
    
    // Default lấy tháng hiện tại
    const today = new Date();
    document.getElementById("calc-salary-month").value = today.toISOString().substring(0, 7);
    
    // Clear dữ liệu nhập rác từ lần trước
    document.getElementById("calc-teacher-id").value = "";
    
    calcModalInstance.show();
  }

  /**
   * Thực thi gọi API tính lương
   * @param {boolean} isForce - Báo hiệu có cưỡng chế chốt lương khi chưa hết tháng (true/false)
   */
  async function submitCalculateSalary(isForce = false) {
    const salaryMonth = document.getElementById("calc-salary-month").value;
    const rawTeacherId = document.getElementById("calc-teacher-id").value.trim();

    // 1. Client-side Validation cơ bản
    if (!salaryMonth) {
        if (window.utils) utils.showToast("Vui lòng chọn tháng cần chốt kết xuất bảng lương", "warning");
        return;
    }

    const teacherId = rawTeacherId ? Number(rawTeacherId) : null;
    if (rawTeacherId && isNaN(teacherId)) {
        if (window.utils) utils.showToast("ID Giáo viên phải là một con số hợp lệ", "warning");
        return;
    }

    const btn = document.getElementById("btn-calculate");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Đang kết xuất...`;

    try {
        // Chuẩn bị Body theo API Spec
        const payload = { 
            salaryMonth: salaryMonth,
            forceRecalculate: isForce
        };
        
        if (teacherId !== null) {
            payload.teacherId = teacherId;
        }

        // 2. Fetch API xử lý logic
        const response = await api.fetch('/teachers/calculate-salary', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        // 3. Xử lý kịch bản thành công 200 OK
        const processCount = response?.data?.processedRecords || 0;
        if (window.utils) utils.showToast(`Hoàn tất! Đã tính toán và cập nhật lương cho ${processCount} giáo viên.`, "success");
        
        if (calcModalInstance) calcModalInstance.hide();
        
        // Cập nhật giá trị bộ lọc tháng để hiển thị đúng dữ liệu vừa chốt
        document.getElementById("filter-month").value = salaryMonth;
        loadData(1); 

    } catch (error) {
        // Nhận đối tượng lỗi được ném ra từ api.fetch đã được tùy chỉnh HTTP Status
        const status = error.status || (error.response && error.response.status);
        const errorMsg = error.message || "";

        // Bắt lỗi Validation Chốt Sớm (HTTP 400 Bad Request kèm thông báo đặc thù)
        if (status === 400 && errorMsg.toLowerCase().includes('chưa kết thúc')) {
            if (calcModalInstance) calcModalInstance.hide(); 
            
            // Khởi tạo và hiển thị Modal Confirm Cưỡng Chế
            if (!confirmEarlyModalInstance) {
                const modalEl = document.getElementById('confirmEarlySalaryModal');
                if (modalEl) confirmEarlyModalInstance = new bootstrap.Modal(modalEl);
            }
            if (confirmEarlyModalInstance) confirmEarlyModalInstance.show();
            
        // Bắt lỗi Xung đột do đã thanh toán (HTTP 409 Conflict)
        } else if (status === 409) {
            if (window.utils) utils.showToast("Lương tháng này đã được chốt và thanh toán (PAID). Không thể tính lại!", "danger");
        
        // Bắt lỗi không tìm thấy User hoặc dữ liệu (HTTP 404 Not Found)
        } else if (status === 404) {
            if (window.utils) utils.showToast("Không tìm thấy giáo viên hoặc giáo viên không có ca dạy hợp lệ trong kỳ này.", "danger");
            
        // Các lỗi khác (500 Server Error hoặc 400 format input)
        } else {
            if (window.utils) utils.showToast(errorMsg || "Lỗi hệ thống, vui lòng thử lại sau", "danger");
        }
    } finally {
        // Phục hồi UI nút bấm
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-bolt me-1"></i> Bắt đầu chạy dữ liệu`;
    }
  }

  /**
   * Gọi lại luồng tính lương với cờ cưỡng chế khi Admin xác nhận qua Modal phụ
   */
  function confirmEarlyCalculate() {
      if (confirmEarlyModalInstance) {
          confirmEarlyModalInstance.hide();
      }
      // Gọi lại chính hàm xử lý với flag isForce = true
      submitCalculateSalary(true);
  }

  // ── 4. ĐIỀU CHỈNH LƯƠNG CƠ BẢN GIÁO VIÊN ──
  function openUpdateSalaryModal() {
    const modalEl = document.getElementById("updateSalaryModal");
    if (!updateModalInstance) updateModalInstance = new bootstrap.Modal(modalEl);
    
    document.getElementById("mod-applied-date").value = new Date().toISOString().substring(0, 10);
    updateModalInstance.show();
  }

  async function submitUpdateSalary() {
    const teacherId = document.getElementById("mod-teacher-id").value;
    const newSalary = document.getElementById("mod-new-salary").value;
    const appliedDate = document.getElementById("mod-applied-date").value;
    const note = document.getElementById("mod-salary-note").value;
    
    if (!teacherId || !newSalary || !appliedDate) {
        if (window.utils) utils.showToast("Vui lòng nhập đầy đủ Mã ID, Mức lương và Ngày áp dụng", "warning");
        return;
    }

    const btn = document.getElementById("btn-update-salary");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Đang lưu...`;

    try {
        await api.fetch(`/teachers/${teacherId}/salary`, {
            method: 'PUT',
            body: JSON.stringify({ newSalary: Number(newSalary), appliedDate, note })
        });

        if (window.utils) utils.showToast("Cập nhật lương cơ bản và ghi nhận lịch sử thành công!", "success");
        
        document.getElementById("mod-teacher-id").value = "";
        document.getElementById("mod-new-salary").value = "";
        document.getElementById("mod-salary-note").value = "";
        
        updateModalInstance.hide();
        loadData(currentPage); 
    } catch (error) {
        if (window.utils) utils.showToast(error.message || "Cập nhật lương cơ bản thất bại!", "danger");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-floppy-disk me-1"></i> Lưu thiết lập`;
    }
  }

  // ── KHỞI TẠO DOM MẶC ĐỊNH KHI LOAD TRANG ──
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      document.getElementById("filter-month").value = new Date().toISOString().substring(0, 7);
      adjustTableHeight();
      loadData(1);
    });
  } else {
    document.getElementById("filter-month").value = new Date().toISOString().substring(0, 7);
    adjustTableHeight();
    loadData(1);
  }

  // Lộ diện các function ra Global (Window) để HTML trực tiếp gắn sự kiện onclick
  return {
    loadData,
    goToPage,
    handleFilter,
    openDetail,
    markAsPaid,
    openCalculateModal,
    submitCalculateSalary,
    confirmEarlyCalculate, 
    openUpdateSalaryModal,
    submitUpdateSalary,
    startPress,
    cancelPress,
    toggleSelectIfMode,
    toggleSelection,
    toggleSelectAll,
    deleteSelected,
  };
})();