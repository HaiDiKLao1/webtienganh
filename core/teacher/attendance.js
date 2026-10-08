window.teacherAttendance = (() => {
  // Lấy dữ liệu tạm từ trang Lịch dạy
  const activeSessionId = sessionStorage.getItem("targetSessionId");
  const activeClassCode = sessionStorage.getItem("targetClassCode") || "";
  const storedSessionInfo = (() => {
    try {
      const raw = sessionStorage.getItem("targetSessionInfo");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  // Xóa ngay tránh rác cache
  sessionStorage.removeItem("targetSessionId");
  sessionStorage.removeItem("targetClassCode");
  sessionStorage.removeItem("targetSessionInfo");

  if (!activeSessionId) {
    renderNoSession();
  }

  let activeSessionInfo = storedSessionInfo;
  let isReadOnly = false;
  let isAssistant = false;
  let selectedTempStatus = null; // Trạng thái đang chọn nháp trước khi bấm xác nhận

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

  function renderNoSession() {
    const main = document.querySelector(".container-fluid");
    if (!main) return;

    main.innerHTML = `
      <div class="d-flex flex-column align-items-center justify-content-center py-5 text-center">
        <i class="fa-regular fa-calendar-xmark text-secondary opacity-25 mb-3" style="font-size: 5rem;"></i>
        <h5 class="fw-bold text-dark mb-1">Không có buổi học nào được chọn</h5>
        <p class="text-muted small mb-3">
          Vui lòng vào mục <b>Lịch dạy</b> và nhấn <b>Vào lớp</b> để bắt đầu điểm danh.
        </p>
        <button class="btn btn-danger px-4" onclick="router.loadPage('/core/teacher/calendar.html', 'main-content')">
          <i class="fa-regular fa-calendar me-1"></i> Quay lại lịch dạy
        </button>
      </div>
    `;
  }

  // Trạng thái buổi học giờ lấy thẳng từ activeSessionInfo (đổ từ DB qua loadStudents),
  // KHÔNG còn đọc từ localStorage để tránh lệch dữ liệu giữa các máy/giáo viên.
  function getClassStatus() {
    return activeSessionInfo?.class_status || "scheduled";
  }

  function createLocalDateTime(dateStr, timeStr) {
    const [year, month, day] = String(dateStr).split("-").map(Number);
    const [hour, minute] = String(timeStr || "00:00")
      .split(":")
      .map(Number);
    return new Date(
      year,
      (month || 1) - 1,
      day || 1,
      hour || 0,
      minute || 0,
      0,
      0,
    );
  }

  function isSessionEnded(session) {
    if (!session?.date || !session?.end) return false;
    const endTime = createLocalDateTime(session.date, session.end);
    return new Date() > endTime;
  }

  function isClassTimeStarted(session) {
    if (!session?.date || !session?.start) return false;
    const startTime = createLocalDateTime(session.date, session.start);
    return new Date() >= startTime;
  }

  function getStatusText(status) {
    const map = {
      PRESENT: "Có mặt",
      ABSENT: "Vắng",
      LATE: "Muộn",
      EXCUSED: "Có phép",
    };
    return map[status] || "Chưa điểm danh";
  }

  // ── 1. RENDER GIAO DIỆN THÔNG TIN BUỔI HỌC ──────────────────────────────
  function renderSessionInfo() {
    const box = document.getElementById("session-info-box");
    if (!box) return;

    const classStatus = getClassStatus();
    const ended = isSessionEnded(activeSessionInfo);
    const timeStarted = isClassTimeStarted(activeSessionInfo);

    // Giáo viên chính đã từng đổi trạng thái khác "scheduled" (mặc định ban đầu) => coi như đã chốt.
    // Lấy trực tiếp từ DB (activeSessionInfo.class_status), không dùng cờ localStorage riêng nữa.
    const isConfirmed = classStatus !== "scheduled";

    const dateText = activeSessionInfo?.date
      ? activeSessionInfo.date.split("-").reverse().join("/")
      : "---";

    let badgeHtml = "";
    let noticeHtml = "";
    let actionAreaHtml = "";

    // LOGIC RENDER CỦA HUY HIỆU (BADGE)
    if (classStatus === "cancelled") {
      badgeHtml = `<span class="badge rounded-pill bg-secondary fs-6 px-3 py-2 shadow-sm"><i class="fa-solid fa-ban me-1"></i> Lớp Nghỉ</span>`;
    } else if (!timeStarted) {
      badgeHtml = `<span class="badge rounded-pill bg-warning text-dark fs-6 px-3 py-2 shadow-sm"><i class="fa-regular fa-hourglass-half me-1"></i> Chưa diễn ra</span>`;
    } else {
      if (ended) {
        badgeHtml =
          classStatus === "substitute"
            ? `<span class="badge rounded-pill bg-primary fs-6 px-3 py-2 shadow-sm"><i class="fa-solid fa-chalkboard-user me-1"></i> Đã dạy thay</span>`
            : `<span class="badge rounded-pill bg-success fs-6 px-3 py-2 shadow-sm"><i class="fa-solid fa-circle-check me-1"></i> Đã dạy chính</span>`;
      } else {
        badgeHtml =
          classStatus === "substitute"
            ? `<span class="badge rounded-pill bg-primary fs-6 px-3 py-2 shadow-sm"><i class="fa-solid fa-chalkboard-user me-1"></i> Đang dạy thay</span>`
            : `<span class="badge rounded-pill bg-success fs-6 px-3 py-2 shadow-sm"><i class="fa-solid fa-circle-check me-1"></i> Đang dạy chính</span>`;
      }
    }

    // LOGIC CHIA QUYỀN TRỢ GIẢNG & GIÁO VIÊN
    if (isAssistant) {
      if (classStatus === "cancelled") {
        noticeHtml = `<div class="session-lock-notice cancel"><i class="fa-solid fa-circle-info"></i> Buổi học đã được Giáo viên báo nghỉ.</div>`;
      } else if (!timeStarted) {
        noticeHtml = `<div class="session-lock-notice upcoming"><i class="fa-solid fa-clock"></i> Chưa đến giờ học. Bạn là Trợ giảng, vui lòng đợi đến giờ.</div>`;
      } else if (ended) {
        noticeHtml = `<div class="session-lock-notice study"><i class="fa-solid fa-lock"></i> Buổi học đã kết thúc. Dữ liệu đã được chốt.</div>`;
      } else {
        noticeHtml = `<div class="session-lock-notice upcoming"><i class="fa-solid fa-circle-info"></i> Buổi học đang diễn ra. Bạn có quyền điểm danh.</div>`;
      }
    } else {
      // GIÁO VIÊN CHÍNH
      if (ended) {
        noticeHtml = `<div class="session-lock-notice study"><i class="fa-solid fa-lock"></i> Buổi học đã kết thúc. Dữ liệu đã được chốt.</div>`;
      } else if (isConfirmed || classStatus === "cancelled") {
        noticeHtml = `<div class="session-lock-notice upcoming"><i class="fa-solid fa-lock"></i> Bạn đã chốt trạng thái buổi học này.</div>`;
      } else {
        noticeHtml = `<div class="session-lock-notice upcoming"><i class="fa-solid fa-circle-info"></i> Nếu không chọn, đến giờ sẽ mặc định là <b>Dạy chính</b>.</div>`;

        // Thanh nút bấm Action
        actionAreaHtml = `
          <div class="mt-3 text-end" id="status-selection-area">
             <div class="session-meta-label mb-2">Chốt trạng thái (Chỉ chọn 1 lần duy nhất)</div>
             <div class="d-flex gap-2 flex-wrap justify-content-end" id="status-action-buttons">
                <button class="btn btn-sm btn-outline-success status-btn fw-bold px-3" data-status="scheduled" onclick="window.teacherAttendance.selectStatus('scheduled')">
                  <i class="fa-solid fa-circle-check me-1"></i> Dạy chính
                </button>
                <button class="btn btn-sm btn-outline-primary status-btn fw-bold px-3" data-status="substitute" onclick="window.teacherAttendance.selectStatus('substitute')">
                  <i class="fa-solid fa-chalkboard-user me-1"></i> Dạy thay
                </button>
                <button class="btn btn-sm btn-outline-danger status-btn fw-bold px-3" data-status="cancelled" onclick="window.teacherAttendance.selectStatus('cancelled')">
                  <i class="fa-solid fa-ban me-1"></i> Báo Nghỉ
                </button>
             </div>
             <div id="confirm-status-container" class="mt-2 d-none text-end animate__animated animate__fadeIn">
                <button class="btn btn-sm btn-dark px-3 fw-bold shadow-sm" id="btn-confirm-status" onclick="window.teacherAttendance.submitStatus()">
                   <i class="fa-solid fa-check me-1"></i> Xác nhận: <span id="confirm-status-text"></span>
                </button>
             </div>
          </div>
         `;
      }
    }

    // RENDER RA HTML
    box.innerHTML = `
    <div class="card-body py-3 px-4">
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-3">
        <div class="flex-grow-1">
          <h6 class="fw-bold text-danger mb-3 fs-6">
            <i class="fa-regular fa-calendar-check me-2"></i>Thông tin buổi học
          </h6>
          <div class="row g-3">
            <div class="col-6 col-md-3">
              <div class="session-meta-label">Ngày học</div>
              <div class="session-meta-value fw-bold">${esc(dateText)}</div>
            </div>
            <div class="col-6 col-md-3">
              <div class="session-meta-label">Thời gian</div>
              <div class="session-meta-value fw-bold">
                ${esc(activeSessionInfo?.start || "--:--")} – ${esc(activeSessionInfo?.end || "--:--")}
              </div>
            </div>
            <div class="col-6 col-md-3">
              <div class="session-meta-label">Khóa / Lớp</div>
              <div class="session-meta-value fw-bold">${esc(activeSessionInfo?.class_name || "Chưa cập nhật")}</div>
            </div>
            <div class="col-6 col-md-3">
              <div class="session-meta-label">Mã lớp</div>
              <div class="session-meta-value fw-bold">${esc(activeSessionInfo?.class_code || activeClassCode || "---")}</div>
            </div>
          </div>
          ${noticeHtml}
        </div>
        <div class="text-end flex-shrink-0">
          <div class="mb-2">${badgeHtml}</div>
          ${actionAreaHtml}
        </div>
      </div>
    </div>
  `;
  }

  // ── 2. LOGIC CLICK VÀ HỦY CHỌN NÚT ──────────────────────────────────────
  function selectStatus(status) {
    const container = document.getElementById("confirm-status-container");
    const confirmText = document.getElementById("confirm-status-text");
    const btns = document.querySelectorAll(".status-btn");

    // Nếu click lại nút đang chọn -> Hủy chọn (Ẩn nút xác nhận)
    if (selectedTempStatus === status) {
      selectedTempStatus = null;
      container.classList.add("d-none");
      btns.forEach((b) => b.classList.remove("active"));
    } else {
      // Bật chọn và hiện nút xác nhận
      selectedTempStatus = status;
      container.classList.remove("d-none");

      const texts = {
        scheduled: "Dạy chính",
        substitute: "Dạy thay",
        cancelled: "Nghỉ",
      };
      confirmText.innerText = texts[status];

      // Highlight nút đang chọn
      btns.forEach((b) => {
        if (b.getAttribute("data-status") === status) {
          b.classList.add("active");
        } else {
          b.classList.remove("active");
        }
      });
    }
  }

  // ── 3. GỬI XÁC NHẬN VÀ KHÓA CHỌN (PATCH /sessions/:id/status) ───────────
  async function submitStatus() {
    if (!selectedTempStatus) return;

    // Chuẩn bị nhãn và giao diện cho hộp thoại xác nhận
    const STATUS_LABEL = {
      scheduled: { text: "Dạy chính", icon: "✅", btnCls: "btn-success" },
      substitute: { text: "Dạy thay", icon: "🔵", btnCls: "btn-primary" },
      cancelled: { text: "Báo nghỉ", icon: "🔴", btnCls: "btn-danger" },
    };

    const label = STATUS_LABEL[selectedTempStatus];

    // ── BƯỚC BẢO VỆ: GỌI HỘP THOẠI XÁC NHẬN UTILS.CONFIRM ──────────────────
    if (typeof utils !== "undefined" && typeof utils.confirm === "function") {
      const confirmed = await utils.confirm(
        `Bạn muốn chốt trạng thái buổi học này thành <b>${label.text}</b>?<br>
        <span class="text-muted small">Lưu ý: Bạn không thể hoàn tác sau khi đã chốt.</span>
        ${
          selectedTempStatus === "cancelled"
            ? "<br><span class='text-danger small mt-2 d-block'><i class='fa-solid fa-bell me-1'></i>Hệ thống sẽ tự động gửi thông báo Telegram đến học sinh ngay lập tức!</span>"
            : ""
        }`,
        {
          title: `${label.icon} Xác nhận chốt trạng thái`,
          confirmText: `Chốt ${label.text}`,
          cancelText: "Suy nghĩ lại",
          type: selectedTempStatus === "cancelled" ? "danger" : "primary",
        },
      );

      // Nếu giáo viên bấm "Suy nghĩ lại" (Hủy) -> Dừng luôn, không làm gì cả
      if (!confirmed) return;
    } else {
      // Fallback nếu utils.confirm bị lỗi
      if (!confirm(`Bạn có chắc chắn muốn chốt buổi học thành: ${label.text}?`))
        return;
    }

    // ── XỬ LÝ GỌI API THẬT: PATCH /sessions/:id/status ─────────────────────
    const btn = document.getElementById("btn-confirm-status");

    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Đang xử lý...`;
      }

      const res = await api.fetch(`/sessions/${activeSessionId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: selectedTempStatus }),
      });

      if (!res || res.error) {
        showToast(res?.message || "Cập nhật trạng thái thất bại!", "danger");
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = `<i class="fa-solid fa-check me-1"></i> Xác nhận: <span id="confirm-status-text">${esc(label.text)}</span>`;
        }
        return;
      }

      // Cập nhật trạng thái thật từ response trả về của backend
      const newStatus = res.data?.newStatus || selectedTempStatus;
      if (activeSessionInfo) {
        activeSessionInfo.class_status = newStatus;
      }

      // Thông báo kết quả góc màn hình
      if (newStatus === "cancelled") {
        showToast(
          res.data?.telegramSent
            ? "Đã chốt báo nghỉ! Hệ thống đã gửi thông báo đến học sinh."
            : "Đã chốt báo nghỉ!",
          "danger",
        );
      } else {
        showToast(`Đã chốt trạng thái: ${label.text}`, "success");
      }

      // Reset biến nháp
      selectedTempStatus = null;

      // Render lại giao diện (sẽ tự động khóa các nút và hiển thị Badge mới)
      renderSessionInfo();
      updateSaveButtonState();
    } catch (err) {
      console.error("SUBMIT STATUS ERROR:", err);
      showToast("Lỗi kết nối máy chủ khi cập nhật trạng thái!", "danger");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-check me-1"></i> Xác nhận: <span id="confirm-status-text">${esc(label.text)}</span>`;
      }
    }
  }

  // ── CÁC HÀM CÒN LẠI GIỮ NGUYÊN BÊN DƯỚI ────────────────────────────────
  function normalizeStudent(st) {
    return {
      id: st.id || st.studentId,
      name: st.name || st.studentName || "",
      code: st.code || st.studentCode || "",
      status: st.status || null,
      note: st.note || "",
    };
  }

  function renderAttendanceTable(students = []) {
    const tbody = document.getElementById("students-att-tbody");
    if (!tbody) return;

    if (!students.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Chưa có dữ liệu học sinh cho buổi học này.</td></tr>`;
      return;
    }

    tbody.innerHTML = students
      .map((rawSt, index) => {
        const st = normalizeStudent(rawSt);
        return `
          <tr data-student-id="${esc(st.id)}" data-student-name="${esc(st.name)}" data-student-code="${esc(st.code)}">
            <td class="ps-4 fw-bold text-muted">${index + 1}</td>
            <td>
              <div class="fw-semibold text-dark">${esc(st.name)}</div>
              <div class="small text-muted">${esc(st.code)}</div>
            </td>
            <td>
              <div class="attendance-radio">
                ${renderRadio(st.id, "PRESENT", "Có mặt", "fa-solid fa-check", st.status)}
                ${renderRadio(st.id, "ABSENT", "Vắng", "fa-solid fa-xmark", st.status)}
                ${renderRadio(st.id, "LATE", "Muộn", "fa-regular fa-clock", st.status)}
                ${renderRadio(st.id, "EXCUSED", "Có phép", "fa-solid fa-envelope-open-text", st.status)}
              </div>
            </td>
            <td class="pe-4">
              <input type="text" class="form-control form-control-sm" placeholder="Nhận xét..." id="note_${esc(st.id)}" value="${esc(st.note || "")}" ${isReadOnly ? "disabled" : ""}>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function renderRadio(studentId, value, label, icon, currentStatus) {
    const inputId = `att_${studentId}_${value.toLowerCase()}`;
    return `
      <input type="radio" name="att_${esc(studentId)}" id="${esc(inputId)}" value="${esc(value)}" ${currentStatus === value ? "checked" : ""} ${isReadOnly ? "disabled" : ""}>
      <label for="${esc(inputId)}"><i class="${esc(icon)} me-1"></i>${esc(label)}</label>
    `;
  }

  function getAttendanceData() {
    const tbody = document.getElementById("students-att-tbody");
    if (!tbody) return [];

    return [...tbody.querySelectorAll("tr[data-student-id]")].map((row) => {
      const studentId = row.getAttribute("data-student-id");
      const checked = row.querySelector("input[type='radio']:checked");
      const noteInput = row.querySelector(`#note_${CSS.escape(studentId)}`);
      return {
        studentId,
        studentCode: row.getAttribute("data-student-code") || "",
        studentName: row.getAttribute("data-student-name") || "",
        status: checked ? checked.value : null,
        note: noteInput ? noteInput.value.trim() : "",
      };
    });
  }

  function updateSaveButtonState() {
    const btn = document.getElementById("btn-save-attendance");
    if (!btn) return;

    // Nếu lớp đã báo nghỉ (cancelled), khóa luôn nút lưu điểm danh vì nghỉ thì không cần điểm danh
    if (isReadOnly || getClassStatus() === "cancelled") {
      btn.disabled = true;
      btn.classList.remove("btn-danger");
      btn.classList.add("btn-secondary");
      btn.innerHTML = `<i class="fa-solid fa-lock me-1"></i> Đã khóa điểm danh`;
    } else {
      btn.disabled = false;
      btn.classList.remove("btn-secondary");
      btn.classList.add("btn-danger");
      btn.innerHTML = `<i class="fa-solid fa-floppy-disk me-1"></i> Lưu điểm danh`;
    }
  }

  async function loadStudents() {
    if (!activeSessionId) {
      renderNoSession();
      return;
    }

    try {
      const res = await api.fetch(`/sessions/${activeSessionId}/attendance`);

      if (!res || res.error) {
        showToast(res?.message || "Không thể tải dữ liệu!", "danger");
        return;
      }

      const { session, students } = res.data;

      activeSessionInfo = {
        id: session.id,
        class_code: session.class_code,
        class_name: session.class_name,
        date: session.date?.slice(0, 10),
        start: session.start?.slice(0, 5),
        end: session.end?.slice(0, 5),
        class_status: session.status,
        locked: !!session.attendance_locked,
        role: session.role || "MAIN",
      };

      // KHÔNG còn dùng localStorage để lưu trạng thái buổi học —
      // class_status luôn lấy trực tiếp từ DB (session.status) ở mỗi lần tải lại.

      isAssistant = activeSessionInfo.role === "ASSISTANT";
      isReadOnly =
        !!session.attendance_locked || isSessionEnded(activeSessionInfo);

      renderSessionInfo();
      renderAttendanceTable(students);
      updateSaveButtonState();
    } catch (err) {
      console.error("LOAD STUDENTS ERROR:", err);
      showToast("Lỗi kết nối máy chủ! Không thể tải dữ liệu.", "danger");
    }
  }

  // ── LƯU ĐIỂM DANH: POST /sessions/:id/attendance ────────────────────────
  async function saveAttendance() {
    if (isReadOnly) {
      showToast(
        "Buổi học đã kết thúc, giáo viên chỉ được xem dữ liệu.",
        "warning",
      );
      return;
    }

    const rawData = getAttendanceData();
    if (!rawData.length) {
      showToast("Chưa có dữ liệu học sinh để lưu!", "warning");
      return;
    }

    // Học sinh chưa chọn trạng thái nào (status null) -> mặc định PRESENT trước khi gửi lên server
    const payload = rawData.map((item) => ({
      studentId: item.studentId,
      status: item.status || "PRESENT",
      note: item.note,
    }));

    const btn = document.getElementById("btn-save-attendance");
    const oldText = btn ? btn.innerHTML : "";

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Đang lưu...`;
    }

    try {
      const res = await api.fetch(`/sessions/${activeSessionId}/attendance`, {
        method: "POST",
        body: JSON.stringify({ students: payload }),
      });

      if (!res || res.error) {
        showToast(res?.message || "Lưu điểm danh thất bại!", "danger");
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = oldText;
        }
        return;
      }

      showToast(
        "Lưu điểm danh thành công! Dữ liệu đã được hệ thống ghi nhận.",
        "success",
      );

      // Cập nhật lại radio trên UI theo giá trị mặc định PRESENT vừa gửi (đồng bộ hiển thị)
      payload.forEach((item) => {
        const radio = document.getElementById(
          `att_${item.studentId}_${item.status.toLowerCase()}`,
        );
        if (radio) radio.checked = true;
      });

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = oldText;
      }
    } catch (err) {
      console.error("SAVE ATTENDANCE ERROR:", err);
      showToast("Lỗi kết nối máy chủ! Không thể lưu điểm danh.", "danger");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = oldText;
      }
    }
  }

  function exportAttendance() {
    const data = getAttendanceData();
    if (!data.length) {
      showToast("Không có dữ liệu để xuất!", "warning");
      return;
    }

    const dateText = activeSessionInfo?.date
      ? activeSessionInfo.date.split("-").reverse().join("/")
      : "---";

    let html = `<html><head><meta charset="UTF-8"></head><body>
        <h3>Danh sách điểm danh</h3>
        <p><b>Ngày học:</b> ${esc(dateText)}</p>
        <p><b>Thời gian:</b> ${esc(activeSessionInfo?.start || "")} - ${esc(activeSessionInfo?.end || "")}</p>
        <p><b>Khóa / Lớp:</b> ${esc(activeSessionInfo?.class_name || "")}</p>
        <p><b>Mã lớp:</b> ${esc(activeSessionInfo?.class_code || activeClassCode || "")}</p>
        <table border="1">
          <thead><tr><th>STT</th><th>Mã học sinh</th><th>Họ và tên</th><th>Trạng thái</th><th>Nhận xét</th></tr></thead>
          <tbody>`;

    data.forEach((item, index) => {
      html += `<tr><td>${index + 1}</td><td>${esc(item.studentCode)}</td><td>${esc(item.studentName)}</td><td>${esc(getStatusText(item.status))}</td><td>${esc(item.note)}</td></tr>`;
    });
    html += `</tbody></table></body></html>`;

    const blob = new Blob(["\ufeff" + html], {
      type: "application/vnd.ms-excel;charset=utf-8;",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `diem-danh-${activeSessionInfo?.class_code || activeClassCode || "lop"}-${activeSessionInfo?.date || "ngay-hoc"}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function showToast(message, type = "success") {
    if (typeof utils !== "undefined" && typeof utils.showToast === "function") {
      utils.showToast(message, type);
      return;
    }
    alert(message);
  }

  // ── PHẦN DRAG & DROP NHẬP EXCEL (Bạn cứ giữ code này nguyên vẹn) ──
  let selectedExcelFile = null;
  function openImportModal() {
    const modalEl = document.getElementById("importExcelModal");
    if (!modalEl) return;

    selectedExcelFile = null;
    document.getElementById("file-input").value = "";
    document.getElementById("file-info").classList.add("d-none");
    document.getElementById("btn-process-excel").disabled = true;
    document.getElementById("drop-zone").classList.remove("dragover");

    const modal = new bootstrap.Modal(modalEl);
    modal.show();
    initDragAndDrop();
  }

  function processImportedFile() {
    if (!selectedExcelFile) return;

    const btnProcess = document.getElementById("btn-process-excel");
    btnProcess.disabled = true;
    btnProcess.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Đang đọc...`;

    // Map ký tự viết tắt → status value
    const STATUS_MAP = {
      C: "PRESENT",
      V: "ABSENT",
      M: "LATE",
      CP: "EXCUSED",
    };

    loadXLSXLibrary()
      .then(() => {
        const reader = new FileReader();

        reader.onload = (e) => {
          try {
            const workbook = XLSX.read(e.target.result, { type: "binary" });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, {
              header: 1,
              defval: "",
            });

            // Tìm dòng header chứa "Mã học sinh" để xác định vị trí bắt đầu data
            let headerRowIndex = -1;
            let colIndexMap = {}; // { maHS: 1, trangThai: 3, nhanXet: 4 }

            for (let i = 0; i < rows.length; i++) {
              const row = rows[i].map((cell) => String(cell).trim());
              const maHSIndex = row.findIndex((c) => c === "Mã học sinh");
              const trangThaiIndex = row.findIndex((c) => c === "Trạng thái");
              const nhanXetIndex = row.findIndex((c) => c === "Nhận xét");

              if (maHSIndex !== -1 && trangThaiIndex !== -1) {
                headerRowIndex = i;
                colIndexMap = {
                  maHS: maHSIndex,
                  trangThai: trangThaiIndex,
                  nhanXet: nhanXetIndex !== -1 ? nhanXetIndex : -1,
                };
                break;
              }
            }

            if (headerRowIndex === -1) {
              showToast(
                "Không tìm thấy dòng tiêu đề 'Mã học sinh' trong file!",
                "danger",
              );
              resetImportBtn(btnProcess);
              return;
            }

            // Lấy các dòng data (bỏ qua header)
            const dataRows = rows
              .slice(headerRowIndex + 1)
              .filter((row) => row.some((cell) => String(cell).trim() !== ""));

            if (!dataRows.length) {
              showToast("File không có dữ liệu học sinh!", "warning");
              resetImportBtn(btnProcess);
              return;
            }

            // Map mã HS → studentId từ DOM hiện tại
            const tbody = document.getElementById("students-att-tbody");
            const studentRows = [
              ...tbody.querySelectorAll("tr[data-student-id]"),
            ];

            const codeToIdMap = {};
            studentRows.forEach((tr) => {
              const code = tr.getAttribute("data-student-code");
              const id = tr.getAttribute("data-student-id");
              if (code) codeToIdMap[code.trim()] = id;
            });

            let matched = 0;
            let unmatched = 0;

            dataRows.forEach((row) => {
              const maHS = String(row[colIndexMap.maHS] || "").trim();
              const trangThai = String(row[colIndexMap.trangThai] || "")
                .trim()
                .toUpperCase();
              const nhanXet =
                colIndexMap.nhanXet !== -1
                  ? String(row[colIndexMap.nhanXet] || "").trim()
                  : "";

              const studentId = codeToIdMap[maHS];
              if (!studentId) {
                unmatched++;
                return;
              }

              const status = STATUS_MAP[trangThai];

              // Chọn radio tương ứng
              if (status) {
                const radio = document.getElementById(
                  `att_${studentId}_${status.toLowerCase()}`,
                );
                if (radio) {
                  radio.checked = true;
                  matched++;
                }
              }

              // Điền nhận xét nếu có
              if (nhanXet) {
                const noteInput = document.getElementById(
                  `note_${CSS.escape(studentId)}`,
                );
                if (noteInput) noteInput.value = nhanXet;
              }
            });

            // Đóng modal
            const modalEl = document.getElementById("importExcelModal");
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            // Thông báo kết quả
            if (unmatched > 0) {
              showToast(
                `Nhập thành công ${matched} học sinh. ${unmatched} mã không khớp.`,
                "warning",
              );
            } else {
              showToast(`Nhập thành công ${matched} học sinh!`, "success");
            }

            resetImportBtn(btnProcess);
          } catch (err) {
            console.error("Import Excel error:", err);
            showToast("Đọc file thất bại! Kiểm tra định dạng file.", "danger");
            resetImportBtn(btnProcess);
          }
        };

        reader.onerror = () => {
          showToast("Không đọc được file!", "danger");
          resetImportBtn(btnProcess);
        };

        reader.readAsBinaryString(selectedExcelFile);
      })
      .catch((err) => {
        showToast(err.message || "Không tải được thư viện Excel!", "danger");
        resetImportBtn(btnProcess);
      });
  }

  setTimeout(loadStudents, 0);

  return {
    loadStudents,
    saveAttendance,
    exportAttendance,
    selectStatus, // Hàm mới
    submitStatus, // Hàm mới
    openImportModal,
    processImportedFile,
  };
})();
