// Hardcoded excluded URLs that should always be excluded
const HARDCODED_EXCLUDED_URLS = ["kinesis.money", "mene.com"];

// Popup script for Priced In Gold
class PopupController {
  constructor() {
    this.elements = {
      kauPrice: document.getElementById("kauPrice"),
      priceSource: document.getElementById("priceSource"),
      lastUpdated: document.getElementById("lastUpdated"),
      enableToggle: document.getElementById("enableToggle"),
      refreshBtn: document.getElementById("refreshBtn"),
      urlInput: document.getElementById("urlInput"),
      addUrlBtn: document.getElementById("addUrlBtn"),
      urlList: document.getElementById("urlList"),
      // testBtn: document.getElementById("testBtn"),
    };

    this.init();
  }

  async init() {
    // Check if we're on a hardcoded excluded URL
    const currentUrl = await this.getCurrentTabUrl();
    if (currentUrl && this.isHardcodedExcluded(currentUrl)) {
      this.showExcludedMessage(currentUrl);
      return;
    }

    // Load current settings
    await this.loadSettings();

    // Load current KAU price
    await this.loadKAUPrice();

    // Set up event listeners
    this.setupEventListeners();

    // Update UI
    this.updateUI();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get([
        "enabled",
        "displayFormat",
        "excludedUrls",
      ]);
      this.elements.enableToggle.checked = result.enabled !== false; // default to true
      this.excludedUrls = result.excludedUrls || [];
      this.renderUrlList();
    } catch (error) {
      console.error("Error loading settings:", error);
    }
  }

  async loadKAUPrice() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: "getKAUPrice",
      });

      if (response.kauPrice) {
        this.updatePriceDisplay(response.kauPrice);
      } else if (response.kauPriceError) {
        this.showErrorState(response.kauPriceError);
      } else {
        this.showLoadingState();
      }
    } catch (error) {
      console.error("Error loading KAU price:", error);
      this.showErrorState("Failed to load KAU price");
    }
  }

  updatePriceDisplay(priceData) {
    const price = priceData.price;
    const source = priceData.source;
    const lastUpdated = new Date(priceData.lastUpdated);

    // Format price
    this.elements.kauPrice.textContent = `$${price.toFixed(2)}/KAU`;

    // Update source badge
    this.elements.priceSource.textContent = source;
    this.elements.priceSource.className = `source-badge ${source.toLowerCase()}`;

    // Update last updated time
    this.elements.lastUpdated.textContent = this.formatTimeAgo(lastUpdated);
  }

  showErrorState(error) {
    this.elements.kauPrice.innerHTML =
      '<span class="error-state">❌ Error</span>';
    this.elements.priceSource.textContent = "Error";
    this.elements.priceSource.className = "source-badge error";
    this.elements.lastUpdated.textContent = error || "Unknown error";
  }

  showLoadingState() {
    this.elements.kauPrice.innerHTML =
      '<span class="loading"><span class="spinner"></span>Loading...</span>';
    this.elements.priceSource.textContent = "Loading";
    this.elements.priceSource.className = "source-badge";
    this.elements.lastUpdated.textContent = "Please wait...";
  }

  formatTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) {
      return "Just now";
    } else if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return `${diffDays}d ago`;
    }
  }

  setupEventListeners() {
    // Enable/disable toggle
    this.elements.enableToggle.addEventListener("change", async (e) => {
      const enabled = e.target.checked;
      await chrome.storage.local.set({ enabled });

      // Update icon based on enabled state
      try {
        await chrome.runtime.sendMessage({
          action: "setIcon",
          iconType: enabled ? "normal" : "disabled",
        });
      } catch (error) {
        console.error("Error updating icon:", error);
      }

      // Send message to all tabs with content scripts
      try {
        const tabs = await chrome.tabs.query({});
        const promises = tabs.map(async (tab) => {
          try {
            await chrome.tabs.sendMessage(tab.id, {
              action: "toggleConversion",
              enabled,
            });
          } catch (error) {
            // Ignore errors for tabs without content script (like chrome:// pages)
            if (!error.message.includes("Could not establish connection")) {
              console.warn(`Error sending message to tab ${tab.id}:`, error);
            }
          }
        });
        await Promise.allSettled(promises);
      } catch (error) {
        console.error("Error toggling conversion:", error);
      }
    });

    // Refresh button
    this.elements.refreshBtn.addEventListener("click", async () => {
      this.elements.refreshBtn.disabled = true;
      this.elements.refreshBtn.textContent = "Refreshing...";

      try {
        const response = await chrome.runtime.sendMessage({
          action: "refreshPrice",
        });

        if (response.success) {
          this.updatePriceDisplay(response.data);
        } else {
          this.showErrorState(response.error);
        }
      } catch (error) {
        console.error("Error refreshing price:", error);
        this.showErrorState("Failed to refresh price");
      } finally {
        this.elements.refreshBtn.disabled = false;
        this.elements.refreshBtn.textContent = "Refresh Price";
      }
    });

    // URL exclusion management
    this.elements.addUrlBtn.addEventListener("click", () => {
      this.addUrl();
    });

    this.elements.urlInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        this.addUrl();
      }
    });

    // Event delegation for remove buttons
    this.elements.urlList.addEventListener("click", (e) => {
      if (e.target.classList.contains("remove-btn")) {
        const urlPattern = e.target.getAttribute("data-url");
        this.removeUrl(urlPattern);
      }
    });

    // // Test button
    // this.elements.testBtn.addEventListener("click", async () => {
    //   try {
    //     const [tab] = await chrome.tabs.query({
    //       active: true,
    //       currentWindow: true,
    //     });
    //     await chrome.tabs.sendMessage(tab.id, { action: "testConversion" });

    //     // Show feedback
    //     const originalText = this.elements.testBtn.textContent;
    //     this.elements.testBtn.textContent = "Testing...";
    //     this.elements.testBtn.disabled = true;

    //     setTimeout(() => {
    //       this.elements.testBtn.textContent = originalText;
    //       this.elements.testBtn.disabled = false;
    //     }, 2000);
    //   } catch (error) {
    //     console.error("Error testing conversion:", error);
    //     this.elements.testBtn.textContent = "Error";
    //     setTimeout(() => {
    //       this.elements.testBtn.textContent = "Test Page";
    //     }, 2000);
    //   }
    // });
  }

  updateUI() {
    // Update button states based on current settings
    const enabled = this.elements.enableToggle.checked;
    // formatSelect is commented out in HTML, so no need to update it
  }

  async addUrl() {
    const urlPattern = this.elements.urlInput.value.trim();
    if (!urlPattern) return;

    // Validate URL pattern
    if (!this.isValidUrlPattern(urlPattern)) {
      alert(
        "Invalid URL pattern. Please use valid domains or wildcards like *.google.com"
      );
      return;
    }

    // Check if already exists
    if (this.excludedUrls.includes(urlPattern)) {
      alert("This URL pattern is already in the exclusion list");
      return;
    }

    // Add to list
    this.excludedUrls.push(urlPattern);
    this.saveExcludedUrls();
    this.renderUrlList();
    this.elements.urlInput.value = "";
  }

  async removeUrl(urlPattern) {
    this.excludedUrls = this.excludedUrls.filter((url) => url !== urlPattern);
    this.saveExcludedUrls();
    this.renderUrlList();
  }

  async saveExcludedUrls() {
    try {
      await chrome.storage.local.set({ excludedUrls: this.excludedUrls });

      // Notify content script about the update
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        console.log(
          "Sending updateExcludedUrls message to tab:",
          tab.id,
          "with:",
          this.excludedUrls
        );
        await chrome.tabs.sendMessage(tab.id, {
          action: "updateExcludedUrls",
          excludedUrls: this.excludedUrls,
        });
        console.log("Message sent successfully");
      } catch (error) {
        console.error("Error notifying content script:", error);
      }
    } catch (error) {
      console.error("Error saving excluded URLs:", error);
    }
  }

  renderUrlList() {
    this.elements.urlList.innerHTML = "";

    this.excludedUrls.forEach((urlPattern) => {
      const urlItem = document.createElement("div");
      urlItem.className = "url-item";

      urlItem.innerHTML = `
        <span class="url-pattern">${urlPattern}</span>
        <button class="remove-btn" data-url="${urlPattern}">Remove</button>
      `;

      this.elements.urlList.appendChild(urlItem);
    });
  }

  async getCurrentTabUrl() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      return tab ? tab.url : null;
    } catch (error) {
      console.error("Error getting current tab URL:", error);
      return null;
    }
  }

  checkUrlMatch(currentUrl, pattern) {
    try {
      const currentUrlObj = new URL(currentUrl);
      const hostname = currentUrlObj.hostname;
      const fullUrl = currentUrl;

      // Always exclude kinesis.money
      if (hostname === "kinesis.money" || hostname.endsWith(".kinesis.money")) {
        return true;
      }

      return this.matchesUrlPattern(hostname, fullUrl, pattern);
    } catch (error) {
      console.error("Error checking URL match:", error);
      return false;
    }
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

    // Exact hostname match or subdomain match
    return hostname === pattern || hostname.endsWith(`.${pattern}`);
  }

  isValidUrlPattern(pattern) {
    // Allow domain patterns, URL patterns with paths, and wildcards
    try {
      // Try to parse as a URL to validate the format
      const url = new URL(
        pattern.startsWith("http") ? pattern : `https://${pattern}`
      );

      // Check if it's a valid hostname
      const hostname = url.hostname;
      const validHostnamePattern =
        /^(\*\.)?[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*(\*)?$/;

      return (
        validHostnamePattern.test(hostname) ||
        hostname.includes("localhost") ||
        hostname.includes("127.0.0.1")
      );
    } catch (error) {
      // If URL parsing fails, check if it's a simple domain pattern
      const validPattern =
        /^(\*\.)?[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*(\*)?$/;
      return (
        validPattern.test(pattern) ||
        pattern.includes("localhost") ||
        pattern.includes("127.0.0.1")
      );
    }
  }

  isHardcodedExcluded(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;

      for (const excludedUrl of HARDCODED_EXCLUDED_URLS) {
        if (hostname === excludedUrl || hostname.endsWith(`.${excludedUrl}`)) {
          return true;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  showExcludedMessage(currentUrl) {
    // Hide all existing content
    document.querySelector(".status-card").style.display = "none";
    document.querySelector(".controls").style.display = "none";
    document.querySelector(".footer").style.display = "none";

    // Get the domain name for display
    const urlObj = new URL(currentUrl);
    const domain = urlObj.hostname;

    // Create special message for excluded URLs
    const messageContainer = document.createElement("div");
    messageContainer.className = "excluded-message";
    messageContainer.style.cssText = `
      background: white;
      border-radius: 8px;
      padding: 24px;
      text-align: center;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      margin-bottom: 16px;
    `;

    // Get appropriate message based on domain
    const message = this.getExcludedMessage(domain);

    messageContainer.innerHTML = `
      <h2 style="margin: 0 0 12px 0; color: #2c3e50; font-size: 18px;">Extension Not Needed</h2>
      <p style="margin: 0 0 16px 0; color: #7f8c8d; font-size: 14px; line-height: 1.4;">
        You're on <strong>${domain}</strong> - ${message.description}
      </p>
      <div style="background: #e8f4f8; padding: 12px; border-radius: 6px; font-size: 12px; color: #2c3e50;">
        <strong>Why?</strong> ${message.reason}
      </div>
    `;

    // Insert the message after the header
    document
      .querySelector(".header")
      .insertAdjacentElement("afterend", messageContainer);
  }

  getExcludedMessage(domain) {
    const messages = {
      "kinesis.money": {
        description:
          "a gold-focused platform where USD to KAU conversion is not needed",
        reason:
          "Kinesis already displays prices in gold equivalents, making this extension redundant on their platform.",
      },
      "mene.com": {
        description:
          "a luxury jewelry platform that already displays prices in gold",
        reason:
          "Mene already shows prices in gold equivalents, making USD to KAU conversion unnecessary.",
      },
    };

    // Default message for any other hardcoded excluded URLs
    return (
      messages[domain] || {
        description: "a platform where this extension is not needed",
        reason:
          "This platform already provides gold-based pricing, making the extension redundant.",
      }
    );
  }
}

// Initialize popup when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new PopupController();
});
