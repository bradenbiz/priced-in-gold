// Hardcoded excluded URLs that should always be excluded
const HARDCODED_EXCLUDED_URLS = ["kinesis.money", "mene.com"];

// Background service worker for fetching gold prices per gram
class GoldPriceFetcher {
  constructor() {
    // Gold price APIs that provide price per troy ounce (we'll convert to per gram)
    this.goldApis = [
      {
        name: "gold-api.com",
        url: "https://api.gold-api.com/price/XAU",
        parser: (data) => data.price,
      },
      {
        name: "goldapi.io",
        url: "https://api.goldapi.io/api/XAU/USD",
        parser: (data) => data.price,
      },
      {
        name: "api.goldapi.io",
        url: "https://api.goldapi.io/api/XAU/USD",
        parser: (data) => data.price,
      },
    ];
    this.refreshInterval = 30 * 60 * 1000; // 30 minutes
    this.retryDelay = 5 * 60 * 1000; // 5 minutes
    this.gramsPerOunce = 31.1034768; // Standard troy ounce to gram conversion
    this.fallbackGoldPricePerGram = 130; // Fallback price per gram if APIs fail
  }

  async fetchGoldPrice() {
    for (const api of this.goldApis) {
      try {
        console.log(`Fetching gold price from ${api.name}...`);
        const response = await fetch(api.url, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(
            `${api.name} API responded with status: ${response.status}`
          );
        }

        const data = await response.json();
        console.log(`Raw data from ${api.name}:`, data);
        const pricePerOunce = api.parser(data);

        if (isNaN(pricePerOunce) || pricePerOunce <= 0) {
          throw new Error(`Invalid price from ${api.name}: ${pricePerOunce}`);
        }

        // Validate that the price is reasonable (gold should be $1000-5000 per ounce)
        if (pricePerOunce < 1000 || pricePerOunce > 5000) {
          throw new Error(
            `Unrealistic gold price from ${api.name}: $${pricePerOunce} per ounce`
          );
        }

        // Convert from price per troy ounce to price per gram
        const pricePerGram = pricePerOunce / this.gramsPerOunce;

        const priceData = {
          price: pricePerGram, // Price per gram of gold (equivalent to 1 KAU)
          pricePerOunce: pricePerOunce,
          source: api.name,
          timestamp: Date.now(),
          lastUpdated: new Date().toISOString(),
        };

        await chrome.storage.local.set({ kauPrice: priceData });
        console.log(`Gold price updated from ${api.name}:`, priceData);
        return priceData;
      } catch (error) {
        console.error(`Error fetching from ${api.name}:`, error);
        continue;
      }
    }

    // If all APIs fail, use fallback price
    console.warn("All gold price APIs failed, using fallback price");
    const fallbackData = {
      price: this.fallbackGoldPricePerGram,
      pricePerOunce: this.fallbackGoldPricePerGram * this.gramsPerOunce,
      source: "fallback",
      timestamp: Date.now(),
      lastUpdated: new Date().toISOString(),
    };

    await chrome.storage.local.set({ kauPrice: fallbackData });
    console.log("Using fallback gold price:", fallbackData);
    return fallbackData;
  }

  async updateGoldPrice() {
    try {
      console.log("Updating gold price per gram...");
      return await this.fetchGoldPrice();
    } catch (error) {
      console.error("Error updating gold price:", error);

      // Store error state
      const errorData = {
        error: "Error updating gold price: " + error.message,
        timestamp: Date.now(),
        lastAttempt: new Date().toISOString(),
      };
      await chrome.storage.local.set({ kauPriceError: errorData });

      // Don't throw error since we have fallback price
      console.log("Using fallback price due to error");
    }
  }

  async scheduleNextUpdate() {
    // Clear existing timeout
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }

    // Schedule next update
    this.updateTimeout = setTimeout(async () => {
      try {
        await this.updateGoldPrice();
        this.scheduleNextUpdate(); // Schedule the next one
      } catch (error) {
        console.error("Scheduled price update failed:", error);
        // Retry in shorter interval on error
        setTimeout(() => this.scheduleNextUpdate(), this.retryDelay);
      }
    }, this.refreshInterval);
  }

  start() {
    console.log("Starting gold price fetcher...");
    this.updateGoldPrice()
      .then(() => {
        this.scheduleNextUpdate();
      })
      .catch((error) => {
        console.error("Initial gold price fetch failed:", error);
        // Still schedule retries
        this.scheduleNextUpdate();
      });
  }
}

// Initialize the price fetcher
const priceFetcher = new GoldPriceFetcher();

// Start fetching prices when extension is installed or updated
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("Extension installed/updated:", details.reason);
  priceFetcher.start();

  // Set icon based on enabled state
  await setIconBasedOnEnabledState();
});

// Start fetching prices when extension starts
chrome.runtime.onStartup.addListener(() => {
  console.log("Extension startup");
  priceFetcher.start();
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getKAUPrice") {
    chrome.storage.local.get(["kauPrice", "kauPriceError"]).then((data) => {
      console.log("🚀 ~ data:", data);
      sendResponse(data);
    });
    return true; // Keep message channel open for async response
  }

  if (request.action === "refreshPrice") {
    priceFetcher
      .updateGoldPrice()
      .then((priceData) => {
        sendResponse({ success: true, data: priceData });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }

  if (request.action === "openPopup") {
    // Open the extension popup
    chrome.action.openPopup();
    sendResponse({ success: true });
    return true;
  }

  if (request.action === "setIcon") {
    // Change the extension icon based on the state
    const iconType = request.iconType;
    console.log("Setting icon to:", iconType);

    if (iconType === "disabled") {
      chrome.action.setIcon({
        path: {
          16: "icon16-disabled.png",
          48: "icon48-disabled.png",
          128: "icon128-disabled.png",
        },
      });
      chrome.action.setTitle({
        title: "Priced In Gold (Disabled)",
      });
      console.log("Set to disabled icon");
    } else if (iconType === "hardcoded") {
      chrome.action.setIcon({
        path: {
          16: "icon16-hardcoded.png",
          48: "icon48-hardcoded.png",
          128: "icon128-hardcoded.png",
        },
      });
      chrome.action.setTitle({
        title: "Priced In Gold (Not needed on this site)",
      });
      console.log("Set to hardcoded excluded icon");
    } else if (iconType === "normal") {
      chrome.action.setIcon({
        path: {
          16: "icon16.png",
          48: "icon48.png",
          128: "icon128.png",
        },
      });
      chrome.action.setTitle({ title: "Priced In Gold" });
      console.log("Set to normal icon");
    }
    sendResponse({ success: true });
    return true;
  }

  if (request.action === "updateIconForCurrentTab") {
    // Update icon for the current active tab
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]) {
        await updateIconForTab(tabs[0]);
      }
    });
    sendResponse({ success: true });
    return true;
  }
});

// Handle tab activation to update icon when switching tabs
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    await updateIconForTab(tab);
  } catch (error) {
    console.error("Error handling tab activation:", error);
  }
});

// Handle tab updates (when URL changes)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) {
    await updateIconForTab(tab);
  }
});

// Function to update icon based on tab's URL and enabled state
async function updateIconForTab(tab) {
  try {
    // Get enabled state and excluded URLs from storage
    const result = await chrome.storage.local.get(["enabled", "excludedUrls"]);
    const enabled = result.enabled !== false; // default to true
    const excludedUrls = result.excludedUrls || [];

    // If extension is disabled globally, show disabled icon
    if (!enabled) {
      chrome.action.setIcon({
        path: {
          16: "icon16-disabled.png",
          48: "icon48-disabled.png",
          128: "icon128-disabled.png",
        },
      });
      chrome.action.setTitle({
        title: "Priced In Gold (Disabled)",
      });
      console.log("Extension disabled globally");
      return;
    }

    // Check if current tab URL is excluded
    const currentUrl = new URL(tab.url);
    const hostname = currentUrl.hostname;
    const fullUrl = tab.url;

    // Check hardcoded excluded URLs first
    let isHardcodedExcluded = false;
    for (const excludedUrl of HARDCODED_EXCLUDED_URLS) {
      if (hostname === excludedUrl || hostname.endsWith(`.${excludedUrl}`)) {
        isHardcodedExcluded = true;
        break;
      }
    }

    // If hardcoded excluded, set hardcoded icon and return
    if (isHardcodedExcluded) {
      chrome.action.setIcon({
        path: {
          16: "icon16-hardcoded.png",
          48: "icon48-hardcoded.png",
          128: "icon128-hardcoded.png",
        },
      });
      chrome.action.setTitle({
        title: "Priced In Gold (Not needed on this site)",
      });
      console.log("Tab is hardcoded excluded:", tab.url);
      return;
    }

    // If no user exclusions, set normal icon
    if (excludedUrls.length === 0) {
      chrome.action.setIcon({
        path: {
          16: "icon16.png",
          48: "icon48.png",
          128: "icon128.png",
        },
      });
      chrome.action.setTitle({ title: "Priced In Gold" });
      return;
    }

    // Check if current tab URL matches any user-excluded patterns
    const isUserExcluded = excludedUrls.some((pattern) => {
      return matchesUrlPattern(hostname, fullUrl, pattern);
    });

    if (isUserExcluded) {
      // Set disabled icon for user-excluded site
      chrome.action.setIcon({
        path: {
          16: "icon16-disabled.png",
          48: "icon48-disabled.png",
          128: "icon128-disabled.png",
        },
      });
      chrome.action.setTitle({
        title: "Priced In Gold (Disabled on this site)",
      });
      console.log("Tab is user excluded:", tab.url);
    } else {
      // Set normal icon
      chrome.action.setIcon({
        path: {
          16: "icon16.png",
          48: "icon48.png",
          128: "icon128.png",
        },
      });
      chrome.action.setTitle({ title: "Priced In Gold" });
      console.log("Tab is not excluded:", tab.url);
    }
  } catch (error) {
    console.error("Error updating icon for tab:", error);
  }
}

// URL pattern matching function (same as in content script)
function matchesUrlPattern(hostname, fullUrl, pattern) {
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

// Function to set icon based on enabled state
async function setIconBasedOnEnabledState() {
  try {
    const result = await chrome.storage.local.get(["enabled"]);
    const enabled = result.enabled !== false; // default to true

    const iconType = enabled ? "normal" : "disabled";

    if (iconType === "disabled") {
      chrome.action.setIcon({
        path: {
          16: "icon16-disabled.png",
          48: "icon48-disabled.png",
          128: "icon128-disabled.png",
        },
      });
      chrome.action.setTitle({
        title: "Priced In Gold (Disabled)",
      });
    } else {
      chrome.action.setIcon({
        path: {
          16: "icon16.png",
          48: "icon48.png",
          128: "icon128.png",
        },
      });
      chrome.action.setTitle({ title: "Priced In Gold" });
    }

    console.log("Set icon based on enabled state:", enabled);
  } catch (error) {
    console.error("Error setting icon based on enabled state:", error);
  }
}

// Handle extension startup
chrome.runtime.onStartup.addListener(async () => {
  priceFetcher.start();

  // Set icon based on enabled state
  await setIconBasedOnEnabledState();

  // Update icon for current tab on startup
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (tabs[0]) {
      await updateIconForTab(tabs[0]);
    }
  });
});
