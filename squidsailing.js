/*
    Copyright © 2021 Thomas Krofta (github.com/tkrofta)

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.
*/

const axios = require ('axios')
const convert = require ('./skunits')
const FORECASTAPI = 'https://front-remora.greatcircle.be/forecast'
let log
let logwarning = true
let sendVal
let token = ''
let variables = []
let output = []
let meta
let horizon = {
    hours: 1,
    unit: 'd'
}
let offset = 1


const navigationPosition = 'navigation.position';
const navigationElevation = 'navigation.gnss.antennaAltitude';
const oneMinute = 60*1000;
const oneHour = 60*60*1000;
const refreshRate = oneHour;

const subscriptions = [
    { path: navigationPosition, period: refreshRate, policy: "instant", minPeriod: refreshRate },
    { path: navigationElevation, period: refreshRate, policy: "instant", minPeriod: oneMinute },
];

// basic Path definitions
const pathCurrent = "environment.outside.";
const currentTemp = pathCurrent+'temperature';
const currentHumidity = pathCurrent+'relativeHumidity';
const currentPressure = pathCurrent+'pressure';
const pathPrefix = "environment.forecast.";
const forecastTime = pathPrefix+"time";
const forecastWindSpeed = pathPrefix+'wind.speed';
const forecastWindDir = pathPrefix+'wind.direction';
const forecastWindGust = pathPrefix+'wind.gust';
const forecastTemperature = pathPrefix+'temperature';
const forecastHumidity = pathPrefix+'relativeHumidity';
const forecastPressure = pathPrefix+'pressure';
const forecastClouds = pathPrefix+'clouds';
const forecastPrecipRate = pathPrefix+'precipitation.rate';
const forecastPrecipAccumulated = pathPrefix+'precipitation.accumulated';
const forecastSnow = pathPrefix+'snow';
const forecastStormEnergy = pathPrefix+'storm.energy';
const forecastStormIndex = pathPrefix+'storm.index';
const forecastWaterTemp = pathPrefix+'water.temperature';
const forecastWaveCombined = pathPrefix+'waves.combinedHeight';
const forecastWaveDir = pathPrefix+'waves.primaryDirection';
const forecastWavePeriod = pathPrefix+'waves.meanPeriod';
const forecastCurrentSpeed = pathPrefix+'current.speed';
const forecastCurrentDir = pathPrefix+'current.direction';

const latest = {
    update: null,
    forecast: { time: null, tz: null },
    position: { lat: null, lon: null },
    current: {
        publish: false,
        temperature : { value: null, unit: 'K', key: 'temperature_2m', description: 'Current temp at an elevation of 2 meters' },
        humidity : { value: null, unit: 'ratio', key: 'relativeHumidity_2m', description: 'Current relative humidity at an elevation of 2 meters' },
        pressure : { value: null, unit: 'Pa', key: 'pressure', description: 'Current pressure at mean sea l0evel' },        
    },
    wind: {
        enabled: false,
        speed : { value: null, unit: 'm/s', key: 'windSpeed_10m', description: 'Wind speed at an elevation of 10 meters' },
        direction : { value: null, unit: 'rad', key: 'windDirection_10m', description: 'Wind direction at an elevation of 10 meters, angle counting clockwise from the North' },
        gust : { value: null, unit: 'm/s', key: 'windGust', description: 'Gust wind speed at ground level' },
    },
    pressure: {
        enabled: false,
        sealevel : { value: null, unit: 'Pa', key: 'pressure', description: 'Pressure at Mean Sea Level' },
    },
    clouds: {
        enabled: false,
        cover : { value: null, unit: 'ratio', key: 'totalCloudCover', description: 'Total cloud coverage' },
    },
    temperature: {
        enabled: false,
        outside : { value: null, unit: 'K', key: 'temperature_2m', description: 'Temperature at an elevation of 2 meters' },
        water : { value: null, unit: 'K', key: 'waterTemperature', description: 'Surface water temperature' },
    },
    precipitation: {
        enabled: false,
        rate : { value: null, unit: 'mm/s', key: 'precipitationRate', description: 'Precipitation rate' },
        accumulated : { value: null, unit: 'mm', key: 'accumulatedPrecipitation', description: 'Accumulated precipitation' },         
    },
    humidity: {
        enabled: false,
        relative : { value: null, unit: 'ratio', key: 'relativeHumidity_2m', description: 'Relative humidity at an elevation of 2 meters' },
    },
    snow: {
        enabled: false,
        cover : { value: null, unit: 'mm', key: 'snowCoverage', description: 'Snow coverage' },
    },
    storm: {
        enabled: false,
        energy : { value: null, unit: '', key: 'convectiveAvailablePotentialEnergy', description: 'Convective available potential energy' },
        index : { value: null, unit: 'K', key: 'liftedIndex', description: 'Lifted index' },
    },
    sea: {
        enabled: false,
        waveheight : { value: null, unit: 'm', key: 'combinedWaveSignificantHeight', description: 'Height of the combined wave' },
        wavedirection : { value: null, unit: 'rad', key: 'primaryWaveDirection', description: 'Direction of the primary wave, angle counting clockwise from the North' },
        waveperiod : { value: null, unit: 's', key: 'primaryWaveMeanPeriod', description: 'Mean period of the primary wave' },
        currentspeed: { value: null, unit: 'm/s', key: 'seaCurrentSpeed', description: 'Sea current speed' },
        currentdirection: { value: null, unit: 'rad', key: 'seaCurrentDirection', description: 'Sea current direction, angle counting clockwise from the North' },
    },
    altitude: {
        elevation: 0,
    }
}

const subscriptionHandler = [
    { path: navigationPosition, handle: (value) => onPositionUpdate(value) },
    { path: navigationElevation, handle: (value) => onElevationUpdate(value) },
]

function onDeltasUpdate(deltas) {
    if (token==='') 
        return 
    else if (deltas === null && !Array.isArray(deltas) && deltas.length === 0) {
        throw "Deltas cannot be null";
    }

    deltas.updates.forEach(u => {
        u.values.forEach((value) => {
            let onDeltaUpdated = subscriptionHandler.find((d) => d.path === value.path);

            if (onDeltaUpdated !== null) {
                onDeltaUpdated.handle(value.value);
            }
        });
    });
}

function onPositionUpdate(value) {
    if (value == null) log("PositionUpdate: Cannot add null value");

    latest.position.lat = value.latitude;
    latest.position.lon = value.longitude;

    if (!lastUpdateWithin(refreshRate) && isValidPosition(latest.position.lat, latest.position.lon))
    {
        latest.update = Date.now();
        log("SquidSailing Coordinates "+latest.position.lat+","+latest.position.lon);

        let measures = '' 
        if (variables.length>0) variables.forEach(v => measures = (measures==='' ? v : measures+','+v));
        let excludes = typeof meta === 'undefined' ? 'minute' : 'minute,metadata' 
        let fchours = horizon.hours+','+horizon.unit
        let config = {
            method: 'get',
            url: FORECASTAPI+`?token=${token}&longitude=${latest.position.lon}&latitude=${latest.position.lat}&variables=${measures}&horizon=${fchours}&exclude=${excludes}&extend=hour`,
            headers: { 
            'Content-Type': 'application/json',
            }
        };
            
        axios(config)
            .then( (response) => {
                let result = {}
                latest.position.lat = response.data.latitude
                latest.position.lon = response.data.longitude
                latest.forecast.time = response.data.forecast.length>0 && response.data.forecast.length>offset ? response.data.forecast[offset].timestamp.unix : null
                latest.forecast.tz = response.data.timezone
                if (typeof meta === 'undefined') {
                    meta = response.data.metadata
                    result.initial = true
                }
                if (response.data.forecast.length>0 && response.data.forecast.length>offset) {
                    latest.current.temperature.value = latest.current.publish ?  
                        (meta[latest.current.temperature.key].unit!==latest.current.temperature.unit ? 
                        convert.toSignalK(meta[latest.current.temperature.key].unit, response.data.forecast[0][latest.current.temperature.key]).value : 
                        response.data.forecast[0][latest.current.temperature.key]) : null
                    latest.current.humidity.value = latest.current.publish ?
                        (meta[latest.current.humidity.key].unit!==latest.current.humidity.unit ?
                        convert.toSignalK(meta[latest.current.humidity.key].unit, response.data.forecast[0][latest.current.humidity.key]).value :
                        response.data.forecast[0][latest.current.humidity.key]) : null
                    latest.current.pressure.value = latest.current.publish ?
                        (meta[latest.current.pressure.key].unit!==latest.current.pressure.unit ?
                        convert.toStationAltitude(convert.toSignalK(meta[latest.current.pressure.key].unit, response.data.forecast[0][latest.current.pressure.key]).value, latest.altitude.elevation, latest.current.temperature.value) :
                        convert.toStationAltitude(response.data.forecast[0][latest.current.pressure.key], latest.altitude.elevation, latest.current.temperature.value)) : null
                    latest.wind.speed.value = latest.wind.enabled ? 
                        (meta[latest.wind.speed.key].unit!==latest.wind.speed.unit ?
                        convert.toSignalK(meta[latest.wind.speed.key].unit, response.data.forecast[offset][latest.wind.speed.key]).value :
                        response.data.forecast[offset][latest.wind.speed.key]) : null
                    latest.wind.direction.value = latest.wind.enabled ?
                        (meta[latest.wind.direction.key].unit!==latest.wind.direction.unit ?
                        convert.toSignalK(meta[latest.wind.direction.key].unit, response.data.forecast[offset][latest.wind.direction.key]).value :
                        response.data.forecast[offset][latest.wind.direction.key]) : null
                    latest.wind.gust.value = latest.wind.enabled ?
                        (meta[latest.wind.gust.key].unit!==latest.wind.gust.unit ? 
                        convert.toSignalK(meta[latest.wind.gust.key].unit, response.data.forecast[offset][latest.wind.gust.key]).value :
                        response.data.forecast[offset][latest.wind.gust.key]) : null
                    latest.pressure.sealevel.value = latest.pressure.enabled ?
                        (meta[latest.pressure.sealevel.key].unit!==latest.pressure.sealevel.unit ? 
                        convert.toSignalK(meta[latest.pressure.sealevel.key].unit, response.data.forecast[offset][latest.pressure.sealevel.key]).value : 
                        response.data.forecast[offset][latest.pressure.sealevel.key]) : null
                    latest.temperature.outside.value = latest.temperature.enabled ?
                        (meta[latest.temperature.outside.key].unit!==latest.temperature.outside.unit ?
                        convert.toSignalK(meta[latest.temperature.outside.key].unit, response.data.forecast[offset][latest.temperature.outside.key]).value :
                        response.data.forecast[offset][latest.temperature.outside.key]) : null
                    latest.temperature.water.value = latest.sea.enabled || latest.current.publish ?
                        (meta[latest.temperature.water.key].unit!==latest.temperature.water.unit ? 
                        convert.toSignalK(meta[latest.temperature.water.key].unit, response.data.forecast[offset][latest.temperature.water.key]).value :
                        response.data.forecast[offset][latest.temperature.water.key]) : null
                    latest.humidity.relative.value = latest.humidity.enabled ?
                        (meta[latest.humidity.relative.key].unit!==latest.humidity.relative.unit ?
                        convert.toSignalK(meta[latest.humidity.relative.key].unit, response.data.forecast[offset][latest.humidity.relative.key]).value : 
                        response.data.forecast[offset][latest.humidity.relative.key]) : null
                    latest.clouds.cover.value = latest.clouds.enabled ? 
                        (meta[latest.clouds.cover.key].unit!==latest.clouds.cover.unit ?
                        convert.toSignalK(meta[latest.clouds.cover.key].unit, response.data.forecast[offset][latest.clouds.cover.key]).value :
                        response.data.forecast[offset][latest.clouds.cover.key]) : null
                    latest.precipitation.rate.value = latest.precipitation.enabled && meta[latest.precipitation.rate.key] ?
                        (meta[latest.precipitation.rate.key].unit!==latest.precipitation.rate.unit ?
                        convert.toSignalK(meta[latest.precipitation.rate.key].unit, response.data.forecast[offset][latest.precipitation.rate.key]).value : 
                        response.data.forecast[offset][latest.precipitation.rate.key]) : null
                    latest.precipitation.accumulated.value = latest.precipitation.enabled && meta[latest.precipitation.accumulated.key] ? 
                        (meta[latest.precipitation.accumulated.key].unit!==latest.precipitation.accumulated.unit ?
                        convert.toSignalK(meta[latest.precipitation.accumulated.key].unit, response.data.forecast[offset][latest.precipitation.accumulated.key]).value : 
                        response.data.forecast[offset][latest.precipitation.accumulated.key]) : null
                    latest.snow.cover.value = latest.snow.enabled && meta[latest.snow.cover.key]? 
                        (meta[latest.snow.cover.key].unit!==latest.snow.cover.unit ? 
                        convert.toSignalK(meta[latest.snow.cover.key].unit, response.data.forecast[offset][latest.snow.cover.key]).value : 
                        response.data.forecast[offset][latest.snow.cover.key]) : null 
                    latest.storm.energy.value = latest.storm.enabled ? 
                        (meta[latest.storm.energy.key].unit!==latest.storm.energy.unit ? 
                        convert.toSignalK(meta[latest.storm.energy.key].unit, response.data.forecast[offset][latest.storm.energy.key]).value : 
                        response.data.forecast[offset][latest.storm.energy.key]) : null
                    latest.storm.index.value = latest.storm.enabled ? 
                        (meta[latest.storm.index.key].unit!==latest.storm.index.unit ?
                        convert.toSignalK(meta[latest.storm.index.key].unit, response.data.forecast[offset][latest.storm.index.key]).value :
                        response.data.forecast[offset][latest.storm.index.key]) : null
                    latest.sea.waveheight.value = latest.sea.enabled ? 
                        (meta[latest.sea.waveheight.key].unit!==latest.sea.waveheight.unit ?
                        convert.toSignalK(meta[latest.sea.waveheight.key].unit, response.data.forecast[offset][latest.sea.waveheight.key]).value :
                        response.data.forecast[offset][latest.sea.waveheight.key]) : null
                    latest.sea.wavedirection.value = latest.sea.enabled ? 
                        (meta[latest.sea.wavedirection.key].unit!==latest.sea.wavedirection.unit ? 
                        convert.toSignalK(meta[latest.sea.wavedirection.key].unit, response.data.forecast[offset][latest.sea.wavedirection.key]).value : 
                        response.data.forecast[offset][latest.sea.wavedirection.key]) : null
                    latest.sea.waveperiod.value = latest.sea.enabled ? 
                        (meta[latest.sea.waveperiod.key].unit!==latest.sea.waveperiod.unit ?
                        convert.toSignalK(meta[latest.sea.waveperiod.key].unit, response.data.forecast[offset][latest.sea.waveperiod.key]).value :
                        response.data.forecast[offset][latest.sea.waveperiod.key]) : null
                    latest.sea.currentspeed.value = latest.sea.enabled || latest.current.publish ? 
                        (meta[latest.sea.currentspeed.key].unit!==latest.sea.currentspeed.unit ? 
                        convert.toSignalK(meta[latest.sea.currentspeed.key].unit, response.data.forecast[offset][latest.sea.currentspeed.key]).value :
                        response.data.forecast[offset][latest.sea.currentspeed.key]) : null
                    latest.sea.currentdirection.value = latest.sea.enabled || latest.current.publish ? 
                        (meta[latest.sea.currentdirection.key].unit!==latest.sea.currentdirection.unit ? 
                        convert.toSignalK(meta[latest.sea.currentdirection.key].unit, response.data.forecast[offset][latest.sea.currentdirection.key]).value : 
                        response.data.forecast[offset][latest.sea.currentdirection.key]) : null
                }
                if (logwarning && response.data.errors && response.data.errors.length>0)
                    response.data.errors.forEach(w => log(w.message))

                output.forEach(o => {
                    if (o.path.includes('outside')) {
                        let res=o.path.replace('environment.', '').split('.')
                        if (res.length===1)
                            result[res[0]]=o.val.value
                        else if (res.length===2 && !result[res[0]])
                            result[res[0]]={[res[1]]: o.val.value}
                        else if (res.length===2 && result[res[0]])
                            result[res[0]][res[1]] = o.val.value
                    } else {
                        let res=o.path.replace('environment.forecast.', '').split('.')
                        if (res.length===1)
                            result[res[0]]=o.val.value
                        else if (res.length===2 && !result[res[0]])
                            result[res[0]]={[res[1]]: o.val.value}
                        else if (res.length===2 && result[res[0]])
                            result[res[0]][res[1]] = o.val.value
                        else
                            result[o.path.replace('environment.forecast.', '')] = o.val.value
                    }
                });
                log(result);
                sendVal(prepareUpdate('values'))
            })
            .catch( (error) => {
              log(error);
            });
    }
}

function onElevationUpdate(value) {
    if (value == null) 
    {
        log("Cannot add null value as elevation - using 0 instead");
        latest.altitude.elevation = 0
    }
    else if (value!=="waiting ...")
    {
        latest.altitude.elevation = value
        log("Elevation set to "+value+"m above sea level");
    }
}

function prepareUpdate(type) {
    let update = []
    switch (type) {
        case 'values': {
            update.push(buildDeltaUpdate(forecastTime, convert.toSignalK('unixdate', latest.forecast.time).value))
            output.forEach(o => { if (typeof o.val.value!=='undefined') update.push(buildDeltaUpdate(o.path, o.val.value)) } );
            break;
        }
        case 'meta': {
            output.forEach(o => update.push(buildDeltaUpdate(o.path, o.val.hasOwnProperty('unit') ? 
                { units: o.val.unit, timeout: refreshRate / 1000, description: o.val.description } :
                { timeout: refreshRate / 1000, description: o.val.description }
             )));    
            break;
            }
        default:
            break;
    }
    return update;
}

function buildDeltaUpdate(path, value) {
    return {
        path: path,
        value: value
    }
}

function preLoad(apikey, config, param) {
    if (!apikey || apikey==='') {
        log("API-Key not provided - forecasts deactivated!")
        return [];
    } 
    else
        token = apikey
    if (param && param.offset!==undefined && param.offset!==null)
    {
        if (param.offset>47) { log("Offset shall not exceed max. 48 hours!") }
        offset = param.offset<=0 ? 1 : Math.min(param.offset, 96);
    }
    if (param && param.horizon!==undefined && param.horizon!==null)
    {
        if (param.horizon>24*7) { log("Forecast only supports max. 7 days!") }
        horizon = { 
            hours: param.horizon<=0 ? 8 : Math.min(Math.max(param.offset+1, param.horizon), 24*7),
            unit: 'h'
        }
    }
    if (config.wind) {
        variables.push('wind');
        latest.wind.enabled = true
        output.push({ path: forecastWindSpeed, val: latest.wind.speed });
        output.push({ path: forecastWindDir, val: latest.wind.direction });
        output.push({ path: forecastWindGust, val: latest.wind.gust });
    }
    if (config.temperature || param.current) {
        variables.push('temperature');
        latest.temperature.enabled = true
        output.push({ path: forecastTemperature, val: latest.temperature.outside });
        if (param.current)
            output.push({ path: currentTemp, val: latest.current.temperature });
    } 
    if (config.humidity || param.current) {
        variables.push('humidity');
        latest.humidity.enabled = true
        output.push({ path: forecastHumidity, val: latest.humidity.relative });
        if (param.current)
            output.push({ path: currentHumidity, val: latest.current.humidity });
    } 
    if (config.pressure || param.current) {
        variables.push('pressure');
        latest.pressure.enabled = true
        output.push({ path: forecastPressure, val: latest.pressure.sealevel });
        if (param.current)
            output.push({ path: currentPressure, val: latest.current.pressure });
    }
    if (config.clouds) {
        variables.push('clouds');
        latest.clouds.enabled = true
        output.push({ path: forecastClouds, val: latest.clouds.cover });
    } 
    if (config.storm) {
        variables.push('storm');
        latest.storm.enabled = true
        output.push({ path: forecastStormEnergy, val: latest.storm.energy });
        output.push({ path: forecastStormIndex, val: latest.storm.index });
    } 
    if (config.precipitation) {
        variables.push('precipitation');
        latest.precipitation.enabled = true
        output.push({ path: forecastPrecipRate, val: latest.precipitation.rate });
        output.push({ path: forecastPrecipAccumulated, val: latest.precipitation.accumulated });
    }
    if (config.snow) {
        variables.push('snow');
        latest.snow.enabled = true
        output.push({ path: forecastSnow, val: latest.snow.cover });
    } 
    if (config.sea) {
        variables.push('sea');
        latest.sea.enabled = true
        output.push({ path: forecastWaterTemp, val: latest.temperature.water });
        output.push({ path: forecastWaveCombined, val: latest.sea.waveheight });
        output.push({ path: forecastWaveDir, val: latest.sea.wavedirection });
        output.push({ path: forecastWavePeriod, val: latest.sea.waveperiod });
        output.push({ path: forecastCurrentSpeed, val: latest.sea.currentspeed });
        output.push({ path: forecastCurrentDir, val: latest.sea.currentdirection });
    }
    if (param.current && !config.sea) {
        variables.push('sea');
        output.push({ path: forecastWaterTemp, val: latest.temperature.water });
        output.push({ path: forecastCurrentSpeed, val: latest.sea.currentspeed });
        output.push({ path: forecastCurrentDir, val: latest.sea.currentdirection });
    } 
    latest.current.publish = param.current;
    return prepareUpdate('meta');
}

function lastUpdateWithin(interval) {
    return latest.update !== null ? (Date.now() - latest.update) <= interval : false;
}

function isValidPosition(lat, lon) {
    return (lat!==null&&lon!==null && lat!==undefined&&lon!==undefined);
}

module.exports = {
    subscriptions,
    preLoad,
    onDeltasUpdate,

    init: function(msgHandler, getVal, logHandler) {
        sendVal = msgHandler;
        log = logHandler;
        latest.update = null;
        let timerId = null;
        if (refreshRate) {
            timerId = setInterval(() => {
                if (!lastUpdateWithin(refreshRate)) {
                    onPositionUpdate(getVal(navigationPosition).value);
                }
            }, refreshRate)
            log(`Interval started, refresh rate ${refreshRate/60/1000}min`);
        }
        return timerId;
    }
}