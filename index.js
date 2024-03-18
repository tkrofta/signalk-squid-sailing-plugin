/*
    Copyright © 2024 Inspired Technologies GmbH (www.inspiredtechnologies.eu)

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.
*/

'use strict'
const debug = require("debug")("signalk:squid-sailing-signalk")
const squid = require('./squidsailing')

module.exports = function (app) {
    var plugin = {};

    plugin.id = 'squid-sailing-signalk';
    plugin.name = 'SquidSailing Forecast';
    plugin.description = 'Provide selected data from the SquidSailing Forecast Service';

    var unsubscribes = [];
    let timerId = null;
    plugin.start = function (options, restartPlugin) {

        app.debug('Plugin started');
        timerId = squid.init(sendDelta, app.getSelfPath, log);

        let localSubscription = {
            context: 'vessels.self',
            subscribe: squid.subscriptions
        };

        app.subscriptionmanager.subscribe(
            localSubscription,
            unsubscribes,
            subscriptionError => {
                app.error('Error:' + subscriptionError);
            },
            delta => squid.onDeltasUpdate(delta)
        );

        let meta = squid.preLoad(options["apikey"], options["variables"], 
            { horizon: options["horizon"] || 48, offset: options["offset"] || 1, current: options["current"] || false } )
        if (meta.length>0)
            sendMeta(meta)
    };

    plugin.stop = function () {
        unsubscribes.forEach(f => f());
        if (timerId) clearInterval(timerId);
        unsubscribes = [];
        app.debug('Plugin stopped');
    };

    plugin.schema = {
        // The plugin schema
        type: "object",
        title: "SquidSailing Service Configuration",
        description: "Configure squid sailing weather data (powered by GREAT CIRCLE, BE)",
        required: ['apikey','horizon','offset'],
        properties: {
          apikey: {
            type: 'string',
            title: 'ApiKey',
            description: "Required to extract data from Squid Sailing's Forecast API - https://www.squid-sailing.com/doc-api/forecast"
          },
          variables: {
            type: "object",
            title: "Measurements",
            description: "Forecast API Variables - https://www.squid-sailing.com/doc-api/forecast/variables.html",
            properties: {
              wind: {
                type: 'boolean',
                title: 'Wind at an elevation of 10m',
                description: 'includes wind gusts at groundlevel',
                default: true
              },
              temperature: {
                type: 'boolean',
                title: 'Temperature at an elevation of 2m',
                default: true
              },
              pressure: {
                type: 'boolean',
                title: 'Pressure at mean sea level',
                default: true
              },
              humidity: {
                type: 'boolean',
                title: 'Relative humidity at an elevation of 2m',
                default: true
              },
              clouds: {
                type: 'boolean',
                title: 'Total cloud coverage',
                default: false
              },
              storm: {
                type: 'boolean',
                title: 'Convective potential energy and lifted index',
                default: false
              },              
              sea: {
                type: 'boolean',
                title: 'Combined wave height, current and water temperature',
                description: 'BETA only',
                default: false
              },
              snow: {
                type: 'boolean',
                title: 'Snow coverage',
                description: 'BETA only',
                default: false
              },
              precipitation: {
                type: 'boolean',
                title: 'Precipitation rate / accumulated',
                description: 'BETA only',
                default: false
              },
            },
          },
          horizon: {
            type: 'number',
            title: 'Forecast Horizon',
            description: 'Time horizon for which the forecast must be computed (in hours, max. 96)',
            default: 48
          },
          offset: {
            type: 'number',
            title: 'Forecast Offset',
            description: 'Publish offset from localtime (full next hour within <offset> hours, max. see above)',
            default: 1
          },
          current: {
            type: 'boolean',
            title: 'Publish 0h offset forecast as current',
            description: 'turn this on, only if no other signals on the network (eg. BME280, RUUVI)',
            default: false
          },
        }
    };

    /**
     * 
     * @param {Array<[{path:path, value:value}]>} messages 
     */
    function sendDelta(messages) {
        app.handleMessage('squid-sailing-signalk', {
            updates: [
                {
                    values: messages
                }
            ]
        });
    }

    function sendMeta(units) {
        app.handleMessage('squid-sailing-signalk', {
            updates: [
                {
                    meta: units
                }
            ]   
        })
    }

    function log(msg) { app.debug(msg); }

    return plugin;
};