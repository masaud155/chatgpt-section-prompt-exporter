function isVisibleElement(element) {
  const style = window.getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0" &&
    element.offsetParent !== null
  );
}

function sortElementsByPosition(elements) {
  return Array.from(elements).sort((a, b) => {
    if (a === b) return 0;
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
  });
}

function findChatMessages() {
  const rootSelectors = [
    "div[data-testid='conversation-panel']",
    "div[data-testid='message-list']",
    "div[aria-label='Chat messages']",
    "main",
    "div[class*='conversation']"
  ];

  const messageSelectors = [
    "article",
    "div[role='listitem']",
    "div[data-testid='message']",
    "div[class*='message']",
    "div[class*='group']"
  ];

  const elements = new Set();

  for (const rootSelector of rootSelectors) {
    document.querySelectorAll(rootSelector).forEach((root) => {
      if (!(root instanceof HTMLElement)) return;
      if (isVisibleElement(root) && root.innerText.trim().length > 0) {
        elements.add(root);
      }

      messageSelectors.forEach((selector) => {
        root.querySelectorAll(selector).forEach((element) => {
          if (
            element instanceof HTMLElement &&
            isVisibleElement(element) &&
            element.innerText.trim().length > 0
          ) {
            elements.add(element);
          }
        });
      });
    });
  }

  if (elements.size === 0) {
    document.querySelectorAll([...messageSelectors, "article"].join(",")).forEach((element) => {
      if (
        element instanceof HTMLElement &&
        isVisibleElement(element) &&
        element.innerText.trim().length > 0
      ) {
        elements.add(element);
      }
    });
  }

  return sortElementsByPosition(
    Array.from(elements).filter((element) => {
      const text = element.innerText.trim();
      return text.length > 16 && /[A-Za-z0-9]/.test(text);
    })
  );
}

function buildConversationText() {
  const messageElements = findChatMessages();
  if (messageElements.length === 0) {
    return document.body.innerText || "";
  }

  const textItems = messageElements
    .map((el) => el.innerText.trim())
    .filter(Boolean);
  const uniqueTextItems = Array.from(new Set(textItems));
  return uniqueTextItems.join("\n\n");
}

function normalizeText(text) {
  return text.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");
}

function findBlogTitleIndex(text, title) {
  if (!title || !title.trim()) {
    return 0;
  }

  const normalized = text.toLowerCase();
  const normalizedTitle = title.trim().toLowerCase();
  return normalized.indexOf(normalizedTitle);
}

function extractPrompts(text, startIndex) {
  const normalized = normalizeText(text);
  const workingText = normalized.slice(startIndex);
  const lines = workingText.split("\n");
  const prompts = [];
  const promptKeys = new Set();

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.toLowerCase().startsWith("[section image]")) {
      let promptLines = [];
      let nextLineIndex = i + 1;
      let foundGenerate = false;

      const markerRest = lines[i].split(/\[section image\]/i)[1] || "";
      if (markerRest.trim()) {
        const sameLineText = markerRest.trim();
        if (/^generate\b/i.test(sameLineText)) {
          promptLines.push(sameLineText);
          foundGenerate = true;
        }
      }

      while (nextLineIndex < lines.length) {
        const nextLine = lines[nextLineIndex];
        const trimmed = nextLine.trim();

        const isSectionBoundary = /^\s*\d+\.\s+/.test(trimmed);
        const isNewMarker = /^\s*\[section image\]/i.test(trimmed);
        const isHeading = /^\s*#{1,6}\s+/.test(trimmed) || /^\s*[-=]{2,}\s*$/.test(trimmed);
        const isTitleMarker = /^\s*section\s+image\b/i.test(trimmed);
        const isSectionTitle = /^\s*\d+\b/.test(trimmed);

        if (isSectionBoundary || isNewMarker || isHeading || isTitleMarker || isSectionTitle) {
          break;
        }

        if (!foundGenerate) {
          if (/^generate\b/i.test(trimmed)) {
            foundGenerate = true;
            promptLines.push(trimmed);
          }
        } else {
          if (trimmed === "") {
            break;
          }
          promptLines.push(nextLine);
        }

        nextLineIndex += 1;
      }

      const promptText = promptLines
        .join("\n")
        .trim()
        .replace(/\n{3,}/g, "\n\n");

      if (foundGenerate && promptText) {
        const promptKey = promptText.replace(/\s+/g, " ").trim().toLowerCase();
        if (!promptKeys.has(promptKey)) {
          promptKeys.add(promptKey);
          prompts.push({ prompt: promptText });
        }
      }

      i = Math.max(nextLineIndex, i + 1);
    } else {
      i += 1;
    }
  }

  return prompts;
}

function extractBlogTitles(text) {
  const lines = normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const titles = [];
  const addTitle = (value) => {
    const cleaned = value.replace(/^[\d\-\s"'“”]+/, "").trim();
    if (!cleaned || cleaned.length < 8 || cleaned.length > 140) {
      return;
    }
    if (!titles.includes(cleaned)) {
      titles.push(cleaned);
    }
  };

  const labelRegex = /^(?:blog|article|post)?\s*(?:title|topic|name)\s*[:\-–]\s*(.+)$/i;
  const explicitRegex = /(?:blog|article|post).{0,40}(?:title|topic|name)\s*[:\-–]\s*(.+)$/i;

  for (const line of lines) {
    const labelMatch = line.match(labelRegex);
    const explicitMatch = line.match(explicitRegex);
    if (labelMatch) {
      addTitle(labelMatch[1]);
      continue;
    }
    if (explicitMatch) {
      addTitle(explicitMatch[1]);
      continue;
    }
  }

  if (titles.length === 0) {
    for (const line of lines) {
      if (/\[section image\]/i.test(line) || /^generate\b/i.test(line) || /^prompt:/i.test(line)) {
        continue;
      }
      if (/\b(blog|article|topic|post|prompt)\b/i.test(line) && line.length <= 120 && line.length >= 20) {
        addTitle(line);
      }
      if (titles.length >= 8) {
        break;
      }
    }
  }

  if (titles.length === 0) {
    for (const line of lines.slice(0, 20)) {
      if (line.length >= 20 && line.length <= 120 && !/\[section image\]/i.test(line) && !/^generate\b/i.test(line)) {
        addTitle(line);
      }
      if (titles.length >= 6) {
        break;
      }
    }
  }

  return titles.slice(0, 8);
}

function cleanBlogText(text, startIndex) {
  const raw = normalizeText(text).slice(startIndex);
  const lines = raw.split("\n");
  const result = [];
  let skipBlock = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (skipBlock) {
      if (trimmed === "") {
        skipBlock = false;
      }
      continue;
    }

    if (/\[section image\]/i.test(trimmed)) {
      skipBlock = true;
      continue;
    }
    if (/^section image prompt/i.test(trimmed)) {
      continue;
    }
    if (/^prompt:/i.test(trimmed)) {
      skipBlock = true;
      continue;
    }
    if (/^generate\b/i.test(trimmed) && (i === 0 || /^\s*$/.test(lines[i - 1]) || /\[section image\]/i.test(lines[i - 1]) || /^prompt:/i.test(lines[i - 1].trim()))) {
      skipBlock = true;
      continue;
    }

    result.push(line);
  }

  const cleaned = [];
  let lastBlank = false;
  for (const line of result) {
    if (line.trim() === "") {
      if (!lastBlank) {
        cleaned.push("");
        lastBlank = true;
      }
    } else {
      cleaned.push(line);
      lastBlank = false;
    }
  }

  return cleaned.join("\n").trim();
}

function getPromptsForBlog(title) {
  const pageText = buildConversationText();
  const startIndex = findBlogTitleIndex(pageText, title);
  if (title && title.trim() && startIndex === -1) {
    return { prompts: [], foundTitle: false };
  }
  const extracted = extractPrompts(pageText, startIndex);
  return { prompts: extracted, foundTitle: true };
}

function getCleanBlogForTitle(title) {
  const pageText = buildConversationText();
  const startIndex = findBlogTitleIndex(pageText, title);
  if (title && title.trim() && startIndex === -1) {
    return { text: "", foundTitle: false };
  }
  return { text: cleanBlogText(pageText, startIndex), foundTitle: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) {
    return;
  }

  if (message.action === "extractPrompts") {
    sendResponse(getPromptsForBlog(message.blogTitle));
    return;
  }

  if (message.action === "detectBlogTitles") {
    const pageText = buildConversationText();
    sendResponse({ titles: extractBlogTitles(pageText) });
    return;
  }

  if (message.action === "extractCleanBlog") {
    sendResponse(getCleanBlogForTitle(message.blogTitle));
    return;
  }

  if (message.action === "getChatText") {
    sendResponse({ text: buildConversationText() });
    return;
  }
});
