# USD to Gold Converter Chrome Extension

A Chrome extension that automatically converts USD prices on web pages to their equivalent in gold, using the Kinesis KAU price (1 KAU = 1 gram of gold) with fallback to standard gold spot prices.

## Features

- **Automatic Conversion**: Converts USD prices to gold equivalents on all web pages
- **KAU Integration**: Uses Kinesis KAU price as primary source (1 KAU = 1 gram of gold)
- **Fallback Support**: Falls back to standard gold spot prices if KAU is unavailable
- **Smart Detection**: Recognizes various USD price formats ($123.45, USD 123, 123 dollars, etc.)
- **Hover Tooltips**: Shows original USD price when hovering over converted gold prices
- **Dynamic Content**: Handles dynamically loaded content with MutationObserver
- **Customizable Display**: Choose between different gold weight units (mg, g, oz)
- **Real-time Updates**: Refreshes gold prices every 30 minutes
- **Error Handling**: Graceful degradation when APIs are unavailable

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

1. **Primary**: Kinesis KAU API (`https://api.kinesis.money/v1/market-data/KAU`)
2. **Fallback**: Standard gold spot price APIs (metals.live, goldapi.io)

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

## Technical Details

- **Manifest Version**: 3
- **Content Scripts**: Injected into all web pages
- **Background Service Worker**: Fetches gold prices
- **Storage**: Uses Chrome storage API for settings and price cache
- **Performance**: Debounced DOM processing to avoid excessive updates

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

- No personal data is collected or transmitted
- Only gold price data is fetched from public APIs
- All processing happens locally in your browser

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

## License

This project is open source and available under the MIT License.
