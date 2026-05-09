const viewTitles = {
  login: "登录页",
  teacher: "老师工作台",
  admin: "管理后台",
};

const navButtons = document.querySelectorAll("[data-view-target]");
const views = document.querySelectorAll(".view");
const viewTitle = document.querySelector("#view-title");
const appShell = document.querySelector("#app-shell");
const sidebarToggle = document.querySelector("[data-sidebar-toggle]");

sidebarToggle?.addEventListener("click", () => {
  appShell?.classList.toggle("sidebar-collapsed");
});

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.viewTarget;

    navButtons.forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");

    views.forEach((view) => {
      view.classList.toggle("is-active", view.id === `view-${target}`);
    });

    viewTitle.textContent = viewTitles[target] || "课薪记录";
  });
});

const noticeTitleInput = document.querySelector("#notice-title-input");
const noticeContentInput = document.querySelector("#notice-content-input");
const loginTitle = document.querySelector("#login-title");
const loginNoticePreview = document.querySelector("#login-notice-preview");

function syncNoticePreview() {
  if (noticeTitleInput && loginTitle) {
    loginTitle.textContent = noticeTitleInput.value.trim() || "系统提示";
  }

  if (noticeContentInput && loginNoticePreview) {
    loginNoticePreview.textContent =
      noticeContentInput.value.trim() || "暂无公告。";
  }
}

noticeTitleInput?.addEventListener("input", syncNoticePreview);
noticeContentInput?.addEventListener("input", syncNoticePreview);
