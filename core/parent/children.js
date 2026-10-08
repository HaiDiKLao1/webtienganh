window.childrenManager = (() => {
  // 1. CẤU HÌNH BIẾN TOÀN CỤC & DOM
  let currentYear = new Date().getFullYear();
  let currentMonth = new Date().getMonth(); // 0-11
  let currentStudentId = null;
  let childrenList = []; // Danh sách con
  const user = typeof auth !== "undefined" ? auth.getUser() : null; // Lấy thông tin user đăng nhập

  const monthYearText = document.getElementById("calendarMonthYear");
  const calendarContainer = document.getElementById("calendarDays");
  const classDetail = document.getElementById("classDetail");
  const absenceSummary = document.getElementById("absenceSummary");

  // Tiện ích chống lỗi XSS
  const esc = (str) =>
    String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  // =========================================================================
  // 1. TẢI DANH SÁCH CON CỦA PHỤ HUYNH
  // =========================================================================
  async function loadChildrenData() {
    const tbody = document.getElementById("children-tbody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4"><span class="spinner-border spinner-border-sm text-danger me-2"></span> Đang tải thông tin...</td></tr>`;

    try {
      const parentId = user ? user.id : null;
      if (!parentId)
        throw new Error("Không tìm thấy thông tin định danh Phụ huynh.");

      // GỌI API LẤY DANH SÁCH HỌC SINH CỦA PHỤ HUYNH
      const res = await api.fetch(`/parents/${parentId}/students`);
      if (res && res.error) throw new Error(res.message);

      childrenList = res.data || [];

      if (childrenList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Chưa có hồ sơ học sinh nào được liên kết.</td></tr>`;
        return;
      }

      tbody.innerHTML = childrenList
        .map((child) => {
          const studentId = child.studentId;
          const studentCode = child.studentCode || child.student_code || "---";
          const fullName =
            child.studentName || child.full_name || "Chưa cập nhật";

          let classesHtml =
            '<span class="badge bg-light border text-dark fw-medium px-2 py-1">Chưa xếp lớp</span>';
          if (child.classes && child.classes.length > 0) {
            classesHtml = child.classes
              .map(
                (c) =>
                  `<span class="badge bg-light border text-dark fw-medium px-2 py-1 me-1 mb-1">${esc(c.className)}</span>`,
              )
              .join("");
          }

          const statusClass =
            "bg-success bg-opacity-10 text-success border border-success-subtle";
          const statusText = "Đang học";

          return `
          <tr>
            <td class="py-3">
              <span class="badge bg-light text-dark border px-2 py-1 fw-semibold">${esc(studentCode)}</span>
            </td>
            <td class="py-3 fw-bold text-dark">
              ${esc(fullName)}
            </td>
            <td class="py-3" style="max-width: 200px; flex-wrap: wrap;">
              ${classesHtml}
            </td>
            <td class="py-3"><span class="badge px-2 py-1 ${statusClass}">${statusText}</span></td>
            <td class="py-3 text-end pe-4">
              <button class="btn btn-outline-danger btn-sm rounded-1 px-3 fw-medium" onclick="window.childrenManager.viewProgress(${studentId}, '${esc(fullName)}')">
                  <i class="fa-solid fa-chart-line me-1"></i> Xem tiến độ
              </button>
            </td>
          </tr>
        `;
        })
        .join("");
    } catch (error) {
      console.error(error);
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">Lỗi tải dữ liệu. Vui lòng kiểm tra kết nối mạng!</td></tr>`;
    }
  }

  // =========================================================================
  // 2. LOGIC LỊCH HỌC & ĐIỂM DANH
  // =========================================================================

  // Hàm phụ trợ: Render nhãn trạng thái điểm danh
  function getAttendanceBadge(attStatus, sessionStatus) {
    if (sessionStatus === "cancelled") {
      return `<span class="badge bg-secondary"><i class="fa-solid fa-ban me-1"></i> Lớp nghỉ</span>`;
    }
    if (!attStatus || attStatus === "scheduled") {
      return `<span class="badge bg-light text-secondary border"><i class="fa-regular fa-circle text-muted me-1"></i> Chưa Đ.danh</span>`;
    }

    switch (attStatus) {
      case "PRESENT":
        return `<span class="badge bg-success"><i class="fa-solid fa-check me-1"></i> Có mặt</span>`;
      case "ABSENT":
        return `<span class="badge bg-danger"><i class="fa-solid fa-xmark me-1"></i> Vắng mặt</span>`;
      case "LATE":
        return `<span class="badge bg-warning text-dark"><i class="fa-regular fa-clock me-1"></i> Đi muộn</span>`;
      case "EXCUSED":
        return `<span class="badge bg-info text-white"><i class="fa-solid fa-envelope-open-text me-1"></i> Có phép</span>`;
      default:
        return `<span class="badge bg-light text-secondary border"><i class="fa-regular fa-circle text-muted me-1"></i> Chưa Đ.danh</span>`;
    }
  }

  async function fetchStudentScheduleFromServer(studentId, year, month) {
    try {
      const resData = await api.fetch(
        `/students/${studentId}/schedules?year=${year}&month=${month + 1}`,
      );
      const apiList = resData.data || resData || [];

      let mappedSchedule = {};

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (Array.isArray(apiList)) {
        apiList.forEach((item) => {
          if (!item.date) return;

          if (!mappedSchedule[item.date]) {
            mappedSchedule[item.date] = [];
          }

          // Cập nhật lấy từ startTime, endTime theo chuẩn camelCase của API mới
          const startStr = (item.startTime || "00:00").substring(0, 5);
          const endStr = (item.endTime || "00:00").substring(0, 5);

          const classDate = new Date(item.date);
          const calculatedStatus = classDate < today ? "past" : "future";

          mappedSchedule[item.date].push({
            status: calculatedStatus,
            session: item.sessionNumber || 1,
            subject: item.className || "Chưa cập nhật",
            code: item.classCode || "",
            shift: item.shiftName || "Ca học",
            time: `${startStr} - ${endStr}`,
            sessionStatus: item.sessionStatus, // done, scheduled, cancelled
            attendanceStatus: item.attendanceStatus || item.displayStatus, // PRESENT, ABSENT...
          });
        });
      }
      return mappedSchedule;
    } catch (error) {
      console.error("Lỗi lấy lịch học:", error);
      return {};
    }
  }

  async function renderDynamicCalendar(year, month, studentId) {
    if (!calendarContainer || !monthYearText) return;

    calendarContainer.innerHTML = `<div class="w-100 h-100 d-flex justify-content-center align-items-center" style="grid-column: 1 / -1; min-height: 200px;"><span class="spinner-border text-danger"></span></div>`;
    monthYearText.innerText = `Tháng ${month + 1}, ${year}`;

    let firstDayIndex = new Date(year, month, 1).getDay();
    let startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    let totalDaysInMonth = new Date(year, month + 1, 0).getDate();

    const studentSchedule = await fetchStudentScheduleFromServer(
      studentId,
      year,
      month,
    );

    calendarContainer.innerHTML = "";

    for (let x = 0; x < startOffset; x++) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "cal-day empty";
      calendarContainer.appendChild(emptyDiv);
    }

    const now = new Date();

    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dayDiv = document.createElement("div");
      dayDiv.className = "cal-day";
      dayDiv.innerHTML = `${day}`;

      const formattedMonth = String(month + 1).padStart(2, "0");
      const formattedDay = String(day).padStart(2, "0");
      const dateKey = `${year}-${formattedMonth}-${formattedDay}`;

      if (studentSchedule[dateKey] && studentSchedule[dateKey].length > 0) {
        const classesToday = studentSchedule[dateKey];
        const hasFutureClass = classesToday.some((c) => c.status === "future");

        if (hasFutureClass) {
          dayDiv.classList.add("has-class");
          dayDiv.innerHTML += `<span class="dot"></span>`;
        } else {
          dayDiv.classList.add("attended");
        }

        dayDiv.addEventListener("click", () => {
          highlightSelectedDay(dayDiv);
          if (classDetail) {
            classDetail.classList.remove("justify-content-center");

            const classesHtml = classesToday
              .map((info) => {
                const isCancelled = info.sessionStatus === "cancelled";
                const isDone =
                  info.sessionStatus === "done" || info.status === "past";

                return `
              <div class="bg-light bg-opacity-50 rounded-3 p-3 border border-light-subtle mb-3">
                  <div class="d-flex justify-content-between align-items-center mb-2 border-bottom pb-2">
                      <span class="badge bg-danger bg-opacity-10 text-danger border border-danger-subtle px-2 py-1">Buổi ${info.session}</span>
                      <span class="badge bg-secondary bg-opacity-10 text-secondary border px-2 py-1">${esc(info.shift)}</span>
                  </div>
                  <div class="row g-2 mt-1">
                      <div class="col-12 border-bottom pb-2 mb-1">
                          <p class="text-muted small mb-0 fw-bold text-uppercase">Khóa / Môn học</p>
                          <p class="fw-bold text-dark mb-0 fs-6">${esc(info.subject)} <span class="text-muted fw-normal small">(${esc(info.code)})</span></p>
                      </div>
                      <div class="col-sm-4 border-end">
                          <p class="text-muted small mb-0 fw-bold text-uppercase">Thời gian</p>
                          <p class="fw-medium text-dark mb-0"><i class="fa-regular fa-clock me-1 text-secondary"></i> ${esc(info.time)}</p>
                      </div>
                      <div class="col-sm-4 border-end px-sm-2">
                          <p class="text-muted small mb-0 fw-bold text-uppercase">Trạng thái lớp</p>
                          <p class="mb-0 mt-1" style="font-size: 0.9rem;">
                              ${
                                isCancelled
                                  ? '<span class="text-danger fw-bold"><i class="fa-solid fa-ban me-1"></i> Nghỉ học</span>'
                                  : isDone
                                    ? '<span class="text-success fw-bold"><i class="fa-solid fa-check-circle me-1"></i> Đã diễn ra</span>'
                                    : '<span class="text-secondary fw-medium"><i class="fa-regular fa-hourglass-half me-1"></i> Chưa diễn ra</span>'
                              }
                          </p>
                      </div>
                      <div class="col-sm-4 px-sm-2">
                          <p class="text-muted small mb-0 fw-bold text-uppercase">Điểm danh</p>
                          <p class="mb-0 mt-1">
                              ${getAttendanceBadge(info.attendanceStatus, info.sessionStatus)}
                          </p>
                      </div>
                  </div>
              </div>
            `;
              })
              .join("");

            classDetail.innerHTML = `
                <div class="d-flex flex-column h-100 animate__animated animate__fadeIn">
                    <h5 class="fw-bold text-dark mb-3 border-bottom pb-2 flex-shrink-0">
                        <i class="fa-regular fa-calendar-check text-danger me-2"></i>Chi tiết ngày ${formattedDay}/${formattedMonth}/${year}
                    </h5>
                    <div class="flex-grow-1 overflow-auto pe-1 custom-scrollbar" style="max-height: 320px;">
                        ${classesHtml}
                    </div>
                </div>
            `;
          }
        });
      } else {
        // Ngày trống lịch học
        dayDiv.addEventListener("click", () => {
          highlightSelectedDay(dayDiv);
          if (classDetail) {
            classDetail.classList.add("justify-content-center");
            classDetail.innerHTML = `
                <div class="text-center text-muted m-auto animate__animated animate__fadeIn">
                    <i class="fa-regular fa-calendar-xmark text-secondary opacity-25 mb-3" style="font-size: 4rem;"></i>
                    <h6 class="fw-bold text-dark mb-1">Ngày ${formattedDay}/${formattedMonth}/${year}</h6>
                    <p class="small mb-0">Không có ca học nào được xếp vào ngày này.</p>
                </div>
            `;
          }
        });
      }

      calendarContainer.appendChild(dayDiv);

      // Tự động giả lập click nếu ô ngày đang render chính là HÔM NAY
      if (
        year === now.getFullYear() &&
        month === now.getMonth() &&
        day === now.getDate()
      ) {
        dayDiv.click();
      }
    }

    if (absenceSummary) {
      absenceSummary.innerText = "Chưa có dữ liệu";
    }
  }

  function highlightSelectedDay(element) {
    document
      .querySelectorAll(".cal-day")
      .forEach((el) => el.classList.remove("active-day"));
    element.classList.add("active-day");
  }

  // =========================================================================
  // 3. CÁC HÀM TƯƠNG TÁC
  // =========================================================================
  async function viewProgress(studentId, studentName) {
    currentStudentId = studentId;
    currentYear = new Date().getFullYear();
    currentMonth = new Date().getMonth();

    const nameEl = document.getElementById("progressStudentName");
    const sectionEl = document.getElementById("progressSection");

    if (nameEl) nameEl.innerText = studentName;
    if (sectionEl) sectionEl.classList.remove("d-none");

    if (classDetail) {
      classDetail.classList.add("justify-content-center");
      classDetail.innerHTML = `
          <div class="empty-state m-auto">
              <div class="spinner-border text-danger mb-3" role="status"></div>
              <p class="text-muted fw-medium">Đang đồng bộ dữ liệu máy chủ...</p>
          </div>
      `;
    }

    await renderDynamicCalendar(currentYear, currentMonth, currentStudentId);
  }

  async function nextMonth() {
    if (!currentStudentId) return;
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    await renderDynamicCalendar(currentYear, currentMonth, currentStudentId);
  }

  async function prevMonth() {
    if (!currentStudentId) return;
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    await renderDynamicCalendar(currentYear, currentMonth, currentStudentId);
  }

  // Initialize
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      loadChildrenData();
      document
        .getElementById("prevMonthBtn")
        ?.addEventListener("click", prevMonth);
      document
        .getElementById("nextMonthBtn")
        ?.addEventListener("click", nextMonth);
    });
  } else {
    loadChildrenData();
    document
      .getElementById("prevMonthBtn")
      ?.addEventListener("click", prevMonth);
    document
      .getElementById("nextMonthBtn")
      ?.addEventListener("click", nextMonth);
  }

  return {
    viewProgress,
  };
})();
