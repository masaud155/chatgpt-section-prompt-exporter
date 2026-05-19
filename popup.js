const blogTitleInput = document.getElementById("blogTitle");
const findPromptsButton = document.getElementById("findPrompts");
const promptCount = document.getElementById("promptCount");
const statusMessage = document.getElementById("statusMessage");
const results = document.getElementById("results");
const copyPromptsButton = document.getElementById("copyPrompts");
const exportTxtButton = document.getElementById("exportTxt");
const exportJsonButton = document.getElementById("exportJson");
const exportCsvButton = document.getElementById("exportCsv");
const clearResultsButton = document.getElementById("clearResults");
const startTimeInput = document.getElementById("startTime");
const endTimeInput = document.getElementById("endTime");
const gapMinutesInput = document.getElementById("gapMinutes");
const generateScheduleButton = document.getElementById("generateSchedule");
const schedulePreview = document.getElementById("schedulePreview");
const scheduleCount = document.getElementById("scheduleCount");
const copyScheduleButton = document.getElementById("copySchedule");
const exportScheduleTxtButton = document.getElementById("exportScheduleTxt");
const clearScheduleButton = document.getElementById("clearSchedule");
const scheduleStatus = document.getElementById("scheduleStatus");

let extractedPrompts = [];
let activeBlogTitle = "";

function normalizePromptKey(text) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function dedupePromptEntries(prompts) {
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

function updateUI() {
  promptCount.textContent = `Total prompts: ${extractedPrompts.length}`;

  if (extractedPrompts.length === 0) {
    results.textContent = "No prompts extracted yet.";
    return;
  }

  const formatted = extractedPrompts
    .map((entry, index) => `Section Image Prompt ${index + 1}:\n${entry.prompt}`)
    .join("\n\n");
  results.textContent = formatted;
}

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.style.color = isError ? "#dc2626" : "#2563eb";
}

function clearResults() {
  extractedPrompts = [];
  activeBlogTitle = "";
  results.textContent = "No prompts extracted yet.";
  promptCount.textContent = "Total prompts: 0";
  setStatus("");
}

function toTxtContent() {
  const lines = [];
  if (activeBlogTitle) {
    lines.push(`Blog Title: ${activeBlogTitle}`);
    lines.push("");
  }

  extractedPrompts.forEach((entry, index) => {
    lines.push(`Section Image Prompt ${index + 1}:`);
    lines.push(entry.prompt);
    if (index < extractedPrompts.length - 1) {
      lines.push("");
    }
  });

  return lines.join("\n");
}

function toJsonContent() {
  return JSON.stringify(
    {
      blogTitle: activeBlogTitle || "",
      totalPrompts: extractedPrompts.length,
      prompts: extractedPrompts.map((entry, index) => ({
        sectionNumber: index + 1,
        prompt: entry.prompt
      }))
    },
    null,
    2
  );
}

function toCsvContent() {
  const lines = ["Section Number,Prompt"];
  extractedPrompts.forEach((entry, index) => {
    const prompt = `"${entry.prompt.replace(/"/g, '""')}"`;
    lines.push(`${index + 1},${prompt}`);
  });
  return lines.join("\n");
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
  const m = ((mins % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours = Math.floor(m / 60);
  const minutes = m % 60;
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHour = ((hours + 11) % 12) + 1;
  const mm = minutes.toString().padStart(2, "0");
  return `${displayHour}:${mm} ${ampm}`;
}

function generateSchedulePlan() {
  scheduleStatus.textContent = "";
  if (!extractedPrompts || extractedPrompts.length === 0) {
    setStatus("No extracted prompts to schedule.", true);
    return null;
  }

  const startTime = parseTimeToMinutes(startTimeInput.value);
  const endTime = parseTimeToMinutes(endTimeInput.value);
  const gap = parseInt(gapMinutesInput.value, 10) || 0;

  if (startTime === null || isNaN(startTime)) {
    setStatus("Please provide a valid start time.", true);
    return null;
  }
  if (gap <= 0 || isNaN(gap)) {
    setStatus("Please provide a valid gap in minutes (>=1).", true);
    return null;
  }

  const lines = [];
  let current = startTime;

  let scheduledCount = 0;

  for (let i = 0; i < extractedPrompts.length; i += 1) {
    const taskIndex = i + 1;
    if (endTime !== null && current > endTime) {
      scheduleStatus.textContent = "Your selected time range is not enough for all prompts. Increase the end time or reduce the gap.";
      scheduleStatus.style.color = "#dc2626";
      break;
    }

    const timeLabel = formatMinutesTo12Hour(current);
    const promptText = extractedPrompts[i].prompt;

    lines.push(`Scheduled Task ${taskIndex}:`);
    lines.push(`Time: ${timeLabel}`);
    lines.push(`Instruction:`);
    if (taskIndex === 1) {
      lines.push(`Generate Image ${taskIndex} only using the prompt below. Generate one image only, then stop.`);
    } else {
      lines.push(`Generate Image ${taskIndex} only using the prompt below. Keep the same premium Medium blog style, but make it visually different from Image 1. Generate one image only, then stop.`);
    }
    lines.push("");
    lines.push("Prompt:");
    lines.push(promptText);
    lines.push("");

    scheduledCount += 1;
    current += gap;
  }

  const result = lines.join("\n");
  schedulePreview.textContent = result || "No schedule generated.";
  scheduleCount.textContent = `Total scheduled tasks: ${scheduledCount}`;
  if (scheduledCount > 0 && scheduledCount === extractedPrompts.length) {
    scheduleStatus.textContent = "Schedule generated.";
    scheduleStatus.style.color = "#2563eb";
  } else if (scheduledCount > 0) {
    setStatus("Schedule generated partially. Check the time range.", true);
  }
  return result;
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

function copyToClipboard(text) {
  if (!navigator.clipboard) {
    setStatus("Clipboard API not supported.", true);
    return;
  }

  navigator.clipboard.writeText(text).then(
    () => setStatus("All section image prompts copied successfully."),
    () => setStatus("Unable to copy prompts to clipboard.", true)
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

// No automatic topic detection: user will type blog title manually.

async function handleFindPrompts() {
  setStatus("Searching conversation...");
  extractedPrompts = [];
  updateUI();

  const title = blogTitleInput.value.trim();
  activeBlogTitle = title;

  try {
    const response = await sendMessageToContentScript({ action: "extractPrompts", blogTitle: title });
    if (!response) {
      setStatus("No response from the content script.", true);
      return;
    }

    if (title && !response.foundTitle) {
      setStatus("Blog title not found in the conversation.", true);
      return;
    }

    extractedPrompts = dedupePromptEntries(response.prompts || []);
    if (extractedPrompts.length === 0) {
      setStatus(title ? "No section image prompts found for this blog." : "No section image prompts found.", true);
    } else {
      setStatus(`Found ${extractedPrompts.length} prompt${extractedPrompts.length === 1 ? "" : "s"}.`);
    }
    updateUI();
  } catch (error) {
    setStatus(error.message || "Unable to extract prompts.", true);
  }
}

findPromptsButton.addEventListener("click", handleFindPrompts);
copyPromptsButton.addEventListener("click", () => {
  if (!extractedPrompts.length) {
    setStatus("No prompts to copy.", true);
    return;
  }
  copyToClipboard(toTxtContent());
});
exportTxtButton.addEventListener("click", () => {
  if (!extractedPrompts.length) {
    setStatus("No prompts to export.", true);
    return;
  }
  downloadFile("section-image-prompts.txt", toTxtContent(), "text/plain;charset=utf-8");
});
exportJsonButton.addEventListener("click", () => {
  if (!extractedPrompts.length) {
    setStatus("No prompts to export.", true);
    return;
  }
  downloadFile("section-image-prompts.json", toJsonContent(), "application/json;charset=utf-8");
});
exportCsvButton.addEventListener("click", () => {
  if (!extractedPrompts.length) {
    setStatus("No prompts to export.", true);
    return;
  }
  downloadFile("section-image-prompts.csv", toCsvContent(), "text/csv;charset=utf-8");
});
clearResultsButton.addEventListener("click", clearResults);
clearResults();

generateScheduleButton.addEventListener("click", () => {
  generateSchedulePlan();
});

copyScheduleButton.addEventListener("click", () => {
  const text = schedulePreview.textContent || "";
  if (!text) {
    setStatus("No schedule to copy.", true);
    return;
  }
  copyToClipboard(text);
});

exportScheduleTxtButton.addEventListener("click", () => {
  const text = schedulePreview.textContent || "";
  if (!text) {
    setStatus("No schedule to export.", true);
    return;
  }
  downloadFile("schedule-plan.txt", text, "text/plain;charset=utf-8");
});

clearScheduleButton.addEventListener("click", () => {
  schedulePreview.textContent = "No schedule generated yet.";
  scheduleCount.textContent = "Total scheduled tasks: 0";
  scheduleStatus.textContent = "";
});
