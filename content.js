// Content script for USD to KAU conversion
// KAU = 1 gram of gold, so we convert using gold price per gram
class USDToKAUConverter {
  constructor() {
    this.isEnabled = true;
    this.kauPrice = null; // This will contain gold price per gram
    this.processedElements = new WeakSet();
    this.observer = null;
    this.debounceTimeout = null;

    // USD price regex patterns - ordered from most specific to least specific
    // Using word boundaries to prevent partial matches and exclude written-out amounts
    this.pricePatterns = [
      /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)(?=\s|$|[^\d])(?!\s*(?:million|billion|trillion|thousand|hundred|k|m|b|t)\b)/g, // $1,234.56 with word boundary, excluding text descriptors
      /\$\s*(\d+\.\d{2})(?=\s|$|[^\d])(?!\s*(?:million|billion|trillion|thousand|hundred|k|m|b|t)\b)/g, // $123.45 with word boundary, excluding text descriptors
      /\$\s*(\d+)(?=\s|$|[^\d])(?!\s*(?:million|billion|trillion|thousand|hundred|k|m|b|t)\b)/g, // $123 with word boundary, excluding text descriptors
      /USD\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)(?=\s|$|[^\d])(?!\s*(?:million|billion|trillion|thousand|hundred|k|m|b|t)\b)/gi, // USD 1,234.56 with word boundary, excluding text descriptors
      /USD\s*(\d+\.\d{2})(?=\s|$|[^\d])(?!\s*(?:million|billion|trillion|thousand|hundred|k|m|b|t)\b)/gi, // USD 123.45 with word boundary, excluding text descriptors
      /USD\s*(\d+)(?=\s|$|[^\d])(?!\s*(?:million|billion|trillion|thousand|hundred|k|m|b|t)\b)/gi, // USD 123 with word boundary, excluding text descriptors
      /(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*dollars?(?=\s|$|[^\d])(?!\s*(?:million|billion|trillion|thousand|hundred|k|m|b|t)\b)/gi, // 1234.56 dollars with word boundary, excluding text descriptors
      /(\d+\.\d{2})\s*dollars?(?=\s|$|[^\d])(?!\s*(?:million|billion|trillion|thousand|hundred|k|m|b|t)\b)/gi, // 123.45 dollars with word boundary, excluding text descriptors
      /(\d+)\s*dollars?(?=\s|$|[^\d])(?!\s*(?:million|billion|trillion|thousand|hundred|k|m|b|t)\b)/gi, // 123 dollars with word boundary, excluding text descriptors
    ];

    // Additional patterns to explicitly exclude written-out amounts
    this.exclusionPatterns = [
      /\$\s*\d+(?:\.\d+)?\s*(?:million|billion|trillion|thousand|hundred|k|m|b|t)\b/gi,
      /USD\s*\d+(?:\.\d+)?\s*(?:million|billion|trillion|thousand|hundred|k|m|b|t)\b/gi,
      /\d+(?:\.\d+)?\s*(?:million|billion|trillion|thousand|hundred|k|m|b|t)\s*dollars?/gi,
      // More specific patterns for common abbreviations
      /\$\s*\d+(?:\.\d+)?\s*[kmbt]\b/gi,
      /USD\s*\d+(?:\.\d+)?\s*[kmbt]\b/gi,
    ];

    this.init();
  }

  async init() {
    // Get KAU price from background script
    await this.getKAUPrice();

    // Start processing the page
    this.processPage();

    // Set up mutation observer for dynamic content
    this.setupMutationObserver();

    // Listen for price updates
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "priceUpdated") {
        this.kauPrice = request.price;
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
      z-index: 10000;
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
      return;
    }

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

    // First check if the text contains any exclusion patterns (written-out amounts)
    const hasExclusionPattern = this.exclusionPatterns.some((pattern) =>
      pattern.test(originalText)
    );

    if (hasExclusionPattern) {
      // Skip processing this text node if it contains written-out amounts
      this.processedElements.add(textNode);
      return;
    }

    // Collect all matches from all patterns first
    const allMatches = [];
    for (const pattern of this.pricePatterns) {
      const matches = [...originalText.matchAll(pattern)];
      for (const match of matches) {
        const usdAmount = this.parseUSDAmount(match[1]);
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
        wrapper.title = `Original USD: ${replacement.originalPrice}`;

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

  parseUSDAmount(amountStr) {
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

    // Allow very large amounts but filter out obviously invalid values
    // Set a very high upper limit to allow for large financial amounts
    if (amount > 1000000000000000) {
      // 1 quadrillion USD
      return 0;
    }

    return amount;
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
