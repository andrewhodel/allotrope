// 24 hours with 5 minute interval
//  update(5*60, 24*60/5, 'GAUGE', 34, jsonObject);

// 30 days with 1 hour interval
//  update(60*60, 30*24/1, 'GAUGE', 34, jsonObject);

// 365 days with 1 day interval
//  update(24*60*60, 365*24/1, 'GAUGE', 34, jsonObject);

function dBug(s) {
    // uncomment out for debug
    //console.log(s);
}

exports.update = function (intervalSeconds, totalSteps, dataType, updateDataPoint, jsonDb) {

    if(typeof(jsonDb)==='undefined') jsonDb = {};
    for (var e=0; e<updateDataPoint.length; e++) {
        updateDataPoint[e] = parseFloat(updateDataPoint[e]);
    }

    updateTimeStamp = Math.round((new Date()).getTime() / 1000);

    // intervalSeconds - time between updates
    // totalSteps - total steps of data
    // dataType - GAUGE or COUNTER
    //  GAUGE - things that have no limits, like the value of raw materials
    //  COUNTER - things that count up, if we get a value that's less than last time it means it reset... stored as a per second rate
    // updateTimeStamp - unix epoch timestamp of this update
    // updateDataPoint - data object for this update
    // jsonDb - data from previous updates
    //
    // returns json object with update added

    // color codes
    var ccRed = '\033[31m';
    var ccBlue = '\033[34m';
    var ccReset = '\033[0m';

    dBug(ccRed+'### GOT NEW UPDATE ###'+ccReset);
    dBug('intervalSeconds: '+intervalSeconds);
    dBug('totalSteps: '+totalSteps);
    dBug('dataType: '+dataType);
    dBug('updateTimeStamp: '+updateTimeStamp);
    dBug('updateDataPoint: ');
    dBug(updateDataPoint);
    dBug('jsonDb: ');
    dBug(jsonDb);

    // first we need to see if this is the first update or not
    if (Object.keys(jsonDb).length==0) {
        // this is the first update
        dBug(ccBlue+'### INSERTING FIRST UPDATE ###'+ccReset);

        // create the array of data points
        jsonDb[updateTimeStamp] = [];
        // insert the data for each data point
        for (var e=0; e<updateDataPoint.length; e++) {
            jsonDb[updateTimeStamp].push({d:updateDataPoint[e]});
        }

    } else {
        // this is not the first update
        dBug(ccBlue+'### PROCESSING '+dataType+' UPDATE ###'+ccReset);

        // check if the previous update was in this interval, considering the first update
        var previousUpdateTimeStamp = Object.keys(jsonDb)[Object.keys(jsonDb).length-1];
        dBug('previousUpdateTimeStamp: '+previousUpdateTimeStamp);
        // this timestamp
        dBug('updateTimeStamp: '+updateTimeStamp);
        // get the difference
        var tsDifference = (updateTimeStamp-previousUpdateTimeStamp);
        dBug('tsDifference: '+tsDifference);

        // check if the difference between the first and this updateTimeStamp is greater than the interval
        if (updateTimeStamp-previousUpdateTimeStamp>intervalSeconds) {

            // being here means that this update is not in the same step group as the previous
            dBug('this update is not in the same step group as the previous');

            // either way we have to create an array of data points here
            jsonDb[updateTimeStamp] = [];

            // handle different dataType
            switch (dataType) {
                case 'GAUGE':

                    dBug('inserting data');
                    // insert the data for each data point
                    for (var e=0; e<updateDataPoint.length; e++) {
                        jsonDb[updateTimeStamp].push({d:updateDataPoint[e]});
                    }

                    break;
                case 'COUNTER':

                    // for each data point
                    for (var e=0; e<updateDataPoint.length; e++) {

                    // we need to check for overflow, overflow happens when a counter resets so we check the last values to see if they were close to the limit if the previous update
                    // is 3 times the size or larger, meaning if the current update is 33% or smaller it's probably an overflow
                    if (jsonDb[Object.keys(jsonDb)[Object.keys(jsonDb).length-2]][e].d > updateDataPoint[e]*3) {

                        // oh no, the counter has overflown so we need to check if this happened near 32 or 64 bit limit
                        dBug('overflow');

                        // the 32 bit limit is 2,147,483,647 so we should check if we were within 10% of that either way on the last update
                        if (jsonDb[Object.keys(jsonDb)[Object.keys(jsonDb).length-2]][e].d<(2147483647*.1)-2147483647) {
                            // this was so close to the limit that we are going to make 32bit adjustments

                            // for this calculation we just need to add the remainder of subtracting the last data point from the 32 bit limit to the updateDataPoint
                            updateDataPoint[e] += 2147483647-jsonDb[Object.keys(jsonDb)[Object.keys(jsonDb).length-2]][e].d;

                        // the 64 bit limit is 9,223,372,036,854,775,807 so we should check if we were within 1% of that
                        } else if (jsonDb[Object.keys(jsonDb)[Object.keys(jsonDb).length-2]][e].d<(9223372036854775807*.01)-9223372036854775807) {
                            // this was so close to the limit that we are going to make 64bit adjustments

                            // for this calculation we just need to add the remainder of subtracting the last data point from the 64 bit limit to the updateDataPoint
                            updateDataPoint[e] += 9223372036854775807-jsonDb[Object.keys(jsonDb)[Object.keys(jsonDb).length-2]][e].d;

                        }

                    }

                    // for a counter, we need to divide the difference by the tsDifference to gather the value for the last data point
                    dBug('calculating the rate');
                    var r = (updateDataPoint[e]-jsonDb[Object.keys(jsonDb)[Object.keys(jsonDb).length-2]][e].d)/tsDifference;
                    // insert the data with the new r
                    dBug('inserting data with rate '+r);
                    jsonDb[updateTimeStamp].push({d:updateDataPoint[e],r:r});

                    }

                    break;
                default:
                    dBug('unsupported dataType '+dataType);
            }

        } else {

            // being here means that this update is in the same step group as the previous
            dBug('this update is in the same step as the previous');

            // handle different dataType
            switch (dataType) {

                case 'GAUGE':
                    // this update needs to be averaged with the last

                    // we need to do this for each data point
                    for (var e=0; e<updateDataPoint.length; e++) {

                    // first we need to check if the last update was itself an average
                    if (jsonDb[Object.keys(jsonDb)[Object.keys(jsonDb).length-1]][e].avgCount>0) {
                        // we are averaging with a previous update that was itself an average
                        dBug('we are averaging with a previous update that was itself an average');

                        // that means we have to multiply the avgCount of the previous update by the data point of the previous update, add this updateDataPoint, then divide by the avgCount+1
                        var avg = ((jsonDb[Object.keys(jsonDb)[Object.keys(jsonDb).length-1]][e].avgCount*jsonDb[Object.keys(jsonDb)[Object.keys(jsonDb).length-1]][e].d)+updateDataPoint[e])/(jsonDb[Object.keys(jsonDb)[Object.keys(jsonDb).length-1]][e].avgCount+1);

                        // set the avgCount to that of the previous data point+1
                        // ts must be set to that of the first otherwise it will loop forever
                        // and insert it
                        dBug('updating data point with avg '+avg);
                        jsonDb[Object.keys(jsonDb)[Object.keys(jsonDb).length-1]][e] = {avgCount:jsonDb[Object.keys(jsonDb)[Object.keys(jsonDb).length-1]][e].avgCount+1,d:avg};

                    } else {
                        // we need to average the previous update with this one
                        dBug('averaging with previous update');

                        // we need to add the previous update data point to this one then divide by 2 for the average
                        var avg = (updateDataPoint[e]+jsonDb[Object.keys(jsonDb)[Object.keys(jsonDb).length-1]][e].d)/2;
                        // set the avgCount:2
                        // ts must be set to that of the first otherwise it will loop forever
                        // and insert it
                        dBug('updating data point with avg '+avg);
                        jsonDb[Object.keys(jsonDb)[Object.keys(jsonDb).length-1]][e] = {avgCount:2,d:avg};

                        // since we have inserted another data point, and this is a GAUGE we can remove the previous avgCount to save space
                        if (Object.keys(jsonDb).length>1) {
                            if (jsonDb[Object.keys(jsonDb)[Object.keys(jsonDb).length-2]][e].avgCount>0) {
                                dBug('deleting previous avgCount to save space');
                                delete jsonDb[Object.keys(jsonDb)[Object.keys(jsonDb).length-2]][e].avgCount;
                            }
                        }

                    }

                    }

                    break;
                case 'COUNTER':
                    // increase the counter on the last update to this one for each data point
                    for (var e=0; e<updateDataPoint.length; e++) {
                        jsonDb[Object.keys(jsonDb)[Object.keys(jsonDb).length-1]][e].d = updateDataPoint[e];
                    }

                    break;
                default:
                    dBug('unsupported dataType '+dataType);
            }
        }

        // check if she's over the limit
        if (Object.keys(jsonDb).length>totalSteps) {
            // remove the oldest data point
            // this is the actuality of [r]ound [r]obin [d]atabase
            dBug('over the totalSteps, removing the oldest data point');
            delete jsonDb[Object.keys(jsonDb)[0]];
        }

    }

    // finally return the object
    return jsonDb;

};

exports.fetch = function (intervalSeconds, maxSteps, jsonDb) {

    // intervalSeconds - time between updates
    // maxSteps - max steps of intervalSeconds to return
    // jsonDb - data

    var dd = [];
    var totalSeconds = 0;

for (var i = 0; i < Object.keys(jsonDb).length; i++) {

    var d = jsonDb[Object.keys(jsonDb)[i]][0].d;
    var ts = Object.keys(jsonDb)[i];
    var now = Math.round((new Date()).getTime() / 1000);
    var diff = now-ts;

    if (diff-totalSeconds < intervalSeconds) {

    dd.push({
        'd': d,
        'ts': ts
    });

    }

    totalSeconds += intervalSeconds;

}

    return dd;

};
