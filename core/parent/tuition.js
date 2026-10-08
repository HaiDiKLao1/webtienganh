window.tuitionManager = (() => {
  // CẤU HÌNH DOM VÀ BIẾN
  const tableBody = document.getElementById("tuitionDataBody");
  const user = typeof auth !== "undefined" ? auth.getUser() : null;
  let pollingInterval = null; // Biến lưu vòng lặp kiểm tra thanh toán

  // Tiện ích chống XSS
  const esc = (str) =>
    String(str ?? "").replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[m],
    );

  // Hàm format tiền VND
  function formatVND(amount) {
    return Number(amount).toLocaleString("vi-VN") + " đ";
  }

  // =========================================================================
  // 1. TẢI DỮ LIỆU TỪ API
  // =========================================================================
  async function loadTuitionData() {
    if (!tableBody) return;
    tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-4"><span class="spinner-border spinner-border-sm text-danger me-2"></span> Đang tải dữ liệu học phí...</td></tr>`;

    try {
      const parentId = user ? user.id : null;
      if (!parentId) throw new Error("Không tìm thấy thông tin Phụ huynh.");

      const res = await api.fetch(`/parents/${parentId}/tuition`);
      const tuitionList = res.data || [];

      if (tuitionList.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">Chưa có dữ liệu học phí nào cần thanh toán.</td></tr>`;
        return;
      }

      tableBody.innerHTML = tuitionList
        .map((item) => {
          const invoiceId = item.invoiceId || null; // ĐÃ THÊM: Lấy invoiceId từ dữ liệu
          const studentCode = item.studentCode || "---";
          const fullName = item.fullName || "Chưa cập nhật";
          const className = item.className || "Chưa xếp lớp";
          const totalSessions = item.totalSessions || 0;

          const originalFee = parseFloat(item.totalAmount) || 0;
          const finalFee = parseFloat(item.finalAmount) || 0;
          const paidFee = parseFloat(item.paidAmount) || 0;
          const dueFee = parseFloat(item.remainingAmount) || 0;

          let feeDisplayHtml = "";
          if (originalFee > finalFee) {
            feeDisplayHtml = `
                <div class="fw-bold text-danger">${formatVND(finalFee)}</div>
                <div class="text-muted small text-decoration-line-through mb-1">${formatVND(originalFee)}</div>
            `;
          } else {
            feeDisplayHtml = `<div class="fw-bold text-dark">${formatVND(finalFee)}</div>`;
          }

          let actionColumnContent = "";

          if (dueFee <= 0 && finalFee > 0) {
            actionColumnContent = `
                        <span class="badge bg-success-subtle text-success badge-status fw-bold px-2 py-2">
                            <i class="fa-solid fa-circle-check me-1"></i> Đã hoàn thành
                        </span>
                    `;
          } else {
            // ĐÃ SỬA: Truyền thêm invoiceId vào hàm openPaymentModal
            actionColumnContent = `
                        <button type="button" class="btn btn-sm btn-danger px-3 btn-pay-now fw-medium rounded-1 shadow-sm" 
                                onclick="event.preventDefault(); window.tuitionManager.openPaymentModal(${invoiceId}, '${esc(studentCode)}', '${esc(fullName)}', '${esc(className)}', ${originalFee}, ${finalFee}, ${paidFee}, ${dueFee})">
                            <i class="fa-solid fa-credit-card me-1"></i> Nạp tiền
                        </button>
                    `;
          }

          return `
                    <tr>
                        <td class="py-3">
                            <span class="badge bg-light text-dark border px-2 py-1 fw-semibold">${esc(studentCode)}</span>
                        </td>
                        <td class="py-3 fw-bold text-dark text-start ps-4">${esc(fullName)}</td>
                        <td class="py-3"><span class="badge bg-light border text-dark fw-medium px-2 py-1">${esc(className)}</span></td>
                        <td class="py-3"><span class="fw-semibold text-secondary">${totalSessions} buổi</span></td>
                        <td class="py-3">${feeDisplayHtml}</td>
                        <td class="py-3 fw-bold text-success">${formatVND(paidFee)}</td>
                        <td class="py-3 text-end pe-4">${actionColumnContent}</td>
                    </tr>
                `;
        })
        .join("");
    } catch (error) {
      console.error("Lỗi lấy dữ liệu học phí:", error);
      tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">Không thể kết nối đến máy chủ để lấy dữ liệu!</td></tr>`;
    }
  }

  // =========================================================================
  // 2. LOGIC ĐỐI SOÁT THANH TOÁN (POLLING)
  // =========================================================================
  function stopPolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
      console.log("Đã dừng tiến trình kiểm tra thanh toán.");
    }
  }

  async function checkPaymentStatus(orderCode, amountExpected) {
    try {
      const res = await api.fetch(`/transactions/check?orderCode=${orderCode}`);

      if (res && res.data && res.data.isSuccess) {
        stopPolling();

        const modalBody = document.querySelector("#paymentModal .modal-body");
        modalBody.innerHTML = `
            <div class="text-center py-4 animate__animated animate__zoomIn">
                <div class="mb-3">
                    <i class="fa-solid fa-circle-check text-success" style="font-size: 5rem;"></i>
                </div>
                <h4 class="fw-bold text-success mb-2">Thanh toán thành công!</h4>
                <p class="text-muted mb-4">Hệ thống đã ghi nhận giao dịch của bạn.</p>
                
                <div class="bg-success bg-opacity-10 border border-success border-opacity-25 rounded-3 p-3 mx-auto mb-4" style="max-width: 300px;">
                    <div class="text-success small fw-bold text-uppercase mb-1">Số tiền đã nhận</div>
                    <h3 class="fw-bold text-success mb-0">${formatVND(amountExpected)}</h3>
                </div>

                <div class="spinner-border spinner-border-sm text-success mb-2" role="status"></div>
                <p class="small text-muted">Đang cập nhật dữ liệu...</p>
            </div>
        `;

        if (navigator.vibrate) navigator.vibrate(150);

        setTimeout(() => {
          const modalEl = document.getElementById("paymentModal");
          const modalInstance = bootstrap.Modal.getInstance(modalEl);
          if (modalInstance) {
            modalInstance.hide();
          }
          loadTuitionData();
        }, 2000);
      }
    } catch (error) {
      // Bỏ qua lỗi ngầm
    }
  }

  // =========================================================================
  // 3. MỞ POPUP TẠO GIAO DỊCH
  // =========================================================================
  // ĐÃ SỬA: Thêm tham số invoiceId vào đầu
  function openPaymentModal(
    invoiceId,
    studentCode,
    studentName,
    className,
    original,
    total,
    paid,
    due,
  ) {
    stopPolling();

    const modalBody = document.querySelector("#paymentModal .modal-body");
    // ĐÃ SỬA: Truyền invoiceId lại vào nút Đổi số tiền thanh toán
    modalBody.innerHTML = `
      <div id="infoSection">
        <div class="text-start bg-light p-3 rounded-3 mb-3 border border-light-subtle">
          <p class="mb-2"><strong>Học sinh:</strong> <span id="modalStudentName" class="text-dark fw-bold"></span></p>
          <p class="mb-2"><strong>Khóa học:</strong> <span id="modalClassName" class="text-dark fw-medium"></span></p>
          <hr class="my-2" />
          <p class="mb-2"><strong>Học phí gốc:</strong> <span id="modalTotalFee" class="text-secondary"></span></p>
          <p class="mb-2"><strong>Số tiền đã đóng:</strong> <span id="modalPaidFee" class="text-success"></span></p>
          <p class="mb-0 fs-6"><strong>Còn nợ:</strong> <span id="modalDueFee" class="text-danger fw-bold fs-5"></span></p>
        </div>

        <div class="text-start mb-3" id="inputArea">
          <label class="form-label fw-bold text-dark small mb-1">Nhập số tiền bạn muốn đóng (VNĐ):</label>
          <div class="input-group">
            <input type="number" class="form-control fw-bold text-danger" id="inputPayAmount" placeholder="Nhập số tiền..." min="0" />
            <button type="button" class="btn btn-danger fw-medium px-3" id="btnGenerateQR">
              <i class="fa-solid fa-qrcode me-1"></i> Bắt đầu thanh toán
            </button>
          </div>
          <small class="text-muted d-block mt-1" style="font-size: 0.75rem">Hệ thống sẽ tự điều chỉnh nếu bạn nhập quá số nợ.</small>
        </div>
      </div>

      <div id="iframeSection" class="d-none animate__animated animate__fadeInUp">
          <div class="w-100 position-relative rounded-3 overflow-hidden border shadow-sm" style="height: 480px; background: #f8f9fa;">
              <div id="iframeLoader" class="position-absolute top-50 start-50 translate-middle text-center">
                  <div class="spinner-border text-danger mb-2" role="status"></div>
                  <div class="small text-muted fw-bold">Đang kết nối cổng thanh toán...</div>
              </div>
              <iframe id="payosIframe" src="" width="100%" height="100%" frameborder="0" allow="clipboard-write" style="position: relative; z-index: 2;"></iframe>
          </div>
          <button type="button" class="btn btn-sm btn-outline-secondary mt-3 w-100 fw-medium" onclick="event.preventDefault(); window.tuitionManager.openPaymentModal(${invoiceId}, '${esc(studentCode)}', '${esc(studentName)}', '${esc(className)}', ${original}, ${total}, ${paid}, ${due})">
             <i class="fa-solid fa-arrow-left me-1"></i> Đổi số tiền thanh toán
          </button>
      </div>
    `;

    document.getElementById("modalStudentName").innerText = studentName;
    document.getElementById("modalClassName").innerText = className;

    const modalTotalFeeEl = document.getElementById("modalTotalFee");
    if (original > total) {
      modalTotalFeeEl.innerHTML = `<span class="text-muted text-decoration-line-through small me-2">${formatVND(original)}</span> <span class="text-danger fw-bold">${formatVND(total)}</span>`;
    } else {
      modalTotalFeeEl.innerHTML = `<span class="text-dark fw-bold">${formatVND(total)}</span>`;
    }

    document.getElementById("modalPaidFee").innerText = formatVND(paid);
    document.getElementById("modalDueFee").innerText = formatVND(due);

    const inputAmount = document.getElementById("inputPayAmount");
    const btnGenerate = document.getElementById("btnGenerateQR");

    inputAmount.value = due;

    inputAmount.oninput = function () {
      let val = parseInt(this.value);
      if (val < 0) this.value = 0;
      if (val > due) {
        this.value = due;
        if (window.utils)
          window.utils.showToast(
            "Số tiền không được vượt quá số nợ!",
            "warning",
          );
      }
    };

    btnGenerate.onclick = async function (e) {
      e.preventDefault();

      let payValue = parseInt(inputAmount.value);
      if (!payValue || payValue <= 0) {
        if (window.utils)
          window.utils.showToast("Vui lòng nhập số tiền hợp lệ", "warning");
        return;
      }

      const originalText = btnGenerate.innerHTML;
      btnGenerate.disabled = true;
      inputAmount.disabled = true;
      btnGenerate.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Đang kết nối...`;

      try {
        // ĐÃ SỬA: Thay description bằng invoiceId theo đúng yêu cầu
        const payload = {
          amount: payValue,
          invoiceId: invoiceId,
        };

        const res = await api.fetch("/transactions/create-payment", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        if (res && res.error) throw new Error(res.message);

        document.getElementById("infoSection").classList.add("d-none");
        document.getElementById("iframeSection").classList.remove("d-none");

        document.getElementById("payosIframe").src = res.data.checkoutUrl;

        document.getElementById("payosIframe").onload = function () {
          document.getElementById("iframeLoader").classList.add("d-none");
        };

        const orderCode = res.data.orderCode;

        stopPolling();
        pollingInterval = setInterval(() => {
          checkPaymentStatus(orderCode, payValue);
        }, 3000);
      } catch (err) {
        console.error("Lỗi tạo thanh toán:", err);
        if (window.utils)
          window.utils.showToast(
            err.message || "Lỗi tạo cổng thanh toán!",
            "danger",
          );
      } finally {
        btnGenerate.disabled = false;
        inputAmount.disabled = false;
        btnGenerate.innerHTML = originalText;
      }
    };

    const modalEl = document.getElementById("paymentModal");
    if (modalEl) {
      let myModal = bootstrap.Modal.getInstance(modalEl);
      if (!myModal) {
        myModal = new bootstrap.Modal(modalEl);
      }
      myModal.show();
    }
  }

  // =========================================================================
  // 4. LẮNG NGHE SỰ KIỆN KHI ĐÓNG MODAL VÀ KHỞI TẠO
  // =========================================================================
  function initEvents() {
    loadTuitionData();

    const paymentModalEl = document.getElementById("paymentModal");
    if (paymentModalEl) {
      paymentModalEl.addEventListener("hidden.bs.modal", () => {
        stopPolling();
        const payosIframe = document.getElementById("payosIframe");
        if (payosIframe) {
          payosIframe.src = "";
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEvents);
  } else {
    initEvents();
  }

  return {
    loadTuitionData,
    openPaymentModal,
  };
})();
