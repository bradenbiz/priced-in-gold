// Popup script for USD to KAU Converter
class PopupController {
  constructor() {
    this.elements = {
      kauPrice: document.getElementById("kauPrice"),
      priceSource: document.getElementById("priceSource"),
      lastUpdated: document.getElementById("lastUpdated"),
      enableToggle: document.getElementById("enableToggle"),
      formatSelect: document.getElementById("formatSelect"),
      refreshBtn: document.getElementById("refreshBtn"),
      testBtn: document.getElementById("testBtn"),
    };

    this.init();
  }

  async init() {
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
      ]);
      this.elements.enableToggle.checked = result.enabled !== false; // default to true
      this.elements.formatSelect.value = result.displayFormat || "auto";
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

      // Send message to content script
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        await chrome.tabs.sendMessage(tab.id, {
          action: "toggleConversion",
          enabled,
        });
      } catch (error) {
        console.error("Error toggling conversion:", error);
      }
    });

    // Format select
    this.elements.formatSelect.addEventListener("change", async (e) => {
      const format = e.target.value;
      await chrome.storage.local.set({ displayFormat: format });

      // Send message to content script
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        await chrome.tabs.sendMessage(tab.id, {
          action: "updateFormat",
          format,
        });
      } catch (error) {
        console.error("Error updating format:", error);
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

    // Test button
    this.elements.testBtn.addEventListener("click", async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        await chrome.tabs.sendMessage(tab.id, { action: "testConversion" });

        // Show feedback
        const originalText = this.elements.testBtn.textContent;
        this.elements.testBtn.textContent = "Testing...";
        this.elements.testBtn.disabled = true;

        setTimeout(() => {
          this.elements.testBtn.textContent = originalText;
          this.elements.testBtn.disabled = false;
        }, 2000);
      } catch (error) {
        console.error("Error testing conversion:", error);
        this.elements.testBtn.textContent = "Error";
        setTimeout(() => {
          this.elements.testBtn.textContent = "Test Page";
        }, 2000);
      }
    });
  }

  updateUI() {
    // Update button states based on current settings
    const enabled = this.elements.enableToggle.checked;
    this.elements.formatSelect.disabled = !enabled;
  }
}

// Initialize popup when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new PopupController();
});
