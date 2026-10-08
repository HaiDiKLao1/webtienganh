(function () {
    // ---- STATE & MODALS ----
    let expenditureModalInstance = null;
    let debtModalInstance = null;
    let exportModalInstance = null;
    let opExpModalInstance = null;
    let deleteConfirmModalInstance = null;
    let revenueModalInstance = null; 
    
    let currentExpenditureMonth = "";
    let currentDebtPage = 1;

    // Ký tự Escape chống XSS
    const esc = (str) => String(str ?? "").replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

    window.initFinanceDashboard = async function () {
        const filterSelect = document.getElementById('financeTimeFilter');
        if (!filterSelect) return;

        // Xóa thể hiện Chart cũ
        if (window.myCashflowChartInstance) {
            window.myCashflowChartInstance.destroy();
        }

        buildMonthOptions();
        initModalBackdropCleaner();

        // Lắng nghe Click Drill-down Tổng Thu
        const cardTongThu = document.getElementById('card-tong-thu');
        if (cardTongThu) {
            cardTongThu.addEventListener('click', () => {
                const filterVal = filterSelect.value;
                let targetMonth = currentExpenditureMonth;
                if (filterVal === 'all') {
                    const now = new Date();
                    targetMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                } else {
                    targetMonth = filterVal;
                }
                openRevenueModal(targetMonth);
            });
        }

        // Lắng nghe Click Drill-down Tổng Chi
        const cardTongChi = document.getElementById('card-tong-chi');
        if (cardTongChi) {
            cardTongChi.addEventListener('click', () => {
                const filterVal = filterSelect.value;
                if (filterVal === 'all') {
                    const now = new Date();
                    currentExpenditureMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                } else {
                    currentExpenditureMonth = filterVal;
                }
                openExpenditureModal(currentExpenditureMonth, 'ALL');
            });
        }

        // Lắng nghe Click Drill-down Công Nợ
        const cardCongNo = document.getElementById('card-cong-no');
        if (cardCongNo) {
            cardCongNo.addEventListener('click', () => {
                openDebtModal();
            });
        }

        const expTypeFilter = document.getElementById('expenditureTypeFilter');
        if (expTypeFilter) {
            expTypeFilter.addEventListener('change', (e) => {
                loadExpenditures(currentExpenditureMonth, e.target.value);
            });
        }

        filterSelect.addEventListener('change', function (e) {
            loadFinanceData(e.target.value);
        });

        loadFinanceData(filterSelect.value);
    };

    function initModalBackdropCleaner() {
        document.querySelectorAll('.modal').forEach(modalEl => {
            modalEl.addEventListener('hidden.bs.modal', function () {
                const activeModal = document.querySelector('.modal.show');
                if (!activeModal) {
                    document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.remove());
                    document.body.classList.remove('modal-open');
                    document.body.style.removeProperty('padding-right');
                    document.body.style.removeProperty('overflow');
                } else {
                    document.body.classList.add('modal-open');
                }
            });
        });
    }

    function buildMonthOptions() {
        const filterSelect = document.getElementById('financeTimeFilter');
        filterSelect.innerHTML = '<option value="all" selected>6 tháng gần nhất</option>';
        const now = new Date();
        for (let i = 0; i < 6; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            filterSelect.innerHTML += `<option value="${year}-${month}">Tháng ${d.getMonth() + 1}/${year}</option>`;
        }
    }

    function formatDateToYYYYMMDD(dateObj) {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // ==========================================
    // 1. DASHBOARD CHÍNH
    // ==========================================
    async function loadFinanceData(timeValue) {
        let startDate, endDate;
        const now = new Date();

        if (timeValue === 'all') {
            const past = new Date(now.getFullYear(), now.getMonth() - 5, 1);
            startDate = formatDateToYYYYMMDD(past);
            endDate = formatDateToYYYYMMDD(now);
            document.getElementById('chartMainTitle').innerText = "Biến động Dòng tiền 6 tháng gần nhất";
        } else {
            const [year, month] = timeValue.split('-');
            startDate = `${year}-${month}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            endDate = `${year}-${month}-${lastDay}`;
            document.getElementById('chartMainTitle').innerText = `Biến động Dòng tiền Tháng ${parseInt(month)}/${year}`;
        }

        try {
            const res = await api.fetch('/finance/dashboard', {
                method: 'POST',
                body: JSON.stringify({ startDate, endDate })
            });
            if (res && res.success) renderDashboardUI(res.data);
        } catch (error) {
            if (typeof utils !== 'undefined') utils.showToast(error.message || "Không thể tải báo cáo tài chính!", "danger");
        }
    }

    function renderDashboardUI(data) {
        const summary = data.summary || {};
        document.getElementById('kpi-thu').innerText = `${Number(summary.totalRevenue || 0).toLocaleString('vi-VN')} đ`;
        document.getElementById('kpi-chi').innerText = `${Number(summary.totalExpenditure || 0).toLocaleString('vi-VN')} đ`;
        document.getElementById('kpi-loinhuan').innerText = `${Number(summary.netProfit || 0).toLocaleString('vi-VN')} đ`;
        document.getElementById('kpi-congno').innerText = `${Number(summary.totalDebt || 0).toLocaleString('vi-VN')} đ`;
        document.getElementById('subtext-congno').innerText = `Từ ${summary.debtStudentCount || 0} học sinh`;

        const txContainer = document.getElementById('latestTransactionsList');
        if (data.recentTransactions?.length > 0) {
            txContainer.innerHTML = data.recentTransactions.map(tx => {
                const isRev = tx.type === 'REVENUE';
                const sign = isRev ? '+' : '-';
                const colorClass = isRev ? 'text-success' : 'text-danger';
                const iconBg = isRev ? 'bg-soft-success text-thu' : 'bg-soft-danger text-chi';
                const txDate = new Date(tx.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit' });
                return `
                    <div class="d-flex align-items-center justify-content-between border-bottom pb-2">
                        <div class="d-flex align-items-center">
                            <div class="${iconBg} rounded-circle d-flex align-items-center justify-content-center me-3" style="width: 36px; height: 36px; font-weight: bold;">${sign}</div>
                            <div>
                                <h6 class="fw-bold mb-0 text-dark text-truncate" style="font-size:0.95rem; max-width: 180px;" title="${tx.title}">${tx.title}</h6>
                                <small class="text-muted">${txDate}</small>
                            </div>
                        </div>
                        <span class="${colorClass} fw-bold small">${sign}${Number(tx.amount).toLocaleString('vi-VN')}đ</span>
                    </div>`;
            }).join('');
        } else {
            txContainer.innerHTML = `<p class="text-muted small text-center py-3">Chưa có giao dịch phát sinh</p>`;
        }
        renderChart(data.chartData);
    }

    function renderChart(chartData) {
        if (!Array.isArray(chartData)) chartData = [];
        const canvas = document.getElementById('mainCashflowChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (window.myCashflowChartInstance) window.myCashflowChartInstance.destroy();

        const labels = chartData.map(item => item.month || '');
        const thuData = chartData.map(item => (item.revenue || 0) / 1000000);
        const chiData = chartData.map(item => (item.expenditure || 0) / 1000000);

        window.myCashflowChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Tổng Thu (VNĐ)', data: thuData, backgroundColor: '#1aa768', barPercentage: 0.6, categoryPercentage: 0.7 },
                    { label: 'Tổng Chi (VNĐ)', data: chiData, backgroundColor: '#e63946', barPercentage: 0.6, categoryPercentage: 0.7 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'top', align: 'center', labels: { boxWidth: 35, boxHeight: 12, font: { weight: '500' } } } },
                scales: {
                    y: { beginAtZero: true, min: 0, ticks: { callback: v => v + ' Tr' }, grid: { color: '#eaeaea' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // ==========================================
    // 2. DRILL-DOWN: TỔNG THU (LỌC TỪ SAO KÊ)
    // ==========================================
    async function openRevenueModal(monthStr) {
        const [year, month] = monthStr.split('-');
        document.getElementById('revenueMonthLabel').textContent = `${month}/${year}`;
        
        const modalEl = document.getElementById('revenueModal');
        if (!revenueModalInstance) revenueModalInstance = new bootstrap.Modal(modalEl);
        revenueModalInstance.show();
        
        const tbody = document.getElementById('revenueTableBody');
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4"><span class="spinner-border spinner-border-sm text-success me-2"></span> Đang nạp và lọc dữ liệu...</td></tr>`;

        const startDate = `${monthStr}-01`;
        const lastDay = new Date(year, parseInt(month), 0).getDate();
        const endDate = `${monthStr}-${lastDay}`;

        try {
            const res = await api.fetch('/finance/export', {
                method: 'POST',
                body: JSON.stringify({ startDate, endDate })
            });

            if (res && res.success && res.data && res.data.transactions) {
                const revenues = res.data.transactions.filter(t => t.transaction_type === 'THU');

                if (revenues.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">Không có khoản thu nào trong tháng này.</td></tr>`;
                    return;
                }

                tbody.innerHTML = revenues.map(item => {
                    const dateObj = new Date(item.transaction_date);
                    return `
                        <tr>
                            <td class="text-muted small">
                                <span class="fw-medium text-dark">${dateObj.toLocaleDateString('vi-VN')}</span><br>
                                ${dateObj.toLocaleTimeString('vi-VN')}
                            </td>
                            <td>
                                <div class="fw-semibold text-dark">${esc(item.description)}</div>
                            </td>
                            <td class="text-end fw-bold text-success">+${Number(item.amount).toLocaleString('vi-VN')} đ</td>
                            <td class="text-center">
                                <span class="badge bg-light text-dark border">${esc(item.method || 'K/XĐ')}</span>
                            </td>
                        </tr>
                    `;
                }).join('');
            } else {
                tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">Không có dữ liệu giao dịch.</td></tr>`;
            }
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger py-4">${error.message || 'Lỗi xử lý dữ liệu thu'}</td></tr>`;
        }
    }

    // ==========================================
    // 3. DRILL-DOWN: CÔNG NỢ (GET DEBTS)
    // ==========================================
    async function openDebtModal(page = 1) {
        currentDebtPage = page;
        const modalEl = document.getElementById('debtModal');
        if (!debtModalInstance) debtModalInstance = new bootstrap.Modal(modalEl);
        debtModalInstance.show();
        await fetchDebts(page);
    }

    async function fetchDebts(page) {
        const tbody = document.getElementById('debtTableBody');
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4"><span class="spinner-border spinner-border-sm text-danger me-2"></span> Đang tải...</td></tr>`;
        
        try {
            const res = await api.fetch('/finance/debts', {
                method: 'POST',
                body: JSON.stringify({ page: page, limit: 10 })
            });

            if (res && res.success) {
                if (res.data.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">Tuyệt vời! Không có học viên nào đang nợ học phí.</td></tr>`;
                    document.getElementById('debtPagination').innerHTML = '';
                    return;
                }

                tbody.innerHTML = res.data.map(item => {
                    const badge = item.status === 'partial' 
                        ? '<span class="badge bg-warning text-dark border border-warning-subtle">Nộp 1 phần</span>' 
                        : '<span class="badge bg-danger bg-opacity-10 text-danger border border-danger-subtle">Chưa nộp</span>';
                    return `
                        <tr>
                            <td class="ps-4">
                                <div class="fw-semibold text-dark">${esc(item.student_name)}</div>
                                <div class="text-muted small"><i class="fa-solid fa-phone me-1"></i>${esc(item.phone)}</div>
                            </td>
                            <td><span class="small fw-medium text-secondary">${esc(item.course_name)}</span></td>
                            <td class="text-end text-dark">${Number(item.final_amount).toLocaleString('vi-VN')} đ</td>
                            <td class="text-end text-success">${Number(item.paid_amount).toLocaleString('vi-VN')} đ</td>
                            <td class="text-end text-danger fw-bold">${Number(item.debt_amount).toLocaleString('vi-VN')} đ</td>
                            <td class="text-center text-muted">${esc(item.due_date)}</td>
                            <td class="text-center pe-4">${badge}</td>
                        </tr>
                    `;
                }).join('');
                renderDebtPagination(res.pagination);
            }
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">${error.message || 'Lỗi lấy công nợ'}</td></tr>`;
        }
    }

    function renderDebtPagination(pagination) {
        const totalPages = Math.ceil(pagination.total / pagination.limit);
        const container = document.getElementById('debtPagination');
        if (totalPages <= 1) { container.innerHTML = ''; return; }

        let html = `<ul class="pagination pagination-sm justify-content-end mb-0">`;
        html += `<li class="page-item ${pagination.page <= 1 ? 'disabled' : ''}"><button class="page-link" onclick="window.financeManager.openDebtModal(${pagination.page - 1})">Trước</button></li>`;
        for (let i = 1; i <= totalPages; i++) {
            html += `<li class="page-item ${i === pagination.page ? 'active' : ''}"><button class="page-link" onclick="window.financeManager.openDebtModal(${i})">${i}</button></li>`;
        }
        html += `<li class="page-item ${pagination.page >= totalPages ? 'disabled' : ''}"><button class="page-link" onclick="window.financeManager.openDebtModal(${pagination.page + 1})">Sau</button></li></ul>`;
        container.innerHTML = html;
    }

    // ==========================================
    // 4. DRILL-DOWN: CHI PHÍ VẬN HÀNH
    // ==========================================
    async function openExpenditureModal(month, type) {
        currentExpenditureMonth = month;
        const [yearStr, monthStr] = month.split('-');
        document.getElementById('expenditureMonthLabel').textContent = `${monthStr}/${yearStr}`;
        document.getElementById('expenditureTypeFilter').value = type;
        
        const modalEl = document.getElementById('expenditureModal');
        if (!expenditureModalInstance) expenditureModalInstance = new bootstrap.Modal(modalEl);
        expenditureModalInstance.show();
        await loadExpenditures(month, type);
    }

    async function loadExpenditures(month, type) {
        const tbody = document.getElementById('expenditureTableBody');
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4"><span class="spinner-border spinner-border-sm text-danger me-2"></span> Đang nạp...</td></tr>`;
        
        try {
            const res = await api.fetch('/finance/expenditures', { method: 'POST', body: JSON.stringify({ month, type }) });
            if (res && res.success) {
                if (res.data.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Chưa có giao dịch chi tiêu nào.</td></tr>`;
                    return;
                }
                tbody.innerHTML = res.data.map(item => {
                    const isSalary = item.category === 'SALARY';
                    const badgeClass = isSalary ? 'bg-primary bg-opacity-10 text-primary border-primary-subtle' : 'bg-warning text-dark border-warning-subtle';
                    const dateObj = new Date(item.transaction_date);
                    
                    let actions = isSalary ? '' : `
                        <div class="d-flex justify-content-center gap-1">
                            <button class="btn btn-sm btn-light border text-primary px-2" onclick="window.financeManager.openOperatingExpenseModal(${item.id}, '${esc(item.payee_name)}', ${item.amount}, '${month}')"><i class="fa-solid fa-pen"></i></button>
                            <button class="btn btn-sm btn-light border text-danger px-2" onclick="window.financeManager.confirmDeleteExpense(${item.id})"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    `;

                    return `
                        <tr>
                            <td class="text-muted small"><span class="fw-medium text-dark">${dateObj.toLocaleDateString('vi-VN')}</span><br>${dateObj.toLocaleTimeString('vi-VN')}</td>
                            <td class="fw-medium text-dark">${esc(item.payee_name)}</td>
                            <td><span class="badge border ${badgeClass}">${isSalary ? 'Lương' : 'Vận hành'}</span></td>
                            <td class="text-end fw-bold text-danger">-${Number(item.amount).toLocaleString('vi-VN')} đ</td>
                            <td class="align-middle">${actions}</td>
                        </tr>
                    `;
                }).join('');
            }
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">${error.message}</td></tr>`;
        }
    }

    // ---- CRUD CHI PHÍ VẬN HÀNH ----
    function openOperatingExpenseModal(id = '', name = '', amount = '', month = '') {
        const modalEl = document.getElementById('operatingExpenseModal');
        if (!opExpModalInstance) opExpModalInstance = new bootstrap.Modal(modalEl);
        
        document.getElementById('opExpId').value = id;
        document.getElementById('opExpName').value = name;
        document.getElementById('opExpAmount').value = amount;
        
        const defaultMonth = month || currentExpenditureMonth || new Date().toISOString().substring(0,7);
        document.getElementById('opExpMonth').value = defaultMonth;
        
        document.getElementById('opExpModalTitle').textContent = id ? 'Chỉnh sửa Chi phí' : 'Ghi nhận Chi phí mới';
        opExpModalInstance.show();
    }

    async function saveOperatingExpense() {
        const id = document.getElementById('opExpId').value;
        const expenseName = document.getElementById('opExpName').value.trim();
        const amount = document.getElementById('opExpAmount').value;
        const expenseMonth = document.getElementById('opExpMonth').value;

        if (!expenseName || !amount) {
            if (typeof utils !== 'undefined') utils.showToast("Vui lòng điền đủ Tên khoản chi và Số tiền", "warning");
            return;
        }

        const btn = document.getElementById('btn-save-expense');
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Đang lưu...`;

        try {
            const payload = { expenseName, amount: Number(amount), expenseMonth };
            const method = id ? 'PUT' : 'POST';
            const endpoint = id ? `/finance/operating-expenses/${id}` : `/finance/operating-expenses`;

            const res = await api.fetch(endpoint, {
                method: method,
                body: JSON.stringify(payload)
            });

            if (res && res.success) {
                if (typeof utils !== 'undefined') utils.showToast(res.message, "success");
                opExpModalInstance.hide();
                if (currentExpenditureMonth) {
                    loadExpenditures(currentExpenditureMonth, document.getElementById('expenditureTypeFilter').value);
                }
                loadFinanceData(document.getElementById('financeTimeFilter').value);
            }
        } catch (error) {
            if (typeof utils !== 'undefined') utils.showToast(error.message || "Lỗi lưu chi phí", "danger");
        } finally {
            btn.disabled = false;
            btn.innerHTML = `Lưu chi phí`;
        }
    }

    function confirmDeleteExpense(id) {
        const modalEl = document.getElementById('deleteConfirmModal');
        if (!deleteConfirmModalInstance) deleteConfirmModalInstance = new bootstrap.Modal(modalEl);
        document.getElementById('deleteExpenseId').value = id;
        deleteConfirmModalInstance.show();
    }

    async function deleteOperatingExpense() {
        const id = document.getElementById('deleteExpenseId').value;
        const btn = document.getElementById('btn-confirm-delete');
        btn.disabled = true;
        
        try {
            const res = await api.fetch(`/finance/operating-expenses/${id}`, { method: 'DELETE' });
            if (res && res.success) {
                if (typeof utils !== 'undefined') utils.showToast(res.message, "success");
                deleteConfirmModalInstance.hide();
                loadExpenditures(currentExpenditureMonth, document.getElementById('expenditureTypeFilter').value);
                loadFinanceData(document.getElementById('financeTimeFilter').value);
            }
        } catch (error) {
            if (typeof utils !== 'undefined') utils.showToast(error.message || "Lỗi xóa dữ liệu", "danger");
        } finally {
            btn.disabled = false;
        }
    }

    // ==========================================
    // 5. XUẤT SAO KÊ EXCEL BẰNG SHEETJS (XLSX)
    // ==========================================
    
    // Tải động thư viện XLSX để định dạng được cột Excel thay vì xuất CSV thuần
    function loadXLSXLibrary() {
        return new Promise((resolve, reject) => {
            if (window.XLSX) return resolve();
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Không tải được thư viện xuất Excel, kiểm tra mạng!"));
            document.head.appendChild(script);
        });
    }

    function openExportModal() {
        const modalEl = document.getElementById('exportModal');
        if (!exportModalInstance) exportModalInstance = new bootstrap.Modal(modalEl);
        
        const now = new Date();
        const start = new Date();
        start.setDate(1);
        
        document.getElementById('exportStartDate').value = formatDateToYYYYMMDD(start);
        document.getElementById('exportEndDate').value = formatDateToYYYYMMDD(now);
        exportModalInstance.show();
    }

    async function submitExport() {
        const startDate = document.getElementById('exportStartDate').value;
        const endDate = document.getElementById('exportEndDate').value;

        if (!startDate || !endDate) {
            if (typeof utils !== 'undefined') utils.showToast("Vui lòng chọn đầy đủ ngày", "warning");
            return;
        }

        const dStart = new Date(startDate);
        const dEnd = new Date(endDate);
        if (dStart > dEnd) {
            if (typeof utils !== 'undefined') utils.showToast("Ngày bắt đầu không được lớn hơn ngày kết thúc", "warning");
            return;
        }

        const diffTime = Math.abs(dEnd - dStart);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        if (diffDays > 365) {
            if (typeof utils !== 'undefined') utils.showToast("Khoảng thời gian sao kê không được vượt quá 1 năm", "warning");
            return;
        }

        const btn = document.getElementById('btn-submit-export');
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Đang xử lý...`;

        try {
            await loadXLSXLibrary();

            const res = await api.fetch('/finance/export', {
                method: 'POST',
                body: JSON.stringify({ startDate, endDate })
            });

            if (res && res.success && res.data) {
                exportToExcel(res.data.transactions, startDate, endDate);
                if (typeof utils !== 'undefined') utils.showToast("Xuất Excel thành công", "success");
                exportModalInstance.hide();
            }
        } catch (error) {
            if (typeof utils !== 'undefined') utils.showToast(error.message || "Lỗi trích xuất sao kê", "danger");
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-download me-1"></i> Tải file Excel`;
        }
    }

    // Logic xuất file XLSX định dạng chuẩn
    function exportToExcel(transactions, start, end) {
        if (!transactions || transactions.length === 0) {
            if (typeof utils !== 'undefined') utils.showToast("Không có giao dịch nào để xuất", "info");
            return;
        }

        // Tạo dữ liệu mảng cấu trúc chuẩn cho SheetJS
        const rows = transactions.map(tx => {
            const d = new Date(tx.transaction_date).toLocaleString('vi-VN');
            return {
                "STT": tx.stt,
                "Thời Gian": d,
                "Phân Loại": tx.transaction_type,
                "Nội Dung": tx.description,
                "Phương Thức": tx.method || "K/XĐ",
                "Số Tiền (VNĐ)": tx.amount
            };
        });

        // Tạo sheet
        const worksheet = XLSX.utils.json_to_sheet(rows);

        // Thiết lập độ rộng cột tùy chỉnh rất rộng để không bị khuyết chữ
        worksheet['!cols'] = [
            { wch: 8 },   // Cột STT
            { wch: 25 },  // Cột Thời Gian
            { wch: 20 },  // Cột Phân Loại
            { wch: 50 },  // Cột Nội Dung (rất rộng)
            { wch: 20 },  // Cột Phương Thức
            { wch: 20 }   // Cột Số Tiền
        ];

        // Tạo workbook và gắn sheet vào
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Sao Ke Tai Chinh");

        // Xuất file
        XLSX.writeFile(workbook, `SaoKe_TaiChinh_${start}_den_${end}.xlsx`);
    }

    window.financeManager = {
        openRevenueModal,
        openDebtModal,
        openOperatingExpenseModal,
        saveOperatingExpense,
        confirmDeleteExpense,
        deleteOperatingExpense,
        openExportModal,
        submitExport
    };

    if (document.getElementById('financeTimeFilter')) {
        window.initFinanceDashboard();
    }
})();