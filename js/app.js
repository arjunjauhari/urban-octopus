/*global tau*/
/*exported init*/

var INFO_SETTIMEOUT_DELAY = 10000;
var INFO_SHOW_DELAY = 10000;
var TEXT_STOP = 'Stop';
var TEXT_START = 'Start';
var TIMER_MS = 30000;

var heartRateEl;
var accelRateEl;
var heartImg;
var infoBackBtn;
var hrmControlBtn;
var timeEl;
var timerEl;
var lefttext;
var righttext;

var countDownTo;
var infoTimeoutEnd = 0;
var infoTimeout = 0;

var sensorStarted = false;
var isTrigActive = false;

var initial = new Date().getTime();
var lastTrigSamp = new Date().getTime();
var dataLength = 100;
var dpsX = [];
var dpsY = [];
var dpsZ = [];

var dummy = true;
var dummyHRcnt = 0;
var dummyACcnt = 0;
var hr_idx = 0;
var ac_idx = 0;

var mainHRWindow = [];
var mainAccelWindow = [];

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

    tizen.humanactivitymonitor.start('HRM', onHeartRateDataChange, onerrorCB);
    AccelToggle(true);
}

function startTime() {
    var today = new Date();
    var h = today.getHours();
    var m = today.getMinutes();
    var s = today.getSeconds();
    m = checkTime(m);
    s = checkTime(s);
    timeEl.innerHTML = h + ":" + m + ":" + s;
    var t = setTimeout(startTime, 500);
}

function checkTime(i) {
    if (i < 10) {i = "0" + i};  // add zero in front of numbers < 10
    return i;
}

/*
 * Function invoked on onload event
 */
function init()
{
    console.log("init() called...");
    timeEl = document.getElementById('time');
    lefttext = document.getElementById('leftbuttontext');
    righttext = document.getElementById('rightbuttontext');
    heartRateEl = document.getElementById('heart-rate-value');
    heartImg = document.getElementById('heart-img');
    accelRateEl = document.getElementById('accelerometerdata');
    timerEl = document.getElementById('timerdata');

    timerEl.style.visibility = "hidden";
    lefttext.style.visibility = "hidden";

    openDB();
    startTime();
    startSensors();

    //Registering click event handler for buttons.
	document.addEventListener('tizenhwkey', function(e) {
        if(e.keyName == "back") {
            stopSensors();
            console.log(mainHRWindow);
            console.log(mainAccelWindow);
            tizen.application.getCurrentApplication().exit();
        }
    });
}

function engine() {
    console.log("engine called...")
    var hrtrigger = false;
    // read last 5 values
    var curHRWindow = mainHRWindow.slice(Math.max(mainHRWindow.length - 5, 0))
    // avg
    var avgHR = get_avg(curHRWindow);
    console.log(avgHR);
    if (avgHR > 72) {
        hrtrigger = true;
    } else {
        hrtrigger = false;
    }

    var actrigger = false;
    var sumAC = {
        'x': 0,
        'y': 0,
        'z': 0
    };
    // read last 20 values
    var curACWindow = mainAccelWindow.slice(Math.max(mainAccelWindow.length - 20, 0))
    // get pairwise delta for each axis
    var tmp = get_pw_delta(curACWindow);
    // sum all of them
    for (var i = 0; i < tmp.length; i++) {
        sumAC.x += tmp[i].x;
        sumAC.y += tmp[i].y;
        sumAC.z += tmp[i].z;
    }
    var finalAC = sumAC.x + sumAC.y + sumAC.z;
    console.log("Final AC: ", finalAC);
    if (finalAC > 500) {
        actrigger = true;
    } else {
        actrigger = false;
    }

    accelRateEl.innerHTML = Math.floor(finalAC);
    // use both the triggers
    if (hrtrigger && actrigger && !isTrigActive) {
        isTrigActive = true;
        console.log("ALERT!!ALERT!!");
        timeEl.style.visibility = "hidden";
        lefttext.innerHTML = 'YES';
        lefttext.style.visibility = "visible";
        righttext.innerHTML = 'NO';

        countDownTo = new Date(new Date().getTime() + TIMER_MS);
        timerID = setInterval(timerFunc, 1000);

        lefttext.addEventListener('click', good)
        righttext.addEventListener('click', stage3)
    }
}

function timerFunc() {
    timerExpired = false;
    var now = new Date();
    var distance = countDownTo - now;
    var minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    var seconds = Math.floor((distance % (1000 * 60)) / 1000);
    s = checkTime(seconds);
    timerEl.innerHTML = minutes + ":" + s;
    timerEl.style.visibility = "visible";

    if (distance < 0) {
        timerExpired = true;
        clearInterval(timerID);
        //FIXME
        // implement send alert to caregiver here
        stage3();
    }
}

function stage3() {
    if (!isTrigActive) {
        return;
    }

    isTrigActive = false;
    timerExpired = true;
    clearInterval(timerID);
    timerEl.style.visibility = 'hidden';
    lefttext.innerHTML = 'CALLING';
    righttext.innerHTML = 'HELP';

    stopSensors();
}

function good() {
    if (!isTrigActive || timerExpired) {
        return;
    }

    // go back to monitor mode
    isTrigActive = false;
    timerExpired = true;
    clearInterval(timerID);
    timerEl.style.visibility = 'hidden';
    lefttext.style.visibility = 'hidden';
    timeEl.style.visibility = 'visible';
    righttext.innerHTML = 'Monitoring';
}

function get_pw_delta(arr) {
    var out = [];

    for (var i = 1; i < arr.length; i++) {
        var tmp = {
            'x': 0,
            'y': 0,
            'z': 0
        };
        tmp.x = Math.abs(arr[i].x - arr[i-1].x);
        tmp.y = Math.abs(arr[i].y - arr[i-1].y);
        tmp.z = Math.abs(arr[i].z - arr[i-1].z);
        out.push(tmp);
    }

    return out
}

function get_avg(arr) {
    var sum = 0
    for (var i = 0; i < arr.length; i++) {
        sum += arr[i];
    }

    return sum/arr.length;
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
        if (dummyHRcnt < 10) {
            dummyHRcnt++;
            return;
        }
        dummyHRcnt = 0;
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

    if (rate < 1) {     // FIXME
        console.log("Heart rate value < 1");
        rate = 0;
        heartRateEl.innerHTML = '';
        heartImg.classList.remove('animate');

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
        console.log("heartRateEl is valid information...");
        if (!heartImg.classList.contains('animate')) {
            heartImg.classList.add('animate');
        }
        heartRateEl.innerHTML = rate;
        // Save to db
        submitNewRecord(rate);
        mainHRWindow.push(rate);
    }

    var timeDelta = new Date().getTime() - lastTrigSamp;
    if (timeDelta > 1000) {
        lastTrigSamp = new Date().getTime();
        engine();
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
function stopSensors() {
    console.log("stopSensors() called...");
    sensorStarted = false;
    heartImg.classList.remove('animate');

    clearTimers();

    tizen.humanactivitymonitor.stop("HRM");
    AccelToggle(false);
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

function AccelToggle(accelStart) {
    console.log("onAccelControlBtnClick() called...");
    if (accelStart === true){
        console.log("Starting Accel");
        if (window.DeviceMotionEvent) {
            console.log("Device Motion supported")
            window.addEventListener('devicemotion', deviceMotionHandler, false);
        } else {
            console.log("Device Motion not supported")
        }
    } else {
        console.log("Stopping Accel");
	    window.removeEventListener('devicemotion', deviceMotionHandler, false);
    }
};

function updateChart(x, y, z) {
	//var chart = new CanvasJS.Chart("chartContainer",{
	//	title :{
	//		fontColor: "#ccc",
	//		text: "Sensor Data"
	//	},
	//	backgroundColor: "#222",
	//	data: [{
	//		color: "#1E90FF",
	//		type: "line",
	//		dataPoints: dpsX
	//	}, {
	//		color: "#228B22",
	//		type: "line",
	//		dataPoints: dpsY
	//	}, {
	//		color: "#B22222",
	//		type: "line",
	//		dataPoints: dpsZ
	//	}]
	//});
	var lastSecond = -1;
    time = new Date().getTime() - initial;
    //console.log("[" + time + ", " + x + "," + y + "," + z + "]");
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
    	//chart.render();
    }
};

function deviceMotionHandler(e) {
    if (dummy === true) {
        if (dummyACcnt < 0) {
            dummyACcnt++;
            return;
        }
        dummyACcnt = 0;
        var tmp = get_accel_data();
        ac_idx++;
        accelval = tmp;
    } else {
        var accelval = e.accelerationIncludingGravity;
    }
    mainAccelWindow.push(accelval);
    updateChart(
         accelval.x,
         accelval.y,
         accelval.z);

    var timeDelta = new Date().getTime() - lastTrigSamp;
    if (timeDelta > 1000) {
        lastTrigSamp = new Date().getTime();
        engine();
    }
}

function get_hr_data() {
var data = [
	{"HR": 69},
	{"HR": 67},
	{"HR": 69},
	{"HR": 68},
	{"HR": 67},
	{"HR": 69},
	{"HR": 68},
	{"HR": 67},
	{"HR": 67},
	{"HR": 67},
	{"HR": 68},
	{"HR": 68},
	{"HR": 67},
	{"HR": 68},
	{"HR": 67},
	{"HR": 69},
	{"HR": 69},
	{"HR": 68},
	{"HR": 67},
	{"HR": 68},
	{"HR": 68},
	{"HR": 67},
	{"HR": 67},
	{"HR": 69},
	{"HR": 69},
	{"HR": 67},
	{"HR": 69},
	{"HR": 67},
	{"HR": 69},
	{"HR": 67},
	{"HR": 69},
	{"HR": 67},
	{"HR": 68},
	{"HR": 69},
	{"HR": 67},
	{"HR": 68},
	{"HR": 68},
	{"HR": 68},
	{"HR": 69},
	{"HR": 67},
	{"HR": 67},
	{"HR": 67},
	{"HR": 69},
	{"HR": 68},
	{"HR": 69},
	{"HR": 67},
	{"HR": 68},
	{"HR": 68},
	{"HR": 67},
	{"HR": 67},
	{"HR": 68},
	{"HR": 69},
	{"HR": 67},
	{"HR": 67},
	{"HR": 67},
	{"HR": 69},
	{"HR": 69},
	{"HR": 68},
	{"HR": 69},
	{"HR": 67},
	{"HR": 67},
	{"HR": 67},
	{"HR": 67},
	{"HR": 69},
	{"HR": 68},
	{"HR": 68},
	{"HR": 67},
	{"HR": 69},
	{"HR": 68},
	{"HR": 67},
	{"HR": 68},
	{"HR": 69},
	{"HR": 69},
	{"HR": 68},
	{"HR": 69},
	{"HR": 69},
	{"HR": 68},
	{"HR": 69},
	{"HR": 68},
	{"HR": 69},
	{"HR": 69},
	{"HR": 67},
	{"HR": 67},
	{"HR": 67},
	{"HR": 67},
	{"HR": 69},
	{"HR": 68},
	{"HR": 69},
	{"HR": 67},
	{"HR": 68},
	{"HR": 68},
	{"HR": 68},
	{"HR": 67},
	{"HR": 69},
	{"HR": 68},
	{"HR": 67},
	{"HR": 68},
	{"HR": 67},
	{"HR": 68},
	{"HR": 68},
	{"HR": 73},
	{"HR": 74},
	{"HR": 72},
	{"HR": 74},
	{"HR": 71},
	{"HR": 72},
	{"HR": 71},
	{"HR": 73},
	{"HR": 74},
	{"HR": 71},
	{"HR": 74},
	{"HR": 71},
	{"HR": 73},
	{"HR": 72},
	{"HR": 74},
	{"HR": 71},
	{"HR": 73},
	{"HR": 72},
	{"HR": 72},
	{"HR": 72},
	{"HR": 71},
	{"HR": 74},
	{"HR": 74},
	{"HR": 74},
	{"HR": 74},
	{"HR": 72},
	{"HR": 73},
	{"HR": 71},
	{"HR": 74},
	{"HR": 74},
	{"HR": 73},
	{"HR": 73},
	{"HR": 73},
	{"HR": 72},
	{"HR": 73},
	{"HR": 71},
	{"HR": 73},
	{"HR": 74},
	{"HR": 73},
	{"HR": 71},
	{"HR": 71},
	{"HR": 74},
	{"HR": 71},
	{"HR": 73},
	{"HR": 73},
	{"HR": 72},
	{"HR": 73},
	{"HR": 73},
	{"HR": 71},
	{"HR": 73},
	{"HR": 73},
	{"HR": 71},
	{"HR": 74},
	{"HR": 73},
	{"HR": 72},
	{"HR": 71},
	{"HR": 74},
	{"HR": 74},
	{"HR": 73},
	{"HR": 71},
	{"HR": 72},
	{"HR": 74},
	{"HR": 72},
	{"HR": 72},
	{"HR": 71},
	{"HR": 74},
	{"HR": 71},
	{"HR": 74},
	{"HR": 74},
	{"HR": 72},
	{"HR": 71},
	{"HR": 71},
	{"HR": 71},
	{"HR": 73},
	{"HR": 73},
	{"HR": 71},
	{"HR": 74},
	{"HR": 73},
	{"HR": 73},
	{"HR": 74},
	{"HR": 71},
	{"HR": 74},
	{"HR": 74},
	{"HR": 74},
	{"HR": 73},
	{"HR": 71},
	{"HR": 74},
	{"HR": 71},
	{"HR": 71},
	{"HR": 71},
	{"HR": 73},
	{"HR": 71},
	{"HR": 71},
	{"HR": 74},
	{"HR": 74},
	{"HR": 73},
	{"HR": 73},
	{"HR": 74},
	{"HR": 71},
	{"HR": 73},
	{"HR": 75},
	{"HR": 76},
	{"HR": 78},
	{"HR": 78},
	{"HR": 76},
	{"HR": 76},
	{"HR": 78},
	{"HR": 77},
	{"HR": 75},
	{"HR": 77},
	{"HR": 78},
	{"HR": 77},
	{"HR": 78},
	{"HR": 75},
	{"HR": 78},
	{"HR": 75},
	{"HR": 75},
	{"HR": 77},
	{"HR": 78},
	{"HR": 78},
	{"HR": 76},
	{"HR": 77},
	{"HR": 75},
	{"HR": 76},
	{"HR": 77},
	{"HR": 75},
	{"HR": 77},
	{"HR": 76},
	{"HR": 75},
	{"HR": 76},
	{"HR": 75},
	{"HR": 77},
	{"HR": 78},
	{"HR": 77},
	{"HR": 78},
	{"HR": 76},
	{"HR": 75},
	{"HR": 75},
	{"HR": 76},
	{"HR": 77},
	{"HR": 77},
	{"HR": 76},
	{"HR": 78},
	{"HR": 75},
	{"HR": 77},
	{"HR": 78},
	{"HR": 78},
	{"HR": 75},
	{"HR": 78},
	{"HR": 75},
	{"HR": 76},
	{"HR": 76},
	{"HR": 75},
	{"HR": 77},
	{"HR": 76},
	{"HR": 75},
	{"HR": 78},
	{"HR": 78},
	{"HR": 76},
	{"HR": 75},
	{"HR": 76},
	{"HR": 77},
	{"HR": 76},
	{"HR": 76},
	{"HR": 76},
	{"HR": 75},
	{"HR": 78},
	{"HR": 76},
	{"HR": 75},
	{"HR": 76},
	{"HR": 76},
	{"HR": 76},
	{"HR": 78},
	{"HR": 75},
	{"HR": 76},
	{"HR": 76},
	{"HR": 76},
	{"HR": 77},
	{"HR": 77},
	{"HR": 78},
	{"HR": 75},
	{"HR": 76},
	{"HR": 75},
	{"HR": 77},
	{"HR": 76},
	{"HR": 75},
	{"HR": 75},
	{"HR": 77},
	{"HR": 76},
	{"HR": 77},
	{"HR": 78},
	{"HR": 78},
	{"HR": 77},
	{"HR": 76},
	{"HR": 76},
	{"HR": 77},
	{"HR": 75},
	{"HR": 77},
	{"HR": 77},
	{"HR": 77},
	{"HR": 75},
	{"HR": 76},
	{"HR": 78},
	{"HR": 78},
	{"HR": 76},
	{"HR": 76},
	{"HR": 78},
	{"HR": 77},
	{"HR": 75},
	{"HR": 77},
	{"HR": 78},
	{"HR": 77},
	{"HR": 78},
	{"HR": 75},
	{"HR": 78},
	{"HR": 75},
	{"HR": 75},
	{"HR": 77},
	{"HR": 78},
	{"HR": 78},
	{"HR": 76},
	{"HR": 77},
	{"HR": 75},
	{"HR": 76},
	{"HR": 77},
	{"HR": 75},
	{"HR": 77},
	{"HR": 76},
	{"HR": 75},
	{"HR": 76},
	{"HR": 75},
	{"HR": 77},
	{"HR": 78},
	{"HR": 77},
	{"HR": 78},
	{"HR": 76},
	{"HR": 75},
	{"HR": 75},
	{"HR": 76},
	{"HR": 77},
	{"HR": 77},
	{"HR": 76},
	{"HR": 78},
	{"HR": 75},
	{"HR": 77},
	{"HR": 78},
	{"HR": 78},
	{"HR": 75},
	{"HR": 78},
	{"HR": 75},
	{"HR": 76},
	{"HR": 76},
	{"HR": 75},
	{"HR": 77},
	{"HR": 76},
	{"HR": 75},
	{"HR": 78},
	{"HR": 78},
	{"HR": 76},
	{"HR": 75},
	{"HR": 76},
	{"HR": 77},
	{"HR": 76},
	{"HR": 76},
	{"HR": 76},
	{"HR": 75},
	{"HR": 78},
	{"HR": 76},
	{"HR": 75},
	{"HR": 76},
	{"HR": 76},
	{"HR": 76},
	{"HR": 78},
	{"HR": 75},
	{"HR": 76},
	{"HR": 76},
	{"HR": 76},
	{"HR": 77},
	{"HR": 77},
	{"HR": 78},
	{"HR": 75},
	{"HR": 76},
	{"HR": 75},
	{"HR": 77},
	{"HR": 76},
	{"HR": 75},
	{"HR": 75},
	{"HR": 77},
	{"HR": 76},
	{"HR": 77},
	{"HR": 78},
	{"HR": 78},
	{"HR": 77},
	{"HR": 76},
	{"HR": 76},
	{"HR": 77},
	{"HR": 75},
	{"HR": 77},
	{"HR": 77},
	{"HR": 77}
];
if (hr_idx >= data.length) {
    hr_idx = 0;
}
return data[hr_idx].HR;
};

function get_accel_data() {
    var data = [
  {
    "x": 0.20817557,
    "y": -0.961914659,
    "z": -9.822537422
  },
  {
    "x": 0.20817557,
    "y": -0.961914659,
    "z": -9.822537422
  },
  {
    "x": 0.198604286,
    "y": -1.004985452,
    "z": -9.872786522
  },
  {
    "x": 0.200997099,
    "y": -0.990628541,
    "z": -9.834501266
  },
  {
    "x": 0.165104762,
    "y": -1.036092162,
    "z": -9.834501266
  },
  {
    "x": 0.215354055,
    "y": -0.988235772,
    "z": -9.851251602
  },
  {
    "x": 0.167497575,
    "y": -1.057627559,
    "z": -9.877571106
  },
  {
    "x": 0.212961212,
    "y": -1.026520848,
    "z": -9.827322006
  },
  {
    "x": 0.210568383,
    "y": -1.079162955,
    "z": -9.834501266
  },
  {
    "x": 0.205782756,
    "y": -1.031306505,
    "z": -9.829714775
  },
  {
    "x": 0.174676061,
    "y": -1.062413216,
    "z": -9.844072342
  },
  {
    "x": 0.220139682,
    "y": -1.071984529,
    "z": -9.870393753
  },
  {
    "x": 0.198604286,
    "y": -0.995414197,
    "z": -9.879963875
  },
  {
    "x": 0.174676061,
    "y": -1.021735311,
    "z": -9.860822678
  },
  {
    "x": 0.1914258,
    "y": -1.040877819,
    "z": -9.846465111
  },
  {
    "x": 0.203389928,
    "y": -1.00737834,
    "z": -9.851251602
  },
  {
    "x": 0.215354055,
    "y": -0.981057286,
    "z": -9.822537422
  },
  {
    "x": 0.189032987,
    "y": -1.062413216,
    "z": -9.882357597
  },
  {
    "x": 0.172283247,
    "y": -1.098305583,
    "z": -9.841679573
  },
  {
    "x": 0.153140649,
    "y": -1.105484128,
    "z": -9.841679573
  },
  {
    "x": 0.162711948,
    "y": -1.170090318,
    "z": -9.846465111
  },
  {
    "x": 0.205782756,
    "y": -1.03848505,
    "z": -9.91824913
  },
  {
    "x": 0.122033961,
    "y": -0.923629463,
    "z": -9.889535904
  },
  {
    "x": -0.071784683,
    "y": -1.000199914,
    "z": -9.84885788
  },
  {
    "x": 0.196211442,
    "y": -1.67976141,
    "z": -10.21974564
  },
  {
    "x": 0.143569365,
    "y": 0.823131025,
    "z": -10.47338486
  },
  {
    "x": 0.10049855,
    "y": 0.600598454,
    "z": -10.30827999
  },
  {
    "x": -0.11246267,
    "y": 0.143569365,
    "z": -10.32502937
  },
  {
    "x": -0.406779855,
    "y": -0.471386075,
    "z": -9.951749802
  },
  {
    "x": -0.373280317,
    "y": -1.399801373,
    "z": -9.700503349
  },
  {
    "x": -0.940379262,
    "y": -0.421136767,
    "z": -10.47577763
  },
  {
    "x": -1.098305583,
    "y": -0.569491804,
    "z": -10.24128151
  },
  {
    "x": -1.24666059,
    "y": -0.442672163,
    "z": -9.265008926
  },
  {
    "x": -1.794616938,
    "y": -1.000199914,
    "z": -9.03051281
  },
  {
    "x": -1.74197495,
    "y": -0.071784683,
    "z": -9.480363846
  },
  {
    "x": -0.760917604,
    "y": -0.346959293,
    "z": -8.999405861
  },
  {
    "x": -0.54317075,
    "y": -0.665204704,
    "z": -8.283952713
  },
  {
    "x": -1.170090318,
    "y": -0.301495641,
    "z": -9.176474571
  },
  {
    "x": -0.672383189,
    "y": 1.32801652,
    "z": -9.468399048
  },
  {
    "x": -0.813559711,
    "y": 1.641476274,
    "z": -9.375079155
  },
  {
    "x": -0.212961212,
    "y": 1.672582984,
    "z": -10.42313576
  },
  {
    "x": -0.418743968,
    "y": 0.050249275,
    "z": -9.736394882
  },
  {
    "x": 0.057427742,
    "y": 0.318245381,
    "z": -9.322437286
  },
  {
    "x": -1.000199914,
    "y": -2.060220242,
    "z": -7.338787079
  },
  {
    "x": -3.146562099,
    "y": 4.237688541,
    "z": -11.51426315
  },
  {
    "x": -1.823330879,
    "y": 3.950549841,
    "z": -11.76790237
  },
  {
    "x": -1.72761786,
    "y": 3.65862608,
    "z": -10.34177971
  },
  {
    "x": -2.065006018,
    "y": 4.488935471,
    "z": -6.915257454
  },
  {
    "x": -3.35952282,
    "y": 3.062812805,
    "z": -9.717252731
  },
  {
    "x": -4.187439442,
    "y": 1.529013753,
    "z": -9.288937569
  },
  {
    "x": -4.350151539,
    "y": 3.337987661,
    "z": -8.901299477
  },
  {
    "x": -5.06560564,
    "y": 3.488735676,
    "z": -9.164510727
  },
  {
    "x": -4.474578381,
    "y": 2.404786825,
    "z": -8.348558426
  },
  {
    "x": -5.922235966,
    "y": 3.184847116,
    "z": -10.55713272
  },
  {
    "x": -5.211567879,
    "y": 1.258624673,
    "z": -8.250452042
  },
  {
    "x": -6.297908783,
    "y": 3.804587841,
    "z": -6.537191868
  },
  {
    "x": -6.824329853,
    "y": 2.201396704,
    "z": -5.910271645
  },
  {
    "x": -8.28155899,
    "y": 1.002592683,
    "z": -6.93679285
  },
  {
    "x": -8.396414757,
    "y": -2.651247263,
    "z": -6.50369215
  },
  {
    "x": -8.255237579,
    "y": 3.010170937,
    "z": -5.340780735
  },
  {
    "x": -8.1762743,
    "y": 1.840080619,
    "z": -3.550948858
  },
  {
    "x": -7.879564762,
    "y": 3.192025185,
    "z": -5.64227581
  },
  {
    "x": -9.300901413,
    "y": 2.52682066,
    "z": -4.819144726
  },
  {
    "x": -7.48474884,
    "y": 1.852044702,
    "z": -4.072584152
  },
  {
    "x": -9.166903496,
    "y": 3.153740168,
    "z": -3.61555481
  },
  {
    "x": -8.736195564,
    "y": 2.093719721,
    "z": -4.811966419
  },
  {
    "x": -9.360722542,
    "y": 2.931207657,
    "z": -3.194417953
  },
  {
    "x": -9.738788605,
    "y": 0.143569365,
    "z": -3.256631613
  },
  {
    "x": -8.405985832,
    "y": 1.555334687,
    "z": -3.976871252
  },
  {
    "x": -9.097511292,
    "y": 0.595812857,
    "z": -2.770888567
  },
  {
    "x": -10.31306553,
    "y": 1.981257081,
    "z": -1.579262972
  },
  {
    "x": -10.65045452,
    "y": 2.27078867,
    "z": -2.177468777
  },
  {
    "x": -8.793622971,
    "y": 0.224925339,
    "z": -2.804388046
  },
  {
    "x": -10.96630478,
    "y": 1.797009826,
    "z": -0.358923405
  },
  {
    "x": -8.379664421,
    "y": 0.110069841,
    "z": -2.184647083
  },
  {
    "x": -11.73918724,
    "y": 1.864008904,
    "z": -0.624526739
  },
  {
    "x": -7.350750923,
    "y": -0.11246267,
    "z": -2.861815929
  },
  {
    "x": -11.12184048,
    "y": 1.071984529,
    "z": -1.380658507
  },
  {
    "x": -8.415557861,
    "y": 1.311266899,
    "z": -2.512463808
  },
  {
    "x": -10.06660557,
    "y": 0.626919508,
    "z": -1.483550072
  },
  {
    "x": -9.98285675,
    "y": -0.004785645,
    "z": -0.741775036
  },
  {
    "x": -10.88734341,
    "y": 1.864008904,
    "z": -1.052841902
  },
  {
    "x": -11.99043274,
    "y": 2.029113531,
    "z": -2.275574446
  },
  {
    "x": -11.94975662,
    "y": 0.971485972,
    "z": -0.076570325
  },
  {
    "x": -10.70070171,
    "y": -0.172283247,
    "z": 0.473778874
  },
  {
    "x": -11.526227,
    "y": -0.349352121,
    "z": -0.105284192
  },
  {
    "x": -11.57168961,
    "y": -0.873380244,
    "z": -0.586241543
  },
  {
    "x": -9.332008362,
    "y": -1.335195184,
    "z": -0.619741023
  },
  {
    "x": -8.827122688,
    "y": -1.940579176,
    "z": -2.368894339
  },
  {
    "x": -9.095119476,
    "y": -1.495514154,
    "z": -3.287738323
  },
  {
    "x": -9.243474007,
    "y": -1.928615093,
    "z": -2.983849764
  },
  {
    "x": -8.786444664,
    "y": -1.576870084,
    "z": -2.54357028
  },
  {
    "x": -9.114260674,
    "y": -1.134197831,
    "z": -2.134397745
  },
  {
    "x": -9.348757744,
    "y": -1.531406403,
    "z": -2.68713975
  },
  {
    "x": -8.161917686,
    "y": -0.375673145,
    "z": -2.828316212
  },
  {
    "x": -7.946564198,
    "y": 0.775274515,
    "z": -2.440679073
  },
  {
    "x": -7.817351341,
    "y": 1.823330879,
    "z": -3.079562902
  },
  {
    "x": -7.391428947,
    "y": 2.213360786,
    "z": -3.574877024
  },
  {
    "x": -7.324430466,
    "y": 1.292124271,
    "z": -3.7256248
  },
  {
    "x": -7.161717892,
    "y": 1.383051395,
    "z": -4.189832211
  },
  {
    "x": -7.432106972,
    "y": 1.387837172,
    "z": -4.840680122
  },
  {
    "x": -7.549355507,
    "y": 1.538584948,
    "z": -5.35752964
  },
  {
    "x": -8.286344528,
    "y": 1.596012592,
    "z": -5.376672745
  },
  {
    "x": -9.219545364,
    "y": 1.67736876,
    "z": -5.580062389
  },
  {
    "x": -10.78923702,
    "y": 1.691725612,
    "z": -5.091926098
  },
  {
    "x": -11.88036442,
    "y": 1.607976794,
    "z": -4.948357105
  },
  {
    "x": -12.42832088,
    "y": 1.430907965,
    "z": -3.83569479
  },
  {
    "x": -10.9686985,
    "y": 1.270588875,
    "z": -2.569891453
  },
  {
    "x": -10.04746246,
    "y": 1.966900229,
    "z": -2.072184324
  },
  {
    "x": -9.695716858,
    "y": 2.577069998,
    "z": -1.715653777
  },
  {
    "x": -9.468399048,
    "y": 3.074777126,
    "z": -1.560120344
  },
  {
    "x": -9.891928673,
    "y": 3.424129248,
    "z": -1.488335609
  },
  {
    "x": -8.819944382,
    "y": 3.287738323,
    "z": -1.1820544
  },
  {
    "x": -8.171488762,
    "y": 3.196810961,
    "z": -1.35673058
  },
  {
    "x": -7.92742157,
    "y": 3.330809116,
    "z": -1.454836249
  },
  {
    "x": -7.695317268,
    "y": 3.426522017,
    "z": -1.572084427
  },
  {
    "x": -7.728816509,
    "y": 4.084547997,
    "z": -1.830509305
  },
  {
    "x": -7.539783955,
    "y": 4.426721573,
    "z": -2.084148407
  },
  {
    "x": -7.434500217,
    "y": 4.620540142,
    "z": -2.517249346
  },
  {
    "x": -7.503891945,
    "y": 4.60379076,
    "z": -2.624926567
  },
  {
    "x": -7.635497093,
    "y": 4.474578381,
    "z": -2.866601706
  },
  {
    "x": -8.298308372,
    "y": 4.144368649,
    "z": -2.868994236
  },
  {
    "x": -8.683552742,
    "y": 3.936193228,
    "z": -2.84267354
  },
  {
    "x": -8.415557861,
    "y": 3.754338503,
    "z": -3.158525944
  },
  {
    "x": -8.855835915,
    "y": 4.024727345,
    "z": -3.613162041
  },
  {
    "x": -9.284152031,
    "y": 4.242474556,
    "z": -4.149154186
  },
  {
    "x": -9.552147865,
    "y": 4.417150497,
    "z": -4.596612453
  },
  {
    "x": -9.430113792,
    "y": 4.192224979,
    "z": -4.713860512
  },
  {
    "x": -9.810573578,
    "y": 4.31186676,
    "z": -4.558327198
  },
  {
    "x": -9.576076508,
    "y": 4.168296814,
    "z": -4.230510235
  },
  {
    "x": -9.69811058,
    "y": 3.857230186,
    "z": -4.247260094
  },
  {
    "x": -9.925428391,
    "y": 4.297509193,
    "z": -3.811766624
  },
  {
    "x": -10.08574677,
    "y": 4.855037212,
    "z": -3.601198196
  },
  {
    "x": -9.805787086,
    "y": 5.168497086,
    "z": -3.450450182
  },
  {
    "x": -9.722038269,
    "y": 5.000998974,
    "z": -3.139383078
  },
  {
    "x": -10.08574677,
    "y": 4.984249592,
    "z": -3.122633696
  },
  {
    "x": -8.453842163,
    "y": 4.299902439,
    "z": -2.854637384
  },
  {
    "x": -7.829315186,
    "y": 3.641876221,
    "z": -2.857030153
  },
  {
    "x": -9.111868858,
    "y": 3.203989506,
    "z": -2.524427891
  },
  {
    "x": -9.731609344,
    "y": 2.785245419,
    "z": -2.124826431
  },
  {
    "x": -9.253045082,
    "y": 2.359323025,
    "z": -1.847258925
  },
  {
    "x": -8.602196693,
    "y": 2.151147604,
    "z": -1.591226935
  },
  {
    "x": -7.367500782,
    "y": 2.201396704,
    "z": -1.95015049
  },
  {
    "x": -6.178267956,
    "y": 2.30189538,
    "z": -2.414358139
  },
  {
    "x": -6.075376511,
    "y": 2.309073925,
    "z": -2.486142874
  },
  {
    "x": -6.917649746,
    "y": 2.727817774,
    "z": -3.079562902
  },
  {
    "x": -7.819744587,
    "y": 3.012563944,
    "z": -3.699303627
  },
  {
    "x": -9.279366493,
    "y": 4.721039295,
    "z": -4.398008347
  },
  {
    "x": -9.616753578,
    "y": 5.759523869,
    "z": -4.675575256
  },
  {
    "x": -9.430113792,
    "y": 5.283352375,
    "z": -4.510470867
  },
  {
    "x": -9.288937569,
    "y": 4.902893543,
    "z": -5.084747791
  },
  {
    "x": -9.006584167,
    "y": 4.716253281,
    "z": -5.206782341
  },
  {
    "x": -8.614161491,
    "y": 4.630111694,
    "z": -4.962714195
  },
  {
    "x": -8.482556343,
    "y": 4.735395908,
    "z": -4.785645485
  },
  {
    "x": -8.216952324,
    "y": 4.84546566,
    "z": -4.381258488
  },
  {
    "x": -8.623733521,
    "y": 4.972285748,
    "z": -3.694517851
  },
  {
    "x": -9.659825325,
    "y": 5.55852747,
    "z": -2.926422358
  },
  {
    "x": -11.24866009,
    "y": 5.635097504,
    "z": -2.407179594
  },
  {
    "x": -10.93519974,
    "y": 5.735595226,
    "z": -1.7898314
  },
  {
    "x": -9.509077072,
    "y": 5.469992638,
    "z": -1.093519926
  },
  {
    "x": -8.733802795,
    "y": 5.06560564,
    "z": -0.461814731
  },
  {
    "x": -10.00439167,
    "y": 6.290730953,
    "z": -1.127019525
  },
  {
    "x": -10.74377441,
    "y": 6.838686943,
    "z": -1.153340578
  },
  {
    "x": -10.5978117,
    "y": 6.317051888,
    "z": -1.043270707
  },
  {
    "x": -10.4853487,
    "y": 5.632704258,
    "z": -1.040877819
  },
  {
    "x": -8.973085403,
    "y": 4.637290478,
    "z": -0.880558729
  },
  {
    "x": -8.171488762,
    "y": 4.211367607,
    "z": -1.385444283
  },
  {
    "x": -7.604390144,
    "y": 4.663610935,
    "z": -1.332802296
  },
  {
    "x": -7.01575613,
    "y": 4.369294167,
    "z": -1.179661512
  },
  {
    "x": -6.556333542,
    "y": 4.266402721,
    "z": -1.203589797
  },
  {
    "x": -6.453442574,
    "y": 4.094119549,
    "z": -1.476371646
  },
  {
    "x": -6.317051888,
    "y": 4.206582069,
    "z": -1.74197495
  },
  {
    "x": -6.742973804,
    "y": 4.139583111,
    "z": -2.438286304
  },
  {
    "x": -6.857830048,
    "y": 4.223331928,
    "z": -2.823530912
  },
  {
    "x": -7.704888821,
    "y": 4.733003139,
    "z": -3.744767427
  },
  {
    "x": -8.879764557,
    "y": 4.907679081,
    "z": -4.761716843
  },
  {
    "x": -9.406186104,
    "y": 4.639683247,
    "z": -4.706681728
  },
  {
    "x": -10.30827999,
    "y": 4.012763977,
    "z": -4.244867325
  },
  {
    "x": -9.46361351,
    "y": 3.684947014,
    "z": -4.546362877
  },
  {
    "x": -10.36331463,
    "y": 4.378865719,
    "z": -4.811966419
  },
  {
    "x": -11.37787151,
    "y": 4.546362877,
    "z": -4.357330322
  },
  {
    "x": -10.05942631,
    "y": 3.940979004,
    "z": -3.641876221
  },
  {
    "x": -8.786444664,
    "y": 3.280559778,
    "z": -3.285345316
  },
  {
    "x": -7.984848976,
    "y": 3.476771355,
    "z": -2.92402935
  },
  {
    "x": -7.850851536,
    "y": 3.390629768,
    "z": -2.761317015
  },
  {
    "x": -7.668996811,
    "y": 3.37387991,
    "z": -2.888136864
  },
  {
    "x": -7.537391663,
    "y": 3.718446255,
    "z": -3.031706333
  },
  {
    "x": -7.764709949,
    "y": 4.000799656,
    "z": -3.376272678
  },
  {
    "x": -7.867600918,
    "y": 4.060619831,
    "z": -3.416950703
  },
  {
    "x": -8.092526436,
    "y": 3.8715868,
    "z": -3.507878065
  },
  {
    "x": -8.128417969,
    "y": 3.797409296,
    "z": -3.318845034
  },
  {
    "x": -8.774479866,
    "y": 4.0630126,
    "z": -3.314059258
  },
  {
    "x": -9.432506561,
    "y": 4.354937553,
    "z": -3.182453871
  },
  {
    "x": -10.82512951,
    "y": 4.692325115,
    "z": -2.746960402
  },
  {
    "x": -13.02413464,
    "y": 5.754738331,
    "z": -2.196611166
  },
  {
    "x": -11.19601727,
    "y": 6.053841114,
    "z": -2.036292076
  },
  {
    "x": -8.652446747,
    "y": 4.881358147,
    "z": -1.294516921
  },
  {
    "x": -10.45184898,
    "y": 6.23330307,
    "z": -1.05523479
  },
  {
    "x": -10.84427261,
    "y": 6.484549046,
    "z": -0.641276419
  },
  {
    "x": -10.37527847,
    "y": 5.13738966,
    "z": -0.497707099
  },
  {
    "x": -9.552147865,
    "y": 4.328616142,
    "z": -0.844666421
  },
  {
    "x": -8.408378601,
    "y": 4.823930264,
    "z": -1.009771109
  },
  {
    "x": -7.850851536,
    "y": 5.424529076,
    "z": -1.134197831
  },
  {
    "x": -7.793423176,
    "y": 5.426922321,
    "z": -1.208375454
  },
  {
    "x": -7.252645493,
    "y": 5.266602516,
    "z": -1.234696388
  },
  {
    "x": -7.09471941,
    "y": 5.32163763,
    "z": -1.201196909
  },
  {
    "x": -6.982256413,
    "y": 5.173282146,
    "z": -1.543370605
  },
  {
    "x": -6.699903488,
    "y": 5.134997368,
    "z": -1.87118721
  },
  {
    "x": -6.68076086,
    "y": 4.898108006,
    "z": -2.266003132
  },
  {
    "x": -6.19741106,
    "y": 4.58943367,
    "z": -2.746960402
  },
  {
    "x": -5.876771927,
    "y": 4.541577339,
    "z": -3.09870553
  },
  {
    "x": -6.262016773,
    "y": 4.800002098,
    "z": -3.933800459
  },
  {
    "x": -7.310072899,
    "y": 5.326423168,
    "z": -4.151546955
  },
  {
    "x": -7.929814339,
    "y": 5.163711548,
    "z": -3.936193228
  },
  {
    "x": -8.073383331,
    "y": 4.742574692,
    "z": -4.44107914
  },
  {
    "x": -9.293723106,
    "y": 4.627718925,
    "z": -4.551148891
  },
  {
    "x": -10.91605759,
    "y": 4.66839695,
    "z": -4.625326157
  },
  {
    "x": -11.25583744,
    "y": 4.223331928,
    "z": -4.307080746
  },
  {
    "x": -10.60738182,
    "y": 3.285345316,
    "z": -3.527020454
  },
  {
    "x": -9.418149948,
    "y": 2.806780815,
    "z": -2.979063988
  },
  {
    "x": -8.573483467,
    "y": 2.993421316,
    "z": -3.132204771
  },
  {
    "x": -8.257630348,
    "y": 3.249453068,
    "z": -2.873780012
  },
  {
    "x": -7.774280071,
    "y": 3.445664883,
    "z": -2.950350285
  },
  {
    "x": -7.826922894,
    "y": 3.498306513,
    "z": -3.024527788
  },
  {
    "x": -8.027919769,
    "y": 3.567698717,
    "z": -3.055634737
  },
  {
    "x": -8.013563156,
    "y": 3.242274523,
    "z": -3.172882795
  },
  {
    "x": -8.00638485,
    "y": 3.254238844,
    "z": -3.428915024
  },
  {
    "x": -8.408378601,
    "y": 3.407379389,
    "z": -3.287738323
  },
  {
    "x": -8.729016304,
    "y": 3.292524099,
    "z": -3.15134716
  },
  {
    "x": -9.303294182,
    "y": 3.601198196,
    "z": -3.060420036
  },
  {
    "x": -9.288937569,
    "y": 4.161118507,
    "z": -3.050848961
  },
  {
    "x": -8.965906143,
    "y": 4.362115383,
    "z": -3.000599623
  },
  {
    "x": -9.64068222,
    "y": 4.883750916,
    "z": -3.316452026
  },
  {
    "x": -10.1144619,
    "y": 5.130211353,
    "z": -3.469593048
  },
  {
    "x": -10.04267597,
    "y": 5.192424774,
    "z": -3.510270834
  },
  {
    "x": -9.891928673,
    "y": 4.630111694,
    "z": -2.392822742
  },
  {
    "x": -11.49990559,
    "y": 5.108676434,
    "z": -2.658426046
  },
  {
    "x": -11.13858986,
    "y": 5.01774931,
    "z": -2.163111687
  },
  {
    "x": -10.07856941,
    "y": 5.012963295,
    "z": -1.8855443
  },
  {
    "x": -10.10728264,
    "y": 4.888536453,
    "z": -2.321038008
  },
  {
    "x": -9.69811058,
    "y": 4.44107914,
    "z": -1.43808639
  },
  {
    "x": -8.604590416,
    "y": 4.043870449,
    "z": -1.359123111
  },
  {
    "x": -7.436892509,
    "y": 4.024727345,
    "z": -1.361515999
  },
  {
    "x": -7.51346302,
    "y": 4.304687977,
    "z": -1.339980602
  },
  {
    "x": -6.929614544,
    "y": 4.146761417,
    "z": -1.308874011
  },
  {
    "x": -6.561119556,
    "y": 4.130012035,
    "z": -1.32801652
  },
  {
    "x": -6.46062088,
    "y": 4.216153622,
    "z": -1.926222205
  },
  {
    "x": -6.587440491,
    "y": 4.467400074,
    "z": -2.072184324
  },
  {
    "x": -6.522834301,
    "y": 4.680361271,
    "z": -2.751746178
  },
  {
    "x": -6.738188267,
    "y": 4.725824833,
    "z": -4.012763977
  },
  {
    "x": -7.57806921,
    "y": 5.027320385,
    "z": -4.38365078
  },
  {
    "x": -8.851050377,
    "y": 4.677968502,
    "z": -4.766502857
  },
  {
    "x": -10.22453213,
    "y": 4.857429981,
    "z": -4.957928181
  },
  {
    "x": -8.652446747,
    "y": 4.699503899,
    "z": -5.125426292
  },
  {
    "x": -9.808179855,
    "y": 4.713860512,
    "z": -5.082355499
  },
  {
    "x": -10.39920807,
    "y": 4.505684853,
    "z": -4.295116425
  },
  {
    "x": -9.879963875,
    "y": 3.443271637,
    "z": -3.26141715
  },
  {
    "x": -9.119047165,
    "y": 3.314059258,
    "z": -2.811566591
  },
  {
    "x": -8.322237015,
    "y": 3.543770313,
    "z": -2.938385963
  },
  {
    "x": -7.951349258,
    "y": 3.766302824,
    "z": -2.560320377
  },
  {
    "x": -8.11166954,
    "y": 4.067798615,
    "z": -2.811566591
  },
  {
    "x": -8.319844246,
    "y": 4.051048756,
    "z": -2.986242533
  },
  {
    "x": -8.216952324,
    "y": 3.840480089,
    "z": -3.196810961
  },
  {
    "x": -8.212166786,
    "y": 3.936193228,
    "z": -3.531806231
  },
  {
    "x": -7.879564762,
    "y": 3.991228342,
    "z": -3.584448099
  },
  {
    "x": -8.161917686,
    "y": 3.931407452,
    "z": -3.59641242
  },
  {
    "x": -8.403593063,
    "y": 3.996013641,
    "z": -3.34038043
  },
  {
    "x": -9.31525898,
    "y": 4.436293125,
    "z": -3.337987661
  },
  {
    "x": -9.932606697,
    "y": 4.656433105,
    "z": -2.92402935
  },
  {
    "x": -10.0833559,
    "y": 4.92442894,
    "z": -2.801995039
  },
  {
    "x": -10.44467068,
    "y": 5.443671703,
    "z": -2.823530912
  },
  {
    "x": -10.12403297,
    "y": 5.809773445,
    "z": -2.390429735
  },
  {
    "x": -9.714859962,
    "y": 5.86959362,
    "z": -1.272981524
  },
  {
    "x": -11.28933811,
    "y": 6.130411148,
    "z": -1.10309124
  },
  {
    "x": -11.99521923,
    "y": 5.895915031,
    "z": -0.823131025
  },
  {
    "x": -10.21735287,
    "y": 4.993820667,
    "z": -0.729810894
  },
  {
    "x": -9.229117393,
    "y": 5.292923927,
    "z": -1.146162033
  },
  {
    "x": -8.863015175,
    "y": 4.895715237,
    "z": -0.770488918
  },
  {
    "x": -7.999206066,
    "y": 4.68275404,
    "z": -0.937986493
  },
  {
    "x": -7.946564198,
    "y": 4.797609329,
    "z": -0.957129002
  },
  {
    "x": -7.192824841,
    "y": 4.773681164,
    "z": -0.930808008
  },
  {
    "x": -6.642475128,
    "y": 4.991428375,
    "z": -0.95952189
  },
  {
    "x": -6.439085484,
    "y": 5.13738966,
    "z": -1.323230982
  },
  {
    "x": -6.388835907,
    "y": 5.125426292,
    "z": -1.268196106
  },
  {
    "x": -6.637690067,
    "y": 4.87417984,
    "z": -1.552941799
  },
  {
    "x": -6.65204668,
    "y": 4.756931305,
    "z": -2.088934183
  },
  {
    "x": -6.833901405,
    "y": 4.689932346,
    "z": -2.593819618
  },
  {
    "x": -7.506284714,
    "y": 4.694717884,
    "z": -4.07736969
  },
  {
    "x": -8.614161491,
    "y": 4.350151539,
    "z": -3.902693748
  },
  {
    "x": -9.602396965,
    "y": 4.139583111,
    "z": -4.386044025
  },
  {
    "x": -9.879963875,
    "y": 3.663411379,
    "z": -5.927021503
  },
  {
    "x": -12.31825161,
    "y": 4.15633297,
    "z": -5.946164608
  },
  {
    "x": -11.79900932,
    "y": 3.584448099,
    "z": -3.878765583
  },
  {
    "x": -10.15753269,
    "y": 2.15593338,
    "z": -3.469593048
  },
  {
    "x": -8.743373871,
    "y": 1.971685886,
    "z": -3.203989506
  },
  {
    "x": -7.934599876,
    "y": 2.770888567,
    "z": -2.864208698
  },
  {
    "x": -7.86999321,
    "y": 3.292524099,
    "z": -2.952743292
  },
  {
    "x": -7.960920811,
    "y": 3.412164927,
    "z": -2.921636581
  },
  {
    "x": -7.554140568,
    "y": 3.35952282,
    "z": -2.605783939
  },
  {
    "x": -7.929814339,
    "y": 3.785445213,
    "z": -3.093919754
  },
  {
    "x": -8.226524353,
    "y": 4.034298897,
    "z": -3.364308596
  },
  {
    "x": -8.396414757,
    "y": 3.371486902,
    "z": -3.031706333
  },
  {
    "x": -8.69551754,
    "y": 3.538984537,
    "z": -2.986242533
  },
  {
    "x": -8.750552177,
    "y": 3.687339783,
    "z": -2.880958557
  },
  {
    "x": -9.444471359,
    "y": 4.144368649,
    "z": -2.986242533
  },
  {
    "x": -9.681360245,
    "y": 4.572684288,
    "z": -2.859423161
  },
  {
    "x": -10.58823967,
    "y": 4.993820667,
    "z": -3.203989506
  },
  {
    "x": -10.18863869,
    "y": 5.405385971,
    "z": -3.041277409
  },
  {
    "x": -10.05464077,
    "y": 5.809773445,
    "z": -3.321237564
  },
  {
    "x": -9.949356079,
    "y": 5.895915031,
    "z": -2.423929214
  },
  {
    "x": -11.52144051,
    "y": 6.089733124,
    "z": -1.840080619
  },
  {
    "x": -12.46899891,
    "y": 6.463014126,
    "z": -1.148554921
  },
  {
    "x": -11.44487095,
    "y": 5.54417038,
    "z": -0.734596491
  },
  {
    "x": -9.999605179,
    "y": 4.986642361,
    "z": -1.507478356
  },
  {
    "x": -9.461220741,
    "y": 4.596612453,
    "z": -0.739382207
  },
  {
    "x": -8.353343964,
    "y": 5.156532764,
    "z": -1.337587714
  },
  {
    "x": -7.534998417,
    "y": 6.068198204,
    "z": -0.923629463
  },
  {
    "x": -7.176074505,
    "y": 5.434100151,
    "z": -1.179661512
  },
  {
    "x": -5.970092773,
    "y": 4.718646049,
    "z": -1.26341033
  },
  {
    "x": -5.041677952,
    "y": 4.596612453,
    "z": -1.617547989
  },
  {
    "x": -4.304687977,
    "y": 4.546362877,
    "z": -1.926222205
  },
  {
    "x": -4.125226021,
    "y": 4.637290478,
    "z": -2.304288149
  },
  {
    "x": -4.266402721,
    "y": 4.962714195,
    "z": -2.928815126
  },
  {
    "x": -4.680361271,
    "y": 5.615954876,
    "z": -3.723232031
  },
  {
    "x": -5.864808083,
    "y": 6.501298904,
    "z": -4.005585194
  },
  {
    "x": -7.03729105,
    "y": 6.434299946,
    "z": -3.919443369
  },
  {
    "x": -8.537590981,
    "y": 6.190232277,
    "z": -3.962514162
  },
  {
    "x": -8.425127983,
    "y": 5.833701611,
    "z": -4.053441525
  },
  {
    "x": -9.31525898,
    "y": 6.082554817,
    "z": -4.218546391
  },
  {
    "x": -10.22931671,
    "y": 5.711667538,
    "z": -4.285545349
  },
  {
    "x": -10.71745205,
    "y": 4.44107914,
    "z": -3.538984537
  },
  {
    "x": -9.379864693,
    "y": 3.555734634,
    "z": -2.447857618
  },
  {
    "x": -9.011369705,
    "y": 3.936193228,
    "z": -3.627518892
  },
  {
    "x": -7.728816509,
    "y": 4.31904459,
    "z": -2.871387243
  },
  {
    "x": -8.063812256,
    "y": 2.54357028,
    "z": -3.079562902
  },
  {
    "x": -8.341379166,
    "y": 2.852244377,
    "z": -3.565305471
  },
  {
    "x": -8.465806007,
    "y": 3.675375462,
    "z": -4.165904045
  },
  {
    "x": -8.465806007,
    "y": 3.7256248,
    "z": -4.02712059
  },
  {
    "x": -8.178668022,
    "y": 4.335794449,
    "z": -3.574877024
  },
  {
    "x": -8.609375954,
    "y": 4.098905563,
    "z": -4.108476162
  },
  {
    "x": -9.035298347,
    "y": 3.584448099,
    "z": -3.950549841
  },
  {
    "x": -9.626325607,
    "y": 4.07736969,
    "z": -3.988835573
  },
  {
    "x": -10.16949558,
    "y": 4.386044025,
    "z": -3.7256248
  },
  {
    "x": -10.79402161,
    "y": 4.015156269,
    "z": -2.467000008
  },
  {
    "x": -11.70329571,
    "y": 5.716453552,
    "z": -3.256631613
  },
  {
    "x": -10.42552853,
    "y": 4.69711113,
    "z": -2.423929214
  },
  {
    "x": -10.07378387,
    "y": 4.570291519,
    "z": -0.808773994
  },
  {
    "x": -10.91605759,
    "y": 5.132604122,
    "z": -1.368694544
  },
  {
    "x": -10.4159565,
    "y": 5.056034088,
    "z": 0.215354055
  },
  {
    "x": -9.62154007,
    "y": 6.15433979,
    "z": -0.60777694
  },
  {
    "x": -9.827322006,
    "y": 4.345366001,
    "z": -2.311466694
  },
  {
    "x": -8.257630348,
    "y": 5.063212872,
    "z": -0.437886536
  },
  {
    "x": -8.023134232,
    "y": 4.888536453,
    "z": -0.222532481
  },
  {
    "x": -7.86999321,
    "y": 4.962714195,
    "z": -0.49531427
  },
  {
    "x": -8.200202942,
    "y": 4.912464619,
    "z": -0.488135844
  },
  {
    "x": -8.171488762,
    "y": 4.742574692,
    "z": -1.040877819
  },
  {
    "x": -8.003991127,
    "y": 4.649254322,
    "z": -1.289731503
  },
  {
    "x": -7.903492928,
    "y": 4.491327763,
    "z": -1.655833364
  },
  {
    "x": -7.738388062,
    "y": 4.342973232,
    "z": -1.942971945
  },
  {
    "x": -7.379465103,
    "y": 4.153940201,
    "z": -2.318645239
  },
  {
    "x": -7.482356548,
    "y": 4.220939159,
    "z": -3.665804386
  },
  {
    "x": -8.121239662,
    "y": 4.388436794,
    "z": -4.199403763
  },
  {
    "x": -8.781659126,
    "y": 4.285545349,
    "z": -5.48674202
  },
  {
    "x": -7.944170952,
    "y": 3.390629768,
    "z": -4.936393261
  },
  {
    "x": -9.085547447,
    "y": 3.830909014,
    "z": -5.338387489
  },
  {
    "x": -9.131011009,
    "y": 3.491128206,
    "z": -4.926821709
  },
  {
    "x": -8.798408508,
    "y": 2.962314367,
    "z": -4.0630126
  },
  {
    "x": -8.659625053,
    "y": 2.986242533,
    "z": -3.414557934
  },
  {
    "x": -7.982456684,
    "y": 3.282952547,
    "z": -2.560320377
  },
  {
    "x": -7.917850018,
    "y": 3.505485058,
    "z": -2.452643394
  },
  {
    "x": -8.087740898,
    "y": 4.460221291,
    "z": -2.723031998
  },
  {
    "x": -7.793423176,
    "y": 4.577469349,
    "z": -2.596212387
  },
  {
    "x": -8.444271088,
    "y": 4.929214478,
    "z": -3.065205574
  },
  {
    "x": -8.652446747,
    "y": 4.591826439,
    "z": -3.120240688
  },
  {
    "x": -8.499305725,
    "y": 4.295116425,
    "z": -3.127418995
  },
  {
    "x": -8.585447311,
    "y": 4.230510235,
    "z": -3.45523572
  },
  {
    "x": -8.678767204,
    "y": 3.94576478,
    "z": -3.280559778
  },
  {
    "x": -8.274380684,
    "y": 4.316651821,
    "z": -3.682554007
  },
  {
    "x": -8.633303642,
    "y": 4.615755081,
    "z": -3.625126123
  },
  {
    "x": -9.162117958,
    "y": 4.630111694,
    "z": -3.376272678
  },
  {
    "x": -9.614361763,
    "y": 4.663610935,
    "z": -2.708675385
  },
  {
    "x": -9.741181374,
    "y": 4.945964336,
    "z": -2.409572363
  },
  {
    "x": -9.911071777,
    "y": 5.309673309,
    "z": -2.086541414
  },
  {
    "x": -11.50708389,
    "y": 6.439085484,
    "z": -1.418943882
  },
  {
    "x": -10.18145943,
    "y": 6.029913425,
    "z": -0.806381285
  },
  {
    "x": -9.372685432,
    "y": 5.247459888,
    "z": -0.533599436
  },
  {
    "x": -10.03310585,
    "y": 5.056034088,
    "z": -1.344766378
  },
  {
    "x": -9.623932838,
    "y": 4.840680122,
    "z": -1.349551916
  },
  {
    "x": -9.614361763,
    "y": 4.792823315,
    "z": -1.351944804
  },
  {
    "x": -8.886943817,
    "y": 4.615755081,
    "z": -1.43808639
  },
  {
    "x": -8.164310455,
    "y": 4.472185612,
    "z": -1.251446128
  },
  {
    "x": -7.743173599,
    "y": 4.505684853,
    "z": -1.162911773
  },
  {
    "x": -7.463213921,
    "y": 4.491327763,
    "z": -1.239482045
  },
  {
    "x": -7.350750923,
    "y": 4.44107914,
    "z": -1.270588875
  },
  {
    "x": -6.60419035,
    "y": 4.292723656,
    "z": -1.256231904
  },
  {
    "x": -6.247659683,
    "y": 4.484149933,
    "z": -1.634297967
  },
  {
    "x": -6.546762466,
    "y": 4.436293125,
    "z": -1.95015049
  },
  {
    "x": -7.056434155,
    "y": 4.591826439,
    "z": -2.136790514
  },
  {
    "x": -7.678568363,
    "y": 5.010570526,
    "z": -2.469392776
  },
  {
    "x": -8.159524918,
    "y": 5.536991596,
    "z": -3.108276367
  },
  {
    "x": -9.420542717,
    "y": 6.029913425,
    "z": -3.763910055
  },
  {
    "x": -10.17667484,
    "y": 6.032306194,
    "z": -3.369094133
  },
  {
    "x": -9.346364975,
    "y": 5.300102711,
    "z": -3.337987661
  },
  {
    "x": -8.248059273,
    "y": 4.833501816,
    "z": -3.517449141
  },
  {
    "x": -10.5164547,
    "y": 5.505885124,
    "z": -3.467200041
  },
  {
    "x": -10.03549862,
    "y": 4.895715237,
    "z": -3.127418995
  },
  {
    "x": -8.664410591,
    "y": 4.113262177,
    "z": -2.766102791
  },
  {
    "x": -7.630711555,
    "y": 3.780659914,
    "z": -2.823530912
  },
  {
    "x": -7.453642368,
    "y": 3.634697676,
    "z": -2.426322222
  },
  {
    "x": -7.523034096,
    "y": 3.859622955,
    "z": -2.778067112
  },
  {
    "x": -8.056633949,
    "y": 4.376472473,
    "z": -3.065205574
  },
  {
    "x": -8.169095993,
    "y": 4.130012035,
    "z": -3.024527788
  },
  {
    "x": -8.257630348,
    "y": 4.118047714,
    "z": -3.407379389
  },
  {
    "x": -8.049454689,
    "y": 4.05583477,
    "z": -3.419343472
  },
  {
    "x": -8.391629219,
    "y": 3.979264021,
    "z": -3.457628727
  },
  {
    "x": -8.733802795,
    "y": 3.919443369,
    "z": -3.467200041
  },
  {
    "x": -9.420542717,
    "y": 4.438685894,
    "z": -3.170490026
  },
  {
    "x": -9.860822678,
    "y": 4.395615101,
    "z": -2.837887764
  },
  {
    "x": -10.61934662,
    "y": 4.642076015,
    "z": -2.644068956
  },
  {
    "x": -10.77248859,
    "y": 5.084747791,
    "z": -2.572284222
  },
  {
    "x": -9.427721024,
    "y": 5.192424774,
    "z": -1.897508383
  },
  {
    "x": -10.20538902,
    "y": 5.429314613,
    "z": -2.309073925
  },
  {
    "x": -11.09073353,
    "y": 5.132604122,
    "z": -1.636690617
  },
  {
    "x": -10.80838013,
    "y": 5.64945364,
    "z": -1.67976141
  },
  {
    "x": -10.83948708,
    "y": 5.204389572,
    "z": -1.136590719
  },
  {
    "x": -8.779266357,
    "y": 4.05583477,
    "z": -0.937986493
  },
  {
    "x": -7.877171993,
    "y": 4.264009953,
    "z": -1.440479279
  },
  {
    "x": -7.51346302,
    "y": 4.730610371,
    "z": -1.526620865
  },
  {
    "x": -7.183253765,
    "y": 4.476971149,
    "z": -1.292124271
  },
  {
    "x": -7.417750359,
    "y": 4.687539577,
    "z": -1.026520848
  },
  {
    "x": -7.211967468,
    "y": 4.740181923,
    "z": -0.940379262
  },
  {
    "x": -6.994220734,
    "y": 5.027320385,
    "z": -1.162911773
  },
  {
    "x": -6.824329853,
    "y": 4.95314312,
    "z": -1.476371646
  },
  {
    "x": -6.632904053,
    "y": 4.893322468,
    "z": -1.849651814
  },
  {
    "x": -6.479763508,
    "y": 5.08714056,
    "z": -2.390429735
  },
  {
    "x": -6.884150982,
    "y": 5.163711548,
    "z": -3.512663841
  },
  {
    "x": -7.877171993,
    "y": 5.254639149,
    "z": -3.893122435
  },
  {
    "x": -9.628718376,
    "y": 5.010570526,
    "z": -3.058027506
  },
  {
    "x": -9.427721024,
    "y": 4.563112736,
    "z": -4.125226021
  },
  {
    "x": -8.779266357,
    "y": 4.620540142,
    "z": -4.785645485
  },
  {
    "x": -11.22712326,
    "y": 4.804787636,
    "z": -4.934000015
  },
  {
    "x": -11.55015469,
    "y": 3.888336658,
    "z": -3.572484016
  },
  {
    "x": -10.32981586,
    "y": 1.988435626,
    "z": -2.825923443
  },
  {
    "x": -9.020941734,
    "y": 2.268395662,
    "z": -3.072384119
  },
  {
    "x": -7.932207108,
    "y": 2.976671219,
    "z": -3.060420036
  },
  {
    "x": -7.487142086,
    "y": 3.345165968,
    "z": -2.919243574
  },
  {
    "x": -6.939186096,
    "y": 3.838087559,
    "z": -3.476771355
  },
  {
    "x": -6.910471439,
    "y": 3.940979004,
    "z": -3.457628727
  },
  {
    "x": -7.281359196,
    "y": 4.18504715,
    "z": -3.6299119
  },
  {
    "x": -7.786244869,
    "y": 4.476971149,
    "z": -3.639483213
  },
  {
    "x": -7.99681282,
    "y": 4.476971149,
    "z": -3.450450182
  },
  {
    "x": -8.702695847,
    "y": 4.840680122,
    "z": -3.251846075
  },
  {
    "x": -9.243474007,
    "y": 4.986642361,
    "z": -2.770888567
  },
  {
    "x": -10.0833559,
    "y": 5.058426857,
    "z": -2.012363672
  },
  {
    "x": -11.1505537,
    "y": 5.520241737,
    "z": -1.880758524
  },
  {
    "x": -11.11466122,
    "y": 6.147161484,
    "z": -2.167897224
  },
  {
    "x": -9.334401131,
    "y": 5.912664413,
    "z": -1.964507341
  },
  {
    "x": -9.303294182,
    "y": 5.364708424,
    "z": -1.426122189
  },
  {
    "x": -10.90409184,
    "y": 5.271388054,
    "z": -1.251446128
  },
  {
    "x": -11.86600685,
    "y": 5.034498692,
    "z": -1.385444283
  },
  {
    "x": -10.54516888,
    "y": 4.376472473,
    "z": -0.808773994
  },
  {
    "x": -9.403792381,
    "y": 4.309473515,
    "z": -1.060020447
  },
  {
    "x": -8.827122688,
    "y": 4.465007305,
    "z": -0.823131025
  },
  {
    "x": -8.025527954,
    "y": 4.532006264,
    "z": -0.933200836
  },
  {
    "x": -7.104290962,
    "y": 4.409972191,
    "z": -0.665204704
  },
  {
    "x": -6.900900364,
    "y": 4.756931305,
    "z": -0.940379262
  },
  {
    "x": -6.611368656,
    "y": 4.768895626,
    "z": -1.028913736
  },
  {
    "x": -6.647261143,
    "y": 4.699503899,
    "z": -1.138983607
  },
  {
    "x": -6.88893652,
    "y": 4.744967461,
    "z": -1.392622709
  },
  {
    "x": -7.099504471,
    "y": 4.756931305,
    "z": -1.593619823
  },
  {
    "x": -7.38664341,
    "y": 4.831109047,
    "z": -2.029113531
  },
  {
    "x": -7.934599876,
    "y": 4.914857388,
    "z": -2.79720974
  },
  {
    "x": -8.705088615,
    "y": 4.713860512,
    "z": -3.091526985
  },
  {
    "x": -10.04267597,
    "y": 4.472185612,
    "z": -3.168097258
  },
  {
    "x": -9.556933403,
    "y": 4.247260094,
    "z": -3.311666727
  },
  {
    "x": -9.894321442,
    "y": 4.314259529,
    "z": -4.029513359
  },
  {
    "x": -11.43769264,
    "y": 4.785645485,
    "z": -4.479363918
  },
  {
    "x": -10.45424175,
    "y": 3.909872293,
    "z": -3.66101861
  },
  {
    "x": -9.20758152,
    "y": 2.928815126,
    "z": -3.294916868
  },
  {
    "x": -8.468198776,
    "y": 2.878565788,
    "z": -3.036492109
  },
  {
    "x": -7.72163868,
    "y": 2.991028309,
    "z": -2.928815126
  },
  {
    "x": -7.625925541,
    "y": 3.282952547,
    "z": -2.857030153
  },
  {
    "x": -7.757531166,
    "y": 3.641876221,
    "z": -3.192025185
  },
  {
    "x": -8.451449394,
    "y": 3.684947014,
    "z": -3.146562099
  },
  {
    "x": -8.350951195,
    "y": 3.479164124,
    "z": -3.282952547
  },
  {
    "x": -8.114061356,
    "y": 3.239881754,
    "z": -3.337987661
  },
  {
    "x": -8.286344528,
    "y": 3.488735676,
    "z": -3.21356082
  },
  {
    "x": -8.807979584,
    "y": 3.668196917,
    "z": -3.117847919
  },
  {
    "x": -9.413363457,
    "y": 3.85244441,
    "z": -2.84267354
  },
  {
    "x": -9.047262192,
    "y": 4.074976921,
    "z": -2.311466694
  },
  {
    "x": -9.74835968,
    "y": 4.498506546,
    "z": -2.409572363
  },
  {
    "x": -10.73180866,
    "y": 5.008177757,
    "z": -2.445464611
  },
  {
    "x": -11.9473629,
    "y": 5.733203411,
    "z": -1.988435626
  },
  {
    "x": -9.585646629,
    "y": 5.118247986,
    "z": -1.371087313
  },
  {
    "x": -9.46361351,
    "y": 4.639683247,
    "z": -1.076770186
  },
  {
    "x": -10.31785202,
    "y": 6.216552734,
    "z": -1.629512191
  },
  {
    "x": -10.29392242,
    "y": 6.302694321,
    "z": -1.799402714
  },
  {
    "x": -9.611968994,
    "y": 6.163911343,
    "z": -1.440479279
  },
  {
    "x": -8.506484032,
    "y": 5.228317261,
    "z": -1.392622709
  },
  {
    "x": -8.420342445,
    "y": 5.364708424,
    "z": -1.584048629
  },
  {
    "x": -8.372486115,
    "y": 4.756931305,
    "z": -1.545763493
  },
  {
    "x": -7.977671146,
    "y": 4.534398556,
    "z": -1.512263894
  },
  {
    "x": -7.496713638,
    "y": 4.484149933,
    "z": -1.610369682
  },
  {
    "x": -6.819544315,
    "y": 4.31904459,
    "z": -1.840080619
  },
  {
    "x": -6.42472887,
    "y": 4.271188736,
    "z": -1.981257081
  },
  {
    "x": -6.642475128,
    "y": 3.8715868,
    "z": -2.294716835
  },
  {
    "x": -6.463014126,
    "y": 3.634697676,
    "z": -2.490928411
  },
  {
    "x": -6.786045074,
    "y": 3.632304668,
    "z": -2.900100946
  },
  {
    "x": -7.369894028,
    "y": 3.94576478,
    "z": -4.182653904
  },
  {
    "x": -9.631111145,
    "y": 4.350151539,
    "z": -4.26879549
  },
  {
    "x": -10.61934662,
    "y": 4.232903004,
    "z": -4.436293125
  },
  {
    "x": -9.229117393,
    "y": 3.555734634,
    "z": -4.867001534
  },
  {
    "x": -10.15513992,
    "y": 3.811766624,
    "z": -4.804787636
  },
  {
    "x": -10.31067276,
    "y": 4.031906128,
    "z": -4.292723656
  },
  {
    "x": -9.839285851,
    "y": 3.029313326,
    "z": -3.594019651
  },
  {
    "x": -9.032905579,
    "y": 2.22053957,
    "z": -3.079562902
  },
  {
    "x": -8.061419487,
    "y": 2.572284222,
    "z": -3.034099102
  },
  {
    "x": -7.623533249,
    "y": 3.40259409,
    "z": -3.050848961
  },
  {
    "x": -7.678568363,
    "y": 3.718446255,
    "z": -3.211168051
  },
  {
    "x": -8.195417404,
    "y": 3.950549841,
    "z": -3.488735676
  },
  {
    "x": -8.74576664,
    "y": 3.601198196,
    "z": -3.617947817
  },
  {
    "x": -8.67398262,
    "y": 3.416950703,
    "z": -3.627518892
  },
  {
    "x": -8.67398262,
    "y": 3.412164927,
    "z": -3.469593048
  },
  {
    "x": -8.583055496,
    "y": 3.43609333,
    "z": -3.381058455
  },
  {
    "x": -8.609375954,
    "y": 3.608376265,
    "z": -2.995814085
  },
  {
    "x": -8.953942299,
    "y": 3.931407452,
    "z": -2.871387243
  },
  {
    "x": -9.164510727,
    "y": 4.28315258,
    "z": -2.711068153
  },
  {
    "x": -10.19581604,
    "y": 4.661218643,
    "z": -2.512463808
  },
  {
    "x": -10.3226366,
    "y": 4.95314312,
    "z": -2.577069998
  },
  {
    "x": -10.00917721,
    "y": 5.467599869,
    "z": -3.000599623
  },
  {
    "x": -8.772088051,
    "y": 5.106283188,
    "z": -2.081755638
  },
  {
    "x": -10.82752228,
    "y": 5.072784424,
    "z": -1.861616015
  },
  {
    "x": -11.58365345,
    "y": 5.082355499,
    "z": -1.366301775
  },
  {
    "x": -10.54516888,
    "y": 4.92442894,
    "z": -1.270588875
  },
  {
    "x": -9.52104187,
    "y": 5.046462536,
    "z": -1.488335609
  },
  {
    "x": -9.444471359,
    "y": 4.615755081,
    "z": -1.292124271
  },
  {
    "x": -9.372685432,
    "y": 3.957728624,
    "z": -1.148554921
  },
  {
    "x": -8.906085968,
    "y": 3.921836376,
    "z": -1.100698352
  },
  {
    "x": -8.362915039,
    "y": 4.228117943,
    "z": -1.060020447
  },
  {
    "x": -7.84845829,
    "y": 4.247260094,
    "z": -1.268196106
  },
  {
    "x": -7.467998981,
    "y": 4.146761417,
    "z": -1.43808639
  },
  {
    "x": -6.690331936,
    "y": 4.163511276,
    "z": -1.746760488
  },
  {
    "x": -6.551548481,
    "y": 4.206582069,
    "z": -2.232503653
  },
  {
    "x": -6.644868374,
    "y": 4.0630126,
    "z": -2.799602747
  },
  {
    "x": -6.807580471,
    "y": 4.003192425,
    "z": -3.318845034
  },
  {
    "x": -6.87457943,
    "y": 4.118047714,
    "z": -4.039084435
  },
  {
    "x": -7.35792923,
    "y": 4.804787636,
    "z": -4.359722614
  },
  {
    "x": -8.295915604,
    "y": 5.00339222,
    "z": -4.639683247
  },
  {
    "x": -10.14317608,
    "y": 5.386244297,
    "z": -4.302295208
  },
  {
    "x": -10.24128151,
    "y": 5.565705299,
    "z": -4.472185612
  },
  {
    "x": -9.054441452,
    "y": 5.168497086,
    "z": -4.38365078
  },
  {
    "x": -9.408578873,
    "y": 5.551348686,
    "z": -4.278366566
  },
  {
    "x": -9.49232769,
    "y": 4.984249592,
    "z": -3.211168051
  },
  {
    "x": -8.95154953,
    "y": 3.598805428,
    "z": -2.873780012
  },
  {
    "x": -8.082954407,
    "y": 3.548555851,
    "z": -2.703889608
  },
  {
    "x": -7.728816509,
    "y": 3.570091248,
    "z": -2.502892256
  },
  {
    "x": -8.228917122,
    "y": 3.847658634,
    "z": -2.569891453
  },
  {
    "x": -7.987241268,
    "y": 3.826123238,
    "z": -2.46221447
  },
  {
    "x": -8.200202942,
    "y": 3.821337461,
    "z": -2.780460119
  },
  {
    "x": -8.011170387,
    "y": 3.61076951,
    "z": -2.871387243
  },
  {
    "x": -8.015955925,
    "y": 3.565305471,
    "z": -3.139383078
  },
  {
    "x": -8.257630348,
    "y": 3.534198999,
    "z": -3.235095978
  },
  {
    "x": -8.293522835,
    "y": 3.330809116,
    "z": -3.038884878
  },
  {
    "x": -8.36052227,
    "y": 3.964907169,
    "z": -3.184847116
  },
  {
    "x": -8.568697929,
    "y": 4.479363918,
    "z": -3.172882795
  },
  {
    "x": -9.159724236,
    "y": 4.823930264,
    "z": -3.282952547
  },
  {
    "x": -9.844072342,
    "y": 4.871786594,
    "z": -3.220739365
  },
  {
    "x": -11.04526806,
    "y": 5.477170467,
    "z": -3.335594893
  },
  {
    "x": -10.4853487,
    "y": 5.352744102,
    "z": -2.691925526
  },
  {
    "x": -8.702695847,
    "y": 5.185246468,
    "z": -2.103291035
  },
  {
    "x": -10.21017456,
    "y": 5.285745621,
    "z": -1.797009826
  },
  {
    "x": -11.42094326,
    "y": 5.639883518,
    "z": -1.497907043
  },
  {
    "x": -9.868000031,
    "y": 4.917250633,
    "z": -0.873380244
  },
  {
    "x": -9.032905579,
    "y": 4.663610935,
    "z": -1.131805182
  },
  {
    "x": -9.269794464,
    "y": 4.725824833,
    "z": -0.866201818
  },
  {
    "x": -8.843873024,
    "y": 4.218546391,
    "z": -0.684347272
  },
  {
    "x": -8.468198776,
    "y": 4.256831646,
    "z": -0.624526739
  },
  {
    "x": -8.020741463,
    "y": 4.654040337,
    "z": -0.818345308
  },
  {
    "x": -7.776673317,
    "y": 4.663610935,
    "z": -0.866201818
  },
  {
    "x": -7.338787079,
    "y": 4.689932346,
    "z": -0.820738137
  },
  {
    "x": -6.752545357,
    "y": 4.749752522,
    "z": -1.272981524
  },
  {
    "x": -6.506085396,
    "y": 4.876572609,
    "z": -1.713261008
  },
  {
    "x": -6.415157318,
    "y": 4.862215519,
    "z": -2.457428694
  },
  {
    "x": -6.979863644,
    "y": 4.677968502,
    "z": -3.30927372
  },
  {
    "x": -7.331608772,
    "y": 4.606183529,
    "z": -3.823730707
  },
  {
    "x": -8.15473938,
    "y": 4.785645485,
    "z": -4.474578381
  },
  {
    "x": -9.221939087,
    "y": 4.637290478,
    "z": -4.476971149
  },
  {
    "x": -10.25324535,
    "y": 5.125426292,
    "z": -4.601397991
  },
  {
    "x": -8.185846329,
    "y": 5.108676434,
    "z": -4.596612453
  },
  {
    "x": -8.327022552,
    "y": 4.694717884,
    "z": -4.278366566
  },
  {
    "x": -9.949356079,
    "y": 5.419743538,
    "z": -3.684947014
  },
  {
    "x": -9.573683739,
    "y": 4.670789719,
    "z": -3.23031044
  },
  {
    "x": -9.142975807,
    "y": 4.345366001,
    "z": -2.737389088
  },
  {
    "x": -8.848658562,
    "y": 4.44107914,
    "z": -2.656033039
  },
  {
    "x": -8.432307243,
    "y": 4.187439442,
    "z": -2.208575249
  },
  {
    "x": -8.365307808,
    "y": 4.022334576,
    "z": -2.11046958
  },
  {
    "x": -8.322237015,
    "y": 3.972085476,
    "z": -2.215753794
  },
  {
    "x": -8.224131584,
    "y": 3.964907169,
    "z": -2.330609322
  },
  {
    "x": -8.178668022,
    "y": 4.000799656,
    "z": -2.471785784
  },
  {
    "x": -7.968099594,
    "y": 3.845265865,
    "z": -2.620140791
  },
  {
    "x": -7.745566845,
    "y": 3.632304668,
    "z": -2.524427891
  },
  {
    "x": -8.169095993,
    "y": 3.594019651,
    "z": -2.550748825
  },
  {
    "x": -8.166703224,
    "y": 3.646661758,
    "z": -2.400001049
  },
  {
    "x": -8.846265793,
    "y": 4.235295773,
    "z": -2.684746981
  },
  {
    "x": -9.276973724,
    "y": 4.28315258,
    "z": -2.531606436
  },
  {
    "x": -10.3154583,
    "y": 4.838287354,
    "z": -2.938385963
  },
  {
    "x": -11.40897751,
    "y": 5.185246468,
    "z": -2.964707375
  },
  {
    "x": -11.00937748,
    "y": 5.352744102,
    "z": -2.66799736
  },
  {
    "x": -9.135796547,
    "y": 5.237888813,
    "z": -2.22053957
  },
  {
    "x": -10.7054882,
    "y": 5.125426292,
    "z": -2.019542217
  },
  {
    "x": -10.81077194,
    "y": 4.654040337,
    "z": -1.143769264
  },
  {
    "x": -10.42552853,
    "y": 4.503292084,
    "z": -1.141376376
  },
  {
    "x": -9.140583038,
    "y": 4.249652863,
    "z": -0.902094066
  },
  {
    "x": -8.640481949,
    "y": 4.122833252,
    "z": -0.643669307
  },
  {
    "x": -7.776673317,
    "y": 4.232903004,
    "z": -0.933200836
  },
  {
    "x": -7.841279984,
    "y": 4.34775877,
    "z": -0.926022351
  },
  {
    "x": -7.647461414,
    "y": 4.429114819,
    "z": -1.062413216
  },
  {
    "x": -7.324430466,
    "y": 4.414757729,
    "z": -1.282552838
  },
  {
    "x": -7.281359196,
    "y": 4.493720531,
    "z": -1.619940877
  },
  {
    "x": -7.027719975,
    "y": 4.515256405,
    "z": -1.914258003
  },
  {
    "x": -7.140182495,
    "y": 4.381258488,
    "z": -2.282752752
  },
  {
    "x": -7.204789162,
    "y": 4.249652863,
    "z": -2.510070801
  },
  {
    "x": -7.645068169,
    "y": 4.417150497,
    "z": -2.991028309
  },
  {
    "x": -7.824529648,
    "y": 4.488935471,
    "z": -3.651447058
  },
  {
    "x": -8.609375954,
    "y": 4.701896191,
    "z": -3.562912941
  },
  {
    "x": -10.87298489,
    "y": 4.938785553,
    "z": -3.857230186
  },
  {
    "x": -9.530611992,
    "y": 4.558327198,
    "z": -4.180261135
  },
  {
    "x": -9.020941734,
    "y": 4.450649738,
    "z": -4.302295208
  },
  {
    "x": -9.968499184,
    "y": 4.701896191,
    "z": -4.101297855
  },
  {
    "x": -10.02831936,
    "y": 4.051048756,
    "z": -3.079562902
  },
  {
    "x": -8.965906143,
    "y": 3.153740168,
    "z": -2.694318056
  },
  {
    "x": -8.379664421,
    "y": 3.321237564,
    "z": -2.553141594
  },
  {
    "x": -7.917850018,
    "y": 3.663411379,
    "z": -2.349751949
  },
  {
    "x": -7.853243828,
    "y": 3.955335617,
    "z": -2.581855774
  },
  {
    "x": -7.879564762,
    "y": 3.75673151,
    "z": -3.09870553
  },
  {
    "x": -8.197811127,
    "y": 3.570091248,
    "z": -3.323630571
  },
  {
    "x": -8.142775536,
    "y": 3.558127403,
    "z": -3.548555851
  },
  {
    "x": -8.166703224,
    "y": 3.625126123,
    "z": -3.797409296
  },
  {
    "x": -8.334200859,
    "y": 3.591626883,
    "z": -3.50069952
  },
  {
    "x": -8.551947594,
    "y": 3.830909014,
    "z": -3.476771355
  },
  {
    "x": -8.776873589,
    "y": 4.165904045,
    "z": -3.335594893
  },
  {
    "x": -9.00179863,
    "y": 4.247260094,
    "z": -2.902493954
  },
  {
    "x": -9.293723106,
    "y": 4.417150497,
    "z": -2.55792737
  },
  {
    "x": -11.33480072,
    "y": 5.027320385,
    "z": -2.785245419
  },
  {
    "x": -12.15075302,
    "y": 5.324030399,
    "z": -2.584248543
  },
  {
    "x": -9.588040352,
    "y": 4.852644444,
    "z": -2.390429735
  },
  {
    "x": -7.939385414,
    "y": 4.620540142,
    "z": -1.495514154
  },
  {
    "x": -9.915856361,
    "y": 4.819144726,
    "z": -1.069591641
  },
  {
    "x": -10.87777138,
    "y": 5.601597786,
    "z": -1.368694544
  },
  {
    "x": -10.40877914,
    "y": 5.261816978,
    "z": -0.966700375
  },
  {
    "x": -9.528220177,
    "y": 5.108676434,
    "z": -0.954736292
  },
  {
    "x": -8.831908226,
    "y": 4.723432064,
    "z": -1.148554921
  },
  {
    "x": -8.248059273,
    "y": 4.259224415,
    "z": -0.949950576
  },
  {
    "x": -7.728816509,
    "y": 4.429114819,
    "z": -1.146162033
  },
  {
    "x": -7.503891945,
    "y": 4.835894108,
    "z": -1.146162033
  },
  {
    "x": -7.331608772,
    "y": 4.565505505,
    "z": -1.349551916
  },
  {
    "x": -7.243074417,
    "y": 4.610969543,
    "z": -2.14157629
  },
  {
    "x": -7.269395351,
    "y": 4.443471909,
    "z": -2.385644197
  },
  {
    "x": -7.697710037,
    "y": 4.206582069,
    "z": -3.031706333
  },
  {
    "x": -7.975277901,
    "y": 4.261617184,
    "z": -3.32602334
  },
  {
    "x": -8.585447311,
    "y": 4.522434711,
    "z": -4.000799656
  },
  {
    "x": -8.807979584,
    "y": 4.295116425,
    "z": -4.307080746
  },
  {
    "x": -9.269794464,
    "y": 4.235295773,
    "z": -4.194617748
  },
  {
    "x": -7.34357214,
    "y": 4.003192425,
    "z": -4.768895626
  },
  {
    "x": -8.140382767,
    "y": 4.400401115,
    "z": -4.613362312
  },
  {
    "x": -9.212367058,
    "y": 3.952943087,
    "z": -3.335594893
  },
  {
    "x": -8.898907661,
    "y": 3.349951744,
    "z": -3.072384119
  },
  {
    "x": -8.863015175,
    "y": 3.467200041,
    "z": -2.991028309
  },
  {
    "x": -8.401200294,
    "y": 3.562912941,
    "z": -2.849851608
  },
  {
    "x": -8.226524353,
    "y": 3.237488747,
    "z": -2.533999205
  },
  {
    "x": -8.300702095,
    "y": 3.065205574,
    "z": -2.505285263
  },
  {
    "x": -7.951349258,
    "y": 3.046063185,
    "z": -2.275574446
  },
  {
    "x": -7.936993122,
    "y": 3.749552965,
    "z": -2.94317174
  },
  {
    "x": -8.087740898,
    "y": 4.12761879,
    "z": -3.287738323
  },
  {
    "x": -8.508876801,
    "y": 4.12761879,
    "z": -3.498306513
  },
  {
    "x": -8.341379166,
    "y": 3.816552162,
    "z": -3.522234917
  },
  {
    "x": -8.752944946,
    "y": 3.656232834,
    "z": -3.524627924
  },
  {
    "x": -9.109475136,
    "y": 3.64426899,
    "z": -3.40498662
  },
  {
    "x": -9.011369705,
    "y": 4.161118507,
    "z": -3.27577424
  },
  {
    "x": -9.44207859,
    "y": 4.33340168,
    "z": -3.127418995
  },
  {
    "x": -10.1144619,
    "y": 4.314259529,
    "z": -3.010170937
  },
  {
    "x": -10.68156147,
    "y": 4.409972191,
    "z": -2.928815126
  },
  {
    "x": -10.91366386,
    "y": 4.838287354,
    "z": -3.110669374
  },
  {
    "x": -9.355937004,
    "y": 4.661218643,
    "z": -2.914458036
  },
  {
    "x": -9.62154007,
    "y": 3.94576478,
    "z": -2.277967215
  },
  {
    "x": -10.51884747,
    "y": 3.864408255,
    "z": -2.143969059
  },
  {
    "x": -10.50688457,
    "y": 3.938585997,
    "z": -1.825723529
  },
  {
    "x": -10.44227791,
    "y": 4.170689583,
    "z": -1.64626205
  },
  {
    "x": -9.516255379,
    "y": 3.972085476,
    "z": -1.488335609
  },
  {
    "x": -8.358129501,
    "y": 3.71126771,
    "z": -1.454836249
  },
  {
    "x": -7.769494534,
    "y": 3.713660717,
    "z": -1.605584025
  },
  {
    "x": -7.680960178,
    "y": 3.385844231,
    "z": -1.47158587
  },
  {
    "x": -7.250252247,
    "y": 3.187239647,
    "z": -1.55054903
  },
  {
    "x": -7.121039391,
    "y": 3.280559778,
    "z": -1.684547067
  },
  {
    "x": -7.216752529,
    "y": 3.438485861,
    "z": -1.875972986
  },
  {
    "x": -7.85563612,
    "y": 3.548555851,
    "z": -2.203789473
  },
  {
    "x": -8.760124207,
    "y": 3.792623758,
    "z": -2.569891453
  },
  {
    "x": -9.102297783,
    "y": 3.818945169,
    "z": -3.299702644
  },
  {
    "x": -9.320044518,
    "y": 3.912264824,
    "z": -3.924229145
  },
  {
    "x": -9.836893082,
    "y": 3.943371773,
    "z": -4.070191383
  },
  {
    "x": -9.353544235,
    "y": 3.955335617,
    "z": -4.620540142
  },
  {
    "x": -8.626125336,
    "y": 4.247260094,
    "z": -4.747360229
  },
  {
    "x": -9.568897247,
    "y": 4.340579987,
    "z": -4.510470867
  },
  {
    "x": -9.566505432,
    "y": 3.830909014,
    "z": -3.828516006
  },
  {
    "x": -8.740981102,
    "y": 3.010170937,
    "z": -3.208775282
  },
  {
    "x": -7.649853706,
    "y": 3.120240688,
    "z": -2.780460119
  },
  {
    "x": -7.228717327,
    "y": 3.201596737,
    "z": -2.438286304
  },
  {
    "x": -7.628318787,
    "y": 3.71126771,
    "z": -2.562713146
  },
  {
    "x": -8.319844246,
    "y": 3.893122435,
    "z": -2.770888567
  },
  {
    "x": -8.525627136,
    "y": 3.802195072,
    "z": -2.873780012
  },
  {
    "x": -8.334200859,
    "y": 3.795016766,
    "z": -3.282952547
  },
  {
    "x": -8.36052227,
    "y": 3.620340586,
    "z": -3.32602334
  },
  {
    "x": -8.343771935,
    "y": 3.503092289,
    "z": -3.608376265
  },
  {
    "x": -8.226524353,
    "y": 3.620340586,
    "z": -3.670589685
  },
  {
    "x": -8.587841034,
    "y": 3.876372576,
    "z": -3.905086756
  },
  {
    "x": -8.860621452,
    "y": 3.938585997,
    "z": -3.88594389
  },
  {
    "x": -9.121439934,
    "y": 4.292723656,
    "z": -3.854837418
  },
  {
    "x": -9.530611992,
    "y": 4.453042984,
    "z": -3.66101861
  },
  {
    "x": -10.34177971,
    "y": 4.761716843,
    "z": -3.369094133
  },
  {
    "x": -11.29890728,
    "y": 5.481956482,
    "z": -3.347558975
  },
  {
    "x": -9.248259544,
    "y": 4.945964336,
    "z": -2.584248543
  },
  {
    "x": -8.171488762,
    "y": 4.890929222,
    "z": -2.20618248
  },
  {
    "x": -8.348558426,
    "y": 5.324030399,
    "z": -1.966900229
  },
  {
    "x": -9.767501831,
    "y": 6.116055012,
    "z": -2.189432859
  },
  {
    "x": -9.403792381,
    "y": 6.022734642,
    "z": -1.459621787
  },
  {
    "x": -9.370293617,
    "y": 7.135397434,
    "z": -1.682154298
  },
  {
    "x": -9.131011009,
    "y": 7.056434155,
    "z": -1.634297967
  },
  {
    "x": -8.685946465,
    "y": 7.020541668,
    "z": -1.34237349
  },
  {
    "x": -7.896315098,
    "y": 8.1260252,
    "z": -1.548156142
  },
  {
    "x": -8.590232849,
    "y": 9.619147301,
    "z": -1.289731503
  },
  {
    "x": -7.714460373,
    "y": 6.326622963,
    "z": -0.961914659
  },
  {
    "x": -5.922235966,
    "y": 4.321437359,
    "z": -0.789631486
  },
  {
    "x": -5.994020462,
    "y": 3.469593048,
    "z": -0.626919508
  },
  {
    "x": -5.797809601,
    "y": 2.983849764,
    "z": -0.54317075
  },
  {
    "x": -5.223531246,
    "y": 1.916650891,
    "z": -0.746560633
  },
  {
    "x": -5.807380676,
    "y": 1.658226013,
    "z": -1.459621787
  },
  {
    "x": -7.51346302,
    "y": 2.14157629,
    "z": -2.450250387
  },
  {
    "x": -10.92084217,
    "y": 3.457628727,
    "z": -2.100898266
  },
  {
    "x": -14.28275871,
    "y": 7.719245911,
    "z": -4.912464619
  },
  {
    "x": -18.93201256,
    "y": 13.03131104,
    "z": -9.016156197
  },
  {
    "x": -14.90967846,
    "y": 13.96451283,
    "z": -7.599604607
  },
  {
    "x": -6.951149464,
    "y": 12.85185146,
    "z": -6.434299946
  },
  {
    "x": -1.557727575,
    "y": 10.98784161,
    "z": -6.003591537
  },
  {
    "x": 1.952543378,
    "y": 8.018348694,
    "z": -2.993421316
  },
  {
    "x": 3.818945169,
    "y": 7.262216091,
    "z": -3.438485861
  },
  {
    "x": 4.041477203,
    "y": 4.639683247,
    "z": -2.495714188
  },
  {
    "x": 3.24466753,
    "y": 3.838087559,
    "z": -0.433100909
  },
  {
    "x": 2.663211584,
    "y": 4.661218643,
    "z": 0.624526739
  },
  {
    "x": 2.852244377,
    "y": 11.44965649,
    "z": -0.957129002
  },
  {
    "x": -7.764709949,
    "y": 34.33939743,
    "z": -0.739382207
  },
  {
    "x": -20.02792549,
    "y": 36.00719452,
    "z": 1.186840057
  },
  {
    "x": -12.49053478,
    "y": 14.136796,
    "z": 1.387837172
  },
  {
    "x": -10.64327526,
    "y": 3.962514162,
    "z": 3.141776323
  },
  {
    "x": -9.20040226,
    "y": -2.263610363,
    "z": 4.051048756
  },
  {
    "x": -6.467799664,
    "y": -6.776473522,
    "z": 2.670390368
  },
  {
    "x": -5.592026711,
    "y": -5.398207664,
    "z": 1.43808639
  },
  {
    "x": -6.04187727,
    "y": -1.832902193,
    "z": -2.079362869
  },
  {
    "x": -10.11924648,
    "y": 9.734003067,
    "z": -4.31904459
  },
  {
    "x": -19.4895401,
    "y": 28.38126945,
    "z": -7.022934437
  },
  {
    "x": -11.01177025,
    "y": 26.83550453,
    "z": -7.731209755
  },
  {
    "x": -2.445464611,
    "y": 13.08156109,
    "z": -4.871786594
  },
  {
    "x": 2.136790514,
    "y": 7.786244869,
    "z": -1.823330879
  },
  {
    "x": 5.759523869,
    "y": 5.254639149,
    "z": -2.627319574
  },
  {
    "x": 6.991827488,
    "y": 3.704089403,
    "z": -1.957328796
  },
  {
    "x": 7.302894115,
    "y": 5.041677952,
    "z": -0.634098053
  },
  {
    "x": 6.096912384,
    "y": 4.472185612,
    "z": 0.818345308
  },
  {
    "x": 8.207381248,
    "y": 11.39701366,
    "z": -0.394815743
  },
  {
    "x": -5.668596745,
    "y": 33.01616669,
    "z": 0.141176537
  },
  {
    "x": -17.0297184,
    "y": 40.03192139,
    "z": 0.770488918
  },
  {
    "x": -15.79980659,
    "y": 17.84327888,
    "z": 0.418743968
  },
  {
    "x": -12.03111267,
    "y": 9.406186104,
    "z": 1.062413216
  },
  {
    "x": -9.142975807,
    "y": 4.371686935,
    "z": 0.732203782
  },
  {
    "x": -6.372087002,
    "y": 1.268196106,
    "z": 2.108076811
  },
  {
    "x": -4.634897232,
    "y": -1.61515522,
    "z": 2.47896409
  },
  {
    "x": -3.728017807,
    "y": -3.273381233,
    "z": 2.11046958
  },
  {
    "x": -3.093919754,
    "y": -3.259024382,
    "z": 1.349551916
  },
  {
    "x": -1.847258925,
    "y": -2.029113531,
    "z": -1.325623631
  },
  {
    "x": -4.721039295,
    "y": 8.140382767,
    "z": -3.608376265
  },
  {
    "x": -15.16810322,
    "y": 32.75534821,
    "z": -5.630311966
  },
  {
    "x": -9.57129097,
    "y": 35.93780136,
    "z": -6.738188267
  },
  {
    "x": 1.050449133,
    "y": 14.17029572,
    "z": -5.678168297
  },
  {
    "x": 3.672982693,
    "y": 6.898508072,
    "z": -2.184647083
  },
  {
    "x": 5.462814331,
    "y": 3.598805428,
    "z": -1.744367838
  },
  {
    "x": 4.517649174,
    "y": 2.254039049,
    "z": -1.660618782
  },
  {
    "x": 4.797609329,
    "y": 1.830509305,
    "z": -0.985842943
  },
  {
    "x": 5.225924492,
    "y": 1.816152334,
    "z": -0.021535406
  },
  {
    "x": 5.927021503,
    "y": 4.290330887,
    "z": 1.74197495
  },
  {
    "x": 4.687539577,
    "y": 19.70010757,
    "z": -0.373280317
  },
  {
    "x": -7.494320393,
    "y": 37.03610992,
    "z": 0.746560633
  },
  {
    "x": -16.13719559,
    "y": 35.80619812,
    "z": -1.911865354
  },
  {
    "x": -10.38963604,
    "y": 16.57986832,
    "z": -0.083748788
  },
  {
    "x": -8.391629219,
    "y": 9.865608215,
    "z": -0.870987475
  },
  {
    "x": -7.01575613,
    "y": 4.170689583,
    "z": -0.521635354
  },
  {
    "x": -5.163711548,
    "y": 1.081555843,
    "z": 0.545563519
  },
  {
    "x": -3.69212532,
    "y": -1.581655741,
    "z": 0.918843865
  },
  {
    "x": -2.976671219,
    "y": -3.862015963,
    "z": 1.526620865
  },
  {
    "x": -1.770688653,
    "y": -4.211367607,
    "z": 0.356530547
  },
  {
    "x": -0.296710014,
    "y": -3.024527788,
    "z": -1.292124271
  },
  {
    "x": -0.70348984,
    "y": 4.651647091,
    "z": -4.278366566
  },
  {
    "x": -13.40698433,
    "y": 31.79104042,
    "z": -11.35633659
  },
  {
    "x": -11.56929684,
    "y": 32.65724182,
    "z": -10.41356468
  },
  {
    "x": -3.036492109,
    "y": 9.750752449,
    "z": -6.637690067
  },
  {
    "x": 1.569691539,
    "y": 3.591626883,
    "z": -3.706482172
  },
  {
    "x": 5.513063908,
    "y": 4.479363918,
    "z": -2.098505497
  },
  {
    "x": 7.202396393,
    "y": 4.78085947,
    "z": -1.024128079
  },
  {
    "x": 7.434500217,
    "y": 2.179861307,
    "z": -0.011964113
  },
  {
    "x": 5.730810642,
    "y": 0.46420759,
    "z": 0.492921472
  },
  {
    "x": 7.149754047,
    "y": 1.514656663,
    "z": 1.512263894
  },
  {
    "x": 6.594619274,
    "y": 22.66720963,
    "z": -0.971485972
  },
  {
    "x": -8.575876236,
    "y": 47.72962952,
    "z": -1.899901152
  },
  {
    "x": -14.96949768,
    "y": 31.92264748,
    "z": 0.394815743
  },
  {
    "x": -10.6480608,
    "y": 13.87119293,
    "z": 0.263210475
  },
  {
    "x": -9.12861824,
    "y": 7.116254807,
    "z": -0.868594587
  },
  {
    "x": -7.664210796,
    "y": 2.04586339,
    "z": 1.24666059
  },
  {
    "x": -6.783651829,
    "y": -3.467200041,
    "z": 2.60817647
  },
  {
    "x": -3.529413223,
    "y": -7.252645493,
    "z": 1.957328796
  },
  {
    "x": -2.146361828,
    "y": -6.032306194,
    "z": 2.093719721
  },
  {
    "x": -2.737389088,
    "y": -1.495514154,
    "z": -0.141176537
  },
  {
    "x": -7.977671146,
    "y": 21.63350868,
    "z": -9.099905014
  },
  {
    "x": -18.97986984,
    "y": 41.82893372,
    "z": -6.285945415
  },
  {
    "x": -4.938785553,
    "y": 30.15913582,
    "z": -4.216153622
  },
  {
    "x": 1.64626205,
    "y": 10.3657074,
    "z": -2.19182539
  },
  {
    "x": 6.02752018,
    "y": 4.821537495,
    "z": -1.823330879
  },
  {
    "x": 7.467998981,
    "y": 3.495913744,
    "z": -1.35673058
  },
  {
    "x": 6.867401123,
    "y": 1.722832441,
    "z": -1.308874011
  },
  {
    "x": 6.474977493,
    "y": 0.586241543,
    "z": 0.490528643
  },
  {
    "x": 5.312066078,
    "y": 2.756531954,
    "z": 1.0863415
  },
  {
    "x": 7.544569969,
    "y": 15.57488251,
    "z": -1.868794322
  },
  {
    "x": -2.706282377,
    "y": 34.51407623,
    "z": -1.734796524
  },
  {
    "x": -11.64347363,
    "y": 35.14577866,
    "z": -2.804388046
  },
  {
    "x": -10.17188835,
    "y": 16.54397583,
    "z": -1.16769743
  },
  {
    "x": -8.848658562,
    "y": 8.764908791,
    "z": -1.883151412
  },
  {
    "x": -8.592625618,
    "y": 4.094119549,
    "z": -0.356530547
  },
  {
    "x": -8.819944382,
    "y": 0.069391862,
    "z": 1.43808639
  },
  {
    "x": -5.302494526,
    "y": -6.195017815,
    "z": 4.704289436
  },
  {
    "x": -1.825723529,
    "y": -8.762516975,
    "z": 1.564906001
  },
  {
    "x": -1.813759446,
    "y": -4.637290478,
    "z": -0.323031068
  },
  {
    "x": -4.80957365,
    "y": 6.226124287,
    "z": -3.814159393
  },
  {
    "x": -14.84028625,
    "y": 34.20300674,
    "z": -11.31805038
  },
  {
    "x": -7.255037785,
    "y": 37.07917786,
    "z": -7.41535759
  },
  {
    "x": -1.375873089,
    "y": 13.58883953,
    "z": -5.084747791
  },
  {
    "x": 2.189432859,
    "y": 6.240481377,
    "z": -4.500899315
  },
  {
    "x": 5.587240696,
    "y": 4.747360229,
    "z": -2.754138947
  },
  {
    "x": 5.654239655,
    "y": 3.232703686,
    "z": -1.713261008
  },
  {
    "x": 5.18046093,
    "y": 1.208375454,
    "z": -0.028713871
  },
  {
    "x": 5.33599472,
    "y": 1.21555388,
    "z": -0.045463633
  },
  {
    "x": 7.216752529,
    "y": 4.031906128,
    "z": -0.028713871
  },
  {
    "x": 6.941578388,
    "y": 20.55673981,
    "z": -1.59840548
  },
  {
    "x": -5.343173027,
    "y": 38.43351746,
    "z": -6.295516491
  },
  {
    "x": -11.00459099,
    "y": 28.49133873,
    "z": -8.202595711
  },
  {
    "x": -9.489934921,
    "y": 14.83550072,
    "z": -5.187639236
  },
  {
    "x": -7.290930748,
    "y": 9.243474007,
    "z": -3.223132133
  },
  {
    "x": -6.886543274,
    "y": 4.046263218,
    "z": -0.547956347
  },
  {
    "x": -5.965306759,
    "y": 0.772881746,
    "z": 0.619741023
  },
  {
    "x": -4.225724697,
    "y": -1.600798368,
    "z": 1.036092162
  },
  {
    "x": -2.624926567,
    "y": -3.34038043,
    "z": 0.643669307
  },
  {
    "x": -2.04586339,
    "y": -3.105883598,
    "z": -0.605384111
  },
  {
    "x": -0.148355007,
    "y": 0.052642096,
    "z": -2.426322222
  },
  {
    "x": -5.503492355,
    "y": 23.98086548,
    "z": -7.673782349
  },
  {
    "x": -11.32762241,
    "y": 41.36711884,
    "z": -11.29173088
  },
  {
    "x": -2.026720762,
    "y": 12.63649559,
    "z": -6.982256413
  },
  {
    "x": 1.995614171,
    "y": 5.326423168,
    "z": -2.514856577
  },
  {
    "x": 4.936393261,
    "y": 5.015356064,
    "z": -1.952543378
  },
  {
    "x": 6.309873104,
    "y": 3.972085476,
    "z": -2.210968256
  },
  {
    "x": 5.414957523,
    "y": 1.560120344,
    "z": -1.170090318
  },
  {
    "x": 4.15633297,
    "y": 1.361515999,
    "z": -0.311066955
  },
  {
    "x": 3.802195072,
    "y": 1.797009826,
    "z": -0.069391862
  },
  {
    "x": 6.599405289,
    "y": 7.592426777,
    "z": -1.969292998
  },
  {
    "x": 3.115455151,
    "y": 25.67498779,
    "z": -5.752345562
  },
  {
    "x": -3.536592007,
    "y": 38.8522644,
    "z": -6.369694233
  },
  {
    "x": -7.025327682,
    "y": 25.00738907,
    "z": -5.099104881
  },
  {
    "x": -6.898508072,
    "y": 12.02871895,
    "z": -3.541377306
  },
  {
    "x": -5.723631859,
    "y": 5.883951187,
    "z": -1.380658507
  },
  {
    "x": -5.934200287,
    "y": 2.651247263,
    "z": 1.244267821
  },
  {
    "x": -5.781059265,
    "y": -1.048056245,
    "z": 1.878365755
  },
  {
    "x": -4.058227062,
    "y": -5.156532764,
    "z": 3.634697676
  },
  {
    "x": -2.799602747,
    "y": -5.680561066,
    "z": 0.277567446
  },
  {
    "x": -2.778067112,
    "y": 3.617947817,
    "z": -2.426322222
  },
  {
    "x": -9.659825325,
    "y": 22.38007164,
    "z": -10.74138069
  },
  {
    "x": -14.29472256,
    "y": 38.10809326,
    "z": -10.87537861
  },
  {
    "x": -3.751945972,
    "y": 16.47937012,
    "z": -6.812366486
  },
  {
    "x": 1.134197831,
    "y": 6.551548481,
    "z": -4.354937553
  },
  {
    "x": 5.280959606,
    "y": 5.125426292,
    "z": -2.947957516
  },
  {
    "x": 5.505885124,
    "y": 4.936393261,
    "z": -2.89531517
  },
  {
    "x": 6.611368656,
    "y": 1.794616938,
    "z": -1.830509305
  },
  {
    "x": 5.809773445,
    "y": 1.021735311,
    "z": -0.246460736
  },
  {
    "x": 5.536991596,
    "y": 4.642076015,
    "z": 0.713061094
  },
  {
    "x": 6.151947498,
    "y": 18.22134399,
    "z": -5.008177757
  },
  {
    "x": -6.87457943,
    "y": 30.52284622,
    "z": -4.744967461
  },
  {
    "x": -6.439085484,
    "y": 24.23929214,
    "z": -7.554140568
  },
  {
    "x": -7.628318787,
    "y": 15.45763302,
    "z": -4.814359188
  },
  {
    "x": -5.864808083,
    "y": 11.72004604,
    "z": -3.682554007
  },
  {
    "x": -5.814558983,
    "y": 7.585247517,
    "z": -1.631905079
  },
  {
    "x": -5.283352375,
    "y": 2.799602747,
    "z": 0.830309391
  },
  {
    "x": -4.110869408,
    "y": 0.315852582,
    "z": 1.052841902
  },
  {
    "x": -2.620140791,
    "y": -0.669990301,
    "z": 0.122033961
  },
  {
    "x": -1.864008904,
    "y": -0.35174492,
    "z": -0.667597592
  },
  {
    "x": -0.990628541,
    "y": 2.967100143,
    "z": -1.19880414
  },
  {
    "x": -4.163511276,
    "y": 12.50728416,
    "z": -6.996613026
  },
  {
    "x": -10.03310585,
    "y": 23.70090866,
    "z": -9.566505432
  },
  {
    "x": -7.204789162,
    "y": 24.42354012,
    "z": -9.729216576
  },
  {
    "x": -1.351944804,
    "y": 11.81814957,
    "z": -7.147361279
  },
  {
    "x": 2.352144718,
    "y": 6.896114826,
    "z": -4.256831646
  },
  {
    "x": 4.407578945,
    "y": 6.352943897,
    "z": -3.129812002
  },
  {
    "x": 5.745166779,
    "y": 4.240081787,
    "z": -1.952543378
  },
  {
    "x": 5.472385883,
    "y": 2.321038008,
    "z": -0.815952539
  },
  {
    "x": 4.290330887,
    "y": 2.227717876,
    "z": -0.500099957
  },
  {
    "x": 5.034498692,
    "y": 4.034298897,
    "z": -1.048056245
  },
  {
    "x": 3.613162041,
    "y": 16.23530197,
    "z": -4.417150497
  },
  {
    "x": -0.583848715,
    "y": 27.83331299,
    "z": -3.71126771
  },
  {
    "x": -3.931407452,
    "y": 30.70230675,
    "z": -6.848258495
  },
  {
    "x": -5.615954876,
    "y": 17.51067734,
    "z": -3.955335617
  },
  {
    "x": -5.06560564,
    "y": 12.39721489,
    "z": -2.423929214
  },
  {
    "x": -4.996213913,
    "y": 8.465806007,
    "z": -1.47158587
  },
  {
    "x": -6.19741106,
    "y": 3.369094133,
    "z": 0.63888365
  },
  {
    "x": -4.761716843,
    "y": -0.41635114,
    "z": 1.26341033
  },
  {
    "x": -2.715853453,
    "y": -1.500299811,
    "z": 0.124426775
  },
  {
    "x": -3.026920557,
    "y": -0.605384111,
    "z": -0.65563345
  },
  {
    "x": -1.600798368,
    "y": 2.122433662,
    "z": -2.215753794
  },
  {
    "x": -4.567898273,
    "y": 16.93161201,
    "z": -7.649853706
  },
  {
    "x": -9.844072342,
    "y": 29.06322289,
    "z": -8.13320446
  },
  {
    "x": -6.118447781,
    "y": 20.82473564,
    "z": -12.00957584
  },
  {
    "x": 0.004785645,
    "y": 7.109076023,
    "z": -8.291130066
  },
  {
    "x": 2.830709219,
    "y": 4.867001534,
    "z": -4.137190342
  },
  {
    "x": 4.462614059,
    "y": 5.436492443,
    "z": -2.926422358
  },
  {
    "x": 5.319244385,
    "y": 2.976671219,
    "z": -2.756531954
  },
  {
    "x": 4.474578381,
    "y": 1.660618782,
    "z": -1.720439553
  },
  {
    "x": 4.218546391,
    "y": 2.407179594,
    "z": -0.940379262
  },
  {
    "x": 6.841079712,
    "y": 6.984649658,
    "z": -0.79920274
  },
  {
    "x": 2.368894339,
    "y": 27.49831772,
    "z": -5.324030399
  },
  {
    "x": -7.223931313,
    "y": 36.75375748,
    "z": -2.92402935
  },
  {
    "x": -8.67398262,
    "y": 21.84168434,
    "z": -1.665404558
  },
  {
    "x": -8.231309891,
    "y": 10.33220863,
    "z": -1.976471543
  },
  {
    "x": -6.326622963,
    "y": 5.036891937,
    "z": -0.806381285
  },
  {
    "x": -5.424529076,
    "y": 2.991028309,
    "z": 0.646062136
  },
  {
    "x": -4.218546391,
    "y": -0.954736292,
    "z": 1.304088235
  },
  {
    "x": -2.550748825,
    "y": -2.242074966,
    "z": 1.447657585
  },
  {
    "x": -1.533799291,
    "y": -1.916650891,
    "z": -0.236889437
  },
  {
    "x": -2.100898266,
    "y": 5.697310448,
    "z": -4.256831646
  },
  {
    "x": -10.14556885,
    "y": 22.12882233,
    "z": -8.544770241
  },
  {
    "x": -13.30648613,
    "y": 29.70928574,
    "z": -9.303294182
  },
  {
    "x": -3.907479048,
    "y": 15.42652798,
    "z": -9.05922699
  },
  {
    "x": -0.28713873,
    "y": 7.549355507,
    "z": -5.314458847
  },
  {
    "x": 1.993221283,
    "y": 5.778666496,
    "z": -3.881158352
  },
  {
    "x": 3.462414265,
    "y": 3.670589685,
    "z": -3.546163082
  },
  {
    "x": 4.161118507,
    "y": 1.155733347,
    "z": -2.244467735
  },
  {
    "x": 4.771288395,
    "y": 0.763310432,
    "z": -1.210768223
  },
  {
    "x": 4.309473515,
    "y": 1.67976141,
    "z": -0.397208571
  },
  {
    "x": 8.877371788,
    "y": 14.61296749,
    "z": -3.184847116
  },
  {
    "x": -3.223132133,
    "y": 32.94438171,
    "z": -2.969493151
  },
  {
    "x": -9.736394882,
    "y": 33.30091476,
    "z": -3.689732552
  },
  {
    "x": -7.70728159,
    "y": 17.21157265,
    "z": -4.015156269
  },
  {
    "x": -6.393621922,
    "y": 10.63848877,
    "z": -3.160918713
  },
  {
    "x": -5.350350857,
    "y": 7.802994728,
    "z": -1.914258003
  },
  {
    "x": -5.460421085,
    "y": 3.61076951,
    "z": 0.334995151
  },
  {
    "x": -5.371887207,
    "y": -0.1914258,
    "z": 0.966700375
  },
  {
    "x": -3.8715868,
    "y": -0.710668385,
    "z": 0.516849697
  },
  {
    "x": -2.720639229,
    "y": -0.564706147,
    "z": -0.332602352
  },
  {
    "x": -1.060020447,
    "y": -0.313459754,
    "z": -1.002592683
  },
  {
    "x": 1.251446128,
    "y": 7.618747234,
    "z": -3.189632893
  },
  {
    "x": -6.068198204,
    "y": 17.08236122,
    "z": -7.67138958
  },
  {
    "x": -12.59581757,
    "y": 32.21935654,
    "z": -13.6223402
  },
  {
    "x": -5.381458282,
    "y": 15.84527206,
    "z": -11.07398319
  },
  {
    "x": 0.033499517,
    "y": 4.840680122,
    "z": -7.118647575
  },
  {
    "x": 2.122433662,
    "y": 6.597012043,
    "z": -4.029513359
  },
  {
    "x": 5.187639236,
    "y": 6.534798622,
    "z": -3.840480089
  },
  {
    "x": 4.354937553,
    "y": 5.764309883,
    "z": -4.144368649
  },
  {
    "x": 3.134597778,
    "y": 3.646661758,
    "z": -3.036492109
  },
  {
    "x": 3.35473752,
    "y": 1.787438512,
    "z": -1.622333765
  },
  {
    "x": 4.278366566,
    "y": 3.476771355,
    "z": -1.050449133
  },
  {
    "x": 4.228117943,
    "y": 17.35992813,
    "z": -4.835894108
  },
  {
    "x": -4.615755081,
    "y": 28.02952385,
    "z": -5.197210789
  },
  {
    "x": -8.549554825,
    "y": 27.83092117,
    "z": -7.381857395
  },
  {
    "x": -7.673782349,
    "y": 14.71346569,
    "z": -5.532205582
  },
  {
    "x": -5.666203976,
    "y": 9.987641335,
    "z": -4.388436794
  },
  {
    "x": -5.618347168,
    "y": 6.434299946,
    "z": -1.476371646
  },
  {
    "x": -5.936593056,
    "y": 1.916650891,
    "z": 0.385244459
  },
  {
    "x": -4.003192425,
    "y": -0.770488918,
    "z": -0.203389928
  },
  {
    "x": -2.426322222,
    "y": -1.811366796,
    "z": -0.425922424
  },
  {
    "x": -1.249053478,
    "y": -0.806381285,
    "z": 0.162711948
  },
  {
    "x": -3.232703686,
    "y": 6.446264267,
    "z": -4.082155228
  },
  {
    "x": -10.28195858,
    "y": 22.72942352,
    "z": -8.386843681
  },
  {
    "x": -10.85862923,
    "y": 30.16392326,
    "z": -9.504291534
  },
  {
    "x": -3.158525944,
    "y": 12.92842102,
    "z": -8.762516975
  },
  {
    "x": 0.404386997,
    "y": 6.061019897,
    "z": -5.343173027
  },
  {
    "x": 2.117647886,
    "y": 4.991428375,
    "z": -2.825923443
  },
  {
    "x": 3.730410576,
    "y": 4.943571568,
    "z": -2.443071842
  },
  {
    "x": 4.888536453,
    "y": 3.014956713,
    "z": -1.866401672
  },
  {
    "x": 3.976871252,
    "y": 2.337787628,
    "z": -1.53619206
  },
  {
    "x": 3.558127403,
    "y": 2.230110645,
    "z": -0.660419047
  },
  {
    "x": 6.661618233,
    "y": 9.951749802,
    "z": -2.069791555
  },
  {
    "x": -1.842473507,
    "y": 25.01935196,
    "z": -3.357130051
  },
  {
    "x": -5.876771927,
    "y": 30.14238548,
    "z": -7.331608772
  },
  {
    "x": -7.697710037,
    "y": 18.18305969,
    "z": -7.154539585
  },
  {
    "x": -6.173482418,
    "y": 9.458827019,
    "z": -5.113461971
  },
  {
    "x": -4.919642925,
    "y": 7.058826447,
    "z": -3.21356082
  },
  {
    "x": -4.290330887,
    "y": 3.503092289,
    "z": -0.784845769
  },
  {
    "x": -3.65862608,
    "y": 0.86380893,
    "z": -0.043070812
  },
  {
    "x": -2.30189538,
    "y": -0.825523794,
    "z": -0.083748788
  },
  {
    "x": -2.017149448,
    "y": -0.681954443,
    "z": -0.423529595
  },
  {
    "x": -0.997807086,
    "y": 2.880958557,
    "z": -0.815952539
  },
  {
    "x": -5.156532764,
    "y": 12.28235817,
    "z": -5.266602516
  },
  {
    "x": -9.91824913,
    "y": 22.67199516,
    "z": -8.161917686
  },
  {
    "x": -9.626325607,
    "y": 22.0881443,
    "z": -12.93320751
  },
  {
    "x": -4.182653904,
    "y": 9.054441452,
    "z": -9.418149948
  },
  {
    "x": -0.722632408,
    "y": 6.001199245,
    "z": -6.245267391
  },
  {
    "x": 2.84267354,
    "y": 5.654239655,
    "z": -3.69212532
  },
  {
    "x": 5.010570526,
    "y": 4.919642925,
    "z": -3.381058455
  },
  {
    "x": 5.063212872,
    "y": 4.175475597,
    "z": -2.651247263
  },
  {
    "x": 4.680361271,
    "y": 2.871387243,
    "z": -1.629512191
  },
  {
    "x": 5.084747791,
    "y": 4.369294167,
    "z": -0.555134892
  },
  {
    "x": 5.166104317,
    "y": 15.51984787,
    "z": -3.26141715
  },
  {
    "x": -3.651447058,
    "y": 27.56771088,
    "z": -4.79521656
  },
  {
    "x": -11.46401405,
    "y": 30.27877617,
    "z": -7.487142086
  },
  {
    "x": -10.11924648,
    "y": 16.00319862,
    "z": -5.982056618
  },
  {
    "x": -6.702296257,
    "y": 11.06201839,
    "z": -4.000799656
  },
  {
    "x": -6.70947504,
    "y": 7.006184578,
    "z": -1.694118381
  },
  {
    "x": -6.329016209,
    "y": 1.892722607,
    "z": 0.976271689
  },
  {
    "x": -4.529613495,
    "y": -0.428315252,
    "z": 1.093519926
  },
  {
    "x": -2.019542217,
    "y": -0.117248312,
    "z": -0.526420951
  },
  {
    "x": -1.75872457,
    "y": -1.316052318,
    "z": -0.770488918
  },
  {
    "x": 1.009771109,
    "y": -0.413958341,
    "z": -0.875773072
  },
  {
    "x": -5.096712112,
    "y": 12.32542992,
    "z": -4.759324074
  },
  {
    "x": -14.60818195,
    "y": 31.56851006,
    "z": -7.271787643
  },
  {
    "x": -8.047062874,
    "y": 26.39283562,
    "z": -8.269595146
  },
  {
    "x": -1.153340578,
    "y": 9.595218658,
    "z": -5.654239655
  },
  {
    "x": 2.275574446,
    "y": 6.841079712,
    "z": -2.837887764
  },
  {
    "x": 3.428915024,
    "y": 6.68076086,
    "z": -1.26341033
  },
  {
    "x": 4.907679081,
    "y": 4.094119549,
    "z": -1.378265977
  },
  {
    "x": 5.479563713,
    "y": 2.139183283,
    "z": -1.170090318
  },
  {
    "x": 3.996013641,
    "y": 0.787238598,
    "z": -0.246460736
  },
  {
    "x": 4.402793407,
    "y": 3.038884878,
    "z": 1.064806104
  },
  {
    "x": 4.811966419,
    "y": 14.87139225,
    "z": -1.629512191
  },
  {
    "x": -6.360122681,
    "y": 29.68296623,
    "z": 0.021535406
  },
  {
    "x": -8.985049248,
    "y": 28.55833817,
    "z": -5.120640755
  },
  {
    "x": -5.288137913,
    "y": 15.51506233,
    "z": -4.532006264
  },
  {
    "x": -4.931607723,
    "y": 11.18644619,
    "z": -2.746960402
  },
  {
    "x": -4.503292084,
    "y": 4.907679081,
    "z": -1.014556766
  },
  {
    "x": -3.716053486,
    "y": 0.86380893,
    "z": 0.124426775
  },
  {
    "x": -2.744567633,
    "y": -1.067198873,
    "z": -0.636490762
  },
  {
    "x": -2.553141594,
    "y": -0.935593605,
    "z": -0.361316204
  },
  {
    "x": -1.294516921,
    "y": -1.05523479,
    "z": -0.937986493
  },
  {
    "x": 0.026321048,
    "y": 2.098505497,
    "z": -2.057827473
  },
  {
    "x": -5.400600433,
    "y": 13.42612743,
    "z": -4.374079704
  },
  {
    "x": -12.19382477,
    "y": 22.43510437,
    "z": -5.381458282
  },
  {
    "x": -11.05962658,
    "y": 25.67737961,
    "z": -9.040083885
  },
  {
    "x": -4.790431023,
    "y": 8.513663292,
    "z": -8.207381248
  },
  {
    "x": -0.827916682,
    "y": 4.074976921,
    "z": -4.53918457
  },
  {
    "x": 1.722832441,
    "y": 6.022734642,
    "z": -3.201596737
  },
  {
    "x": 2.849851608,
    "y": 6.396015167,
    "z": -3.21356082
  },
  {
    "x": 2.914458036,
    "y": 6.190232277,
    "z": -3.232703686
  },
  {
    "x": 2.086541414,
    "y": 6.403193474,
    "z": -3.345165968
  },
  {
    "x": -0.425922424,
    "y": 11.08834076,
    "z": -4.474578381
  },
  {
    "x": -4.003192425,
    "y": 15.17049503,
    "z": -5.711667538
  },
  {
    "x": -8.831908226,
    "y": 14.78525066,
    "z": -6.647261143
  },
  {
    "x": -8.66680336,
    "y": 12.84706497,
    "z": -10.5978117
  },
  {
    "x": -7.688138485,
    "y": 10.54516888,
    "z": -9.281759262
  },
  {
    "x": -4.457828522,
    "y": 8.276773453,
    "z": -6.089733124
  },
  {
    "x": -2.801995039,
    "y": 6.826723099,
    "z": -4.342973232
  },
  {
    "x": -2.423929214,
    "y": 5.611168861,
    "z": -2.751746178
  },
  {
    "x": -2.254039049,
    "y": 5.201996326,
    "z": -2.268395662
  },
  {
    "x": -3.060420036,
    "y": 5.364708424,
    "z": -2.043470621
  },
  {
    "x": -2.471785784,
    "y": 4.843072891,
    "z": -1.785045624
  },
  {
    "x": -2.890529633,
    "y": 4.52482748,
    "z": -1.665404558
  },
  {
    "x": -2.849851608,
    "y": 6.585048199,
    "z": -3.64426899
  },
  {
    "x": -3.055634737,
    "y": 7.49910593,
    "z": -5.572883606
  },
  {
    "x": -4.345366001,
    "y": 7.601996899,
    "z": -7.831708431
  },
  {
    "x": -6.821937084,
    "y": 9.908678055,
    "z": -8.027919769
  },
  {
    "x": -7.946564198,
    "y": 9.714859962,
    "z": -9.116654396
  },
  {
    "x": -5.587240696,
    "y": 10.52602577,
    "z": -9.913464546
  },
  {
    "x": -2.995814085,
    "y": 9.856036186,
    "z": -7.905886173
  },
  {
    "x": -1.253839016,
    "y": 7.331608772,
    "z": -5.946164608
  },
  {
    "x": -0.050249275,
    "y": 6.781259537,
    "z": -5.400600433
  },
  {
    "x": 0.990628541,
    "y": 6.88893652,
    "z": -4.749752522
  },
  {
    "x": 1.289731503,
    "y": 7.197610855,
    "z": -4.721039295
  },
  {
    "x": 0.636490762,
    "y": 7.994420052,
    "z": -4.610969543
  },
  {
    "x": -1.435693622,
    "y": 9.573683739,
    "z": -5.568098068
  },
  {
    "x": -3.778266668,
    "y": 10.03549862,
    "z": -6.005984783
  },
  {
    "x": -5.45085001,
    "y": 10.74377441,
    "z": -6.66640377
  },
  {
    "x": -5.941378593,
    "y": 7.846065521,
    "z": -5.599205494
  },
  {
    "x": -4.52482748,
    "y": 9.879963875,
    "z": -6.73100996
  },
  {
    "x": -5.26420927,
    "y": 12.61735344,
    "z": -7.444070816
  },
  {
    "x": -5.223531246,
    "y": 10.68395329,
    "z": -6.209374905
  },
  {
    "x": -3.548555851,
    "y": 7.424928665,
    "z": -4.943571568
  },
  {
    "x": -3.215953588,
    "y": 5.503492355,
    "z": -4.340579987
  },
  {
    "x": -2.54117775,
    "y": 5.089533329,
    "z": -3.617947817
  },
  {
    "x": -2.213360786,
    "y": 4.536791325,
    "z": -2.897708178
  },
  {
    "x": -3.249453068,
    "y": 5.276174068,
    "z": -3.05324173
  },
  {
    "x": -3.864408255,
    "y": 6.635297298,
    "z": -2.744567633
  },
  {
    "x": -4.024727345,
    "y": 10.17188835,
    "z": -4.029513359
  },
  {
    "x": -3.304487944,
    "y": 10.42552853,
    "z": -5.716453552
  },
  {
    "x": -3.065205574,
    "y": 7.728816509,
    "z": -6.510870457
  },
  {
    "x": -0.696311355,
    "y": 7.4010005,
    "z": -5.824130058
  },
  {
    "x": -1.464407563,
    "y": 8.886943817,
    "z": -6.276373863
  },
  {
    "x": -2.299502611,
    "y": 10.73420238,
    "z": -6.015556335
  },
  {
    "x": -2.342573404,
    "y": 9.659825325,
    "z": -5.790630341
  },
  {
    "x": -2.414358139,
    "y": 7.8843503,
    "z": -6.23330307
  },
  {
    "x": -1.74197495,
    "y": 7.00139904,
    "z": -5.857630253
  },
  {
    "x": -1.160519004,
    "y": 7.180860996,
    "z": -5.314458847
  },
  {
    "x": -0.873380244,
    "y": 7.042076588,
    "z": -4.912464619
  },
  {
    "x": -0.6867401,
    "y": 7.073184013,
    "z": -4.993820667
  },
  {
    "x": -1.332802296,
    "y": 8.38205719,
    "z": -5.26420927
  },
  {
    "x": -2.768495798,
    "y": 10.54516888,
    "z": -5.276174068
  },
  {
    "x": -3.7256248,
    "y": 9.109475136,
    "z": -4.759324074
  },
  {
    "x": -5.044069767,
    "y": 9.99721241,
    "z": -4.718646049
  },
  {
    "x": -5.08714056,
    "y": 9.121439934,
    "z": -4.462614059
  },
  {
    "x": -4.218546391,
    "y": 8.425127983,
    "z": -3.285345316
  },
  {
    "x": -3.558127403,
    "y": 8.288737297,
    "z": -3.940979004
  },
  {
    "x": -3.036492109,
    "y": 7.908278465,
    "z": -4.58943367
  },
  {
    "x": -2.703889608,
    "y": 9.810573578,
    "z": -5.513063908
  },
  {
    "x": -1.244267821,
    "y": 6.60419035,
    "z": -6.113661766
  },
  {
    "x": -0.081355974,
    "y": 7.054040909,
    "z": -7.740781307
  },
  {
    "x": -0.160319105,
    "y": 7.989634514,
    "z": -9.674181938
  },
  {
    "x": -0.902094066,
    "y": 11.27737331,
    "z": -11.92104244
  },
  {
    "x": -0.440279365,
    "y": 9.473184586,
    "z": -12.80160141
  },
  {
    "x": 1.627119422,
    "y": 7.716853142,
    "z": -12.80877876
  },
  {
    "x": 4.201796532,
    "y": 6.757331371,
    "z": -10.94716454
  },
  {
    "x": 3.117847919,
    "y": 5.371887207,
    "z": -8.709875107
  },
  {
    "x": -1.629512191,
    "y": 3.225525141,
    "z": -3.8668015
  },
  {
    "x": -5.812166691,
    "y": 5.618347168,
    "z": -0.339780778
  },
  {
    "x": -11.04526806,
    "y": 13.87119293,
    "z": 1.251446128
  },
  {
    "x": -12.64846134,
    "y": 9.743573189,
    "z": 2.368894339
  },
  {
    "x": -13.70848083,
    "y": 3.32602334,
    "z": -9.695716858
  },
  {
    "x": 8.039883614,
    "y": -33.19084167,
    "z": -10.34177971
  },
  {
    "x": 4.235295773,
    "y": -27.69931412,
    "z": -13.22273731
  },
  {
    "x": -10.59063339,
    "y": -10.35613537,
    "z": -15.64666653
  },
  {
    "x": -10.43749142,
    "y": 22.70788765,
    "z": 10.60259819
  },
  {
    "x": 3.747160196,
    "y": 13.39980698,
    "z": 1.378265977
  },
  {
    "x": -10.35852909,
    "y": 3.390629768,
    "z": 0.830309391
  },
  {
    "x": -3.529413223,
    "y": -15.62273884,
    "z": -9.205188751
  },
  {
    "x": 6.075376511,
    "y": -35.79901886,
    "z": -9.604789734
  },
  {
    "x": -16.68275833,
    "y": 1.641476274,
    "z": 10.57149124
  },
  {
    "x": 13.53619766,
    "y": 26.55076027,
    "z": -7.618747234
  },
  {
    "x": -11.90429211,
    "y": 5.955735207,
    "z": -2.194218397
  },
  {
    "x": -7.747959614,
    "y": -40.65406036,
    "z": -1.878365755
  },
  {
    "x": 5.584848404,
    "y": -17.73320961,
    "z": -13.12702465
  },
  {
    "x": -12.40917873,
    "y": 41.9270401,
    "z": 40.2712059
  },
  {
    "x": -0.8949157,
    "y": 28.66362,
    "z": -9.006584167
  },
  {
    "x": -8.66680336,
    "y": 11.38504982,
    "z": 8.714660645
  },
  {
    "x": 9.317650795,
    "y": -68.60700989,
    "z": -17.30728722
  },
  {
    "x": 2.689532757,
    "y": -5.4652071,
    "z": 3.474378347
  },
  {
    "x": 6.649653912,
    "y": 13.81615639,
    "z": -11.91386318
  },
  {
    "x": -9.176474571,
    "y": 12.87817097,
    "z": -2.27078867
  },
  {
    "x": -14.29711533,
    "y": -6.630511761,
    "z": 7.960920811
  },
  {
    "x": 10.78684425,
    "y": -34.10490036,
    "z": -14.71346569
  },
  {
    "x": 1.852044702,
    "y": 19.83889198,
    "z": 32.9419899
  },
  {
    "x": -5.498706818,
    "y": 23.51426888,
    "z": -15.8380928
  },
  {
    "x": -14.42393494,
    "y": 2.644068956,
    "z": 6.996613026
  },
  {
    "x": 6.917649746,
    "y": -55.16413498,
    "z": -22.5882473
  },
  {
    "x": -0.122033961,
    "y": 6.151947498,
    "z": 23.42573357
  },
  {
    "x": 19.79821396,
    "y": 28.80719376,
    "z": -24.04786682
  },
  {
    "x": -10.07856941,
    "y": 12.89252853,
    "z": 9.190832138
  },
  {
    "x": -14.79242897,
    "y": -7.125825882,
    "z": 6.340980053
  },
  {
    "x": 10.99502087,
    "y": -39.22554016,
    "z": -15.14896011
  },
  {
    "x": -0.507278383,
    "y": 5.302494526,
    "z": 23.82772636
  },
  {
    "x": 9.36550808,
    "y": 20.37966919,
    "z": -23.12902069
  },
  {
    "x": -7.886743546,
    "y": 2.751746178,
    "z": -4.685146809
  },
  {
    "x": -16.78565025,
    "y": -15.48874092,
    "z": -0.392422885
  },
  {
    "x": 14.65125275,
    "y": -37.65584946,
    "z": -10.56431198
  },
  {
    "x": 0.902094066,
    "y": 14.55075455,
    "z": 25.1724968
  },
  {
    "x": 0.717846811,
    "y": 34.19343567,
    "z": -7.231109619
  },
  {
    "x": -11.66740322,
    "y": 9.288937569,
    "z": 8.915657043
  },
  {
    "x": -5.895915031,
    "y": -40.55595398,
    "z": -11.96889973
  },
  {
    "x": 7.800601959,
    "y": -8.87258625,
    "z": -11.50469112
  },
  {
    "x": 0.428315252,
    "y": 18.4486618,
    "z": 8.214560509
  },
  {
    "x": -7.240681171,
    "y": 3.45523572,
    "z": -5.601597786
  },
  {
    "x": -13.93340588,
    "y": -5.647061825,
    "z": 11.49512005
  },
  {
    "x": 2.313859463,
    "y": -41.12543869,
    "z": -14.79960823
  },
  {
    "x": -3.017349243,
    "y": -1.631905079,
    "z": -8.63808918
  },
  {
    "x": -3.479164124,
    "y": 26.28515625,
    "z": -17.46521187
  },
  {
    "x": -3.06999135,
    "y": 20.33181572,
    "z": 11.14337444
  },
  {
    "x": -21.60000992,
    "y": -1.907079697,
    "z": 29.35993385
  },
  {
    "x": 13.19641781,
    "y": -54.35057068,
    "z": -12.89731407
  },
  {
    "x": -6.120840073,
    "y": -27.3451786,
    "z": -21.75075722
  },
  {
    "x": -4.917250633,
    "y": 26.6799736,
    "z": -55.32445145
  },
  {
    "x": -0.945164979,
    "y": 29.35754013,
    "z": 4.012763977
  },
  {
    "x": -12.41874981,
    "y": -54.67599487,
    "z": 35.27020645
  },
  {
    "x": 22.4638195,
    "y": -37.86880875,
    "z": -11.19841099
  },
  {
    "x": -11.07159042,
    "y": -23.22473526,
    "z": -10.55234814
  },
  {
    "x": -26.16073036,
    "y": 16.83589935,
    "z": -9.276973724
  },
  {
    "x": -0.406779855,
    "y": 28.78326225,
    "z": 0.141176537
  },
  {
    "x": -27.09392929,
    "y": -8.752944946,
    "z": 16.716259
  },
  {
    "x": 37.35913849,
    "y": -21.20041084,
    "z": -9.889535904
  },
  {
    "x": -6.50369215,
    "y": -20.42034912,
    "z": -7.984848976
  },
  {
    "x": -24.11247444,
    "y": 6.896114826,
    "z": -6.422336102
  },
  {
    "x": -8.365307808,
    "y": -4.637290478,
    "z": -4.902893543
  },
  {
    "x": 11.5453701,
    "y": 0.031106694,
    "z": -3.062812805
  },
  {
    "x": 12.49771309,
    "y": -3.30927372,
    "z": 6.788437843
  },
  {
    "x": -7.41535759,
    "y": -6.946363926,
    "z": -13.05284691
  },
  {
    "x": -19.02293968,
    "y": -32.35574722,
    "z": 0.622133911
  },
  {
    "x": 0.825523794,
    "y": -13.2083807,
    "z": -11.06919765
  },
  {
    "x": 15.8380928,
    "y": 20.85344887,
    "z": 9.712467194
  },
  {
    "x": -0.818345308,
    "y": 0.835095108,
    "z": -1.35673058
  },
  {
    "x": -5.754738331,
    "y": 1.708475351,
    "z": -12.41396523
  },
  {
    "x": -12.36849976,
    "y": -59.08118057,
    "z": 29.80978394
  },
  {
    "x": 2.529213428,
    "y": -4.297509193,
    "z": -6.664010525
  },
  {
    "x": -4.797609329,
    "y": 20.74098587,
    "z": 33.83690643
  },
  {
    "x": 2.433500767,
    "y": 13.14377403,
    "z": 3.084348202
  },
  {
    "x": -17.7954216,
    "y": 17.71885109,
    "z": 4.778466702
  },
  {
    "x": 11.46401405,
    "y": -78.39844513,
    "z": -7.503891945
  },
  {
    "x": 0.794417143,
    "y": -4.852644444,
    "z": -18.76930046
  },
  {
    "x": -5.623133183,
    "y": 10.60977459,
    "z": 36.92604065
  },
  {
    "x": 2.419143677,
    "y": 18.10648918,
    "z": 1.768296003
  },
  {
    "x": -20.50409698,
    "y": 10.77727222,
    "z": 8.13320446
  },
  {
    "x": 6.575476646,
    "y": -71.20322418,
    "z": -4.38365078
  },
  {
    "x": -2.344966173,
    "y": -7.068397999,
    "z": -8.468198776
  },
  {
    "x": -9.793823242,
    "y": 42.24049759,
    "z": 38.26841354
  },
  {
    "x": 2.876172781,
    "y": 11.43051338,
    "z": 6.941578388
  },
  {
    "x": -27.60120964,
    "y": -10.05942631,
    "z": 26.95514488
  },
  {
    "x": 15.29970741,
    "y": -67.45366669,
    "z": -7.140182495
  },
  {
    "x": -10.14556885,
    "y": -5.012963295,
    "z": 2.165504456
  },
  {
    "x": 20.06381989,
    "y": 58.82754517,
    "z": 0.045463633
  },
  {
    "x": -12.59581757,
    "y": 13.70848083,
    "z": -1.964507341
  },
  {
    "x": -29.41975403,
    "y": 4.07736969,
    "z": 20.93719673
  },
  {
    "x": 18.19263077,
    "y": -56.78646469,
    "z": 11.07637501
  },
  {
    "x": 9.097511292,
    "y": -19.64507484,
    "z": -12.17707443
  },
  {
    "x": -30.80041313,
    "y": 13.33520031,
    "z": 32.77209854
  },
  {
    "x": 0.54317075,
    "y": 29.7188549,
    "z": -2.196611166
  },
  {
    "x": -36.89493179,
    "y": -5.64227581,
    "z": 41.94617844
  },
  {
    "x": 32.84866714,
    "y": -19.78864288,
    "z": -8.798408508
  },
  {
    "x": -14.06740379,
    "y": -17.25464439,
    "z": 18.29312897
  },
  {
    "x": 36.54318619,
    "y": 29.43411255,
    "z": -13.33520031
  },
  {
    "x": -17.0416832,
    "y": 12.89970684,
    "z": 10.65045452
  },
  {
    "x": 20.44666862,
    "y": -78.39844513,
    "z": -15.48874092
  },
  {
    "x": 11.40419292,
    "y": -5.682953835,
    "z": -19.93460464
  },
  {
    "x": -29.7930336,
    "y": -5.446063995,
    "z": 58.23412323
  },
  {
    "x": 13.51944733,
    "y": 18.44148445,
    "z": 10.24845982
  },
  {
    "x": -31.86522102,
    "y": 7.288537979,
    "z": 13.85204983
  },
  {
    "x": 10.90409184,
    "y": -72.63891602,
    "z": 18.66880226
  },
  {
    "x": 4.132404804,
    "y": -29.51786041,
    "z": -11.06441116
  },
  {
    "x": -31.41775894,
    "y": -1.744367838,
    "z": 33.51865768
  },
  {
    "x": 23.0907402,
    "y": 16.78086472,
    "z": -17.09432411
  },
  {
    "x": -19.27897263,
    "y": 10.9686985,
    "z": 12.06461239
  },
  {
    "x": 2.792424202,
    "y": -48.08616257,
    "z": 11.89232922
  },
  {
    "x": 10.42074299,
    "y": -26.55793953,
    "z": -5.632704258
  },
  {
    "x": -14.31147289,
    "y": -6.309873104,
    "z": 11.1936245
  },
  {
    "x": 12.9834547,
    "y": 29.21157646,
    "z": -28.91008377
  },
  {
    "x": -9.868000031,
    "y": -0.248853549,
    "z": -5.812166691
  },
  {
    "x": -24.02154732,
    "y": -7.814958096,
    "z": -2.859423161
  },
  {
    "x": -4.522434711,
    "y": -11.75354385,
    "z": -21.66222382
  },
  {
    "x": 9.963713646,
    "y": -29.34557533,
    "z": -10.55952549
  },
  {
    "x": -5.929414749,
    "y": -24.07658005,
    "z": -22.42074776
  },
  {
    "x": -38.59622955,
    "y": 20.99941254,
    "z": 14.74218082
  },
  {
    "x": 15.97448254,
    "y": 8.269595146,
    "z": 16.16590881
  },
  {
    "x": 0.859023333,
    "y": -8.003991127,
    "z": 29.60160828
  },
  {
    "x": -5.453242779,
    "y": -3.220739365,
    "z": 2.751746178
  },
  {
    "x": -2.823530912,
    "y": -37.41417694,
    "z": -4.113262177
  },
  {
    "x": -13.30170059,
    "y": -10.38724232,
    "z": -34.06900787
  },
  {
    "x": -25.63670158,
    "y": -1.914258003,
    "z": -10.35852909
  },
  {
    "x": 29.39821815,
    "y": -8.824729919,
    "z": -5.910271645
  },
  {
    "x": -0.650847793,
    "y": 20.70270157,
    "z": 11.24626637
  },
  {
    "x": 2.584248543,
    "y": -16.80479431,
    "z": -8.094919205
  },
  {
    "x": -27.00539589,
    "y": 53.00102234,
    "z": 9.260223389
  },
  {
    "x": -18.75494385,
    "y": -34.97110367,
    "z": -1.859223127
  },
  {
    "x": 15.90987778,
    "y": -9.671788216,
    "z": 0.011964113
  },
  {
    "x": 19.16411781,
    "y": 7.200003147,
    "z": -0.681954443
  },
  {
    "x": -11.41137028,
    "y": -19.87239265,
    "z": -19.93221283
  },
  {
    "x": -27.71606445,
    "y": -1.832902193,
    "z": 0.086141624
  },
  {
    "x": -7.544569969,
    "y": -7.604390144,
    "z": 0.746560633
  },
  {
    "x": 25.21077728,
    "y": -4.371686935,
    "z": 6.240481377
  },
  {
    "x": 4.730610371,
    "y": -2.196611166,
    "z": -2.648854733
  },
  {
    "x": -6.474977493,
    "y": -8.810372353,
    "z": -17.69253159
  },
  {
    "x": -14.73978806,
    "y": -5.324030399,
    "z": 1.952543378
  },
  {
    "x": -7.338787079,
    "y": -11.94018555,
    "z": -5.096712112
  },
  {
    "x": 16.17787361,
    "y": -2.143969059,
    "z": -8.977870941
  },
  {
    "x": 1.174875975,
    "y": -7.173682213,
    "z": -13.21316624
  },
  {
    "x": -11.96172047,
    "y": -11.9090786,
    "z": -10.99023438
  },
  {
    "x": -17.61595917,
    "y": -1.402194023,
    "z": 0.562313318
  },
  {
    "x": -3.280559778,
    "y": 4.177868366,
    "z": -0.076570325
  },
  {
    "x": 3.366701365,
    "y": 7.252645493,
    "z": -6.269195557
  },
  {
    "x": 17.09432411,
    "y": 1.61515522,
    "z": -12.42353439
  },
  {
    "x": 7.774280071,
    "y": 7.544569969,
    "z": -8.094919205
  },
  {
    "x": -0.157926291,
    "y": 16.82393646,
    "z": 2.627319574
  },
  {
    "x": 3.524627924,
    "y": 13.00499153,
    "z": -5.178067684
  },
  {
    "x": 0.090927266,
    "y": 12.46899891,
    "z": -2.60817647
  },
  {
    "x": 4.005585194,
    "y": 2.907279491,
    "z": -5.675775528
  },
  {
    "x": 9.98285675,
    "y": -5.108676434,
    "z": -6.635297298
  },
  {
    "x": 8.396414757,
    "y": -4.338187695,
    "z": -3.622733593
  },
  {
    "x": 2.612962246,
    "y": 4.876572609,
    "z": -2.600998163
  },
  {
    "x": -5.369493961,
    "y": 11.59801102,
    "z": -9.662218094
  },
  {
    "x": -9.39422226,
    "y": 18.3720932,
    "z": -12.110075
  },
  {
    "x": -2.66799736,
    "y": 8.348558426,
    "z": -1.009771109
  },
  {
    "x": 20.56630898,
    "y": -2.017149448,
    "z": -0.040677987
  },
  {
    "x": 32.9419899,
    "y": -13.01934814,
    "z": -0.569491804
  },
  {
    "x": 8.513663292,
    "y": 9.7698946,
    "z": -12.24646568
  },
  {
    "x": -8.140382767,
    "y": 17.52742577,
    "z": -1.435693622
  },
  {
    "x": -14.15833092,
    "y": 18.22852135,
    "z": 0.162711948
  },
  {
    "x": -4.613362312,
    "y": 9.994820595,
    "z": -3.689732552
  },
  {
    "x": 14.7326088,
    "y": 3.476771355,
    "z": -3.64426899
  },
  {
    "x": 32.81277466,
    "y": -11.92582798,
    "z": -0.086141624
  },
  {
    "x": 10.90409184,
    "y": 8.630911827,
    "z": -13.64387417
  },
  {
    "x": -9.877571106,
    "y": 16.11087608,
    "z": -3.574877024
  },
  {
    "x": -19.00379753,
    "y": 15.17049503,
    "z": 0.41635114
  },
  {
    "x": 4.646861553,
    "y": 5.986842632,
    "z": -1.505085468
  },
  {
    "x": 31.4991169,
    "y": -10.43509865,
    "z": -0.727418125
  },
  {
    "x": 9.753145218,
    "y": 7.152146816,
    "z": -19.55653954
  },
  {
    "x": -7.714460373,
    "y": 13.91187,
    "z": -8.535198212
  },
  {
    "x": -17.54656792,
    "y": 12.39482212,
    "z": 5.252245903
  },
  {
    "x": 2.124826431,
    "y": 5.754738331,
    "z": -1.478764415
  },
  {
    "x": 29.77867889,
    "y": -4.955535889,
    "z": -3.491128206
  },
  {
    "x": 21.53061867,
    "y": -8.712266922,
    "z": -10.44706249
  },
  {
    "x": 4.247260094,
    "y": 10.22692394,
    "z": -16.68754387
  },
  {
    "x": -10.27717304,
    "y": 16.35972786,
    "z": -1.478764415
  },
  {
    "x": -7.168896198,
    "y": 13.60558987,
    "z": 1.55054903
  },
  {
    "x": 20.02553368,
    "y": 5.237888813,
    "z": -3.249453068
  },
  {
    "x": 25.84727097,
    "y": -14.66082478,
    "z": -4.161118507
  },
  {
    "x": 10.98305511,
    "y": 4.137190342,
    "z": -16.07019615
  },
  {
    "x": -9.506684303,
    "y": 16.19701576,
    "z": -3.646661758
  },
  {
    "x": -19.68096733,
    "y": 16.7545433,
    "z": 2.402393818
  },
  {
    "x": 20.55434608,
    "y": -0.983450115,
    "z": -1.466800213
  },
  {
    "x": 33.99483109,
    "y": -16.64447403,
    "z": -8.362915039
  },
  {
    "x": 6.221338749,
    "y": 0.229710966,
    "z": -15.19681644
  },
  {
    "x": -11.33240795,
    "y": 16.75215149,
    "z": -0.827916682
  },
  {
    "x": -20.05663872,
    "y": 17.55135345,
    "z": 1.021735311
  },
  {
    "x": 6.996613026,
    "y": 6.331408978,
    "z": -0.811166883
  },
  {
    "x": 33.86801147,
    "y": -13.50509071,
    "z": 0.909272611
  },
  {
    "x": 14.57228947,
    "y": -6.352943897,
    "z": -12.61496067
  },
  {
    "x": -5.18046093,
    "y": 5.862415314,
    "z": -9.638289452
  },
  {
    "x": -17.0177536,
    "y": 19.15693855,
    "z": -0.110069841
  },
  {
    "x": -1.698904157,
    "y": 10.97348404,
    "z": -3.555734634
  },
  {
    "x": 35.0763855,
    "y": -7.03011322,
    "z": 1.318445206
  },
  {
    "x": 24.60539436,
    "y": -10.09771156,
    "z": -8.214560509
  },
  {
    "x": 0.861416221,
    "y": -1.907079697,
    "z": -13.6031971
  },
  {
    "x": -17.41735649,
    "y": 19.52303886,
    "z": -2.234896183
  },
  {
    "x": -4.831109047,
    "y": 12.72742367,
    "z": -5.520241737
  },
  {
    "x": 22.79881287,
    "y": -2.873780012,
    "z": 0.610169768
  },
  {
    "x": 37.67499161,
    "y": -13.22513008,
    "z": -5.371887207
  },
  {
    "x": 10.26760197,
    "y": -4.977071285,
    "z": -13.70848083
  },
  {
    "x": -11.23190975,
    "y": 13.3399868,
    "z": -5.012963295
  },
  {
    "x": -15.43849182,
    "y": 15.59163284,
    "z": -3.7710886
  },
  {
    "x": 9.887143135,
    "y": 6.649653912,
    "z": -2.218146563
  },
  {
    "x": 36.89493179,
    "y": -12.68435192,
    "z": -0.693918586
  },
  {
    "x": 12.97388458,
    "y": -6.635297298,
    "z": -13.83529949
  },
  {
    "x": -4.414757729,
    "y": 5.548955917,
    "z": -5.850451469
  },
  {
    "x": -17.0297184,
    "y": 18.50848198,
    "z": -5.572883606
  },
  {
    "x": 4.120440483,
    "y": 9.231510162,
    "z": -4.275973797
  },
  {
    "x": 35.97369766,
    "y": -15.32602978,
    "z": 6.1399827
  },
  {
    "x": 19.6020031,
    "y": -10.93280697,
    "z": -8.997013092
  },
  {
    "x": 3.40259409,
    "y": -1.404586792,
    "z": -12.31585884
  },
  {
    "x": -15.32842159,
    "y": 25.33760071,
    "z": -2.019542217
  },
  {
    "x": -0.126819596,
    "y": 9.69093132,
    "z": -5.694917679
  },
  {
    "x": 23.50230408,
    "y": -8.394021988,
    "z": 1.751546144
  },
  {
    "x": 21.57368851,
    "y": -15.76152325,
    "z": -6.441478729
  },
  {
    "x": 7.288537979,
    "y": -10.61456108,
    "z": -13.5098772
  },
  {
    "x": -5.448457241,
    "y": 20.9706974,
    "z": -3.785445213
  },
  {
    "x": -12.47617817,
    "y": 18.25005913,
    "z": -6.238089085
  },
  {
    "x": 9.212367058,
    "y": 3.335594893,
    "z": -2.421536446
  },
  {
    "x": 34.56910706,
    "y": -18.40559196,
    "z": 3.352344275
  },
  {
    "x": 15.10828114,
    "y": -15.04846096,
    "z": -14.52443218
  },
  {
    "x": 1.710868239,
    "y": -0.308674097,
    "z": -7.48474884
  },
  {
    "x": -16.57508087,
    "y": 21.42772675,
    "z": -3.584448099
  },
  {
    "x": -1.840080619,
    "y": 10.21974564,
    "z": -7.831708431
  },
  {
    "x": 23.6171608,
    "y": -10.83709431,
    "z": 3.113062143
  },
  {
    "x": 14.45504189,
    "y": -8.525627136,
    "z": -6.943971634
  },
  {
    "x": -2.553141594,
    "y": -2.053041697,
    "z": -17.52742577
  },
  {
    "x": -12.00718307,
    "y": 5.694917679,
    "z": -17.81934929
  },
  {
    "x": -3.050848961,
    "y": -4.31186676,
    "z": -12.42832088
  },
  {
    "x": 7.221539021,
    "y": -0.212961212,
    "z": -3.464807272
  },
  {
    "x": -7.666603565,
    "y": 4.199403763,
    "z": 18.48694801
  },
  {
    "x": 1.141376376,
    "y": 25.01696014,
    "z": 30.06342125
  },
  {
    "x": 1.591226935,
    "y": 8.726623535,
    "z": 25.51706314
  },
  {
    "x": -2.000399828,
    "y": 7.582855225,
    "z": 14.79721451
  },
  {
    "x": 7.226324081,
    "y": -0.842273533,
    "z": -18.28834343
  },
  {
    "x": 8.798408508,
    "y": 11.43529987,
    "z": 0.801595569
  },
  {
    "x": 3.730410576,
    "y": 9.796216011,
    "z": 14.10808182
  },
  {
    "x": -8.123632431,
    "y": 24.89253426,
    "z": 21.58804321
  },
  {
    "x": -2.560320377,
    "y": 3.823730707,
    "z": 4.934000015
  },
  {
    "x": 13.8735857,
    "y": 8.51844883,
    "z": -0.215354055
  },
  {
    "x": 6.415157318,
    "y": -11.79422283,
    "z": -12.49531937
  },
  {
    "x": -7.389035702,
    "y": 9.052047729,
    "z": 8.238488197
  },
  {
    "x": -6.36251545,
    "y": 24.58625412,
    "z": 14.57946873
  },
  {
    "x": -0.861416221,
    "y": 14.83310795,
    "z": 1.217946649
  },
  {
    "x": 16.93161201,
    "y": 18.38405609,
    "z": 0.658026159
  },
  {
    "x": 3.873979807,
    "y": -1.462014675,
    "z": -4.240081787
  },
  {
    "x": -5.474778175,
    "y": 12.51446152,
    "z": 9.351150513
  },
  {
    "x": 3.527020454,
    "y": 7.197610855,
    "z": 8.319844246
  },
  {
    "x": 5.11585474,
    "y": 26.32104874,
    "z": 11.62433338
  },
  {
    "x": -3.527020454,
    "y": 14.21336651,
    "z": 6.419942856
  },
  {
    "x": -3.007778168,
    "y": 11.16251755,
    "z": -2.148754597
  },
  {
    "x": 12.59103298,
    "y": -4.670789719,
    "z": -0.720239639
  },
  {
    "x": 2.364108801,
    "y": -23.4807682,
    "z": 2.112862349
  },
  {
    "x": -22.87538528,
    "y": 19.88914299,
    "z": 1.828116417
  },
  {
    "x": -14.69671726,
    "y": 19.19043732,
    "z": 11.83968639
  },
  {
    "x": -3.613162041,
    "y": 10.69591713,
    "z": -10.10249615
  },
  {
    "x": 48.74658203,
    "y": -28.38605499,
    "z": -12.22253895
  },
  {
    "x": -2.467000008,
    "y": 19.88674927,
    "z": 6.276373863
  },
  {
    "x": -18.50848198,
    "y": 26.88336372,
    "z": 15.12981701
  },
  {
    "x": -5.771488667,
    "y": 7.216752529,
    "z": -13.07199001
  },
  {
    "x": 48.19623184,
    "y": 23.76072884,
    "z": 11.25583744
  },
  {
    "x": 8.085347176,
    "y": 5.862415314,
    "z": 15.94098473
  },
  {
    "x": -32.64527893,
    "y": 9.724431038,
    "z": 14.06501102
  },
  {
    "x": -4.469792366,
    "y": 18.27637863,
    "z": 6.66640377
  },
  {
    "x": 4.718646049,
    "y": 2.533999205,
    "z": -10.28913689
  },
  {
    "x": 31.97768021,
    "y": -27.78067207,
    "z": 0.023928225
  },
  {
    "x": 1.67736876,
    "y": 23.28455544,
    "z": 3.99840641
  },
  {
    "x": -29.59442902,
    "y": 14.24925804,
    "z": 3.7256248
  },
  {
    "x": -10.26520824,
    "y": 10.68156147,
    "z": -2.297109842
  },
  {
    "x": 28.93161964,
    "y": 7.295715809,
    "z": -3.759124279
  },
  {
    "x": 8.64526844,
    "y": -11.16491032,
    "z": 1.323230982
  },
  {
    "x": -21.39422607,
    "y": 25.55295181,
    "z": 6.881758213
  },
  {
    "x": -6.967899799,
    "y": 13.43809128,
    "z": 4.543970108
  },
  {
    "x": 9.994820595,
    "y": -2.431107759,
    "z": -9.238687515
  },
  {
    "x": 12.95234776,
    "y": -5.778666496,
    "z": 3.531806231
  },
  {
    "x": -8.018348694,
    "y": 15.53181267,
    "z": 4.170689583
  },
  {
    "x": -7.70728159,
    "y": 19.25982857,
    "z": 6.98704195
  },
  {
    "x": -7.130610943,
    "y": 12.1675024,
    "z": 9.131011009
  },
  {
    "x": -3.505485058,
    "y": 9.255437851,
    "z": 2.658426046
  },
  {
    "x": 16.86461449,
    "y": 6.93679285,
    "z": 0.002392823
  },
  {
    "x": 12.98584843,
    "y": 5.568098068,
    "z": 4.852644444
  },
  {
    "x": 16.98425484,
    "y": 7.798208714,
    "z": 10.55952549
  },
  {
    "x": 6.453442574,
    "y": 6.1399827,
    "z": 3.783052444
  },
  {
    "x": 4.369294167,
    "y": 0.081355974,
    "z": 1.349551916
  },
  {
    "x": 4.247260094,
    "y": -2.371287346,
    "z": -0.449850678
  },
  {
    "x": -1.148554921,
    "y": 5.594419479,
    "z": -8.707481384
  },
  {
    "x": -1.191625714,
    "y": 8.432307243,
    "z": -14.87857056
  },
  {
    "x": -1.462014675,
    "y": 11.32283688,
    "z": -8.147561073
  },
  {
    "x": 13.31605721,
    "y": 0.937986493,
    "z": -2.026720762
  },
  {
    "x": 30.6329155,
    "y": -4.701896191,
    "z": -3.534198999
  },
  {
    "x": 9.803394318,
    "y": 1.136590719,
    "z": -11.07876873
  },
  {
    "x": -7.274180889,
    "y": 1.339980602,
    "z": -8.449056625
  },
  {
    "x": -21.95654106,
    "y": 9.276973724,
    "z": -4.847858429
  },
  {
    "x": -1.225125194,
    "y": 6.953542709,
    "z": -2.153540373
  },
  {
    "x": 31.83889771,
    "y": 0.184247345,
    "z": 0.143569365
  },
  {
    "x": 27.66581345,
    "y": -2.349751949,
    "z": -11.37787151
  },
  {
    "x": 12.20339584,
    "y": 1.284945726,
    "z": -12.5934248
  },
  {
    "x": -9.399007797,
    "y": 3.955335617,
    "z": -4.644468784
  },
  {
    "x": -17.2426796,
    "y": 9.544969559,
    "z": -7.365108013
  },
  {
    "x": 2.498106956,
    "y": 6.372087002,
    "z": -3.806980848
  },
  {
    "x": 34.41596985,
    "y": -6.647261143,
    "z": -2.474178553
  },
  {
    "x": 10.92084217,
    "y": 4.292723656,
    "z": -13.68694592
  },
  {
    "x": -3.972085476,
    "y": 2.19182539,
    "z": -6.821937084
  },
  {
    "x": -11.82532883,
    "y": 10.67198944,
    "z": -3.730410576
  },
  {
    "x": 6.185446262,
    "y": 8.729016304,
    "z": -4.938785553
  },
  {
    "x": 34.4111824,
    "y": -3.139383078,
    "z": -4.778466702
  },
  {
    "x": 9.162117958,
    "y": -1.619940877,
    "z": -12.08375454
  },
  {
    "x": -9.150154114,
    "y": 3.034099102,
    "z": -4.943571568
  },
  {
    "x": -11.8971138,
    "y": 9.573683739,
    "z": -8.719445229
  },
  {
    "x": 2.309073925,
    "y": 6.943971634,
    "z": -1.033699393
  },
  {
    "x": 29.77149963,
    "y": -0.87816596,
    "z": -3.859622955
  },
  {
    "x": 16.80957794,
    "y": -2.684746981,
    "z": -15.8428793
  },
  {
    "x": 3.620340586,
    "y": -0.064606212,
    "z": -9.353544235
  },
  {
    "x": -13.53859043,
    "y": 20.47538376,
    "z": 7.369894028
  },
  {
    "x": -1.071984529,
    "y": 10.24128151,
    "z": -10.5092783
  },
  {
    "x": 27.03889465,
    "y": -6.611368656,
    "z": -2.586641073
  },
  {
    "x": 13.1700964,
    "y": -0.375673145,
    "z": -11.79661655
  },
  {
    "x": -1.636690617,
    "y": 2.569891453,
    "z": -7.135397434
  },
  {
    "x": -13.56012535,
    "y": 9.590433121,
    "z": -2.316252232
  },
  {
    "x": 5.163711548,
    "y": 9.36550808,
    "z": -4.867001534
  },
  {
    "x": 31.9513607,
    "y": -7.178467751,
    "z": -3.474378347
  },
  {
    "x": 15.40738487,
    "y": -0.179461703,
    "z": -13.78265953
  },
  {
    "x": -3.352344275,
    "y": 6.549155712,
    "z": -7.771887779
  },
  {
    "x": -15.69691658,
    "y": 13.23948765,
    "z": -2.821137905
  },
  {
    "x": 9.760323524,
    "y": 6.443871021,
    "z": -3.270988703
  },
  {
    "x": 29.65903854,
    "y": -2.658426046,
    "z": -3.646661758
  },
  {
    "x": 11.19841099,
    "y": -6.001199245,
    "z": -12.99542046
  },
  {
    "x": -6.415157318,
    "y": 1.383051395,
    "z": -7.034898281
  },
  {
    "x": -12.93559933,
    "y": 8.087740898,
    "z": -12.1675024
  },
  {
    "x": 4.438685894,
    "y": 9.966106415,
    "z": -2.187039852
  },
  {
    "x": 31.87479019,
    "y": -2.452643394,
    "z": -4.476971149
  },
  {
    "x": 7.743173599,
    "y": -0.074177504,
    "z": -12.69631672
  },
  {
    "x": -10.87537861,
    "y": 1.911865354,
    "z": -5.094319344
  },
  {
    "x": -10.59063339,
    "y": 11.47597694,
    "z": -3.349951744
  },
  {
    "x": 11.66740322,
    "y": 7.673782349,
    "z": -4.338187695
  },
  {
    "x": 32.93241882,
    "y": -2.907279491,
    "z": -7.113861561
  },
  {
    "x": 6.884150982,
    "y": 1.098305583,
    "z": -10.31067276
  },
  {
    "x": -18.82912064,
    "y": 7.5421772,
    "z": 1.079162955
  },
  {
    "x": -8.528019905,
    "y": 12.09571838,
    "z": -5.041677952
  },
  {
    "x": 8.152346611,
    "y": 5.223531246,
    "z": -3.072384119
  },
  {
    "x": 32.12842941,
    "y": -3.574877024,
    "z": -8.774479866
  },
  {
    "x": 9.415757179,
    "y": 0.344566494,
    "z": -13.471591
  },
  {
    "x": -6.678368568,
    "y": 5.467599869,
    "z": -4.52482748
  },
  {
    "x": -11.56451035,
    "y": 12.3493576,
    "z": -3.282952547
  },
  {
    "x": 7.810173512,
    "y": 6.273981094,
    "z": -6.458228588
  },
  {
    "x": 23.77029991,
    "y": -0.87816596,
    "z": -9.267402649
  },
  {
    "x": 3.409772158,
    "y": 0.885344326,
    "z": -8.013563156
  },
  {
    "x": -16.90289879,
    "y": 8.798408508,
    "z": -4.838287354
  },
  {
    "x": -2.108076811,
    "y": 10.87777138,
    "z": -6.661618233
  },
  {
    "x": 18.19502258,
    "y": -0.614955366,
    "z": -4.945964336
  },
  {
    "x": 20.77448463,
    "y": -2.699103832,
    "z": -8.781659126
  },
  {
    "x": 2.49332118,
    "y": 2.249253273,
    "z": -9.183652878
  },
  {
    "x": -13.78265953,
    "y": 11.0811615,
    "z": -4.448256969
  },
  {
    "x": -0.784845769,
    "y": 11.79661655,
    "z": -6.728617191
  },
  {
    "x": 16.51765442,
    "y": -1.239482045,
    "z": -6.491727352
  },
  {
    "x": 18.92004776,
    "y": -3.282952547,
    "z": -8.221738815
  },
  {
    "x": 5.570490837,
    "y": 0.174676061,
    "z": -6.783651829
  },
  {
    "x": -6.309873104,
    "y": 5.572883606,
    "z": -6.250052929
  },
  {
    "x": -3.285345316,
    "y": 9.956534386,
    "z": -6.922436237
  },
  {
    "x": 26.1894455,
    "y": -3.524627924,
    "z": -4.261617184
  },
  {
    "x": 16.98904037,
    "y": -0.949950576,
    "z": -8.018348694
  },
  {
    "x": -3.675375462,
    "y": 4.95314312,
    "z": -8.760124207
  },
  {
    "x": -11.00698471,
    "y": 10.42552853,
    "z": -7.324430466
  },
  {
    "x": 10.38245773,
    "y": 4.840680122,
    "z": -3.376272678
  },
  {
    "x": 27.90270424,
    "y": -7.226324081,
    "z": -1.249053478
  },
  {
    "x": 6.764510155,
    "y": -0.138783723,
    "z": -11.93779182
  },
  {
    "x": -9.068797112,
    "y": 5.941378593,
    "z": -8.097311974
  },
  {
    "x": -6.898508072,
    "y": 13.44766331,
    "z": -6.668797016
  },
  {
    "x": 11.38983536,
    "y": 2.519642353,
    "z": -2.916850805
  },
  {
    "x": 25.53620148,
    "y": -7.745566845,
    "z": -2.840280533
  },
  {
    "x": 9.064012527,
    "y": -1.529013753,
    "z": -12.02632618
  },
  {
    "x": -3.763910055,
    "y": 4.567898273,
    "z": -8.877371788
  },
  {
    "x": -5.446063995,
    "y": 12.2608223,
    "z": -5.204389572
  },
  {
    "x": 11.17208862,
    "y": 0.184247345,
    "z": -3.840480089
  },
  {
    "x": 26.18465805,
    "y": -13.64865971,
    "z": -3.347558975
  },
  {
    "x": 5.362315655,
    "y": 0.110069841,
    "z": -10.02353477
  },
  {
    "x": -9.171689034,
    "y": 9.702895164,
    "z": -7.951349258
  },
  {
    "x": -2.313859463,
    "y": 12.39721489,
    "z": -6.297908783
  },
  {
    "x": 16.02712631,
    "y": -0.574277461,
    "z": -2.574677229
  },
  {
    "x": 26.77568436,
    "y": -13.16291714,
    "z": -2.682354212
  },
  {
    "x": 8.137989998,
    "y": -3.605983734,
    "z": -9.248259544
  },
  {
    "x": -5.807380676,
    "y": 9.399007797,
    "z": -7.786244869
  },
  {
    "x": -4.811966419,
    "y": 15.03410435,
    "z": -7.154539585
  },
  {
    "x": 9.17886734,
    "y": 1.55054903,
    "z": -3.766302824
  },
  {
    "x": 29.16372299,
    "y": -14.55314732,
    "z": -1.732403636
  },
  {
    "x": 10.36809921,
    "y": -0.792024314,
    "z": -9.281759262
  },
  {
    "x": -4.271188736,
    "y": 5.520241737,
    "z": -11.1505537
  },
  {
    "x": -2.344966173,
    "y": 12.68913746,
    "z": -4.68275404
  },
  {
    "x": 5.19481802,
    "y": 5.922235966,
    "z": -2.656033039
  },
  {
    "x": 29.92224693,
    "y": -12.303895,
    "z": -3.840480089
  },
  {
    "x": 8.338986397,
    "y": 1.225125194,
    "z": -12.44746304
  },
  {
    "x": -7.025327682,
    "y": 12.97867012,
    "z": -3.424129248
  },
  {
    "x": -3.393022537,
    "y": 13.70848083,
    "z": -6.472585201
  },
  {
    "x": 5.675775528,
    "y": 2.122433662,
    "z": -3.929014683
  },
  {
    "x": 27.1202507,
    "y": -6.898508072,
    "z": -3.117847919
  },
  {
    "x": 15.09871101,
    "y": -1.229910731,
    "z": -5.565705299
  },
  {
    "x": -1.682154298,
    "y": 5.934200287,
    "z": -8.073383331
  },
  {
    "x": -4.740181923,
    "y": 11.1936245,
    "z": -6.015556335
  },
  {
    "x": 0.368494689,
    "y": 9.040083885,
    "z": -5.860023022
  },
  {
    "x": 17.80020714,
    "y": -2.857030153,
    "z": -3.550948858
  },
  {
    "x": 17.15653801,
    "y": -2.569891453,
    "z": -6.697510242
  },
  {
    "x": 4.273581028,
    "y": 2.254039049,
    "z": -7.910671234
  },
  {
    "x": -1.624726534,
    "y": 8.528019905,
    "z": -7.219145775
  },
  {
    "x": 0.157926291,
    "y": 8.142775536,
    "z": -6.659225464
  },
  {
    "x": 8.169095993,
    "y": 1.540977836,
    "z": -6.063412666
  },
  {
    "x": 12.59103298,
    "y": -2.560320377,
    "z": -5.704488754
  },
  {
    "x": 5.659025192,
    "y": -0.083748788,
    "z": -6.862615108
  },
  {
    "x": 2.340180635,
    "y": 2.388036966,
    "z": -7.566104889
  },
  {
    "x": 2.165504456,
    "y": 1.775474429,
    "z": -7.09471941
  },
  {
    "x": 4.141976357,
    "y": 2.562713146,
    "z": -6.84586525
  },
  {
    "x": 7.365108013,
    "y": 2.995814085,
    "z": -3.876372576
  },
  {
    "x": 11.18405342,
    "y": 3.194417953,
    "z": -2.950350285
  },
  {
    "x": 8.147561073,
    "y": 2.636890411,
    "z": -3.24466753
  },
  {
    "x": 5.840879917,
    "y": 3.967299938,
    "z": -4.039084435
  },
  {
    "x": 5.345565319,
    "y": 5.96291399,
    "z": -3.795016766
  },
  {
    "x": 5.867200851,
    "y": 5.498706818,
    "z": -2.888136864
  },
  {
    "x": 6.577868938,
    "y": 6.795616627,
    "z": -3.017349243
  },
  {
    "x": 5.381458282,
    "y": 8.690732002,
    "z": -3.297309637
  },
  {
    "x": 6.951149464,
    "y": 9.341579437,
    "z": -2.562713146
  },
  {
    "x": 6.429513931,
    "y": 9.650253296,
    "z": -4.053441525
  },
  {
    "x": 3.797409296,
    "y": 7.611568451,
    "z": -4.610969543
  },
  {
    "x": 2.469392776,
    "y": 9.308080673,
    "z": -7.412964344
  },
  {
    "x": 2.019542217,
    "y": 9.556933403,
    "z": -8.985049248
  },
  {
    "x": 2.569891453,
    "y": 4.900500774,
    "z": -9.674181938
  },
  {
    "x": 1.076770186,
    "y": 5.723631859,
    "z": -10.45184898
  },
  {
    "x": 1.268196106,
    "y": 3.345165968,
    "z": -11.54297733
  },
  {
    "x": -0.605384111,
    "y": 4.993820667,
    "z": -11.52383423
  },
  {
    "x": 0.078963146,
    "y": 1.35673058,
    "z": -10.96391296
  },
  {
    "x": 0.078963146,
    "y": -0.009571291,
    "z": -9.774680138
  },
  {
    "x": -0.722632408,
    "y": -0.49531427,
    "z": -9.633503914
  },
  {
    "x": 0.275174588,
    "y": -0.162711948,
    "z": -9.702895164
  },
  {
    "x": -0.248853549,
    "y": -0.820738137,
    "z": -9.853643417
  },
  {
    "x": -0.691525698,
    "y": -0.311066955,
    "z": -10.05942631
  },
  {
    "x": -0.526420951,
    "y": -0.081355974,
    "z": -10.32981586
  },
  {
    "x": -0.648454905,
    "y": -1.043270707,
    "z": -9.533005714
  },
  {
    "x": 0.342173636,
    "y": -1.100698352,
    "z": -9.195617676
  },
  {
    "x": -0.327816725,
    "y": -0.832702279,
    "z": -9.231510162
  },
  {
    "x": -1.05523479,
    "y": -0.021535406,
    "z": -10.12403297
  },
  {
    "x": -1.337587714,
    "y": -0.404386997,
    "z": -10.20060253
  },
  {
    "x": -1.452443361,
    "y": 0.215354055,
    "z": -10.26281548
  },
  {
    "x": -1.148554921,
    "y": -0.971485972,
    "z": -9.992427826
  },
  {
    "x": -1.378265977,
    "y": -0.916451097,
    "z": -9.774680138
  },
  {
    "x": -1.217946649,
    "y": -1.122233868,
    "z": -9.868000031
  },
  {
    "x": -1.261017442,
    "y": -0.94277215,
    "z": -9.796216011
  },
  {
    "x": -1.170090318,
    "y": -1.337587714,
    "z": -9.760323524
  },
  {
    "x": -1.225125194,
    "y": -1.459621787,
    "z": -9.430113792
  },
  {
    "x": -1.272981524,
    "y": -1.134197831,
    "z": -9.645467758
  },
  {
    "x": -1.435693622,
    "y": -0.789631486,
    "z": -9.865608215
  },
  {
    "x": -0.91166544,
    "y": -1.296909809,
    "z": -9.712467194
  },
  {
    "x": -0.835095108,
    "y": -1.684547067,
    "z": -9.717252731
  },
  {
    "x": -1.569691539,
    "y": -0.624526739,
    "z": -9.7196455
  },
  {
    "x": -0.868594587,
    "y": -0.550349176,
    "z": -10.42074299
  },
  {
    "x": -1.270588875,
    "y": -0.904486954,
    "z": -10.73180866
  },
  {
    "x": -1.028913736,
    "y": 0.665204704,
    "z": -10.57388306
  },
  {
    "x": 0.504885554,
    "y": 1.299302697,
    "z": -9.755537987
  },
  {
    "x": 0.011964113,
    "y": -1.174875975,
    "z": -9.272188187
  },
  {
    "x": -0.246460736,
    "y": -1.890329957,
    "z": -9.432506561
  },
  {
    "x": -0.184247345,
    "y": -2.294716835,
    "z": -9.635896683
  },
  {
    "x": -0.91166544,
    "y": -2.656033039,
    "z": -9.375079155
  },
  {
    "x": -1.445264816,
    "y": -3.5796628,
    "z": -9.44207859
  },
  {
    "x": -1.835294843,
    "y": -1.155733347,
    "z": -9.913464546
  },
  {
    "x": -1.715653777,
    "y": -2.033899307,
    "z": -9.891928673
  },
  {
    "x": -1.639083385,
    "y": -1.26341033,
    "z": -9.480363846
  },
  {
    "x": -0.949950576,
    "y": -1.048056245,
    "z": -9.829714775
  },
  {
    "x": -1.043270707,
    "y": -0.382851601,
    "z": -9.810573578
  },
  {
    "x": -0.488135844,
    "y": -1.375873089,
    "z": -9.461220741
  },
  {
    "x": -0.906879723,
    "y": -0.39960137,
    "z": -9.829714775
  },
  {
    "x": -0.595812857,
    "y": -1.251446128,
    "z": -9.879963875
  },
  {
    "x": -0.595812857,
    "y": -0.79920274,
    "z": -9.7698946
  },
  {
    "x": -0.868594587,
    "y": -1.787438512,
    "z": -9.767501831
  },
  {
    "x": -0.899701357,
    "y": -0.732203782,
    "z": -9.726823807
  },
  {
    "x": -2.522034883,
    "y": -1.361515999,
    "z": -9.925428391
  },
  {
    "x": -1.517049551,
    "y": -1.122233868,
    "z": -9.949356079
  },
  {
    "x": -0.569491804,
    "y": -1.012163997,
    "z": -9.987641335
  },
  {
    "x": -3.270988703,
    "y": -0.70348984,
    "z": -10.14078236
  },
  {
    "x": 1.11984098,
    "y": -7.38664341,
    "z": -10.54995537
  },
  {
    "x": -2.282752752,
    "y": -0.595812857,
    "z": -10.12403297
  },
  {
    "x": -1.306481123,
    "y": -1.466800213,
    "z": -9.791430473
  },
  {
    "x": -0.880558729,
    "y": -1.141376376,
    "z": -9.695716858
  },
  {
    "x": -0.777667344,
    "y": -1.16769743,
    "z": -9.611968994
  },
  {
    "x": -0.177068874,
    "y": -0.418743968,
    "z": -9.791430473
  },
  {
    "x": 0.105284192,
    "y": -0.552742064,
    "z": -9.662218094
  },
  {
    "x": -0.019142581,
    "y": -0.514456868,
    "z": -9.705288887
  },
  {
    "x": 0.260817677,
    "y": -0.729810894,
    "z": -9.851251602
  },
  {
    "x": 0.157926291,
    "y": -0.547956347,
    "z": -9.796216011
  },
  {
    "x": -0.055034921,
    "y": -1.074377298,
    "z": -9.645467758
  },
  {
    "x": -0.356530547,
    "y": -1.703689694,
    "z": -9.791430473
  },
  {
    "x": -0.210568383,
    "y": -1.442872167,
    "z": -10.08813953
  },
  {
    "x": -0.299102843,
    "y": -0.91166544,
    "z": -10.04746246
  },
  {
    "x": -0.172283247,
    "y": -1.895115495,
    "z": -9.750752449
  },
  {
    "x": -0.071784683,
    "y": -0.926022351,
    "z": -9.927821159
  },
  {
    "x": -0.311066955,
    "y": -1.629512191,
    "z": -9.676574707
  },
  {
    "x": -0.265603304,
    "y": -1.813759446,
    "z": -9.626325607
  },
  {
    "x": -0.275174588,
    "y": -1.50269258,
    "z": -9.870393753
  },
  {
    "x": -0.200997099,
    "y": -1.258624673,
    "z": -9.832108498
  },
  {
    "x": -0.344566494,
    "y": -1.208375454,
    "z": -9.820144653
  },
  {
    "x": -0.186640158,
    "y": -1.43808639,
    "z": -9.827322006
  },
  {
    "x": -0.406779855,
    "y": -1.756331921,
    "z": -9.856036186
  },
  {
    "x": -0.457029104,
    "y": -1.445264816,
    "z": -9.958927155
  },
  {
    "x": -0.354137748,
    "y": -1.368694544,
    "z": -9.923035622
  },
  {
    "x": -0.624526739,
    "y": -1.713261008,
    "z": -9.736394882
  },
  {
    "x": -0.387637258,
    "y": -1.706082463,
    "z": -9.655039787
  },
  {
    "x": -0.076570325,
    "y": -1.801795244,
    "z": -9.6693964
  },
  {
    "x": -0.428315252,
    "y": -1.643869162,
    "z": -9.762716293
  },
  {
    "x": -0.445064962,
    "y": -1.454836249,
    "z": -9.829714775
  },
  {
    "x": -0.614955366,
    "y": -2.012363672,
    "z": -9.743573189
  },
  {
    "x": -0.593420029,
    "y": -1.794616938,
    "z": -9.844072342
  },
  {
    "x": -0.595812857,
    "y": -2.041077614,
    "z": -9.678967476
  },
  {
    "x": -0.610169768,
    "y": -1.749153256,
    "z": -9.777072906
  },
  {
    "x": -0.679561555,
    "y": -1.430907965,
    "z": -9.872786522
  },
  {
    "x": -0.602991283,
    "y": -1.61515522,
    "z": -9.829714775
  },
  {
    "x": -0.49531427,
    "y": -1.849651814,
    "z": -9.705288887
  },
  {
    "x": -0.629312336,
    "y": -1.964507341,
    "z": -9.755537987
  },
  {
    "x": -0.478564501,
    "y": -1.897508383,
    "z": -9.623932838
  },
  {
    "x": -0.507278383,
    "y": -2.029113531,
    "z": -9.84885788
  },
  {
    "x": -0.567098916,
    "y": -1.67736876,
    "z": -9.901500702
  },
  {
    "x": -0.49531427,
    "y": -2.000399828,
    "z": -9.736394882
  },
  {
    "x": -0.418743968,
    "y": -1.864008904,
    "z": -9.537791252
  },
  {
    "x": -0.677168846,
    "y": -1.763510227,
    "z": -9.631111145
  },
  {
    "x": -0.564706147,
    "y": -2.440679073,
    "z": -9.537791252
  },
  {
    "x": -0.631705165,
    "y": -1.35673058,
    "z": -9.860822678
  },
  {
    "x": -0.538385093,
    "y": -1.794616938,
    "z": -9.64068222
  },
  {
    "x": -0.641276419,
    "y": -1.974078774,
    "z": -9.56411171
  },
  {
    "x": -0.394815743,
    "y": -1.629512191,
    "z": -9.638289452
  },
  {
    "x": -0.952343404,
    "y": -1.787438512,
    "z": -9.98285675
  },
  {
    "x": -0.868594587,
    "y": -2.012363672,
    "z": -9.710074425
  },
  {
    "x": -0.600598454,
    "y": -1.976471543,
    "z": -9.726823807
  },
  {
    "x": -0.375673145,
    "y": -1.521835208,
    "z": -10.02353477
  },
  {
    "x": -0.641276419,
    "y": -2.289931059,
    "z": -9.611968994
  },
  {
    "x": -0.693918586,
    "y": -1.490728498,
    "z": -9.757929802
  },
  {
    "x": -0.660419047,
    "y": -1.986042738,
    "z": -9.908678055
  },
  {
    "x": -0.507278383,
    "y": -1.873580098,
    "z": -9.662218094
  },
  {
    "x": -0.653240561,
    "y": -1.517049551,
    "z": -9.695716858
  },
  {
    "x": -0.579063058,
    "y": -1.672582984,
    "z": -9.554540634
  },
  {
    "x": -0.595812857,
    "y": -1.610369682,
    "z": -9.743573189
  },
  {
    "x": -0.744167805,
    "y": -1.730010748,
    "z": -9.793823242
  },
  {
    "x": -0.557527661,
    "y": -1.732403636,
    "z": -9.793823242
  },
  {
    "x": -0.576670289,
    "y": -1.907079697,
    "z": -9.623932838
  },
  {
    "x": -0.528813779,
    "y": -1.744367838,
    "z": -9.7698946
  },
  {
    "x": -0.729810894,
    "y": -1.634297967,
    "z": -9.674181938
  },
  {
    "x": -0.586241543,
    "y": -1.500299811,
    "z": -9.875179291
  },
  {
    "x": -0.567098916,
    "y": -2.029113531,
    "z": -9.822537422
  },
  {
    "x": -0.715453982,
    "y": -1.954936147,
    "z": -9.6693964
  },
  {
    "x": -0.691525698,
    "y": -1.349551916,
    "z": -9.796216011
  },
  {
    "x": -0.873380244,
    "y": -2.0769701,
    "z": -9.69093132
  },
  {
    "x": -0.564706147,
    "y": -1.756331921,
    "z": -9.784252167
  },
  {
    "x": -0.926022351,
    "y": -1.208375454,
    "z": -9.803394318
  },
  {
    "x": -0.612562597,
    "y": -2.591426849,
    "z": -8.853443146
  },
  {
    "x": -0.782453001,
    "y": -1.277767301,
    "z": -9.999605179
  }
];
if (ac_idx >= data.length) {
    ac_idx = 0;
}
return data[ac_idx];
};
