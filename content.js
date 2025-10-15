// Content script for USD to KAU conversion
// KAU = 1 gram of gold, so we convert using gold price per gram
class USDToKAUConverter {
  constructor() {
    this.isEnabled = true;
    this.kauPrice = null; // This will contain gold price per gram
    this.processedElements = new WeakSet();
    this.observer = null;
    this.debounceTimeout = null;
    this.excludedUrls = [];
    this.currentUrl = window.location.href;

    // Hardcoded excluded URLs that should always be excluded
    this.hardcodedExcludedUrls = ["kinesis.money", "mene.com"];

    // USD price regex patterns - ordered from most specific to least specific
    // Now includes written and abbreviated amounts for conversion
    this.pricePatterns = [
      // Written amounts (most specific first)
      /\$\s*(\d+(?:\.\d+)?)\s*(million|billion|trillion|thousand|hundred)\b/gi, // $300 million, $2.5 billion, etc.
      /USD\s*(\d+(?:\.\d+)?)\s*(million|billion|trillion|thousand|hundred)\b/gi, // USD 300 million, etc.
      /(\d+(?:\.\d+)?)\s*(million|billion|trillion|thousand|hundred)\s*dollars?/gi, // 300 million dollars, etc.

      // Abbreviated amounts
      /\$\s*(\d+(?:\.\d+)?)\s*([kmbt])\b/gi, // $100k, $5M, $2B, etc.
      /USD\s*(\d+(?:\.\d+)?)\s*([kmbt])\b/gi, // USD 100k, etc.
      /(\d+(?:\.\d+)?)\s*([kmbt])\s*dollars?/gi, // 100k dollars, etc.

      // Standard numeric amounts (existing patterns)
      /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)(?=\s|$|[^\d])/g, // $1,234.56 with word boundary
      /\$\s*(\d+\.\d{2})(?=\s|$|[^\d])/g, // $123.45 with word boundary
      /\$\s*(\d+)(?=\s|$|[^\d])/g, // $123 with word boundary
      /USD\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)(?=\s|$|[^\d])/gi, // USD 1,234.56 with word boundary
      /USD\s*(\d+\.\d{2})(?=\s|$|[^\d])/gi, // USD 123.45 with word boundary
      /USD\s*(\d+)(?=\s|$|[^\d])/gi, // USD 123 with word boundary
      /(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*dollars?(?=\s|$|[^\d])/gi, // 1234.56 dollars with word boundary
      /(\d+\.\d{2})\s*dollars?(?=\s|$|[^\d])/gi, // 123.45 dollars with word boundary
      /(\d+)\s*dollars?(?=\s|$|[^\d])/gi, // 123 dollars with word boundary
    ];

    // No exclusion patterns needed - we now convert all monetary amounts

    this.init();
  }

  async init() {
    // Get KAU price from background script
    await this.getKAUPrice();

    // Load enabled state and excluded URLs from storage
    await this.loadEnabledState();
    await this.loadExcludedUrls();

    // Always process the page - let the exclusion logic handle whether to show conversions
    this.processPage();

    // Set up mutation observer for dynamic content
    this.setupMutationObserver();

    // Listen for price updates and toggle messages
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "priceUpdated") {
        this.kauPrice = request.price;
        this.processPage();
      } else if (request.action === "toggleConversion") {
        this.isEnabled = request.enabled;

        // Update icon based on enabled state
        chrome.runtime.sendMessage({
          action: "setIcon",
          iconType: this.isEnabled ? "normal" : "disabled",
        });

        if (this.isEnabled) {
          // Re-enable conversions - process the page
          this.processPage();
        } else {
          // Disable conversions - remove all existing conversions
          this.removeConversions();
        }
      } else if (request.action === "updateFormat") {
        // Handle format updates if needed in the future
        console.log("Format updated:", request.format);
      } else if (request.action === "testConversion") {
        // Handle test conversion if needed
        console.log("Test conversion requested");
      } else if (request.action === "updateExcludedUrls") {
        // Handle excluded URLs updates
        console.log(
          "Received updateExcludedUrls message with:",
          request.excludedUrls
        );
        this.excludedUrls = request.excludedUrls || [];
        console.log("Updated excludedUrls to:", this.excludedUrls);

        // Update icon based on current exclusion status
        chrome.runtime.sendMessage({
          action: "updateIconForCurrentTab",
        });

        // Remove existing conversions first, then reprocess
        this.removeConversions();
        this.processPage();
      }
    });
  }

  async getKAUPrice() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: "getKAUPrice",
      });
      if (response.kauPrice) {
        this.kauPrice = response.kauPrice;
        console.log("Gold price per gram loaded:", this.kauPrice);
      } else if (response.kauPriceError) {
        console.warn("Gold price unavailable:", response.kauPriceError);
        this.showErrorIndicator();
      }
    } catch (error) {
      console.error("Error getting gold price:", error);
    }
  }

  async loadEnabledState() {
    try {
      const result = await chrome.storage.local.get(["enabled"]);
      this.isEnabled = result.enabled !== false; // default to true
      console.log("Extension enabled state:", this.isEnabled);
    } catch (error) {
      console.error("Error loading enabled state:", error);
      this.isEnabled = true; // default to enabled
    }
  }

  async loadExcludedUrls() {
    try {
      const result = await chrome.storage.local.get(["excludedUrls"]);
      this.excludedUrls = result.excludedUrls || [];
      console.log("Excluded URLs loaded:", this.excludedUrls);
    } catch (error) {
      console.error("Error loading excluded URLs:", error);
      this.excludedUrls = [];
    }
  }

  showErrorIndicator() {
    // Add a small indicator that conversion is unavailable
    const indicator = document.createElement("div");
    indicator.id = "usd-to-kau-error";
    indicator.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: #ff6b6b;
      color: white;
      padding: 5px 10px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 2147483647;
      font-family: Arial, sans-serif;
    `;
    indicator.textContent = "Gold price unavailable";
    document.body.appendChild(indicator);

    // Remove after 5 seconds
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    }, 5000);
  }

  showExclusionIndicator() {
    // Check if this is a hardcoded exclusion
    const currentUrl = new URL(this.currentUrl);
    const hostname = currentUrl.hostname;

    let isHardcodedExcluded = false;
    for (const excludedUrl of this.hardcodedExcludedUrls) {
      if (hostname === excludedUrl || hostname.endsWith(`.${excludedUrl}`)) {
        isHardcodedExcluded = true;
        break;
      }
    }

    if (isHardcodedExcluded) {
      console.log("Sending setIcon message for hardcoded excluded state");
      chrome.runtime.sendMessage({
        action: "setIcon",
        iconType: "hardcoded-excluded",
      });
    } else {
      console.log("Sending setIcon message for disabled state");
      chrome.runtime.sendMessage({
        action: "setIcon",
        iconType: "disabled",
      });
    }
  }

  isUrlExcluded() {
    const currentUrl = new URL(this.currentUrl);
    const hostname = currentUrl.hostname;
    const fullUrl = this.currentUrl;

    console.log("Checking URL exclusion for:", fullUrl);
    console.log("Current excluded URLs:", this.excludedUrls);

    // Check hardcoded excluded URLs first
    for (const excludedUrl of this.hardcodedExcludedUrls) {
      if (hostname === excludedUrl || hostname.endsWith(`.${excludedUrl}`)) {
        console.log("URL is hardcoded excluded:", excludedUrl);
        return true;
      }
    }

    if (!this.excludedUrls || this.excludedUrls.length === 0) {
      console.log("No excluded URLs configured");
      return false;
    }

    const isExcluded = this.excludedUrls.some((pattern) => {
      const matches = this.matchesUrlPattern(hostname, fullUrl, pattern);
      if (matches) {
        console.log("URL matches excluded pattern:", pattern);
      }
      return matches;
    });

    console.log("URL exclusion result:", isExcluded);
    return isExcluded;
  }

  matchesUrlPattern(hostname, fullUrl, pattern) {
    // Handle URL patterns with paths (e.g., "x.com/search")
    if (pattern.includes("/")) {
      try {
        // Normalize the pattern URL
        const patternUrl = pattern.startsWith("http")
          ? pattern
          : `https://${pattern}`;
        const patternObj = new URL(patternUrl);

        // Check if hostname matches
        if (hostname !== patternObj.hostname) {
          return false;
        }

        // Check if path matches (supports wildcards in path)
        const currentPath = new URL(fullUrl).pathname;
        const patternPath = patternObj.pathname;

        if (patternPath.endsWith("*")) {
          // Wildcard path matching
          const pathPrefix = patternPath.slice(0, -1);
          return currentPath.startsWith(pathPrefix);
        } else {
          // Exact path matching
          return currentPath === patternPath;
        }
      } catch (error) {
        // If URL parsing fails, fall back to hostname matching
        return hostname === pattern;
      }
    }

    // Handle wildcard domain patterns
    if (pattern.startsWith("*.")) {
      const domain = pattern.substring(2);
      return hostname === domain || hostname.endsWith("." + domain);
    }

    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1);
      return hostname.startsWith(prefix);
    }

    // Handle localhost with port
    if (pattern.startsWith("localhost")) {
      return hostname.startsWith("localhost");
    }

    // Handle 127.0.0.1 with port
    if (pattern.startsWith("127.0.0.1")) {
      return hostname.startsWith("127.0.0.1");
    }

    // Exact hostname match
    return hostname === pattern;
  }

  checkUrlExclusion() {
    // Check if current URL is excluded
    if (this.isUrlExcluded()) {
      console.log("Extension disabled for this URL:", this.currentUrl);
      this.showExclusionIndicator();
      // Remove any existing conversions
      this.removeConversions();
    } else {
      // URL is not excluded, restore normal icon and process the page if enabled
      console.log(
        "URL is not excluded, setting normal icon and processing page if enabled"
      );
      chrome.runtime.sendMessage({
        action: "setIcon",
        iconType: "normal",
      });

      if (this.isEnabled && this.kauPrice) {
        console.log("Processing page for conversions");
        this.processPage();
      } else {
        console.log(
          "Not processing page - enabled:",
          this.isEnabled,
          "kauPrice:",
          !!this.kauPrice
        );
      }
    }
  }

  setupMutationObserver() {
    this.observer = new MutationObserver((mutations) => {
      // Debounce to avoid excessive processing
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = setTimeout(() => {
        this.processPage();
      }, 500);
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  processPage() {
    if (!this.kauPrice || !this.isEnabled) {
      console.log(
        "Skipping page processing - enabled:",
        this.isEnabled,
        "kauPrice:",
        !!this.kauPrice
      );
      return;
    }

    // Check if URL is excluded before processing
    if (this.isUrlExcluded()) {
      console.log("Skipping page processing - URL is excluded");
      return;
    }

    console.log("Processing page for conversions");
    // Process all text nodes
    this.processTextNodes(document.body);
  }

  processTextNodes(node) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        // Skip if already processed or in script/style tags
        if (
          this.processedElements.has(node) ||
          node.parentElement?.tagName === "SCRIPT" ||
          node.parentElement?.tagName === "STYLE"
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const textNodes = [];
    let textNode;
    while ((textNode = walker.nextNode())) {
      textNodes.push(textNode);
    }

    textNodes.forEach((textNode) => {
      this.processTextNode(textNode);
    });
  }

  processTextNode(textNode) {
    if (this.processedElements.has(textNode)) {
      return;
    }

    const originalText = textNode.nodeValue;
    const originalPrices = [];
    const processedRanges = []; // Track which parts of text have been processed
    const priceReplacements = []; // Store price replacements with their positions

    // No exclusion patterns - process all monetary amounts

    // Collect all matches from all patterns first
    const allMatches = [];
    for (const pattern of this.pricePatterns) {
      const matches = [...originalText.matchAll(pattern)];
      for (const match of matches) {
        let usdAmount = 0;
        let multiplier = null;

        // Check if this is a written amount pattern (has second capture group)
        if (match[2] && typeof match[2] === "string") {
          const unit = match[2].toLowerCase();
          switch (unit) {
            case "hundred":
              multiplier = 100;
              break;
            case "thousand":
              multiplier = 1000;
              break;
            case "million":
              multiplier = 1000000;
              break;
            case "billion":
              multiplier = 1000000000;
              break;
            case "trillion":
              multiplier = 1000000000000;
              break;
            case "k":
              multiplier = 1000;
              break;
            case "m":
              multiplier = 1000000;
              break;
            case "b":
              multiplier = 1000000000;
              break;
            case "t":
              multiplier = 1000000000000;
              break;
          }
        }

        usdAmount = this.parseUSDAmount(match[1], multiplier);

        if (usdAmount > 0) {
          allMatches.push({
            match,
            usdAmount,
            originalPrice: match[0],
            start: match.index,
            end: match.index + match[0].length,
            pattern: pattern.toString(),
          });
        }
      }
    }

    // Sort matches by start position, then by specificity (longer matches first)
    allMatches.sort((a, b) => {
      if (a.start !== b.start) {
        return a.start - b.start;
      }
      // If same start position, prefer longer match (more specific)
      return b.end - a.end;
    });

    // Process matches, avoiding overlaps
    for (const matchData of allMatches) {
      const { usdAmount, originalPrice, start, end } = matchData;

      // Check if this range overlaps with any already processed range
      const hasOverlap = processedRanges.some(
        (range) => start < range.end && end > range.start
      );

      if (!hasOverlap) {
        const kauAmount = this.convertToKAU(usdAmount);
        const kauText = this.formatKAUAmount(kauAmount);

        // Store original price for tooltip
        originalPrices.push(originalPrice);

        // Mark this range as processed
        processedRanges.push({ start, end });

        // Store the replacement with its position
        priceReplacements.push({
          originalPrice,
          kauText,
          start,
          end,
        });
      }
    }

    if (priceReplacements.length > 0) {
      // Sort replacements by position (reverse order to avoid index shifting)
      priceReplacements.sort((a, b) => b.start - a.start);

      // Create a document fragment to hold all the new elements
      const fragment = document.createDocumentFragment();
      let currentIndex = originalText.length;

      // Process replacements from end to beginning
      for (const replacement of priceReplacements) {
        // Add any text after this replacement
        if (currentIndex > replacement.end) {
          const afterText = originalText.substring(
            replacement.end,
            currentIndex
          );
          if (afterText) {
            fragment.insertBefore(
              document.createTextNode(afterText),
              fragment.firstChild
            );
          }
        }

        // Create wrapper element for this specific price
        const wrapper = document.createElement("span");
        wrapper.className = "usd-to-kau-converted";

        // Create icon element
        const icon = document.createElement("img");
        icon.src = chrome.runtime.getURL("KAU_iconticker.png");
        icon.className = "kau-icon";
        icon.alt = "KAU";

        // Create text span with KAU amount
        const textSpan = document.createElement("span");
        textSpan.textContent = replacement.kauText;

        // Add icon and text to wrapper
        wrapper.appendChild(icon);
        wrapper.appendChild(textSpan);

        // Set tooltip with original USD price
        wrapper.title = `${replacement.originalPrice}`;

        // Add wrapper to fragment
        fragment.insertBefore(wrapper, fragment.firstChild);

        currentIndex = replacement.start;
      }

      // Add any remaining text before the first replacement
      if (currentIndex > 0) {
        const beforeText = originalText.substring(0, currentIndex);
        if (beforeText) {
          fragment.insertBefore(
            document.createTextNode(beforeText),
            fragment.firstChild
          );
        }
      }

      // Replace the text node with the fragment
      textNode.parentNode.replaceChild(fragment, textNode);

      // Mark all new elements as processed
      const allElements = fragment.querySelectorAll("*");
      allElements.forEach((el) => this.processedElements.add(el));
    } else {
      this.processedElements.add(textNode);
    }
  }

  parseUSDAmount(amountStr, multiplier = null) {
    if (!amountStr || typeof amountStr !== "string") {
      return 0;
    }

    // Remove commas and parse
    const cleanAmount = amountStr.replace(/,/g, "").trim();
    const amount = parseFloat(cleanAmount);

    // Validate amount - allow reasonable range but be more permissive for large amounts
    if (isNaN(amount) || amount < 0.01) {
      return 0;
    }

    // Apply multiplier if provided (for written/abbreviated amounts)
    let finalAmount = amount;
    if (multiplier) {
      finalAmount = amount * multiplier;
    }

    // Allow very large amounts but filter out obviously invalid values
    // Set a very high upper limit to allow for large financial amounts
    if (finalAmount > 1000000000000000) {
      // 1 quadrillion USD
      return 0;
    }

    return finalAmount;
  }

  convertToKAU(usdAmount) {
    if (!this.kauPrice || !this.kauPrice.price) {
      return 0;
    }

    // Convert USD to KAU (1 KAU = 1 gram of gold)
    // kauPrice.price is the price per gram of gold
    return usdAmount / this.kauPrice.price;
  }

  formatKAUAmount(kauAmount) {
    if (kauAmount < 0.0001) {
      // Very small amounts, show in micro-KAU
      return `${Math.round(kauAmount * 1000000)} μKAU`;
    } else if (kauAmount < 0.01) {
      // Small amounts, show in milli-KAU
      return `${(kauAmount * 1000).toFixed(2)} mKAU`;
    } else if (kauAmount < 1) {
      // Less than 1 KAU, show with 4 decimal places
      return `${kauAmount.toFixed(4)} KAU`;
    } else if (kauAmount < 1000) {
      // Regular amounts, show with 2 decimal places
      return `${kauAmount.toFixed(2)} KAU`;
    } else {
      // Large amounts, show with commas and 2 decimal places
      return `${kauAmount.toLocaleString("en-US", {
        maximumFractionDigits: 2,
      })} KAU`;
    }
  }

  removeConversions() {
    // Find all converted elements and restore original text
    const convertedElements = document.querySelectorAll(
      ".usd-to-kau-converted"
    );

    console.log(`Removing ${convertedElements.length} conversions`);

    convertedElements.forEach((element) => {
      // Get the original USD price from the tooltip
      const originalPrice = element.title;

      // Replace the converted element with the original text
      const textNode = document.createTextNode(originalPrice);
      element.parentNode.replaceChild(textNode, element);
    });

    // Clear the processed elements set so they can be processed again if re-enabled
    this.processedElements = new WeakSet();
    console.log("Conversions removed, processed elements cleared");
  }

  destroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }
  }
}

// Initialize the converter when the page loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    new USDToKAUConverter();
  });
} else {
  new USDToKAUConverter();
}
