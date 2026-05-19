const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));

const extractBlogTitleInput = document.getElementById("extractBlogTitle");
const extractDetectTitlesButton = document.getElementById("extractDetectTitles");
const extractPromptsBtn = document.getElementById("extractPromptsBtn");
const extractTotalPrompts = document.getElementById("extractTotalPrompts");
const extractStatus = document.getElementById("extractStatus");
const extractPreview = document.getElementById("extractPreview");
const copyExtractedPromptsButton = document.getElementById("copyExtractedPrompts");
const exportExtractTxtButton = document.getElementById("exportExtractTxt");
const exportExtractJsonButton = document.getElementById("exportExtractJson");
const exportExtractCsvButton = document.getElementById("exportExtractCsv");

const scheduleBlogTitleInput = document.getElementById("scheduleBlogTitle");
const scheduleDetectTitlesButton = document.getElementById("scheduleDetectTitles");
const scheduleStartTimeInput = document.getElementById("scheduleStartTime");
const scheduleEndTimeInput = document.getElementById("scheduleEndTime");
const scheduleGapMinutesInput = document.getElementById("scheduleGapMinutes");
const generateScheduleBtn = document.getElementById("generateScheduleBtn");
const scheduleTotalTasks = document.getElementById("scheduleTotalTasks");
const scheduleStatus = document.getElementById("scheduleStatus");
const schedulePreview = document.getElementById("schedulePreview");
const copySchedulePlanButton = document.getElementById("copySchedulePlan");
const exportScheduleTxtButton = document.getElementById("exportScheduleTxt");

const cleanBlogTitleInput = document.getElementById("cleanBlogTitle");
const cleanDetectTitlesButton = document.getElementById("cleanDetectTitles");
const extractCleanBlogBtn = document.getElementById("extractCleanBlogBtn");
const cleanStatus = document.getElementById("cleanStatus");
const cleanPreview = document.getElementById("cleanPreview");
const copyCleanBlogButton = document.getElementById("copyCleanBlog");
const exportCleanTxtButton = document.getElementById("exportCleanTxt");
const exportCleanMdButton = document.getElementById("exportCleanMd");

const settingsDefaultGap = document.getElementById("settingsDefaultGap");
const settingsExportFormat = document.getElementById("settingsExportFormat");
const settingsAutoDetect = document.getElementById("settingsAutoDetect");
const saveSettingsButton = document.getElementById("saveSettingsBtn");
const settingsStatus = document.getElementById("settingsStatus");

const STORAGE_KEY = "promptHarvestSettings";

function activateTab(tabId) {
  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabId);
  });
  tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === tabId);
  });
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.style.color = isError ? "#dc2626" : "#2563eb";
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(":");
  if (parts.length < 2) return null;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  return hours * 60 + minutes;
}

function formatMinutesTo12Hour(mins) {
  const m = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(m / 60);
  const minutes = m % 60;
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHour = ((hours + 11) % 12) + 1;
  const mm = minutes.toString().padStart(2, "0");
  return `${displayHour}:${mm} ${ampm}`;
}

function normalizePromptKey(text) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function removeDuplicatePrompts(prompts) {
  const seen = new Set();
  return prompts.filter((entry) => {
    const key = normalizePromptKey(entry.prompt);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function copyToClipboard(text, statusElement) {
  if (!navigator.clipboard) {
    setStatus(statusElement, "Clipboard API not supported.", true);
    return;
  }
  navigator.clipboard.writeText(text).then(
    () => setStatus(statusElement, "Copied successfully."),
    () => setStatus(statusElement, "Unable to copy to clipboard.", true)
  );
}

function injectContentScript(tabId) {
  return new Promise((resolve, reject) => {
    if (!chrome.scripting) {
      return reject(new Error("The scripting API is unavailable."));
    }
    chrome.scripting.executeScript(
      { target: { tabId }, files: ["content.js"] },
      () => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve();
      }
    );
  });
}

function sendMessageToContentScript(message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab || !activeTab.id) {
        return reject(new Error("No active tab found."));
      }
      const trySend = () => {
        chrome.tabs.sendMessage(activeTab.id, message, (response) => {
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message || "";
            if (/receiving end does not exist/i.test(errorMsg)) {
              injectContentScript(activeTab.id)
                .then(() => {
                  chrome.tabs.sendMessage(activeTab.id, message, (secondResponse) => {
                    if (chrome.runtime.lastError) {
                      return reject(new Error(chrome.runtime.lastError.message));
                    }
                    resolve(secondResponse);
                  });
                })
                .catch((injectError) => reject(injectError));
              return;
            }
            return reject(new Error(errorMsg));
          }
          resolve(response);
        });
      };
      trySend();
    });
  });
}

let detectedBlogTitles = [];

function getSelectedTitle(inputElement) {
  return inputElement.value.trim();
}

function setSharedBlogTitle(title) {
  [extractBlogTitleInput, scheduleBlogTitleInput, cleanBlogTitleInput].forEach((input) => {
    input.value = title;
  });
}

function syncBlogTitleAcrossTabs(value) {
  setSharedBlogTitle(value);
}

function setDetectedBlogTitles(titles) {
  detectedBlogTitles = titles || [];
  if (detectedBlogTitles.length === 1) {
    setSharedBlogTitle(detectedBlogTitles[0]);
  }
}

function populateTitleDropdown(dropdown, titles) {
  // Deprecated, kept for backward compatibility if needed.
}

async function detectBlogTitles(statusElement) {
  if (statusElement) {
    setStatus(statusElement, "Detecting titles...");
  }
  try {
    const response = await sendMessageToContentScript({ action: "detectBlogTitles" });
    if (!response || !Array.isArray(response.titles)) {
      throw new Error("Invalid response from title detection.");
    }
    setDetectedBlogTitles(response.titles);
    if (response.titles.length === 0) {
      if (statusElement) {
        setStatus(statusElement, "No titles detected.", true);
      }
      return [];
    }
    if (statusElement) {
      setStatus(statusElement, `Detected ${response.titles.length} title${response.titles.length === 1 ? "" : "s"}.`);
    }
    return response.titles;
  } catch (error) {
    if (statusElement) {
      setStatus(statusElement, error.message || "Unable to detect titles.", true);
    }
    setDetectedBlogTitles([]);
    return [];
  }
}

async function extractImagePrompts(blogTitle) {
  return sendMessageToContentScript({ action: "extractPrompts", blogTitle });
}

async function extractCleanBlog(blogTitle) {
  return sendMessageToContentScript({ action: "extractCleanBlog", blogTitle });
}

function formatPromptPreview(prompts) {
  if (!prompts || prompts.length === 0) {
    return "No prompts extracted yet.";
  }
  return prompts
    .map((entry, index) => `Section Image Prompt ${index + 1}:\n${entry.prompt}`)
    .join("\n\n");
}

function buildScheduleText(prompts, startTime, gap, endTime) {
  const lines = [];
  let current = startTime;
  let scheduledCount = 0;

  for (let i = 0; i < prompts.length; i += 1) {
    if (endTime !== null && current > endTime) {
      break;
    }
    scheduledCount += 1;
    const taskIndex = i + 1;
    const timeLabel = formatMinutesTo12Hour(current);
    const promptText = prompts[i].prompt;

    lines.push(`Scheduled Task ${taskIndex}:`);
    lines.push(`Time: ${timeLabel}`);
    lines.push("Instruction:");
    if (taskIndex === 1) {
      lines.push("Generate Image 1 only using the prompt below. Generate one image only, then stop.");
    } else {
      lines.push(
        `Generate Image ${taskIndex} only using the prompt below. Keep the same premium Medium blog style, but make it visually different from Image 1. Generate one image only, then stop.`
      );
    }
    lines.push("");
    lines.push("Prompt:");
    lines.push(promptText);
    lines.push("");
    current += gap;
  }

  return { scheduleText: lines.join("\n"), scheduledCount };
}

async function handleExtractPrompts() {
  const blogTitle = getSelectedTitle(extractBlogTitleInput);
  setStatus(extractStatus, "Extracting prompts...");
  extractPreview.textContent = "";
  extractTotalPrompts.textContent = "Total prompts: 0";

  try {
    const response = await extractImagePrompts(blogTitle);
    if (!response) {
      throw new Error("No response from the content script.");
    }
    if (blogTitle && !response.foundTitle) {
      setStatus(extractStatus, "Blog title not found in the conversation.", true);
      extractPreview.textContent = "No prompts extracted.";
      return;
    }
    const prompts = removeDuplicatePrompts(response.prompts || []);
    extractPreview.textContent = formatPromptPreview(prompts);
    extractTotalPrompts.textContent = `Total prompts: ${prompts.length}`;
    setStatus(extractStatus, prompts.length ? `Found ${prompts.length} prompt${prompts.length === 1 ? "" : "s"}.` : "No section image prompts found.", prompts.length === 0);
    extractPreview.dataset.promptCount = prompts.length;
    extractPreview.prompts = prompts;
  } catch (error) {
    setStatus(extractStatus, error.message || "Unable to extract prompts.", true);
    extractPreview.textContent = "No prompts extracted.";
  }
}

async function handleGenerateSchedule() {
  const blogTitle = getSelectedTitle(scheduleBlogTitleInput);
  const startTime = parseTimeToMinutes(scheduleStartTimeInput.value);
  const endTime = parseTimeToMinutes(scheduleEndTimeInput.value);
  const gap = parseInt(scheduleGapMinutesInput.value, 10);

  if (!blogTitle) {
    setStatus(scheduleStatus, "Please enter or select a blog title.", true);
    return;
  }
  if (startTime === null) {
    setStatus(scheduleStatus, "Please provide a valid start time.", true);
    return;
  }
  if (!gap || gap < 1) {
    setStatus(scheduleStatus, "Please provide a valid gap in minutes.", true);
    return;
  }

  setStatus(scheduleStatus, "Generating schedule...");
  schedulePreview.textContent = "";
  scheduleTotalTasks.textContent = "Total scheduled tasks: 0";

  try {
    const response = await extractImagePrompts(blogTitle);
    if (!response) {
      throw new Error("No response from the content script.");
    }
    if (!response.foundTitle) {
      setStatus(scheduleStatus, "Blog title not found in the conversation.", true);
      return;
    }
    const prompts = removeDuplicatePrompts(response.prompts || []);
    if (prompts.length === 0) {
      setStatus(scheduleStatus, "No section image prompts found for this blog.", true);
      return;
    }

    const { scheduleText, scheduledCount } = buildScheduleText(prompts, startTime, gap, endTime);
    if (!scheduleText) {
      setStatus(scheduleStatus, "Your selected time range is not enough for all prompts. Increase the end time or reduce the gap.", true);
    } else {
      schedulePreview.textContent = scheduleText;
      scheduleTotalTasks.textContent = `Total scheduled tasks: ${scheduledCount}`;
      if (scheduledCount < prompts.length) {
        setStatus(scheduleStatus, "Partial schedule generated; the time range is not enough.", true);
      } else {
        setStatus(scheduleStatus, "Schedule generated.");
      }
    }
  } catch (error) {
    setStatus(scheduleStatus, error.message || "Unable to generate schedule.", true);
  }
}

async function handleExtractCleanBlog() {
  const blogTitle = getSelectedTitle(cleanBlogTitleInput);
  if (!blogTitle) {
    setStatus(cleanStatus, "Please select or enter a blog title first so the extension can export the correct blog.", true);
    cleanPreview.textContent = "No clean blog extracted yet.";
    return;
  }

  setStatus(cleanStatus, "Extracting clean blog...");
  cleanPreview.textContent = "";

  try {
    const response = await extractCleanBlog(blogTitle);
    if (!response) {
      throw new Error("No response from the content script.");
    }
    if (!response.foundTitle && blogTitle) {
      setStatus(cleanStatus, "Blog title not found in the conversation.", true);
      cleanPreview.textContent = "No clean blog extracted.";
      return;
    }
    if (!response.text) {
      setStatus(cleanStatus, "No clean blog content found.", true);
      cleanPreview.textContent = "No clean blog extracted.";
      return;
    }
    cleanPreview.textContent = response.text;
    setStatus(cleanStatus, "Clean blog extracted.");
  } catch (error) {
    setStatus(cleanStatus, error.message || "Unable to extract clean blog.", true);
    cleanPreview.textContent = "No clean blog extracted.";
  }
}

function handleCopyExtractedPrompts() {
  const prompts = extractPreview.prompts || [];
  if (!prompts.length) {
    setStatus(extractStatus, "No prompts to copy.", true);
    return;
  }
  copyToClipboard(formatPromptPreview(prompts), extractStatus);
}

function handleCopySchedulePlan() {
  const text = schedulePreview.textContent.trim();
  if (!text) {
    setStatus(scheduleStatus, "No schedule to copy.", true);
    return;
  }
  copyToClipboard(text, scheduleStatus);
}

function handleCopyCleanBlog() {
  const text = cleanPreview.textContent.trim();
  if (!text) {
    setStatus(cleanStatus, "No blog content to copy.", true);
    return;
  }
  copyToClipboard(text, cleanStatus);
}

function loadSettings() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    settingsDefaultGap.value = 3;
    settingsExportFormat.value = "txt";
    settingsAutoDetect.checked = false;
    return;
  }
  try {
    const settings = JSON.parse(stored);
    settingsDefaultGap.value = settings.defaultGapMinutes || 3;
    settingsExportFormat.value = settings.defaultExportFormat || "txt";
    settingsAutoDetect.checked = !!settings.autoDetectTitles;
    scheduleGapMinutesInput.value = settings.defaultGapMinutes || 3;
  } catch {
    settingsDefaultGap.value = 3;
    settingsExportFormat.value = "txt";
    settingsAutoDetect.checked = false;
  }
}

function saveSettings() {
  const settings = {
    defaultGapMinutes: parseInt(settingsDefaultGap.value, 10) || 3,
    defaultExportFormat: settingsExportFormat.value || "txt",
    autoDetectTitles: settingsAutoDetect.checked
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  scheduleGapMinutesInput.value = settings.defaultGapMinutes;
  setStatus(settingsStatus, "Settings saved.");
}

function autoDetectOnLoad() {
  detectBlogTitles();
}

function setupSmartTitleInputs() {
  const inputs = [extractBlogTitleInput, scheduleBlogTitleInput, cleanBlogTitleInput];

  inputs.forEach((input) => {
    input.addEventListener("input", () => {
      syncBlogTitleAcrossTabs(input.value.trim());
    });
  });

  document.querySelectorAll(".clear-title-button").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.target;
      const targetInput = document.getElementById(targetId);
      if (targetInput) {
        syncBlogTitleAcrossTabs("");
      }
    });
  });
}

function setupEventHandlers() {
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });

  extractDetectTitlesButton.addEventListener("click", () => {
    detectBlogTitles(extractStatus);
  });

  extractPromptsBtn.addEventListener("click", handleExtractPrompts);
  copyExtractedPromptsButton.addEventListener("click", handleCopyExtractedPrompts);
  exportExtractTxtButton.addEventListener("click", () => {
    const prompts = extractPreview.prompts || [];
    if (!prompts.length) {
      setStatus(extractStatus, "No prompts to export.", true);
      return;
    }
    downloadFile("section-image-prompts.txt", formatPromptPreview(prompts), "text/plain;charset=utf-8");
  });
  exportExtractJsonButton.addEventListener("click", () => {
    const prompts = extractPreview.prompts || [];
    if (!prompts.length) {
      setStatus(extractStatus, "No prompts to export.", true);
      return;
    }
    downloadFile(
      "section-image-prompts.json",
      JSON.stringify({ prompts: prompts.map((entry, index) => ({ sectionNumber: index + 1, prompt: entry.prompt })) }, null, 2),
      "application/json;charset=utf-8"
    );
  });
  exportExtractCsvButton.addEventListener("click", () => {
    const prompts = extractPreview.prompts || [];
    if (!prompts.length) {
      setStatus(extractStatus, "No prompts to export.", true);
      return;
    }
    const lines = ["Section Number,Prompt"];
    prompts.forEach((entry, index) => {
      const prompt = `"${entry.prompt.replace(/"/g, '""')}"`;
      lines.push(`${index + 1},${prompt}`);
    });
    downloadFile("section-image-prompts.csv", lines.join("\n"), "text/csv;charset=utf-8");
  });

  scheduleDetectTitlesButton.addEventListener("click", () => {
    detectBlogTitles(scheduleStatus);
  });

  generateScheduleBtn.addEventListener("click", handleGenerateSchedule);
  copySchedulePlanButton.addEventListener("click", handleCopySchedulePlan);
  exportScheduleTxtButton.addEventListener("click", () => {
    const text = schedulePreview.textContent.trim();
    if (!text) {
      setStatus(scheduleStatus, "No schedule to export.", true);
      return;
    }
    downloadFile("schedule-plan.txt", text, "text/plain;charset=utf-8");
  });

  cleanDetectTitlesButton.addEventListener("click", () => {
    detectBlogTitles(cleanStatus);
  });

  extractCleanBlogBtn.addEventListener("click", handleExtractCleanBlog);
  copyCleanBlogButton.addEventListener("click", handleCopyCleanBlog);
  exportCleanTxtButton.addEventListener("click", () => {
    const text = cleanPreview.textContent.trim();
    if (!text) {
      setStatus(cleanStatus, "No blog content to export.", true);
      return;
    }
    downloadFile("clean-blog.txt", text, "text/plain;charset=utf-8");
  });
  exportCleanMdButton.addEventListener("click", () => {
    const text = cleanPreview.textContent.trim();
    if (!text) {
      setStatus(cleanStatus, "No blog content to export.", true);
      return;
    }
    downloadFile("clean-blog.md", text, "text/markdown;charset=utf-8");
  });

  saveSettingsButton.addEventListener("click", saveSettings);
}

function init() {
  setupEventHandlers();
  setupSmartTitleInputs();
  loadSettings();
  autoDetectOnLoad();
}

init();
