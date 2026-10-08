window.teacherCalendar = (() => {
  let currentYear = new Date().getFullYear();
  let currentMonth = new Date().getMonth();

  let lastSelectedDateKey = null;
  let lastSelectedSessions = null;
  let currentScheduleData = {}; // Lưu trữ dữ liệu tải từ API

  // Lấy User ID từ phiên đăng nhập hiện tại
  const user = typeof auth !== "undefined" ? auth.getUser() : null;

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

  const safeJsString = (str) =>
    String(str ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'");

  // ── HÀM ĐỒNG BỘ CHIỀU CAO ───────────────────────────────────────────────
  function syncHeight() {
    const leftCard = document.querySelector(".col-lg-4 .card");
    const rightCard = document.querySelector(".col-lg-8 .card");
    const detailContainer = document.getElementById("classDetail");

    if (leftCard && rightCard && detailContainer) {
      if (window.innerWidth >= 992) {
        rightCard.style.height = "auto";
        const leftHeight = leftCard.offsetHeight;

        rightCard.style.height = leftHeight + "px";
        detailContainer.style.height = "100%";
        detailContainer.style.overflow = "hidden";
      } else {
        rightCard.style.height = "auto";
        detailContainer.style.height = "auto";
        detailContainer.style.minHeight = "300px";
      }
    }
  }

  window.addEventListener("resize", syncHeight);

  // ── GỌI API LẤY LỊCH DẠY THẬT TỪ BACKEND ───────────────────────────────
  async function fetchTeacherSchedule(year, month) {
    if (!user || !user.id) return {};
    try {
      const teacherId = user.id;
      const res = await api.fetch(
        `/teachers/${teacherId}/schedules?year=${year}&month=${month + 1}`,
      );

      if (res && res.error) throw new Error(res.message);
      return res.data || {};
    } catch (error) {
      console.error("Lỗi lấy thời khóa biểu giáo viên:", error);
      if (typeof utils !== "undefined") {
        utils.showToast(
          "Lỗi kết nối máy chủ! Không thể tải lịch dạy.",
          "danger",
        );
      }
      return {};
    }
  }

  // ── VẼ BỘ LỊCH THÁNG ───────────────────────────────────────────────────
  async function renderCalendar(year, month) {
    const calendarContainer = document.getElementById("calendarDays");
    const monthYearText = document.getElementById("calendarMonthYear");

    if (!calendarContainer || !monthYearText) return;

    calendarContainer.innerHTML = `<div class="w-100 h-100 d-flex justify-content-center align-items-center" style="grid-column: 1 / -1; min-height: 200px;"><span class="spinner-border text-danger"></span></div>`;
    monthYearText.innerText = `Tháng ${month + 1}, ${year}`;

    currentScheduleData = await fetchTeacherSchedule(year, month);

    calendarContainer.innerHTML = "";

    const firstDayIndex = new Date(year, month, 1).getDay();
    const startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < startOffset; i++) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "cal-day empty";
      calendarContainer.appendChild(emptyDiv);
    }

    const now = new Date();
    let todayCell = null;
    let firstScheduleCell = null;
    let totalShifts = 0;

    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dayDiv = document.createElement("div");
      dayDiv.className = "cal-day";
      dayDiv.innerHTML = `${day}`;

      const formattedMonth = String(month + 1).padStart(2, "0");
      const formattedDay = String(day).padStart(2, "0");
      const dateKey = `${year}-${formattedMonth}-${formattedDay}`;

      const sessionsToday = currentScheduleData[dateKey] || [];

      if (sessionsToday.length > 0) {
        dayDiv.classList.add("has-class");
        dayDiv.innerHTML += `<span class="dot"></span>`;
        totalShifts += sessionsToday.length;

        if (!firstScheduleCell) {
          firstScheduleCell = dayDiv;
        }
      }

      dayDiv.addEventListener("click", () => {
        highlightSelectedDay(dayDiv);

        if (sessionsToday.length > 0) {
          renderClassDetail(dateKey, sessionsToday);
        } else {
          renderEmptyDetail(formattedDay, formattedMonth, year);
        }
      });

      calendarContainer.appendChild(dayDiv);

      if (
        year === now.getFullYear() &&
        month === now.getMonth() &&
        day === now.getDate()
      ) {
        todayCell = dayDiv;
      }
    }

    const totalEl = document.getElementById("totalShiftsMonth");
    if (totalEl) totalEl.innerText = totalShifts;

    if (todayCell) {
      todayCell.click();
    } else if (firstScheduleCell) {
      firstScheduleCell.click();
    }

    setTimeout(syncHeight, 50);
  }

  function getTodayKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // ── VẼ CHI TIẾT LỚP HỌC BÊN PHẢI ────────────────────────────────────────
  function renderClassDetail(dateKey, sessions) {
    const classDetail = document.getElementById("classDetail");
    if (!classDetail) return;

    lastSelectedDateKey = dateKey;
    lastSelectedSessions = sessions;

    const [year, month, day] = dateKey.split("-");
    classDetail.classList.remove("justify-content-center");

    const sessionsHtml = sessions
      .map((s) => {
        const isDone = s.status === "DONE" || s.status === "STUDY";
        const locked = s.attendanceLocked === 1 || s.attendanceLocked === true;

        // Nút sẽ đổi chữ nếu điểm danh đã khóa
        const buttonText = locked ? "Xem lớp" : "Vào lớp";
        const roleText = s.role === "MAIN" ? "Dạy chính" : "Trợ giảng";
        const startStr = (s.startTime || "00:00").substring(0, 5);
        const endStr = (s.endTime || "00:00").substring(0, 5);

        return `
          <div class="teacher-session-card p-3 mb-3 bg-white shadow-sm border" style="border-radius: 8px;">
            <div class="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
              <div class="d-flex gap-2">
                  <span class="badge bg-danger bg-opacity-10 text-danger border border-danger-subtle px-2 py-1">
                    Buổi ${esc(s.sessionNumber || 1)}
                  </span>
                  <span class="badge bg-secondary bg-opacity-10 text-secondary border px-2 py-1">
                    ${esc(s.shiftName || "Ca học")}
                  </span>
                  <span class="badge bg-info bg-opacity-10 text-info border border-info-subtle px-2 py-1">
                    ${roleText}
                  </span>
              </div>
              <span style="font-size: 0.85rem;" class="fw-bold ${isDone ? "text-success" : "text-muted"}">
                  ${isDone ? '<i class="fa-solid fa-check-circle me-1"></i>Đã dạy' : '<i class="fa-regular fa-hourglass-half me-1"></i>Chưa diễn ra'}
              </span>
            </div>

            <div class="row align-items-center mt-2 g-2">
              <div class="col-sm-7">
                <h6 class="fw-bold text-dark mb-1 text-truncate" title="${esc(s.className)}">
                  ${esc(s.className || "Chưa cập nhật")}
                  <span class="text-muted fw-normal small">(${esc(s.classCode)})</span>
                </h6>
                <div class="text-muted small fw-medium d-flex align-items-center">
                  <i class="fa-regular fa-clock me-1 text-secondary"></i>
                  ${esc(startStr)} - ${esc(endStr)}
                </div>
              </div>

              <div class="col-sm-5 d-flex justify-content-sm-end align-items-center gap-2 mt-2 mt-sm-0">
                ${locked ? `<span class="text-muted small fw-medium me-1"><i class="fa-solid fa-lock"></i> Đã khóa</span>` : ""}
                <button
                  class="btn btn-sm btn-danger fw-medium shadow-sm px-3 flex-shrink-0"
                  style="height: 31px;"
                  onclick="window.teacherCalendar.goToAttendance(${s.id}, '${safeJsString(s.classCode)}')"
                >
                  <i class="fa-solid fa-door-open me-1"></i> ${buttonText}
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    classDetail.innerHTML = `
      <div class="d-flex flex-column h-100 w-100 animate__animated animate__fadeIn">
        <h5 class="fw-bold text-dark mb-3 border-bottom pb-2 flex-shrink-0">
          <i class="fa-regular fa-calendar-check text-danger me-2"></i>
          Chi tiết ngày ${day}/${month}/${year}
        </h5>
        <div class="flex-grow-1 position-relative w-100">
          <div class="position-absolute top-0 start-0 w-100 h-100 overflow-auto pe-2 custom-scrollbar">
            ${sessionsHtml}
          </div>
        </div>
      </div>
    `;

    setTimeout(syncHeight, 10);
  }

  function renderEmptyDetail(day, month, year) {
    const classDetail = document.getElementById("classDetail");
    if (!classDetail) return;

    classDetail.classList.add("justify-content-center");
    classDetail.innerHTML = `
      <div class="text-center text-muted m-auto animate__animated animate__fadeIn">
        <i class="fa-regular fa-calendar-xmark text-secondary opacity-25 mb-3" style="font-size: 4rem;"></i>
        <h6 class="fw-bold text-dark mb-1">Ngày ${day}/${month}/${year}</h6>
        <p class="small mb-0">Không có lịch dạy nào trong ngày này.</p>
      </div>
    `;

    setTimeout(syncHeight, 10);
  }

  function highlightSelectedDay(element) {
    document
      .querySelectorAll(".cal-day")
      .forEach((el) => el.classList.remove("active-day"));

    element.classList.add("active-day");
  }

  function changeMonth(offset) {
    currentMonth += offset;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    renderCalendar(currentYear, currentMonth);
  }

  function goToAttendance(sessionId, classCode) {
    sessionStorage.setItem("targetSessionId", sessionId);
    sessionStorage.setItem("targetClassCode", classCode);

    // Tìm session object từ data đang có sẵn → đẩy luôn vào storage
    if (lastSelectedSessions) {
      const sessionInfo = lastSelectedSessions.find((s) => s.id === sessionId);
      if (sessionInfo) {
        sessionStorage.setItem(
          "targetSessionInfo",
          JSON.stringify({
            id: sessionInfo.id,
            class_code: sessionInfo.classCode,
            class_name: sessionInfo.className,
            date: lastSelectedDateKey,
            start: sessionInfo.startTime,
            end: sessionInfo.endTime,
            class_status: sessionInfo.status,
            locked: !!sessionInfo.attendanceLocked,
          }),
        );
      }
    }

    document
      .querySelectorAll(".sidebar-menu a")
      .forEach((m) => m.classList.remove("active"));
    document
      .querySelector('.sidebar-menu a[data-page="attendance.html"]')
      ?.classList.add("active");

    router.loadPage("/core/teacher/attendance.html", "main-content");
  }

  function init() {
    document
      .getElementById("prevMonthBtn")
      ?.addEventListener("click", () => changeMonth(-1));
    document
      .getElementById("nextMonthBtn")
      ?.addEventListener("click", () => changeMonth(1));
    renderCalendar(currentYear, currentMonth);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    loadSchedule: () => renderCalendar(currentYear, currentMonth),
    changeMonth,
    goToAttendance,
  };
})();
