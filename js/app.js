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

/*
 * Function invoked on onload event
 */
function init()
{
    console.log("init() called...");
    heartRateEl = document.getElementById('heart-rate-value');
    heartImg = document.getElementById('heart-img');
    infoBackBtn = document.getElementById('info-back-btn');
    hrmControlBtn= document.getElementById('hrm-control-btn');
    measuringText = document.getElementById('measuring-info');

    //Registering click event handler for buttons.
    infoBackBtn.addEventListener('click', onInfoBackBtnClick);
    hrmControlBtn.addEventListener('click', onhrmControlBtnClick);
}

/*
 * Click event handler for HRM sensor Start/Stop
 * Toggles the sensor state.
 */
function onhrmControlBtnClick() {
    console.log("onhrmControlBtnClick() called...");

    if (hrmControlBtn.innerHTML === TEXT_START){
        console.log("info on button = start");
        startSensor();
    } else {
        console.log("info on button = stop");
        stopSensor();
    }
}

/*
 * Starts the HRM sensor and registers a change listener.
 * Update the UI: Shows measuring text, and change button text to Stop.
 */
function startSensor() {
    console.log("start sensor() called...");
    sensorStarted = true;
    clearTimers();
    measuringText.classList.remove('hide');
    measuringText.classList.add('show');
    hrmControlBtn.innerHTML = TEXT_STOP;

    tizen.humanactivitymonitor.start('HRM', onHeartRateDataChange, onerrorCB);
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

    var rate = heartRateInfo.heartRate;
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
    }
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
    hrmControlBtn.innerHTML = TEXT_START;
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

