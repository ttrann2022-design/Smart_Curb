
# Smart Curb - Digital Parking Sign

## Project Overview

The Smart Curb Digital Parking Sign is part of the Florida Atlantic University Senior Design project. The system provides drivers with parking availability, visual occupancy indicators, and intelligent parking recommendations to help reduce the time spent searching for available parking.

The project currently includes two versions of the digital parking display.

## Live Deployments

| Version | Description | Website |
|---|---|---|
| Version 1.0 | Original Digital Parking Sign | [Launch V1.0](https://eloquent-biscuit-9e0096.netlify.app/) |
| Version 2.0 | Multi-Location Digital Parking Sign | [Launch V2.0](https://stellular-chimera-494fda.netlify.app/) |

## Version 1.0 - Original Parking Display

The original version provides a four-zone parking lot visualization with real-time occupancy monitoring and parking recommendations.

### Features

- Four parking zones: A, B, C, and D
- Firebase Realtime Database integration
- Live parking occupancy monitoring
- Intelligent parking zone recommendations
- Simulated parking data through Demo Mode
- Dynamic parking availability updates
- Color-coded parking spaces

## Version 2.0 - Multi-Location Parking Display

Version 2.0 expands the original system to support multiple parking locations and custom parking lot layouts.

### Features

- Selectable parking locations
- FAU-style parking layout
- Broward Mall parking layout
- Custom asphalt-style parking visualization
- Dynamic parking recommendations
- Individual parking space indicators
- Parking availability totals
- Simulated occupancy changes
- Firebase integration for the FAU display

The Broward Mall layout is based on the general arrangement of the actual property. Parking space locations and occupancy readings are simulated for demonstration purposes.

## Parking Space Indicators

| Color | Status |
|---|---|
| Green | Available |
| Red | Occupied |
| Gray | Sensor offline |
| Yellow | Unknown status |

## Recommendation Algorithm

The parking recommendation algorithm evaluates parking availability across the displayed zones and recommends an area with available parking spaces.

Recommendations are updated as occupancy information changes.

## Technologies Used

- HTML5
- CSS3
- JavaScript
- Firebase Realtime Database
- Node.js
- GitHub
- Netlify

## File Structure

Digital Parking Sign/
- index.html
- app.js
- config.js
- scoring.js
- package.json
- test-scoring.mjs
- README.md
- Version 2.0/
  - index.html
  - app.js
  - config.js
  - scoring.js
  - package.json
  - test-scoring.mjs

## Testing

The system includes automated tests for the parking recommendation logic.

To run the tests, open a terminal in the desired version's directory and execute:

    node test-scoring.mjs

## Demo Mode

Demo Mode allows the parking display to operate without requiring physical Smart Curb hardware.

Users can simulate occupancy changes and observe how parking availability and recommendations respond.

## Future Development

- Additional real-world parking locations
- Physical sensor mapping for Broward Mall
- More detailed parking lot layouts
- Distance-based parking recommendations
- Integration with the Smart Curb navigation system
- Expanded digital signage deployment



