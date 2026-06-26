// ==UserScript==
// @name         校宝查看与导出助手
// @namespace    https://pro.schoolpal.cn/
// @version      0.1.0
// @description  Add a quick account/campus switcher to SchoolPal pages.
// @match        https://pro.schoolpal.cn/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  var ROOT_ID = "sp-campus-switcher-root";
  var STYLE_ID = "sp-campus-switcher-style";
  var LAST_SCHEDULE_URL_KEY = "sp-campus-switcher:last-schedule-url";
  var USER_CENTER_API = "/api2/User/GetUserCenter";
  var CHANGE_USER_API = "/Settings/ChangeUser";
  var SCHEDULE_PATH = "/web/schedule/timeTable";
  var SCHEDULE_FILTER_KEYS = [
    "timeViewFilter",
    "timeViewFilter_custum",
    "classViewFilter",
    "classViewFilter_custum",
    "classRoomViewFilter",
    "classRoomViewFilter_custum",
    "teacherViewFilter",
    "teacherViewFilter_custum"
  ];
  var SCHEDULE_SYNC_RELOAD_KEY = "sp-campus-switcher:schedule-sync-reloaded";

  var text = {
    trigger: "\u5207\u6362\u6821\u533a",
    title: "\u5207\u6362\u6821\u533a",
    loading: "\u52a0\u8f7d\u4e2d...",
    empty: "\u6682\u65e0\u53ef\u5207\u6362\u673a\u6784",
    current: "\u5f53\u524d",
    switching: "\u5207\u6362\u4e2d",
    switchTo: "\u5207\u6362",
    openSchedule: "\u6253\u5f00\u6392\u8bfe\u9875",
    unnamed: "\u672a\u547d\u540d\u673a\u6784",
    requestFailed: "\u8bf7\u6c42\u5931\u8d25\uff1a",
    listFailed: "\u8d26\u53f7\u5217\u8868\u52a0\u8f7d\u5931\u8d25",
    noList: "\u672a\u83b7\u53d6\u5230\u8d26\u53f7\u5217\u8868",
    disabled: "\u8be5\u8d26\u6237\u5df2\u505c\u7528",
    needVerify: "\u8be5\u8d26\u6237\u9700\u8981\u5148\u9a8c\u8bc1\u624b\u673a\u53f7",
    noRole: "\u8be5\u8d26\u53f7\u65e0\u4efb\u4f55\u6743\u9650",
    switchFailed: "\u5207\u6362\u5931\u8d25",
    refreshFirst: "\u767b\u5f55\u72b6\u6001\u9700\u8981\u5237\u65b0\uff0c\u8bf7\u5148\u5230\u4e2a\u4eba\u4e2d\u5fc3\u5207\u6362\u4e00\u6b21",
    verifyFirst: "\u8be5\u673a\u6784\u9700\u8981\u9a8c\u8bc1\u540e\u624d\u80fd\u767b\u5f55",
    statusFailed: "\u5207\u6362\u5931\u8d25\uff0c\u8bf7\u5230\u4e2a\u4eba\u4e2d\u5fc3\u786e\u8ba4\u8d26\u53f7\u72b6\u6001"
  };

  var state = {
    open: false,
    loading: false,
    switchingUserId: null,
    error: "",
    accounts: [],
    currentUserId: null,
    loadedAt: 0,
    locationHref: location.href
  };
  var handledClickEvents = new WeakSet();

  function isAppPage() {
    return location.hostname === "pro.schoolpal.cn" && location.pathname.indexOf("/web/") === 0;
  }

  function isSchedulePage() {
    return location.pathname === SCHEDULE_PATH;
  }

  function rememberScheduleUrl() {
    if (!isSchedulePage()) return;
    try {
      sessionStorage.setItem(LAST_SCHEDULE_URL_KEY, location.href);
    } catch (error) {}
  }

  function monthStart(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-01";
  }

  function withCacheBust(url) {
    var next = new URL(url, location.origin);
    next.searchParams.set("_", String(Date.now()));
    return next.href;
  }

  function getReturnUrl() {
    if (isSchedulePage()) return withCacheBust(location.href);

    try {
      var stored = sessionStorage.getItem(LAST_SCHEDULE_URL_KEY);
      if (stored) return withCacheBust(stored);
    } catch (error) {}

    var fallback = new URL(SCHEDULE_PATH, location.origin);
    fallback.searchParams.set("_", String(Date.now()));
    fallback.searchParams.set("currentDate", monthStart(new Date()));
    return fallback.href;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function accountName(account) {
    var name = account.schoolName || account.name || text.unnamed;
    return name + (account.crmver ? " (" + account.crmver + ")" : "");
  }

  function accountMeta(account) {
    var parts = [];
    if (account.schoolLimitNames) parts.push(account.schoolLimitNames);
    if (account.roleName) parts.push(account.roleName);
    return parts.join(" / ");
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "#" + ROOT_ID + "{position:fixed;top:72px;right:18px;z-index:2147483000;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",\"Microsoft YaHei\",Arial,sans-serif;color:#172033;font-size:13px}",
      "#" + ROOT_ID + " *{box-sizing:border-box}",
      "#" + ROOT_ID + " .spc-trigger{min-width:82px;height:30px;border:1px solid #2276d2;border-radius:6px;background:#1f7ae0;color:#fff;font-size:12px;font-weight:600;line-height:28px;padding:0 9px;box-shadow:0 8px 18px rgba(19,52,92,.16);cursor:pointer}",
      "#" + ROOT_ID + " .spc-trigger:hover{background:#166dca}",
      "#" + ROOT_ID + " .spc-panel{width:338px;margin-top:8px;border:1px solid #d9e2ef;border-radius:8px;background:#fff;box-shadow:0 18px 44px rgba(18,34,66,.18);overflow:hidden}",
      "#" + ROOT_ID + " .spc-head{display:flex;align-items:center;justify-content:space-between;min-height:42px;padding:0 12px;border-bottom:1px solid #edf1f6;font-weight:600}",
      "#" + ROOT_ID + " .spc-close,#" + ROOT_ID + " .spc-refresh{width:28px;height:28px;border:0;border-radius:6px;background:transparent;color:#526071;cursor:pointer;font-size:18px;line-height:28px}",
      "#" + ROOT_ID + " .spc-refresh{font-size:13px;font-weight:700}",
      "#" + ROOT_ID + " .spc-close:hover,#" + ROOT_ID + " .spc-refresh:hover{background:#f0f4f8;color:#172033}",
      "#" + ROOT_ID + " .spc-body{max-height:360px;overflow:auto;padding:8px}",
      "#" + ROOT_ID + " .spc-empty,#" + ROOT_ID + " .spc-error{padding:14px 12px;color:#6b7788;line-height:1.5}",
      "#" + ROOT_ID + " .spc-error{color:#b42318}",
      "#" + ROOT_ID + " .spc-item{display:grid;grid-template-columns:1fr auto;gap:6px 10px;width:100%;min-height:54px;padding:9px 10px;border:1px solid transparent;border-radius:6px;background:#fff;color:inherit;text-align:left;cursor:pointer}",
      "#" + ROOT_ID + " .spc-item+.spc-item{margin-top:4px}",
      "#" + ROOT_ID + " .spc-item:hover{background:#f5f8fb;border-color:#e4ebf3}",
      "#" + ROOT_ID + " .spc-item[disabled]{cursor:default;opacity:.72}",
      "#" + ROOT_ID + " .spc-item-current{background:#f0fff7;border-color:#9ee6bf}",
      "#" + ROOT_ID + " .spc-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}",
      "#" + ROOT_ID + " .spc-meta{grid-column:1/3;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#6b7788;font-size:12px}",
      "#" + ROOT_ID + " .spc-badge{align-self:start;border-radius:999px;padding:2px 7px;background:#e8f2ff;color:#1f6ec5;font-size:12px;white-space:nowrap}",
      "#" + ROOT_ID + " .spc-badge-current{background:#dff8ea;color:#067647}",
      "#" + ROOT_ID + " .spc-foot{display:flex;justify-content:flex-end;gap:8px;padding:8px 12px 12px;border-top:1px solid #edf1f6}",
      "#" + ROOT_ID + " .spc-link{height:30px;border:1px solid #d8e1ec;border-radius:6px;background:#fff;color:#2f4054;padding:0 10px;cursor:pointer}",
      "#" + ROOT_ID + " .spc-link:hover{border-color:#9eb5ce}",
      ".spc-export-campus-btn{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;margin-right:8px;border:1px solid #129b63;border-radius:4px;background:#12b76a;color:#fff;padding:0;cursor:pointer;font-size:16px;font-weight:700;line-height:1;vertical-align:middle;white-space:nowrap;overflow:hidden;box-shadow:0 4px 10px rgba(18,183,106,.24)}",
      ".spc-export-campus-btn:hover{background:#0f9f5c;border-color:#0f8f54}",
      ".spc-export-campus-btn[disabled]{cursor:default;opacity:.65}",
      "@media (max-width:640px){#" + ROOT_ID + "{top:64px;right:10px;left:10px}#" + ROOT_ID + " .spc-trigger{float:right}#" + ROOT_ID + " .spc-panel{width:100%;clear:both}}"
    ].join("\n");
    document.documentElement.appendChild(style);
  }

  function ensureRoot() {
    injectStyle();
    var root = document.getElementById(ROOT_ID);
    if (root) return root;
    root = document.createElement("div");
    root.id = ROOT_ID;
    document.documentElement.appendChild(root);
    return root;
  }

  function removeRoot() {
    var root = document.getElementById(ROOT_ID);
    if (root) root.remove();
  }

  function render() {
    rememberScheduleUrl();
    if (!isAppPage()) {
      removeRoot();
      return;
    }

    var root = ensureRoot();
    var panel = "";
    if (state.open) {
      var body = "";
      if (state.loading) {
        body = '<div class="spc-empty">' + text.loading + "</div>";
      } else if (state.error) {
        body = '<div class="spc-error">' + escapeHtml(state.error) + "</div>";
      } else if (!state.accounts.length) {
        body = '<div class="spc-empty">' + text.empty + "</div>";
      } else {
        body = state.accounts.map(function (account) {
          var current = account.userId === state.currentUserId || account.isChecked;
          var switching = state.switchingUserId === account.userId;
          var disabled = current || switching || account.enable === 0 || account.isVerifyPhone <= 0;
          var badge = current ? text.current : (switching ? text.switching : text.switchTo);
          return [
            '<button class="spc-item', current ? " spc-item-current" : "", '" type="button" data-user-id="', escapeHtml(account.userId), '"', disabled ? " disabled" : "", ">",
            '<span class="spc-name" title="', escapeHtml(accountName(account)), '">', escapeHtml(accountName(account)), "</span>",
            '<span class="spc-badge', current ? " spc-badge-current" : "", '">', escapeHtml(badge), "</span>",
            '<span class="spc-meta">', escapeHtml(accountMeta(account) || " "), "</span>",
            "</button>"
          ].join("");
        }).join("");
      }

      panel = [
        '<div class="spc-panel">',
        '<div class="spc-head"><span>', text.title, '</span><span>',
        '<button class="spc-refresh" type="button" title="Refresh">R</button>',
        '<button class="spc-close" type="button" title="Close">&times;</button>',
        "</span></div>",
        '<div class="spc-body">', body, "</div>",
        '<div class="spc-foot"><button class="spc-link" type="button" data-action="schedule">', text.openSchedule, "</button></div>",
        "</div>"
      ].join("");
    }

    root.innerHTML = '<button class="spc-trigger" type="button">' + text.trigger + "</button>" + panel;
  }

  async function requestJson(url, options) {
    var response = await fetch(url, Object.assign({
      credentials: "include",
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json;charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest"
      }
    }, options || {}));

    var raw = await response.text();
    var data = raw;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch (error) {}
    }
    if (!response.ok) throw new Error(text.requestFailed + response.status);
    return data;
  }

  async function loadAccounts(force) {
    var now = Date.now();
    if (!force && state.accounts.length && now - state.loadedAt < 30000) return;
    state.loading = true;
    state.error = "";
    render();

    try {
      var result = await requestJson(USER_CENTER_API);
      if (!result || !result.status || !result.data) {
        throw new Error(result && result.errorMessage ? result.errorMessage : text.noList);
      }
      state.currentUserId = result.data.userId;
      state.accounts = Array.isArray(result.data.bindOrgUsers) ? result.data.bindOrgUsers : [];
      state.loadedAt = Date.now();
    } catch (error) {
      state.error = error && error.message ? error.message : text.listFailed;
      state.accounts = [];
      state.loadedAt = 0;
    } finally {
      state.loading = false;
      render();
    }
  }

  function messageForChangeResult(value) {
    if (value === true || value === "true") return "";
    if (value === "UserDisabled") return text.disabled;
    if (value === "relogin") return text.refreshFirst;
    if (typeof value === "string" && value.indexOf("Verification") >= 0) return text.verifyFirst;
    if (value === "OrgNotExist") return "\u8be5\u673a\u6784\u4e0d\u5b58\u5728";
    if (value === "OrgCrmVersionNotExist") return "\u8be5\u673a\u6784\u7248\u672c\u4fe1\u606f\u4e0d\u5b58\u5728";
    if (value === "PaymentNotConfirmed") return "\u8be5\u673a\u6784\u672a\u8fdb\u884c\u4ed8\u8d39\u786e\u8ba4";
    if (value === "UnenableWeek" || value === "UnenableTime" || (typeof value === "string" && value.indexOf("UnenableConfigTime") >= 0)) return "\u5f53\u524d\u65f6\u6bb5\u4e0d\u5141\u8bb8\u767b\u5f55\u8be5\u673a\u6784";
    if (value === "Expired") return "\u8be5\u673a\u6784\u7cfb\u7edf\u5df2\u8fc7\u671f";
    if (value === "Personal") return "\u8be5\u673a\u6784\u8d26\u53f7\u6682\u4e0d\u652f\u6301\u7535\u8111\u7248\u767b\u5f55";
    return text.statusFailed;
  }

  function clearScheduleFilterCache() {
    SCHEDULE_FILTER_KEYS.forEach(function (key) {
      try {
        sessionStorage.removeItem(key);
      } catch (error) {}
      try {
        localStorage.removeItem(key);
      } catch (error) {}
    });
  }

  function findVueComponentByName(name) {
    var found = null;
    function walk(el) {
      if (found || !el) return;
      var vm = el.__vue__;
      var vmName = vm && vm.$options && (vm.$options.name || vm.$options._componentTag || "");
      if (vmName === name) {
        found = vm;
        return;
      }
      for (var i = 0; i < (el.children || []).length; i += 1) walk(el.children[i]);
    }
    walk(document.body);
    return found;
  }

  function normalizeIdList(list) {
    if (!Array.isArray(list)) return [];
    return list.map(function (item) {
      return String(item && typeof item === "object" ? item.id : item);
    }).filter(Boolean).sort();
  }

  function sameIdList(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function syncScheduleDefaultSchool() {
    if (!isSchedulePage()) return;

    var timeView = findVueComponentByName("TimeView");
    if (!timeView) return;

    var defaultSchools = timeView.$props && timeView.$props.defaultSchool && timeView.$props.defaultSchool.schoolIds;
    var selectedSchools = timeView.$data && timeView.$data.filterParam && timeView.$data.filterParam.schoolIds;
    var defaultIds = normalizeIdList(defaultSchools);
    var selectedIds = normalizeIdList(selectedSchools);

    if (!defaultIds.length || sameIdList(defaultIds, selectedIds)) {
      try {
        sessionStorage.removeItem(SCHEDULE_SYNC_RELOAD_KEY);
      } catch (error) {}
      highlightSelectedScheduleSchool();
      return;
    }

    clearScheduleFilterCache();
    try {
      if (sessionStorage.getItem(SCHEDULE_SYNC_RELOAD_KEY) === location.href) return;
      sessionStorage.setItem(SCHEDULE_SYNC_RELOAD_KEY, location.href);
    } catch (error) {}
    location.replace(withCacheBust(location.href));
  }

  function highlightSelectedScheduleSchool() {
    var item = document.querySelector(".xbf-selecteditem");
    if (!item || !item.textContent || item.textContent.indexOf("\u6821\u533a") === -1) return;
    item.style.background = "#dff8ea";
    item.style.border = "1px solid #9ee6bf";
    item.style.color = "#067647";
    item.style.borderRadius = "6px";
    item.style.padding = "2px 8px";
  }

  function getTimeView() {
    return findVueComponentByName("TimeView");
  }

  function ensureScheduleMonthView() {
    if (!isSchedulePage()) return;
    var monthButton = document.querySelector(".fc-dayGridMonth-button");
    if (!monthButton || monthButton.classList.contains("fc-button-active")) return;
    monthButton.click();
  }

  function formatDate(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }

  function addMonths(dateText, months) {
    var parts = dateText.split("-").map(Number);
    var date = new Date(parts[0], parts[1] - 1, parts[2] || 1);
    date.setMonth(date.getMonth() + months);
    return formatDate(date);
  }

  function getExportMonthRange(timeView) {
    var startTime = timeView.$data.startTime;
    var endTime = timeView.$data.endTime;
    if (timeView.$data.viewType !== "dayGridMonth") {
      return { startTime: startTime, endTime: endTime };
    }

    var year = Number(startTime.slice(0, 4));
    var month = Number(startTime.slice(5, 7));
    var day = Number(startTime.slice(8, 10));
    if (day > 1) {
      month += 1;
      if (month === 13) {
        year += 1;
        month = 1;
      }
    }
    var monthStart = year + "-" + String(month).padStart(2, "0") + "-01";
    return { startTime: monthStart, endTime: addMonths(monthStart, 1) };
  }

  function getSelectedSchoolName(timeView) {
    var xbFilter = findVueComponentByName("XbFilter");
    var selected = xbFilter && xbFilter.$data && xbFilter.$data.uimodel && xbFilter.$data.uimodel.schoolIds && xbFilter.$data.uimodel.schoolIds.selectedArr;
    var school = selected && selected[0];
    if (!school && timeView.$props && timeView.$props.defaultSchool) {
      school = timeView.$props.defaultSchool.schoolIds && timeView.$props.defaultSchool.schoolIds[0];
    }
    if (school && school.schoolName) return school.schoolName;

    var selectedItem = document.querySelector(".xbf-selecteditem");
    if (selectedItem) return selectedItem.textContent.replace(/\s+/g, "").replace(/^\u6821\u533a[:：]?/, "");
    return "";
  }

  function sanitizeFilePart(value) {
    return String(value || "")
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, "")
      .slice(0, 40);
  }

  function absoluteUrl(url) {
    if (!url) return "";
    if (url.indexOf("//") === 0) return location.protocol + url;
    return new URL(url, location.origin).href;
  }

  function fileNameFromUrl(url) {
    var path = new URL(absoluteUrl(url)).pathname;
    var name = decodeURIComponent(path.split("/").pop() || "");
    return name || ("\u6821\u5b9d\u8bfe\u8868\u5bfc\u51fa" + formatDate(new Date()) + ".xls");
  }

  function appendCampusToFileName(fileName, campusName) {
    var safeCampus = sanitizeFilePart(campusName);
    if (!safeCampus) return fileName;
    var dotIndex = fileName.lastIndexOf(".");
    if (dotIndex <= 0) return fileName + "\uff08" + safeCampus + "\uff09";
    return fileName.slice(0, dotIndex) + "\uff08" + safeCampus + "\uff09" + fileName.slice(dotIndex);
  }

  function buildExportParams(timeView) {
    var filterParam = timeView.$data.filterParam || {};
    var range = getExportMonthRange(timeView);
    var params = {
      fromPage: 1,
      startTime: range.startTime,
      endTime: range.endTime,
      schoolIds: (filterParam.schoolIds || []).join(","),
      lessonClassIds: (filterParam.lessonClassId || []).join(","),
      lessonIds: (filterParam.lessonIds || []).join(","),
      isRecorded: (filterParam.isRecorded || []).join(","),
      hrdocIds: (filterParam.teacherIds || []).join(","),
      classroomIds: (filterParam.classroomIds || []).join(","),
      searchKey: timeView.$data.searchParam && timeView.$data.searchParam.SearchKey,
      searchValue: timeView.$data.searchParam && timeView.$data.searchParam.SearchValue,
      fromExportModel: timeView.$data.viewType === "dayGridMonth" ? 1 : undefined
    };
    if (filterParam.subjectIds) params.subjectIds = filterParam.subjectIds.join(",");
    return params;
  }

  function downloadBlob(blob, fileName) {
    var objectUrl = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(objectUrl);
    }, 30000);
  }

  async function exportScheduleWithCampusName(button) {
    var timeView = getTimeView();
    if (!timeView || !timeView.$axiosServices) return;

    var oldText = button.textContent;
    button.disabled = true;
    button.textContent = "\u5bfc\u51fa\u4e2d...";
    try {
      var response = await timeView.$axiosServices.post("/api2/Schedule/ClassScheduleListExport", buildExportParams(timeView));
      var data = response && response.data;
      if (!data || !data.status || !data.data) {
        throw new Error(data && data.errorMessage ? data.errorMessage : "\u5bfc\u51fa\u5931\u8d25");
      }

      var url = absoluteUrl(data.data);
      var fileResponse = await fetch(url, { credentials: "omit" });
      if (!fileResponse.ok) throw new Error("\u4e0b\u8f7d\u6587\u4ef6\u5931\u8d25\uff1a" + fileResponse.status);
      var blob = await fileResponse.blob();
      var fileName = appendCampusToFileName(fileNameFromUrl(url), getSelectedSchoolName(timeView));
      downloadBlob(blob, fileName);
    } catch (error) {
      if (timeView.$message && timeView.$message.error) {
        timeView.$message.error(error && error.message ? error.message : "\u5bfc\u51fa\u5931\u8d25");
      } else {
        alert(error && error.message ? error.message : "\u5bfc\u51fa\u5931\u8d25");
      }
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  function injectExportCampusButton() {
    if (!isSchedulePage()) return;
    var header = document.querySelector(".header-extra");
    if (!header || header.querySelector(".spc-export-campus-btn")) return;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "spc-export-campus-btn";
    button.title = "\u5bfc\u51fa\u8bfe\u8868\uff0c\u6587\u4ef6\u540d\u8ffd\u52a0\u6821\u533a\u540d";
    button.setAttribute("aria-label", "\u5bfc\u51fa\u8bfe\u8868\uff0c\u6587\u4ef6\u540d\u8ffd\u52a0\u6821\u533a\u540d");
    button.textContent = "\u21e9";
    button.addEventListener("click", function () {
      exportScheduleWithCampusName(button);
    });
    header.insertBefore(button, header.firstChild);
  }

  function runSchedulePageFixes() {
    syncScheduleDefaultSchool();
    ensureScheduleMonthView();
    injectExportCampusButton();
    setTimeout(ensureScheduleMonthView, 1800);
    setTimeout(injectExportCampusButton, 2000);
  }

  async function switchAccount(userId) {
    var account = state.accounts.find(function (item) {
      return String(item.userId) === String(userId);
    });
    if (!account || account.userId === state.currentUserId || account.isChecked) return;
    if (account.enable === 0) return setError(text.disabled);
    if (account.isVerifyPhone <= 0) return setError(text.needVerify);
    if (account.roleName === "") return setError(text.noRole);

    state.switchingUserId = account.userId;
    state.error = "";
    render();

    try {
      clearScheduleFilterCache();
      var result = await requestJson(CHANGE_USER_API, {
        method: "POST",
        body: JSON.stringify({
          idStr: account.userId,
          orgIdStr: account.orgId,
          flag: ""
        })
      });
      var message = messageForChangeResult(result);
      if (message) throw new Error(message);
      try {
        sessionStorage.removeItem("\u9876\u90e8\u5bfc\u822a\u680f");
      } catch (error) {}
      location.replace(getReturnUrl());
    } catch (error) {
      state.switchingUserId = null;
      setError(error && error.message ? error.message : text.switchFailed);
    }
  }

  function setError(message) {
    state.error = message;
    render();
  }

  function handleRootClick(event) {
    var rawTarget = event.target;
    var target = rawTarget && rawTarget.nodeType === 1 ? rawTarget : rawTarget && rawTarget.parentElement;
    var root = document.getElementById(ROOT_ID);
    if (!root || !target || !root.contains(target)) return;
    handledClickEvents.add(event);

    if (target.closest(".spc-trigger")) {
      state.open = !state.open;
      render();
      if (state.open) loadAccounts(false);
      return;
    }
    if (target.closest(".spc-close")) {
      state.open = false;
      render();
      return;
    }
    if (target.closest(".spc-refresh")) {
      loadAccounts(true);
      return;
    }
    if (target.closest('[data-action="schedule"]')) {
      location.href = getReturnUrl();
      return;
    }
    var item = target.closest(".spc-item");
    if (item && !item.disabled) switchAccount(item.getAttribute("data-user-id"));
  }

  function handleOutsideClick(event) {
    if (handledClickEvents.has(event)) return;
    var root = document.getElementById(ROOT_ID);
    if (!root || !state.open || root.contains(event.target)) return;
    state.open = false;
    render();
  }

  function watchLocation() {
    if (state.locationHref === location.href) return;
    state.locationHref = location.href;
    rememberScheduleUrl();
    render();
    setTimeout(runSchedulePageFixes, 1500);
  }

  document.addEventListener("click", handleRootClick, true);
  document.addEventListener("click", handleOutsideClick, true);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && state.open) {
      state.open = false;
      render();
    }
  }, true);
  setInterval(watchLocation, 800);

  rememberScheduleUrl();
  render();
  setTimeout(runSchedulePageFixes, 1500);
  setInterval(highlightSelectedScheduleSchool, 2000);
})();
