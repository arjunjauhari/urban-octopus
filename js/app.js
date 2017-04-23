/*global tau*/
/*exported init*/

var INFO_SETTIMEOUT_DELAY = 10000;
var INFO_SHOW_DELAY = 10000;
var TEXT_STOP = 'Stop';
var TEXT_START = 'Start';

var heartRateEl;
var heartImg;
var infoBackBtn;
var hrmControlBtn;
var measuringText;

var infoTimeoutEnd = 0;
var infoTimeout = 0;

var sensorStarted = false;

var accelStart = true;

var initial = new Date().getTime();
var dataLength = 5;
var dpsX = [];
var dpsY = [];
var dpsZ = [];

var dummy = true;
var hr_idx = 0;

var DB_VERSION = 5,
    DB_NAME = "SensorData",
    DB_DISPLAY_NAME = "sensordata_db",
    DB_SIZE = 5 * 1024 * 1024,
    DB_TABLE_NAME = "HRMonitor",
    dataTypeList = ["id", "heartrate", "timestamp"],
    pageList = ["page-result", "page-input"],
    db,
    dbType = "none",
    idbObjectStore,
    popupStatus = "Deactive";

function startSensors() {
    console.log("start sensor() called...");
    sensorStarted = true;
    clearTimers();
    measuringText.classList.remove('hide');
    measuringText.classList.add('show');
    // hrmControlBtn.innerHTML = TEXT_STOP;

    tizen.humanactivitymonitor.start('HRM', onHeartRateDataChange, onerrorCB);
    //tizen.humanactivitymonitor.start('WRIST_UP', onWUDataChange, onerrorCB);
    //AccelToggle();
}

/*
 * Function invoked on onload event
 */
function init()
{
    console.log("init() called...");
    openDB();
    heartRateEl = document.getElementById('heart-rate-value');
    heartImg = document.getElementById('heart-img');
    infoBackBtn = document.getElementById('info-back-btn');
    hrmControlBtn= document.getElementById('hrm-control-btn');
    measuringText = document.getElementById('measuring-info');

    startSensors();

    //Registering click event handler for buttons.
	document.addEventListener('tizenhwkey', function(e) {
        if(e.keyName == "back") {
            stopSensor();
            tizen.application.getCurrentApplication().exit();
        }
    });
}

/*
 * Clear the timers if running for handling the information popup.
 */
function clearTimers() {
    console.log("Clear timers() called");
    window.clearTimeout(infoTimeout);
    window.clearTimeout(infoTimeoutEnd);
    infoTimeout = 0;
    infoTimeoutEnd = 0;
}

/*
 * Callback function Handles change event on current heart rate.
 *
 */
function onHeartRateDataChange(heartRateInfo) {
    console.log("onHeartRateDataChange() called...");
    if (!sensorStarted){
        return;
    }

    if (dummy === true) {
        var rate = get_hr_data();
        hr_idx++;
    } else {
        var rate = heartRateInfo.heartRate;
    }
    var activePage = document.getElementsByClassName('ui-page-active')[0];
    var activePageId = activePage ? activePage.id : '';

    /*
     * If heart rate value is invalid-
     * Remove heart image animation,
     * Displays measuring text and start a timer to show the information popup after 10 seconds.
     */

    if (rate < 1) {
        console.log("Heart rate value < 1");
        rate = 0;
        heartRateEl.innerHTML = '';
        heartImg.classList.remove('animate');
        measuringText.classList.remove('hide');
        measuringText.classList.add('show');

        /* Start a timer when sensor is started but not able to measure the heart rate
         * showMeasuringInfo() function will be execute after 10 sec and will show a info popup.
         */

        if (activePageId === 'main' && infoTimeout === 0) {
            infoTimeout = window.setTimeout(showMeasuringInfo, INFO_SETTIMEOUT_DELAY);
        }
    } else {
        /*
         * If heart rate value is valid
         * Clear all the timers to  handle info popup
         * Hides measuring text
         * Start the animation on heart image
         * and displays the heart rate value.
         */
        clearTimers();
        hideMeasuringInfo();
        console.log("heartRateEl is valid information...");
        if (!heartImg.classList.contains('animate')) {
            heartImg.classList.add('animate');
            measuringText.classList.remove('show');
            measuringText.classList.add('hide');
        }
        heartRateEl.innerHTML = rate;
        // Save to db
        submitNewRecord(rate)
    }
}

/**
 * Opens the database.
 * @private
 * @param {function} successCb - The callback function should be called after open database.
 */
function openDB(successCb) {
    var request;
    console.log("openDB called");

    if (window.indexedDB) {
        dbType = "IDB";

        request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = function(e) {
            alert("Please allow this application to use Indexed DB");
        };
        request.onsuccess = function(e) {
            console.log("DB onsuccess called");
            db = request.result;
            if (successCb) {
                successCb(db);
            }
        };
        // Set a callback function When the Indexed DB is created first,
        // or upgrade is needed
        request.onupgradeneeded = function(e) {
            console.log("DB onupgradeneeded called");
            db = e.target.result;
            createTable(db);
        };
    } else {
        console.log("Needs a Indexed DB");
    }
}

/**
 * Creates the table if not exists.
 * @private
 * @param {Object} db - The database object(WebSQL or IndexedDB)
 */
function createTable(db) {
    if (dbType === "IDB") {
        console.log("creating table");
        if (db.objectStoreNames.contains(DB_TABLE_NAME)) {
            db.deleteObjectStore(DB_TABLE_NAME);
        }

        idbObjectStore = db.createObjectStore(DB_TABLE_NAME, {
            keyPath: "id",
            autoIncrement: true
        });
    } else {
        alert("Error from createTable: no DBtype");
    }
}

/**
 * Loads the data from database and show the data with showDataView.
 * @private
 * @param {Object} db - The database object
 * @return {array} The array contains the result data
 */
function loadDataView(db) {
    console.log("Loading from table", DB_TABLE_NAME);
    var resultBuffer = [];

    if (dbType === "IDB") {
        console.log("loaddataview table");
        idbObjectStore = db.transaction(DB_TABLE_NAME, "readonly").objectStore(DB_TABLE_NAME);
        idbObjectStore.openCursor().onsuccess = function(e) {
            var cursor = e.target.result;

            if (cursor) {
                console.log("cursor true")
                resultBuffer.push(cursor.value);
                cursor.continue();
            } else {
                console.log("cursor false")
                console.log(resultBuffer);

                return resultBuffer;
            }
        };
    } else {
        console.log("Not an IDB");
    }
}

/**
 * Submit a new record to the database.
 * @private
 * @return {boolean} True if the record is added into the database.
 */
function submitNewRecord(rate) {
    console.log("Submitting HR into DB", rate)
    var data = {
            heartrate: rate
        }

    data.timestamp = getDateTimeString();
    console.log(data.timestamp)

    insertData(db, data);

    return true;
}

/**
 * Inserts a data to the table.
 * @private
 * @param {Object} db - The database object(WebSQL or IndexedDB)
 * @param {Object} data - The data to be put
 */
function insertData(db, data) {
    if (dbType === "IDB") {
        idbObjectStore = db.transaction(DB_TABLE_NAME, "readwrite").objectStore(DB_TABLE_NAME);
        idbObjectStore.put(data);
    } else {
        console.log("Need IDB")
    }
}

/**
 * Gets the string of current datetime by "MM/dd HH:mm" format.
 * @private
 * @return {string} The result string
 */
function getDateTimeString() {
    var day = new Date();

    return (addLeadingZero(day.getMonth() + 1, 2) + "/" + addLeadingZero(day.getDate(), 2) + " " +
        addLeadingZero(day.getHours(), 2) + ":" + addLeadingZero(day.getMinutes(), 2) + ":" +
        addLeadingZero(day.getSeconds(), 2) + ":" + addLeadingZero(day.getMilliseconds(), 3));
}

/**
 * Adds leading zero(s) to a number and make a string of fixed length.
 * @private
 * @param {number} number - A number to make a string.
 * @param {number} digit - The length of the result string.
 * @return {string} The result string
 */
function addLeadingZero(number, digit) {
    var n = number.toString(),
        i,
        strZero = "";

    for (i = 0; i < digit - n.length; i++) {
        strZero += "0";
    }

    return strZero + n;
}

/*
 * Call back when an error occurs */

function onerrorCB(error) {
    console.log("Error name:"+error.name + ", message: "+error.message);
}

/*
 * Displays information popup.
 */
function showMeasuringInfo() {
    console.log("showMeasuringInfo() called..");
    infoTimeout = 0;
    tau.changePage('#info');

    /* Start a timer when info popup is shown
     * hideMeasuringInfo() function will be execute after 10 sec and which will redirect to main page.
     */
    infoTimeoutEnd = window.setTimeout(hideMeasuringInfo, INFO_SHOW_DELAY);
}

/*
 * Hides information popup, redirects to main page.
 */
function hideMeasuringInfo() {
    console.log("hideMeasuringInfo() called..");
    tau.changePage('#main');
    infoTimeoutEnd = 0;
}

/*
 * Stops the sensor
 * Clears timers (to handle info popup)
 * Update the UI: Hides measuring text, stop animation on heart image and change button text to Start.
 */
function stopSensor() {
    console.log("stopSensor() called...");
    sensorStarted = false;
    heartImg.classList.remove('animate');
    measuringText.classList.remove('show');
    measuringText.classList.add('hide');

    clearTimers();

    tizen.humanactivitymonitor.stop("HRM");
    //hrmControlBtn.innerHTML = TEXT_START;
    loadDataView(db)
}

/*
 * Click event handler for back button on info page
 * Hides the information popup and redirects to main page.
 */
function onInfoBackBtnClick() {
    console.log("onInfoBackBtnClick() called...");
    window.clearTimeout(infoTimeoutEnd);
    infoTimeoutEnd = 0;
    tau.changePage('#main');
}

/*
 * Accelerometer
 */

function AccelToggle() {
    console.log("onAccelControlBtnClick() called...");
    if (accelStart === true){
        console.log("Starting Accel");
        if (window.DeviceMotionEvent) {
            console.log("Device Motion supported")
            window.addEventListener('devicemotion', deviceMotionHandler, false);
        } else {
            console.log("Device Motion not supported")
        }
        accelStart = false;
    } else {
        console.log("Stopping Accel");
	    window.removeEventListener('devicemotion', deviceMotionHandler, false);
        accelStart = true;
    }
};

function updateChart(x, y, z) {
	var chart = new CanvasJS.Chart("chartContainer",{
		title :{
			fontColor: "#ccc",
			text: "Sensor Data"
		},
		backgroundColor: "#222",
		data: [{
			color: "#1E90FF",
			type: "line",
			dataPoints: dpsX
		}, {
			color: "#228B22",
			type: "line",
			dataPoints: dpsY
		}, {
			color: "#B22222",
			type: "line",
			dataPoints: dpsZ
		}]
	});
	var lastSecond = -1;
    time = new Date().getTime() - initial;
    console.log("[" + time + ", " + x + "," + y + "," + z + "]");
    dpsX.push({
    	x: time / 1000.0,
    	y: x
    });
    dpsY.push({
    	x: time / 1000.0,
    	y: y
    });
    dpsZ.push({
    	x: time / 1000.0,
    	y: z
    });
    if (dpsX.length > dataLength)
    {
    	dpsX.shift();
    	dpsY.shift();
    	dpsZ.shift();
    }
    var second = Math.round(time / 1000.0);


    if(dpsX.length >= dataLength) {
        console.log("Rendering.............")
    	chart.render();
    }
};

function deviceMotionHandler(e) {
    updateChart(
         e.accelerationIncludingGravity.x,
        -e.accelerationIncludingGravity.y,
        -e.accelerationIncludingGravity.z);
}

/* Pass the lower bound, upper bound and number of points needed
*/
function get_data(lower, upper, points)
{
  if ( lower < 40 ) {
    return "This person is dead";
  }
  if ( upper > 220 ) {
    return "This person's heartrate is too high";
  }

  var range = (upper - lower);
  var result = [];
  var i = 0;
  while ( i < points )  {
    result.push ( upper - Math.floor((Math.random() * range ) + 1));
    i++;
  }
  return result;
}

/* Pass the minimum accel, upper accel, maximum movement between samples and number of points needed
  returns one of the arrays x, y or z.
*/
function get_fake_arr( min, max, max_btwn_sample, points)
{
  var range = (upper - lower);
  var arr = [];

 for (var i = 0; i < points ; i++) {
    var val = upper - Math.floor((Math.random() * range ) + 1);
    var pos = i;
    if ( (i -1) < 0 ) {
        pos = 0
    }
    while ( (val - arr[pos] ) <= max_btwn_sample ) {
        val = upper - Math.floor((Math.random() * range ) + 1);
    }
    arr.push ( val );
  }
  return arr;
}

function get_hr_data() {
var data = [
	{"HR": 70},
	{"HR": 69},
	{"HR": 70},
	{"HR": 68},
	{"HR": 70},
	{"HR": 66},
	{"HR": 68},
	{"HR": 67},
	{"HR": 70},
	{"HR": 68},
	{"HR": 69},
	{"HR": 67},
	{"HR": 66},
	{"HR": 70},
	{"HR": 66},
	{"HR": 70},
	{"HR": 69},
	{"HR": 67},
	{"HR": 67},
	{"HR": 67},
	{"HR": 68},
	{"HR": 69},
	{"HR": 66},
	{"HR": 69},
	{"HR": 68},
	{"HR": 68},
	{"HR": 69},
	{"HR": 69},
	{"HR": 69},
	{"HR": 68},
	{"HR": 69},
	{"HR": 70},
	{"HR": 66},
	{"HR": 69},
	{"HR": 68},
	{"HR": 70},
	{"HR": 70},
	{"HR": 68},
	{"HR": 68},
	{"HR": 69},
	{"HR": 66},
	{"HR": 67},
	{"HR": 66},
	{"HR": 68},
	{"HR": 69},
	{"HR": 69},
	{"HR": 70},
	{"HR": 66},
	{"HR": 70},
	{"HR": 66},
	{"HR": 66},
	{"HR": 68},
	{"HR": 69},
	{"HR": 67},
	{"HR": 69},
	{"HR": 67},
	{"HR": 68},
	{"HR": 69},
	{"HR": 68},
	{"HR": 69},
	{"HR": 67},
	{"HR": 66},
	{"HR": 69},
	{"HR": 66},
	{"HR": 69},
	{"HR": 70},
	{"HR": 66},
	{"HR": 70},
	{"HR": 67},
	{"HR": 66},
	{"HR": 68},
	{"HR": 66},
	{"HR": 67},
	{"HR": 68},
	{"HR": 66},
	{"HR": 66},
	{"HR": 69},
	{"HR": 70},
	{"HR": 70},
	{"HR": 69},
	{"HR": 67},
	{"HR": 67},
	{"HR": 70},
	{"HR": 68},
	{"HR": 66},
	{"HR": 66},
	{"HR": 67},
	{"HR": 66},
	{"HR": 69},
	{"HR": 70},
	{"HR": 68},
	{"HR": 70},
	{"HR": 68},
	{"HR": 67},
	{"HR": 66},
	{"HR": 70},
	{"HR": 70},
	{"HR": 70},
	{"HR": 67},
	{"HR": 66}
];
if (hr_idx >= data.length) {
    hr_idx = 0;
}
return data[i].HR;
};
