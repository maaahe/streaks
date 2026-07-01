(function () {
  "use strict";

  var STORAGE_KEY = "streaks.app.v1";
  var OSLO_TIME_ZONE = "Europe/Oslo";
  var DAY_MS = 24 * 60 * 60 * 1000;
  var EMPTY_DATA = { habits: [], habitDays: [] };
  var app = document.getElementById("app");
  var dialog = document.getElementById("habit-dialog");
  var habitForm = document.getElementById("habit-form");
  var habitInput = document.getElementById("habit-name");
  var habitError = document.getElementById("habit-error");

  var state = {
    data: loadLocalData(),
    remoteConfigured: isRemoteConfigured(),
    syncStatus: "local",
    syncError: "",
  };

  function loadLocalData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return cloneData(EMPTY_DATA);
      }

      return normalizeData(JSON.parse(raw));
    } catch (error) {
      return cloneData(EMPTY_DATA);
    }
  }

  function saveLocalData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  }

  function normalizeData(data) {
    return {
      habits: data && Array.isArray(data.habits) ? data.habits : [],
      habitDays: data && Array.isArray(data.habitDays) ? data.habitDays : [],
    };
  }

  function cloneData(data) {
    return JSON.parse(JSON.stringify(data));
  }

  function getConfig() {
    return window.STREAKS_CONFIG || {};
  }

  function isRemoteConfigured() {
    var config = getConfig();
    return Boolean(config.supabaseUrl && config.supabaseAnonKey && config.stateId);
  }

  function supabaseUrl(path) {
    return getConfig().supabaseUrl.replace(/\/$/, "") + "/rest/v1/" + path;
  }

  function supabaseHeaders(extraHeaders) {
    var key = getConfig().supabaseAnonKey;
    return Object.assign(
      {
        apikey: key,
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
      extraHeaders || {},
    );
  }

  function hasLocalData() {
    return state.data.habits.length > 0 || state.data.habitDays.length > 0;
  }

  async function loadRemoteData() {
    if (!state.remoteConfigured) {
      return;
    }

    state.syncStatus = "loading";
    render();

    try {
      var id = encodeURIComponent(getConfig().stateId);
      var response = await fetch(supabaseUrl("app_state?id=eq." + id + "&select=data"), {
        headers: supabaseHeaders(),
      });

      if (!response.ok) {
        throw new Error("Could not load Supabase data.");
      }

      var rows = await response.json();
      if (rows.length && rows[0].data) {
        state.data = normalizeData(rows[0].data);
        saveLocalData();
      } else {
        await saveRemoteData();
      }

      state.syncStatus = "synced";
      state.syncError = "";
    } catch (error) {
      state.syncStatus = "error";
      state.syncError = "Could not sync. Changes are saved in this browser for now.";
    }

    render();
  }

  async function saveRemoteData() {
    var response = await fetch(supabaseUrl("app_state?on_conflict=id"), {
      method: "POST",
      headers: supabaseHeaders({
        Prefer: "resolution=merge-duplicates,return=minimal",
      }),
      body: JSON.stringify({
        id: getConfig().stateId,
        data: state.data,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error("Could not save Supabase data.");
    }
  }

  function saveData() {
    saveLocalData();

    if (!state.remoteConfigured) {
      state.syncStatus = "local";
      state.syncError = "";
      return;
    }

    state.syncStatus = "saving";
    state.syncError = "";

    saveRemoteData()
      .then(function () {
        state.syncStatus = "synced";
        state.syncError = "";
        render();
      })
      .catch(function () {
        state.syncStatus = "error";
        state.syncError = "Could not sync. Changes are saved in this browser for now.";
        render();
      });
  }

  function osloToday() {
    var parts = new Intl.DateTimeFormat("en", {
      timeZone: OSLO_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());

    return [
      getDatePart(parts, "year"),
      getDatePart(parts, "month"),
      getDatePart(parts, "day"),
    ].join("-");
  }

  function getDatePart(parts, type) {
    for (var index = 0; index < parts.length; index += 1) {
      if (parts[index].type === type) {
        return parts[index].value;
      }
    }
    return "";
  }

  function parseDate(dateString) {
    var parts = dateString.split("-").map(Number);
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
  }

  function toDateString(date) {
    var year = date.getUTCFullYear();
    var month = String(date.getUTCMonth() + 1).padStart(2, "0");
    var day = String(date.getUTCDate()).padStart(2, "0");
    return [year, month, day].join("-");
  }

  function addDays(dateString, amount) {
    return toDateString(new Date(parseDate(dateString).getTime() + amount * DAY_MS));
  }

  function compareDates(left, right) {
    if (left === right) {
      return 0;
    }
    return left < right ? -1 : 1;
  }

  function formatDate(dateString, options) {
    return new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: "UTC" }, options)).format(
      parseDate(dateString),
    );
  }

  function makeId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return prefix + "_" + window.crypto.randomUUID();
    }
    return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function activeHabits() {
    return state.data.habits
      .sort(function (left, right) {
        return left.createdAt.localeCompare(right.createdAt);
      });
  }

  function findHabitDay(habitId, dateString) {
    return state.data.habitDays.find(function (habitDay) {
      return habitDay.habitId === habitId && habitDay.date === dateString;
    });
  }

  function isDone(habitId, dateString) {
    var habitDay = findHabitDay(habitId, dateString);
    return Boolean(habitDay && habitDay.status === "done");
  }

  function toggleHabitDay(habitId) {
    var today = osloToday();
    var habitDay = findHabitDay(habitId, today);
    var nextStatus = habitDay && habitDay.status === "done" ? "not_done" : "done";

    if (habitDay) {
      habitDay.status = nextStatus;
      habitDay.updatedAt = new Date().toISOString();
    } else {
      state.data.habitDays.push({
        id: makeId("habit_day"),
        habitId: habitId,
        date: today,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      });
    }

    saveData();
    render();
  }

  function addHabit(name) {
    var trimmedName = name.trim().replace(/\s+/g, " ");
    var duplicate = activeHabits().some(function (habit) {
      return habit.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase();
    });

    if (!trimmedName) {
      return "Enter a habit name.";
    }

    if (duplicate) {
      return "A habit with that name already exists.";
    }

    state.data.habits.push({
      id: makeId("habit"),
      name: trimmedName,
      createdDate: osloToday(),
      createdAt: new Date().toISOString(),
    });
    saveData();
    render();
    return "";
  }

  function deleteHabit(habitId) {
    var habit = state.data.habits.find(function (item) {
      return item.id === habitId;
    });
    if (!habit) {
      return;
    }

    var confirmed = window.confirm(
      'Delete "' + habit.name + '"?\n\nThis removes the habit and its saved streak data.',
    );
    if (!confirmed) {
      return;
    }

    state.data.habits = state.data.habits.filter(function (item) {
      return item.id !== habitId;
    });
    state.data.habitDays = state.data.habitDays.filter(function (habitDay) {
      return habitDay.habitId !== habitId;
    });
    saveData();
    render();
  }

  function currentStreak(habit) {
    var today = osloToday();
    var cursor = isDone(habit.id, today) ? today : addDays(today, -1);
    var streak = 0;

    while (compareDates(cursor, habit.createdDate) >= 0) {
      if (!isDone(habit.id, cursor)) {
        break;
      }
      streak += 1;
      cursor = addDays(cursor, -1);
    }

    return streak;
  }

  function streakText(count) {
    return count + " day streak";
  }

  function openHabitDialog() {
    habitError.textContent = "";
    habitInput.value = "";
    dialog.showModal();
    window.setTimeout(function () {
      habitInput.focus();
    }, 0);
  }

  function closeHabitDialog() {
    dialog.close();
  }

  function render() {
    var today = osloToday();
    var habits = activeHabits();

    app.innerHTML =
      '<main class="today-screen">' +
      '<header class="today-header">' +
      "<div>" +
      '<h1 class="today-title">Today</h1>' +
      '<p class="today-date">' +
      escapeHtml(formatDate(today, { month: "long", day: "numeric", year: "numeric" })) +
      "</p>" +
      "</div>" +
      '<button class="add-button" type="button" data-action="open-add" aria-label="Add habit">' +
      plusIcon() +
      "</button>" +
      "</header>" +
      renderSyncStatus() +
      renderHabitList(habits, today) +
      "</main>";
  }

  function renderSyncStatus() {
    var text = "";

    if (state.syncStatus === "loading") {
      text = "Syncing...";
    } else if (state.syncStatus === "saving") {
      text = "Saving...";
    } else if (state.syncStatus === "error") {
      text = state.syncError;
    } else if (!state.remoteConfigured && hasLocalData()) {
      text = "Saved on this device";
    }

    if (!text) {
      return "";
    }

    return '<p class="sync-status">' + escapeHtml(text) + "</p>";
  }

  function renderHabitList(habits, today) {
    if (!habits.length) {
      return (
        '<section class="empty-state">' +
        "<h2>You have no habits yet.</h2>" +
        "<p>Add your first habit to begin tracking.</p>" +
        '<button class="empty-action" type="button" data-action="open-add">Add habit</button>' +
        "</section>"
      );
    }

    return (
      '<section class="habit-list" aria-label="Today habits">' +
      habits
        .map(function (habit) {
          return renderHabit(habit, today);
        })
        .join("") +
      "</section>"
    );
  }

  function renderHabit(habit, today) {
    var done = isDone(habit.id, today);
    var actionText = done ? "Done" : "Mark as done";
    return (
      '<article class="habit-row">' +
      "<div>" +
      '<div class="habit-title-line">' +
      '<h2 class="habit-name">' +
      escapeHtml(habit.name) +
      "</h2>" +
      '<button class="delete-button" type="button" data-action="delete-habit" data-habit-id="' +
      escapeAttr(habit.id) +
      '" aria-label="' +
      escapeAttr("Delete " + habit.name) +
      '">' +
      trashIcon() +
      "</button>" +
      "</div>" +
      '<p class="habit-streak">' +
      escapeHtml(streakText(currentStreak(habit))) +
      "</p>" +
      "</div>" +
      '<button class="completion-button' +
      (done ? " is-done" : "") +
      '" type="button" data-action="toggle" data-habit-id="' +
      escapeAttr(habit.id) +
      '" aria-pressed="' +
      done +
      '" aria-label="' +
      escapeAttr(habit.name + ", " + actionText) +
      '">' +
      escapeHtml(actionText) +
      "</button>" +
      "</article>"
    );
  }

  function plusIcon() {
    return (
      '<svg class="icon-only" viewBox="0 0 48 48" aria-hidden="true" focusable="false">' +
      '<path d="M24 9v30M9 24h30" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' +
      "</svg>"
    );
  }

  function trashIcon() {
    return (
      '<svg class="icon-only" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M8 7V5.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M5 7h14M9 11v7M15 11v7M7 7l1 14h8l1-14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>"
    );
  }

  function handleAction(event) {
    var target = event.target.closest("[data-action]");
    if (!target) {
      return;
    }

    var action = target.getAttribute("data-action");

    if (action === "open-add") {
      openHabitDialog();
    }

    if (action === "toggle") {
      toggleHabitDay(target.getAttribute("data-habit-id"));
    }

    if (action === "delete-habit") {
      deleteHabit(target.getAttribute("data-habit-id"));
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  habitForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var error = addHabit(habitInput.value);
    habitError.textContent = error;
    if (!error) {
      closeHabitDialog();
    }
  });

  dialog.addEventListener("click", function (event) {
    if (event.target === dialog) {
      closeHabitDialog();
    }
  });

  document.addEventListener("click", function (event) {
    if (event.target.closest("[data-close-dialog]")) {
      closeHabitDialog();
      return;
    }
    handleAction(event);
  });

  render();
  loadRemoteData();
})();
