# USD to Gold Converter Chrome Extension

A Chrome extension that automatically converts USD prices on web pages to their equivalent in gold, using live gold spot prices. Transform your online experience by understanding the true value of any price in terms of real money - gold.

## Features

- **🔄 Automatic Conversion**: Instantly converts USD prices to gold equivalents on any webpage
- **💰 Real Gold Pricing**: Uses live gold spot prices from reliable APIs (Gold-API.com)
- **🎯 Smart Detection**: Recognizes various USD price formats ($123.45, USD 123, 123 dollars, etc.)
- **💡 Hover Tooltips**: Shows original USD price when hovering over converted gold prices
- **⚙️ Customizable Settings**: Enable/disable conversion, exclude specific websites, manual refresh
- **🛡️ Privacy First**: No personal data collected, all processing happens locally
- **🔄 Dynamic Content**: Handles dynamically loaded content with MutationObserver
- **📊 Multiple Units**: Choose between different gold weight units (μg, mg, g, oz)
- **⏰ Real-time Updates**: Refreshes gold prices every 30 minutes automatically
- **🛠️ Error Handling**: Graceful degradation when APIs are unavailable

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the extension directory
5. The extension will appear in your Chrome toolbar

## Usage

1. **Automatic**: The extension automatically converts USD prices on any webpage you visit
2. **Settings**: Click the extension icon to:
   - View current gold price and source
   - Enable/disable conversion
   - Change display format (auto, grams, milligrams, troy ounces)
   - Refresh gold price manually
   - Test conversion on current page

## Price Sources

1. **Primary**: Gold-API.com (`https://api.gold-api.com`) - Live gold spot prices

## Supported Price Formats

- `$123.45`
- `$1,234.56`
- `USD 123.45`
- `123.45 dollars`
- `$123` (whole numbers)

## Display Units

The extension automatically chooses the most appropriate unit:

- **Micrograms (μg)**: For very small amounts (< 1mg)
- **Milligrams (mg)**: For small amounts (< 1g)
- **Grams (g)**: For medium amounts (< 1 troy oz)
- **Troy Ounces (oz)**: For large amounts (≥ 1 troy oz)

## Why Gold?

Gold has been used as money for thousands of years and maintains its purchasing power over time. While fiat currencies lose value through inflation, gold preserves wealth. This extension helps you understand the true cost of goods and services in terms of real, tangible value.

## Technical Details

- **Manifest Version**: 3 (Latest Chrome extension standard)
- **Content Scripts**: Injected into all web pages for price conversion
- **Background Service Worker**: Fetches gold prices from APIs
- **Storage**: Uses Chrome storage API for settings and price cache
- **Performance**: Debounced DOM processing to avoid excessive updates
- **Security**: HTTPS-only API communications
- **Lightweight**: Minimal resource usage, optimized for performance

## Files Structure

```
├── manifest.json          # Extension configuration
├── background.js          # Service worker for price fetching
├── content.js            # Content script for price conversion
├── styles.css            # Styling for converted prices
├── popup.html            # Extension popup interface
├── popup.js              # Popup functionality
└── README.md             # This file
```

## Privacy

- **No personal data is collected**: This extension does not collect, store, or transmit any personal information about users
- **No browsing history**: We do not track or store your browsing history or the websites you visit
- **No user identification**: We do not collect any information that could identify you personally
- **Local processing only**: All data processing happens locally in your browser
- **Secure storage**: Settings and preferences are stored locally using Chrome's built-in storage system
- **HTTPS only**: All API communications use secure HTTPS connections

### Data Collection and Usage

- **Gold price data**: The extension fetches current gold prices from public APIs to perform currency conversions
- **Local settings**: The extension stores your preferences (like display format and excluded URLs) locally on your device
- **No third-party data sharing**: No personal data is shared with any third-party services except for anonymous gold price API requests

### Compliance

This extension complies with:

- Chrome Web Store Developer Program Policies
- General Data Protection Regulation (GDPR)
- California Consumer Privacy Act (CCPA)

### Contact

If you have any questions about this privacy policy, please contact us through the extension's GitHub repository: https://github.com/bradenbisping/priced-in-gold

## Troubleshooting

1. **Prices not converting**: Check if the extension is enabled in the popup
2. **Wrong gold price**: Try refreshing the price manually
3. **Extension not working**: Reload the webpage or restart Chrome
4. **API errors**: The extension will show an error indicator if gold prices are unavailable

## Development

To modify or extend the extension:

1. Make changes to the source files
2. Go to `chrome://extensions/`
3. Click the refresh button on the extension card
4. Test your changes

---

**Note**: This extension is not affiliated with Kinesis Money or any of its affiliates. KAU is only used as a reference and abbreviation for pricing in grams of gold. Prices are approximate and based on spot gold prices.
