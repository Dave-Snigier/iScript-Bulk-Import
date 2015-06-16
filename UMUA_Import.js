/*
*******************************************************************************************
	name:           UMBUA_Databank_Import.js
	Author:         Dave Snigier (UMass)
	Created:        April 9, 2013
	Last Updated:
----------------------------------------------------------------------------------------------
	Summary:
		Runs as an intool script. Only one instance should be running at any given time.

	Mod Summary:

	Business Use:
		Imports documents received from Databank for Boston Undergraduate Admissions.


*********************************************************************************************/

//********************* Include additional libraries *******************

#include "$IMAGENOWDIR6$\\script\\lib\\yaml_loader.jsh"
#include "$IMAGENOWDIR6$\\script\\lib\\iScriptDebug.jsh"
#include "$IMAGENOWDIR6$\\script\\STL\\packages\\File\\CSVObject.js"
#include "$IMAGENOWDIR6$\\script\\STL\\packages\\File\\doesFileExist.js"
#include "$IMAGENOWDIR6$\\script\\STL\\packages\\File\\writeToFile.js"
#include "$IMAGENOWDIR6$\\script\\lib\\envVariable.jsh"
#include "$IMAGENOWDIR6$\\script\\lib\\createDirectoryRecursive.jsh"
#include "$IMAGENOWDIR6$\\script\\STL\\packages\\File\\writeToFile.js"
#include "$IMAGENOWDIR6$\\script\\STL\\packages\\Workflow\\createOrRouteDoc.js"


//*********************         Configuration        *******************
var REPORT_CONFIG_DIRECTORY_PATH = imagenowDir6+"\\script\\UMBUA_Databank_Import\\config\\";
var MAX_INDEX_KEY_LENGTH = 40;
var IMAGEMAGICK_TOOL = "D:\\Program Files\\ImageMagick-6.8.9-Q16\\convert";

// Logging
// false - log to stdout(intool), wfUser(inscript), true - log to inserverXX/log/ directory

var LOG_TO_FILE = true;
var DEBUG_LEVEL = 5;
var debug = {};

//var ErrLogQName = "BUA Databank Import Errors";

var CUR_CFG = {};
createStagingObjects();

// JSLint configuration:
/*global RouteItem, moment, STAGE_PROPS:true, STAGE_KEYS:true, STAGE_NOT_USED:true, SPLIT_DOCS,
CUR_CFG, QUEUE_ERROR,
iScriptDebug, LOG_TO_FILE, DEBUG_LEVEL, CONFIG_VERIFIED, Buffer, Clib, printf,
INAutoForm, INBizList, INBizListItem, INClassProp,
INDocManager, INDocPriv, INDocType, INDocTypeList, INDocument, INDrawer, INExternMsg,
INFont, INGroup, INInstanceProp, INKeys, INLib, INLogicalObject, INMail, INOsm, INPriv,
INPrivEnum, INFolder, InProjManager, INProjectType, INProjTypeList, INProperty,
INRemoteService, INRetentionHold, INSequence, INSubObject, INSubobPriv, INSubobTemplate,
INTask, INTaskTemplate, INUser, INVersion, INView, INWfAdmin, INWfItem, INWfQueue,
INWfQueuePriv, INWorksheet, INWsDataDef, INWsPresentation, currentTask, currentWfItem,
currentWfQueue, currentDestinationWfQueue, _argv*/


/**
 * Get a list of CSV files needing to be processed
 *
 * @param {String} baseDirectory directory to look for unzip folders within
 * @param {String} fileNameGlob pattern to match when looking for index files
 * @param {Object} config configuration object of current report
 * @return {Array|Boolean} array of Objects or false on error
 *    - directory: directory name
 *    - file: name of file
 */
function getListofIndexFiles(config) {
	var baseDirectory = config.unzipPath;
	var fileNameGlob = config.csvFileName;
	var returnFiles = [];
debug.log('DEBUG','%s\n',baseDirectory);
	// search the directories specified for subdirectories
	var directories = SElib.directory(baseDirectory + "\\*", false);	
	debug.log('DEBUG', 'directories: [%s]\n', directories);
	// if directories are found then search them for files that match the config
	if (isArray(directories)) {
		for (var i = 0; i < directories.length; i++) {
			var files = SElib.directory(directories[i].name + "\\" + fileNameGlob, false);
			// if matching files are found, then add them to the list
			if (isArray(files)) {
				for (var i2 = 0; i2 < files.length; i2++) {
					//printf(directories[i].name+"---"+files[i2].name);
					returnFiles.push({directory: directories[i].name, file: files[i2].name});
				}
			}

		}
	}
	return returnFiles;
}

/**
 * Checks if an object is an array
 *
 * @param {Object} obj object to test
 * @returns {Boolean} true if object is an array, false if it is not
 */
function isArray(obj) {
	if (typeof obj === 'undefined' || obj === null) {
		return false;
	} else {
		return Object.prototype.toString.call(obj) === '[object Array]';
	}
}


/**
 * creates a csv object with type+Name as the field keys
 * @param {Object} config configuration object of current report
 * @param {String} path location on disk of csv file to parse
 * @returns {Object|Boolean} return a CSV object on success, false on failure
 */
function loadCSV(config, path) {
	var delim = config.delim || "^";
	var csvFields = [];

	for (var i = 0; i < config.csvValues.length; i++) {
		var tempObj = {multiple: false};
		tempObj.name = config.csvValues[i].type + config.csvValues[i].name;
		csvFields.push(tempObj);
	}

	var csv = new CSVObject(path, csvFields, {intHeaderLen:0, delim: delim, innerDelim:'"'});
	if (!csv.openFile('r')) {
		debug.log("ERROR", "Failed to open CSV file [%s]: %s\n", path, Clib.strerror(Clib.errno));
		return false;
	}
	return csv;
}


/**
 * maps values from a line of a csv to the global staging objects
 *
 * @param {Array} config an array of csv config items
 * @line {Object} line in the csv to pull values from
 * @returns {Boolean} true if successful, false otherwise
 */
function mapValuesFromCSV(config, line) {
	debug.log('DEBUG', 'Called: mapValuesFromCSV()\n');
	var everythingOK = true;
	var value = '';
	for (var i = 0; i < config.length; i++) {
		var key = config[i].type + config[i].name;
		value = line[key];

		if (!stageValue(config[i].name, config[i].type, value)) {
			everythingOK = false;
		}
	}
	return everythingOK;
}


/**
 * maps values from static configuration within the config to the global staging objects
 *
 * @param {Array} config an array of static config items
 * @return {Boolean} true if successful, false otherwise
 */
function mapValuesFromStaticConfig(config) {
	debug.log('DEBUG', 'Called: mapValuesFromStaticConfig()\n');
	var everythingOK = true;
	var value = '';
	for (var i = 0; i < config.length; i++) {
		if (typeof config[i].value !== 'undefined') {
			// assign and cast to a string
			value = config[i].value + '';
		} else {
			value = '';
		}
		if (!stageValue(config[i].name, config[i].type, value)) {
			everythingOK = false;
		}
	}
	return everythingOK;
}

/**
 * used by the map functions to add values to the global config objects
 *
 * @param {String} name key to use on the object
 * @param {String} type what type of value it is, used to determine which object to map to
 * @param {String} value the value of the key
 * @returns {Boolean} true if successful, false otherwise
 */
function stageValue(name, type, value) {
	var everythingOK = true;

	// check to make sure we actually have a valid type
	if (!type) {
		debug.log('CRITICAL', 'Type not defined in config for [%s]\n', name);
		return false;
	}
	type = type.toUpperCase();
	if (type === 'IDX' || type === 'INDEX') {
		if (!stageToIndex(name, value)) {
			debug.log('WARNING', 'Incorrect config. No index key of: %s\n', name);
			everythingOK = false;
		}
	} else if (type === 'CP' || type === 'PROP') {
		if (!stageToProps(name, value)) {
			debug.log('WARNING', 'Incorrect config. Cannot stage custom property: %s\n', name);
			everythingOK = false;
		}
	} else {
		if (!stageToTemp(name, value)) {
			debug.log('WARNING', 'Incorrect config. Cannot stage to temp array: %s\n', name);
			everythingOK = false;
		}
	}
	return everythingOK;

	function stageToIndex(name, value) {
		debug.log('DEBUG', 'Called: stageToIndex(%s, %s)\n', name, value);
		
		var nameUpper = "";
		if (name) {
			nameUpper = name.toUpperCase();
		}
		
		if (!value) {
			value = "";
		}
		// truncate values greater than 40 characters
		if (value.length > MAX_INDEX_KEY_LENGTH) {
			value = value.substring(0, MAX_INDEX_KEY_LENGTH);
			debug.log('WARNING', 'an index key has been truncated\n');
		}

		switch (nameUpper) {
		case 'DRAWER':
			STAGE_KEYS.drawer = value;
			break;
		case 'FOLDER':
			STAGE_KEYS.folder = value;
			break;
		case 'TAB':
			STAGE_KEYS.tab = value;
			break;
		case 'F3':
			STAGE_KEYS.f3 = value;
			break;
		case 'F4':
			STAGE_KEYS.f4 = value;
			break;
		case 'F5':
			STAGE_KEYS.f5 = value;
			break;
		case 'DOCTYPENAME':
			STAGE_KEYS.docTypeName = value;
			break;
		case 'DOCTYPE':
			STAGE_KEYS.docTypeName = value;
			break;
		case 'DOCUMENT TYPE':
			STAGE_KEYS.docTypeName = value;
			break;
		default:
			return false;
		}
		return true;
	}

	function stageToProps(name, value) {
		debug.log('DEBUG', 'Called: stageToProps(%s, %s)\n', name, value);
		STAGE_PROPS[name] = value;
		return true;
	}

	function stageToTemp(name, value) {
		debug.log('DEBUG', 'Called: stageToTemp(%s, %s)\n', name, value);
		STAGE_NOT_USED[name] = value;
		return true;
	}
}

/**
 * retries a function for a number of times until it returns a successful result
 *
 * @param {Function} func the function to run
 * @param {Array} parameters An array of parameters that should be applied to the function
 * @param {any} errorCondition function return value needs to equal this for a retry to occur
 * @param {Integer} retryTimes max number of times to try before returning an error
 * @param {Integer} timeBetweenTries amount of time to wait between retries of the function
 * @returns {Integer|Boolean} Number of tries on success, error on failure
 */
function retryFunctionIfError(func, parameters, errorCondition, retryTimes, timeBetweenTries) {
	debug.log('DEBUG', 'retry function: parameters\n');
	debug.logObject('DEBUG', parameters, 1000);

	debug.log('DEBUG', 'errorCondition: %s\n', errorCondition);
	debug.log('DEBUG', 'retryTimes%s\n', retryTimes);
	debug.log('DEBUG', 'timeBetweenTries: %s\n', timeBetweenTries);

	var counter = 0;
	var funcReturnValue;
	do {
		debug.log('DEBUG', 'before function is run\n');
		funcReturnValue = func.apply(null, parameters);
		debug.log('DEBUG', 'after function is run\n');
		counter++;
		if (timeBetweenTries) {
			debug.log('DEBUG', 'before sleep\n');
			SElib.suspend(timeBetweenTries);
			debug.log('DEBUG', 'after sleep\n');
		}
	} while (counter <= retryTimes && funcReturnValue === errorCondition);

	if (counter >= retryTimes && funcReturnValue === errorCondition) {
		return false;
	} else {
		return counter;
	}
}

/**
 * Creates a new document in ImageNow from a file located on the filesystem.
 * If storage is successful delete source file
 *
 * @param {String} file path to tiff document
 * @param {Object} inkeys object
 * @param {Array} propArr Array of ininstanceprop objects for the custom properties to be stored
 * @param {Boolean} splitMultipage (optional) true if tiff image should be split
 * @return {Object|Boolean} INDocument object if storage was successful, false if errors were encountered
 *
 */
function storeDocument(file, inkeys, propArr, splitMultipage) {
	// set defaults
	splitMultipage = splitMultipage || false;

	// check if file exists
	file = SElib.fullpath(file);
	if (file === null) {
		debug.log('ERROR', 'storeDocument: file does not exist [%s]\n', file);
		return false;
	}

	// create new document instance in system
	var doc = new INDocument(inkeys);
	if (!doc.create(propArr)) {
		debug.log('ERROR', 'storeDocument: Could not create document. [%s]\n', getErrMsg());
		return false;
	}

	// split the tiff image if needed
	var pagesArray = [];
	var tiff = new TiffSplitter(file);
	if (splitMultipage) {
		pagesArray = tiff.split();
		if (!pagesArray) {
			debug.log('ERROR', 'storeDocument: could not split tiffs on file [%s]\n', file);
			return false;
		}
	} else {
		pagesArray.push(file);
	}

	// store each of the pages on the document
	for (var i = 0; i < pagesArray.length; i++) {

		// attempt to store the pages a few times before giving up
		if (!storePage(pagesArray[i], 3)) {
			// TODO throw error
		}
	}

	function storePage(path, attempts) {
		if (attempts <= 0) {
			return false;
		}
		if (!path) {
			return false;
		}

		if (!doc.storeObject(path)) {
			debug.log('ERROR', 'retryFunctionIfError: Cannot store object [%s]\nserver says: [%s]', pagesArray[i], getErrMsg());
			SElib.suspend(30);

			return storePage(path, attempts - 1);
		}
		return true;
	}


	tiff.deleteAllFiles();

	doc.getInfo(["doc.id"]);

	return doc;
}


/**
 * converts stage objects into their native formats in-place
 *
 * STAGE_KEYS --> inkeys object
 *
 * STAGE_PROPS --> array of inInstanceProp objects
 */
function convertStageObjectToNative() {
	// convert the index keys
	var k = STAGE_KEYS;
	STAGE_KEYS = new INKeys(k.drawer, k.folder, k.tab, k.f3, k.f4, k.f5, k.docTypeName);

	// convert the custom properties
	STAGE_PROPS = convertObjectofCPsTOINInstanceProp(STAGE_PROPS);
}


/**
 * Converts object of name value pairs to an array of inInstance props
 * @param {Object} inputObject full of key (custom property name) and value (value to populate) pairs
 * @returns {Array|Boolean} Array of INInstanceProps, false if errors are encountered
*/
function convertObjectofCPsTOINInstanceProp(inputObject) {
	var iProps = [], type, prop, index=0, errTxt;

	type = typeof inputObject;
	if (type !== 'object') {
		debug.log('ERROR', 'Cannot convert variable type of: [%s]\n', type);
		return false;
	}

	for (prop in inputObject) {
		iProps[index] = new INInstanceProp();
		iProps[index].name = [prop];
		iProps[index].setValue(inputObject[prop]);
		index++;
	}

	// check to see if any custom properties aren't defined or have errors
	for (var i = iProps.length - 1; i >= 0; i--) {
		if (iProps[i].id === '') {
			errTxt = 'Custom Property of [%s] cannot be assigned a value of [%s]. Does it exist?\n';
			debug.log('WARNING', errTxt, iProps[i].name, inputObject[prop]);
			iProps.splice(i, 1);
		}
	}
	return iProps;
}


/**
 * Splits multipage tiff files into individual files
 * A single page tiff file can also be passed without issue (no need to pre-sort)
 *
 * @class TiffSplitter
 * @constructor
 * @param {String} srcFile relative or absolute path to a multipage TIFF file
 * @return {Object} TiffSplitter object
 *
 *     @example
 *     var tiffs = TiffSplitter("some/tiff/file.tif");
 *     tiffs.split();
 *     for (var i = 0; i < tiffs.splitFiles.length; i++) {
 *         printf(tiffs.splitFiles[i]);
 *     };
 *     tiffs.deleteAllFiles();
*/
function TiffSplitter(srcFile) {
	var self = this;
	this.splitFiles = [];
	var splitPath = SElib.splitFilename(srcFile);
	var splitDir = splitPath.dir + splitPath.name;

	/**
	 * split the tiff into individual pages
	 * @returns {Array|Boolean} Array of absolute pathnames if split was successful, false if errors were encountered
	 */
	this.split = function() {
		if (Clib.mkdir(splitDir) !== 0) {
			debug.log('ERROR', 'TiffSplitter: cannot make directory [%s]\nserver says: [%s]', splitDir, getErrMsg());
			return false;
		}
		var cmd = '\"' + IMAGEMAGICK_TOOL + '\" '+ srcFile + ' ' + splitDir + '\\' + splitPath.name + '_%06d.TIF';
		debug.log("DEBUG","cmd = [%s]\n", cmd);
		//debug.log("INFO","srcFile is [%s]\n",srcFile);
		//debug.log("INFO","splitDir is [%s]\n",splitDir);
		//debug.log("INFO","cmd is [%s]\n",cmd);
		var output = Clib.system(cmd);
		if (output !== 0) {
			debug.log('ERROR', 'Cannot split tiff at [%s]. Command returned [%s].\n', srcFile, output);
			return false;
		}
		// get directory contents and sort the array
		var files = SElib.directory(splitDir + "\\*");
		var sortedFiles = [];
		for (var i = 0; i < files.length; i++) {
			sortedFiles.push(files[i].name);
		}
		self.splitFiles = sortedFiles.sort();
		return self.splitFiles;
	};

	/**
	 * Deletes the source file
	 * @returns {Boolean} true if succesful, false if errors were encountered
	 */
	this.deleteSrcFile = function() {
		if (Clib.remove(srcFile) !== 0) {
			return false;
		}
		return true;
	};

	/**
	 * Deletes the split files generated by the split method
	 * @returns {Boolean} true if succesful, false if errors were encountered
	 */
	this.deleteSplitFiles = function() {
		var flag = true;
		for (var i = 0; i < self.splitFiles.length; i++) {
			if (Clib.remove(self.splitFiles[i]) !== 0) {
				flag = false;
			}
		}
		if (Clib.rmdir(splitDir) !== 0) {
			debug.log("ERROR", "Cannot delete temp directory [%s]\n", splitDir);
			flag = false;
		}
		return flag;
	};

	/**
	 * Deletes the source and files generated from the split method
	 * @returns {Boolean} true if succesful, false if errors were encountered
	 */
	this.deleteAllFiles = function() {
		var flag = true;
		if (!self.deleteSplitFiles()) {
			flag = false;
		}
		if (!self.deleteSrcFile()) {
			//printf("delete source file failed");
			flag = false;
		}
		return flag;
	};
}

/**
 * Keeps track of errors within a CSV
 * @param {Object} options options bag
 *	- {String} instructions (optional)
 *	- {Array} mailTo (optional)
 *	- {String} filePath (optional) path to file to append errors to
 *	- {String} mailSubject (optional) subject of email
*/
function ThrowError(options) {
	// set defaults
	this.instructions = options.instructions || "";
	this.mailTo = options.mailTo || "";
	this.filePath = options.filePath || null;
	this.mailSubject = options.mailSubject || "";
	this.errorsEncountered = false;

	var logBuffer = [];
	var logTextBuffer = [];
	var self = this;
	//debug.log("INFO","Selfi is [%s]\n",self);
	/**
	 * Writes out the error String and error text to the log,
	 * adds the error string to the buffer
	 * @param {String|Integer} logLevel Importance of the log message
	 * @param {String} errorText message to write in the log
	 * @param {String} errorString csv line to be stored for writing to a log
	 */
	this.log = function(logLevel, errorText, errorString) {
		var logText = errorText + " [" + errorString + "]\n";

		// log error to script log
		debug.log(logLevel, logText);

		// add to buffer for later use by the send method
		logBuffer.push(errorString);
		logTextBuffer.push(errorText);
		self.errorsEncountered = true;
	};

	/**
	 * Writes out any failed lines to a file,
	 * sends an email containing the error,
	 * clears the failed lines buffer
	 */
	this.sendEmailAndFlushBuffer = function() {
		// write out stuff to file
		if (self.filePath) {
			var logText = "";
			for (var i = 0; i < logBuffer.length; i++) {
				logText = logText + logBuffer[i];
			}
			//debug.log("INFO","self.filepath is [%s]\n",self.filePath);
			// create directories if they don't exist yet and write to file
			var splitFile = SElib.splitFilename(self.filePath);
			//debug.log("INFO","splitFile is [%s]\n",splitFile.dir);
			if (!createDirectoryRecursive(splitFile.dir) ||
				!writeToFile(logText, self.filePath, "ab")) {
				debug.log('ERROR', 'Could not write out errored lines to [%s]\n', self.filePath);
				debug.incrementIndent();
				debug.log('ERROR', '%s\n', logText);
				debug.decrementIndent();
			}
		}

		// send email
		self.sendErrorEmail();

		// clear buffer
		logBuffer = [];
	};


	/**
	 * sends email containing the error
	 */
	this.sendErrorEmail = function() {
		var body = self.instructions + "\n\nPath: " + self.filePath + "\n\n" +
					"Errors encountered:\n";
		for (var i = 0; i < logTextBuffer.length; i++) {
			body += logTextBuffer[i] + "\n";
		}

		sendEmail(self.mailTo, body, self.mailSubject);
	};
}

/** @class global */

/**
 * shells out and sends an email using mailx
 * @param {Array} addressesArr An array of email address strings to send the message to
 * @param {String} body Body of the email.
 * @param {String} subject Subject of the email.
 * @returns {Boolean} true if successful, false if not
 */
function sendEmail(addressesArr, body, subject) {
	subject = subject || "";
	body = body || "";
	if (!isArray(addressesArr)) {
		return false;
	}
	var addresses = "";
	addresses = addressesArr.join('" "');
	var cmd = 'echo "' + body + '" | mailx -s "' + subject + '" "' + addresses + '"';
	if (Clib.system(cmd) !== 0) {
		debug.log('ERROR', 'Failed to send email\n');
		return false;
	}
	return true;
}

function createDoc()
{
	var ret = "";
	var retw = "";

	exec('echo Y:\\DI_PRD_DATABANK_AD_INBOUND\\error\\*preapp*\\*preapp*.csv',0,1,ret)
	exec('echo Y:\\DI_PRD_DATABANK_AD_INBOUND\\error\\*wiserapp*\\*wiserapp*.csv',0,1,retw)
	
	ret = ret.slice(0,ret.length-1);
	retw = retw.slice(0,retw.length-1)

    var paths = ret.split(" ");
    var wpaths = retw.split(" ");

    paths = paths.concat(wpaths);

	var wfQueue = "";

	if(paths.length >0)
	{
		var wfQueue = new INWfQueue();
		wfQueue.name = "BUA Databank Import Errors";
	}
	else{
		return false;
	}
	for (var iter = 0; iter<paths.length; iter++)
	{
	    pat = /(\\)/g;
	    path = paths[iter].replace(pat,"$1\\");
	    //debug.log("INFO","685 path is [%s]\n",path);
		var arr = path.split("\\");
		var folder = arr[arr.length-2];
		var date = folder.substr(0,10);
		var batch = folder.substr(10,7);
		var tab = "";
		if (folder.indexOf("preapp")>=0)
		{
			tab = "Preapp-Files";
		}
		else if(folder.indexOf("wiserapp")>=0)
		{
			tab = "Wiserapp-Files";
		}

	    var doc = new INDocument("UMBUA","DI-Databank",tab,batch,"",date,"Databank error log BUA");//printf("2");


		if(!doc.create())
		{
			debug.log("ERROR", "createOrRouteDoc: Could not create doc with id  [%s] -- Error [%s]\n", doc.id, getErrMsg());
			continue;		
		}

		if(!doc.storeObject(path))
		{
			debug.log("ERROR", "createOrRouteDoc: Could not store doc with id  [%s] -- Error [%s]\n", doc.id, getErrMsg());
			continue;		
		}


		if(!wfQueue.createItem(WfItemType.Document, doc.id, WfItemPriority.Medium))
		{
			debug.log("DEBUG", "createOrRouteDoc: 'false' return by createItem. Verifying workflow information...\n");
			items = doc.getWfInfo();
			if(items && items.length > 0)
			{
				if(items.length > 1)
				{
					debug.log("ERROR", "createOrRouteDoc: Item already in workflow and split\n");
					return false;
				}
				else if(items[0].wfQueue.toUpperCase() != wfQueue.toUpperCase())
				{
					debug.log("ERROR", "createOrRouteDoc: Document is in workflow [%s] but not in specified queue [%s]\n", items[0].wfQueue, wfQueue);
					return false;
				}
			}
			else
			{
				debug.log("ERROR", "createOrRouteDoc: Could not add to queue [%s] -- Error [%s]\n", wfQueue.name, getErrMsg());
				return false;
			}
		}
	}

	function exec(cmd, expectedReturn, logOutput, &strOutput)
	{
		var outputFile = "";
		if (!logOutput) logOutput = false;
		if (logOutput)
		{
			var tempFile = Clib.tmpnam();
			tempFile = tempFile.replace(/[\\\/\.]/g,"");
			if (typeof(INLib) != "undefined")
			{
				tempFile += "_"+INLib.getThreadID();
			}
			outputFile = "..\\temp\\iScriptExecOutput"+tempFile+".txt";
			
			cmd += " >\""+outputFile+"\" 2>&1";
		}
		
		debug.log("INFO", "exec: cmd [%s]\n", cmd);
		var rtn = Clib.system(cmd);
		debug.log("DEBUG", "exec: returned [%s]\n", rtn);
		
		if (logOutput)
		{
			if (SElib.directory(outputFile))
			{
				var fp = Clib.fopen(outputFile, "rb");
				if (!fp)
				{
					debug.log("ERROR","exec: Failed to open outfile [%s], %s\n", outputFile, Clib.strerror(Clib.errno.valueOf()));
				}
				else
				{
					var buf = new Buffer(4096);
					var size;
					var bufString = "";
					do
					{
						bufString += buf.getString().replace(/[\r]/g, "");
						size=Clib.fread(buf, 4096, fp);
					} while (size>0)
					Clib.fclose(fp);
					
					//output the file
					if (logOutput) debug.log("INFO","exec: output from command:\n%s\n", bufString);
					strOutput = bufString;

					if (Clib.remove(outputFile) != 0)
					{
						debug.log("ERROR","exec: Failed to remove outfile [%s], %s\n", outputFile, Clib.strerror(Clib.errno.valueOf()));
					}
				}
			}
		}
		
		//some functions don't return 0 on success
		if (rtn != expectedReturn)
		{
			debug.log("ERROR", "exec: Couldn't call system cmd [%s]\n", cmd);
			return false;
		}
		else
		{
			debug.log("INFO","exec: Command completed succesfully\n");
			return true;
		}
	}	
}

/**
 * Sets the global staging objects (STAGE_KEYS, STAGE_PROPS, and STAGE_NOT_USED)
 * to their empty state
 */
function createStagingObjects() {
	global.STAGE_PROPS = {};
	global.STAGE_NOT_USED = {};
	global.STAGE_KEYS = {
		drawer: "",
		folder: "",
		tab: "",
		f3: "",
		f4: "",
		f5: "",
		docTypeName: ""
	};
}


/** ****************************************************************************
  *     Main body of script.
  *
  * @param {none} None
  * @returns {void} None
  *****************************************************************************/
function main() {
	try {
		debug = new iScriptDebug("USE SCRIPT FILE NAME", LOG_TO_FILE, DEBUG_LEVEL, {logHistoryMax:10000});
		debug.showINowInfo("INFO");

		if (typeof currentWfItem !== 'undefined') {
			debug.log("CRITICAL", "This script is designed to run from intool.\n");  //intool
			return false;
		}

		// load report config files
		loadYAMLConfig(REPORT_CONFIG_DIRECTORY_PATH);

		// leaving the main function as I can't define functions from within here

		if (!realMainLoop()) {
			//createDoc();
			return false;
		}

		//createDoc();

	} catch (e) {
		if (!debug) {
			printf("\n\nFATAL iSCRIPT ERROR: %s\n\n", e.toString());
		}
		try {
			// TODO replace with actual error function
			//throwError('Split Index Script crashed.\n', wfItem);
		} catch (err) {}
		debug.log("CRITICAL", "***********************************************\n");
		debug.log("CRITICAL", "***********************************************\n");
		debug.log("CRITICAL", "**                                           **\n");
		debug.log("CRITICAL", "**    ***    Fatal iScript Error!     ***    **\n");
		debug.log("CRITICAL", "**                                           **\n");
		debug.log("CRITICAL", "***********************************************\n");
		debug.log("CRITICAL", "***********************************************\n");
		debug.log("CRITICAL", "\n\n\n%s\n\n\n", e.toString());
		debug.log("CRITICAL", "\n\nThis script has failed in an unexpected way.  Please\ncontact Perceptive Software Customer Support at 800-941-7460 ext. 2\nAlternatively, you may wish to email support@imagenow.com\nPlease attach:\n - This log file\n - The associated script [%s]\n - Any supporting files that might be specific to this script\n\n", _argv[0]);
		debug.log("CRITICAL", "***********************************************\n");
		debug.log("CRITICAL", "***********************************************\n");
	} finally {
		debug.finish();
		return;
	}
}

/**
 * Main program logic. Seperated from main loop so it does proper variable scoping
 *
 * @returns {Boolean} returns true upon success, false otherwise
 */
function realMainLoop() {

	// main looping logic
//printf("1");
	// for each configuration file loaded
	for (var currentConfigName in CFG.config) {
		if (CFG.config.hasOwnProperty(currentConfigName)) {
			var currentConfig = CFG.config[currentConfigName];
//printf("2");
			// get a list of any csv files we need to load and do
			var csvFiles = getListofIndexFiles(currentConfig);

//printf(csvFiles[0]);			
			if (csvFiles === null) {
				debug.log('DEBUG', 'No directories found for [%s]\n', currentConfigName);
			} else if (!isArray(csvFiles)) {
				debug.log("ERROR", "Cannot process files from: [%s]\n", currentConfig.reportName);
			}

			// load each csv file found
			for (var i = 0; i < csvFiles.length; i++) {
				var currentCSV = csvFiles[i];

				//printf(currentCSV);
				// create an error object for use with this csv
				// TODO need to add the basename to the file too
				var options = {instructions: "Some lines in the csv have failed to load. " +
					"Please check for files at the path below",
					mailTo: currentConfig.alertEmails,
					filePath: currentConfig.errorPath + "\\" + currentCSV.file.replace(/^.*\\.*\\(.*\\.*)$/, "$1"),
					mailSubject: "[DI " + ENV_U3 + " ERROR] Databank Errors Occured"};
				var csvError = new ThrowError(options);

				// check if file is empty first
				if (!doesFileExist(currentCSV.file, true)) {
					//debug.log("INFO","currentCSV.file = [%s]\n",currentCSV.file);
					csvError.instructions = "They sent us a blank file!";
					csvError.sendErrorEmail();
					continue;
				}


				var csv = loadCSV(currentConfig, currentCSV.file);
				if (!csv) {
					csvError.instructions = "Could not load CSV.";
					csvError.sendErrorEmail();
					continue;
				}
				var rowCount = 0;
				while (true) {
					var line = csv.getNextRowObject();
					if (line === false) {
						csvError.instructions = "Failed to read CSV row " + rowCount + " in: " + currentCSV.file;
						csvError.sendErrorEmail();
						rowCount++
						continue;
					}
					else if (line === null) {
						debug.log("NOTIFY", "End of file reached\n");
						break;
					}
					var rawLine = csv.rawLine;
					rowCount++;

					debug.log("DEBUG", "Processing row [%s]:\n", rowCount);
					debug.incrementIndent();
					for (var key in line) {
						debug.log("DEBUG", "    %s: [%s]\n", key, line[key]);
					}
					debug.decrementIndent();
					loadDocumentFromCSV();


					createStagingObjects();
				}
				if (!csv.closeFile()) {
					debug.log("ERROR", "Failed to close CSV file [%s]: %s\n", currentCSV.file, Clib.strerror(Clib.errno));
				}

				// send error emails if anything was a problem
				if (csvError.errorsEncountered) {
					//debug.log("INFO","INSIDE CATCHALL ERROR!@#@|\n");
					csvError.sendEmailAndFlushBuffer();
				}
			}

			// remove the old directories
			for (var z = csvFiles.length - 1; z >= 0; z--) {
				debug.log('DEBUG', 'Deleting [%s]\n', csvFiles[z].directory);

				Clib.system('rmdir /s /q ' + csvFiles[z].directory);
			}
		}

	}

	/**
	 * performs the functions needed to create a file from a line within the CSV
	 */
	function loadDocumentFromCSV() {
		debug.log('DEBUG', 'currentConfig:\n',currentConfig);
		debug.logObject('DEBUG', currentConfig, 1);
		// load static values
		if (!mapValuesFromStaticConfig(currentConfig.staticValues)) {
			csvError.log('ERROR', 'Could not map static values\n', rawLine);
			return false;
		}

		// get filepath
		var file = findFilePath(currentConfig, currentCSV, line);
		//debug.log('DEBUG', 'loading file [%s]\n', file);

		// check if file exists
		if (!doesFileExist(file)) {
			csvError.log("ERROR", "cannot find file specified in csv [" + file + "]\n", rawLine);
			return false;
		}

		// load csv values
		if (!mapValuesFromCSV(currentConfig.csvValues, line)) {
			csvError.log('ERROR', 'Could not map static values\n', rawLine);
			return false;
		}


		debug.log('DEBUG', 'STAGE_KEYS:\n');
		debug.logObject('DEBUG', STAGE_KEYS, 10);
		debug.log('DEBUG', 'STAGE_PROPS:\n');
		debug.logObject('DEBUG', STAGE_PROPS, 10);
		debug.log('DEBUG', 'STAGE_NOT_USED:\n');
		debug.logObject('DEBUG', STAGE_NOT_USED, 10);

		// convert stage objects to native formats
		convertStageObjectToNative();


		var newDoc = storeDocument(file, STAGE_KEYS, STAGE_PROPS, true);


		debug.log('DEBUG', 'new doc info:\n');
		debug.logObject('DEBUG', newDoc, 10);
		if (!newDoc.id) {
			csvError.log("ERROR", "Could not create document", rawLine);
			return false;
		}

		if (typeof currentConfig.addToQueue === 'string') {
			debug.log('DEBUG', 'Adding to queue [%s]\n', currentConfig.addToQueue);
			if (!createOrRouteDoc(newDoc, currentConfig.addToQueue, "UMBUA_Databank_Import creating new workflow item based on ["+currentConfig.reportName+"] config")) {
				csvError.log('ERROR', 'could not route to queue ['+ currentConfig.addToQueue +']\n', rawLine);
				return false;
			}
		}

		/**
		 * transform the relative path from the csv into an absolute path
		 *
		 * @param {Object} currentConfig configuration object currently in use (parsed Yaml)
		 * @param {Object} currentCSV object currently in use
		 * @param {Object} line object of the csv we're parsing
		 * @returns {String|Boolean} absolute path, or false if errors are encountered
		 */
		function findFilePath(currentConfig, currentCSV, line) {
			debug.log('DEBUG', 'currentConfig:\n',currentConfig);
			debug.logObject('DEBUG', currentConfig, 1);
			for (var i = 0; i < currentConfig.csvValues.length; i++) {
				if (typeof currentConfig.csvValues[i].type === 'string') {
					var key = currentConfig.csvValues[i].type + currentConfig.csvValues[i].name;
					//debug.log("INFO","returned file is [%s]\n",currentCSV.directory+ "\\" + line[key]);
					return currentCSV.directory + "\\" + line[key];
				}
			}
			debug.log('ERROR', 'Cannot find a valid filepath for line:\n');
			debug.logObject('ERROR', line, 100);
			return false;
		}
	}
}
