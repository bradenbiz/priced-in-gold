// Background service worker for fetching gold prices per gram
class GoldPriceFetcher {
  constructor() {
    // Gold price APIs that provide price per troy ounce (we'll convert to per gram)
    this.goldApis = [
      {
        name: "metals.live",
        url: "https://api.metals.live/v1/spot/gold",
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
chrome.runtime.onInstalled.addListener((details) => {
  console.log("Extension installed/updated:", details.reason);
  priceFetcher.start();
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
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  priceFetcher.start();
});
