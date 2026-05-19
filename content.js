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

function getPromptsForBlog(title) {
  const pageText = buildConversationText();
  const startIndex = findBlogTitleIndex(pageText, title);
  if (title && title.trim() && startIndex === -1) {
    return { prompts: [], foundTitle: false };
  }

  const extracted = extractPrompts(pageText, startIndex);
  return { prompts: extracted, foundTitle: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.action !== "extractPrompts") {
    return;
  }

  const { blogTitle } = message;
  const result = getPromptsForBlog(blogTitle);
  sendResponse(result);
});
