# squid-sailing-signalk
SignalK Plugin to inject forecast data from __[Squid Sailing](https://www.squid-sailing.com/en/)__ service
## Install & Use
*Note: To use this plugin you need to request an apikey, see also https://www.squid-sailing.com/doc-api/ to get started.*

Install the plugin through the SignalK plugin interface. After installation you may want to 'Activate' it through the SignalK Plugin Config interface, enter your pre-requested apikey and configure the output data you want to receive as new SignalK-values (`environment.forecast.*`), such as:
- Wind at an elevation of 10m, includes wind gusts at groundlevel 
- Temperature at an elevation of 2m
- Pressure at mean sea level
- Relative humidity at an elevation of 2m
- Total cloud coverage
- Convective potential energy and lifted index
- Combined wave height, current and water temperature (*BETA only*)
- Snow coverage (*BETA only*)
- Precipitation rate / accumulated (*BETA only*)

## Forecast Data
Forecast data is purely based on position - hence `navigation.position` needs to be present. Data will be queried on position change and/or regularily on an hourly-basis. For consistency `navigation.gnss.antennaAltitude` (GPS altitude) wil be captured and used to more accurately compensate atmospheric pressure data to the appropriate elevation; default is altitude = 0 (sea level). It may take the plugin a couple of minutes before showing output data, as it will need to get a position before requesting data from the squid-sailing API.
By default the plugin will update forecast information every hour based on the latest position with a potential given hourly offset. No information will be stored or tracked. The plugin shall adhere to meta-data units according to the SignalK definition.

### Release Notes
- v0.1 - initial version