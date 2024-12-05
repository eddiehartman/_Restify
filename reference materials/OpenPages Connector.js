//////////////////////////////////////////////////////////////////////////////
//
//  Licensed Materials - Property of IBM
//
//  5725-D51
//
//  (C) Copyright IBM Corporation 2015, 2017  All Rights Reserved.
//
//  US Government Users Restricted Rights - Use, duplication or
//  disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
//
//////////////////////////////////////////////////////////////////////////////
//
// OpenPages Connector
//
// Ancient history moved to bottom of script
//var version = "20200626 1608"; // make selectEntries() initialize the Connector
//var version = "20200627 1307"; // Now support SOXDocment creation - both the actual doc (attachment) and fields
//var version = "20200629 1102"; // Trying different regex for the replacement of \/ with /
//var version = "20200629 1222"; // Giving up and reverting to simple replace
//var version = "20200630 1007"; // Adding get_fielddefinitions operation to queryReply
//var version = "20200630 1340"; // Fixed refresh in params object to trim Connector param values
//var version = "20200731 2334"; // Added set_current operation to queryReply()
//var version = "20200802 1502"; // putEntry() logs out new Resource ID
//var version = "20200802 1543"; // modEntry() corrected
//var version = "20200802 2109"; // modEntry() now returns updated Entry
//var version = "20200805 2239"; // updated entryToGRCObject() to remove illegal chars from Name
//var version = "20200813 2101"; // Fixed a bug I introduced to GrcObjectToEntry()
//var version = "20200818 1348"; // Fixed a bug where log() was used instead of logmsg()
//var version = "20200818 2013"; // Added debug for putEntry()
var version = "20200818 1710"; // EH - Removed code in entryToGrcObject() that removed extension from Name for SOXDocuments

var requestEntry = system.newEntry();
var cookies = system.newEntry();
var ISOdateMask1 = "yyyy-MM-dd'T'HH:mm:ss.SSZ";
var ISOdateMask2 = "yyyy-MM-dd'T'HH:mm:ss.SSSZ";

// Messages returned by the Connector are kept in an Array and set here to make it
// simpler to localize this component later.
//
var message = [];
message["Required parameter not set"] = "Required parameter not set";
message["Response from"] = "Response from";
message["Request to"] = "Request to";
message["Error from"] = "Error from";
message["You must restart the SDI server in order for the imported certificate to be trusted."] = "You must restart the SDI server in order for the imported certificate to be trusted.";
message["Unable to parse JSON return from"] = "Unable to parse JSON return from";
message["Invalid format for URL parameter"] = "Invalid format for URL parameter";
message["No field definitions returned for GRC object type"] = "No field definitions returned for GRC object type";
message["No GRC Object types returned by OpenPages"] = "No types returned by OpenPages";
message["GRC Object type"] = "GRC Object type";
message["has no field defintion for attribute"] = "has no field defintion for attribute";
message["The following field is readOnly and cannot be written to"] = "The following field is readOnly and cannot be written to";
message["No types returned by OpenPages"] = "No types returned by OpenPages";
message["The following fields are readOnly and cannot be written"] = "The following fields are readOnly and cannot be written";
message["The following fields are required"] = "The following fields are required";
message["Unable to parse DATE_TYPE value for"] = "Unable to parse DATE_TYPE value for";

// Global variables defined here
var initialized = false;

// GRC object system fields
var grcSystemFieldNames = ["name", "description", "primaryParentId", "typeDefinitionId", "parentFolderId"];
var grcSystemFieldTypes = ["String", "String", "Integer (Id)", "Integer (Id)", "Integer (Id)"];

var schemaType = [];
schemaType["DATE_TYPE"] = "Date";
schemaType["INTEGER_TYPE"] = "Integer";
schemaType["ID_TYPE"] = "Integer (Id)";
schemaType["STRING_TYPE"] = "String (limited to 4000 characters)";
schemaType["MEDIUM_STRING_TYPE"] = "Medium size String (limited to 32000 characters)";
schemaType["LARGE_STRING_TYPE"] = "Large size String (limited to configured maximum)";
schemaType["ENUM_TYPE"] = "String";
schemaType["MULTI_VALUE_ENUM"] = "String (multi-valued)";
schemaType["CURRENCY_TYPE"] = "Number (value in default currency)";
schemaType["BOOLEAN_TYPE"] = "Boolean (true or false)";
schemaType["FLOAT_TYPE"] = "Floating point decimal";

// timer object defined in some ALs using this Connector
// var _timer = java.lang.System.getProperties().get("_timer") || {start: function() {}, stop: function() {}, timers: function() {return {} }}; 
// Mail settings - this copy here has a local copy of the values shared by all connectors in the project
var mailSettings = {
	smtpHost: "",
	smtpPort: 25,
	emailTo: "",
	notificationsSent: null
};

// Keep track of last conn Entry after a putEntry() call
var lastConn = null;

// feed properties object; cleared and used for each entry
var feedProps = {
	staticPrimaryParentId: null,
	parentType: null,
	parentLoc: null,
	derivedPrimaryParentId: null,
	currencyIsoCodes: new java.util.HashMap(), // isoCode for each mapped CURRENCY_TYPE value per iteration

	clear: function() {
		this.staticPrimaryParentId = null;
		this.parentType = null;
		this.parentLoc = null;
		this.derivedPrimaryParentId = null;
		this.currencyIsoCodes.clear();
	},

	recoverPrimaryParentIdFromFeed: function(entry) {
		if (typeof entry.primaryparentType !== "undefined" && entry.primaryparentType !== null &&
			typeof entry.primaryparentLocation !== "undefined" && entry.primaryparentLocation !== null) {
			this.parentType = entry.primaryparentType.getValue();
			this.parentLoc = entry.primaryparentLocation.getValue();

			if (this.parentType !== null && this.parentType !== "" &&
				this.parentLoc !== null && this.parentLoc !== "") {
				if (params.getParentObjectType(this.parentType) !== null) {
					this.derivedPrimaryParentId = params.getParentObjectIdFromTypeAndLoc(this.parentType, this.parentLoc);
				}

				if (this.derivedPrimaryParentId === null) {
					var msg = "A primaryParentId could not be derived from the feed's parentType '" + this.parentType +
						"' and parentLocation '" + this.parentLoc + "' properties for this entry." +
						"Verify that the parentType is a legitimate parent type for an object of type '" +
						params.object + "' and that the parentLocation is correct.";
					logmsg("WARN", msg);
					sendEmailNotification(msg);
				}
			}
		}
	},

	obtainPrimaryParentIdFromFeed: function(entry) {
		var msg = "";
		var parentObjectType = null;

		if (typeof entry !== "undefined" && entry instanceof com.ibm.di.entry.Entry) {

			// First check if a valid primary parent id value was included in the feed
			if (typeof entry.primaryParentId !== "undefined" && entry.primaryParentId !== null &&
				isPrimaryParentIdValid(entry.primaryParentId.getValue())) {
				this.staticPrimaryParentId = entry.primaryParentId.getValue();
			}

			// Otherwise check if it can be derived from the feed's parentType and parentLocation values
			else if (typeof entry.parentType !== "undefined" && entry.parentType !== null &&
				typeof entry.parentLocation !== "undefined" && entry.parentLocation !== null) {
				this.parentType = entry.parentType.getValue();
				this.parentLoc = entry.parentLocation.getValue();

				if (this.parentType !== null && this.parentType !== "" &&
					this.parentLoc !== null && this.parentLoc !== "") {
					parentObjectType = params.getParentObjectType(this.parentType);

					if (parentObjectType !== null) {
						this.derivedPrimaryParentId = params.getParentObjectIdFromTypeAndLoc(this.parentType, this.parentLoc);
					}

					if (this.derivedPrimaryParentId === null) {
						msg = "A primaryParentId could not be derived from the feed's parentType '" + this.parentType +
							"' and parentLocation '" + this.parentLoc + "' properties for this entry." +
							"Verify that the parentType is a legitimate parent type for an object of type '" +
							params.object + "' and that the parentLocation is correct.";
						logmsg("WARN", msg);
						sendEmailNotification(msg);
					}
				}
			}
		}
	}
};

// parameters container object
var params = {
	url: "",
	root: "/grc/api",
	username: "",
	password: "",

	//
	// The grc object name, such as "Submandate" or "Mandate".  Should be set in the connector settings form.
	//
	object: "",

	//
	// The grc object id, looked up from the object name specified in the "object" property above
	//
	objectId: null,

	query: "",
	schema: null,
	defaultPrimaryParentObjectId: null, // derived from op_parentType, op_parentLoc props in connector.properties
	http: null,
	current: null,
	deBug: false,
	parentType: "", // from connector.properties file for deriving defaultPrimaryParentObjectId only
	parentLoc: "", // from connector.properties file for deriving defaultPrimaryParentObjectId only
	validPrimaryParentIds: null,
	invalidPrimaryParentIds: null,
	smtpHost: "",
	smtpPort: 25,
	mailTo: "",
	defaultCurrencyIsoCode: "",
	largeStringMaxSize: 256000,

	//
	// Resource caches that are loaded via query to OpenPages
	//
	fieldDefinitions: null,
	templates: null,
	typesById: null,
	typesByName: null,
	typeDetailsByName: null,

	//
	// Properties shared across all members of an assembly line (instance of java.lang.System.getProperties()).
	// This will be used to cache results of OP queries that will not change over the lifetime of the
	// assembly line, such as type and field definitions, preventing unnecessary reloading of common data.
	//
	properties: null,

	getHttp: function() {
		if (!this.http) {
			this.http = system.getConnector("ibmdi.HTTPClient");
			this.http.initialize(null);
		}

		return this.http;
	},

	refresh: function() {
		var paramVal;
		this.getHttp();
		for (var pname in this) {
			if (typeof this[pname] !== "function") {
				paramVal = connector.getParam(pname);
				if (paramVal != null || pname == "query") {
					if (typeof paramVal == "string") {
						paramVal = paramVal.trim();
					}
					this[pname] = paramVal;
				}
			}
		}
		if (!this.url.endsWith(this.root)) {
			this.url += this.fixPath(this.root);
		}
	},

	apply: function() {
		for (var pname in this) {
			if (typeof this[pname] !== "function") {
				this.getHttp().setParam(pname, this[pname]);
			}
		}

		if (this.deBug !== "true") this.deBug = false;
	},

	fixPath: function(path) {
		if (!path.startsWith("/")) {
			path = "/" + path;
		}
		return path;
	},

	initialize: function() {
		this.refresh();
		this.apply();

		//		this.properties = java.lang.System.getProperties();
		this.properties = new java.util.Properties();

		// Process the SMTP/mail properties
		var hostname = java.net.InetAddress.getLocalHost().getHostName();
		mailSettings.mailSubject = "(Do Not Reply) OpenPages Connector error ";
		mailSettings.mailFrom = "TDI-Administrator-on-" + hostname + "@" + hostname;
		mailSettings.notificationsSent = new java.util.HashSet();
		mailSettings.smtpHost = this.smtpHost ? this.smtpHost : "";
		mailSettings.smtpPort = this.smtpPort ? this.smtpPort : 25;
		mailSettings.mailTo = this.mailTo ? this.mailTo : "";

		// Disable mail notifications if important mailing properties were not specified
		if (mailSettings.smtpHost === "" || mailSettings.mailTo === "") {
			mailSettings.smtpHost = "";
		}

		// verify required properties are at least present from processing properties files
		if (this.url === null || this.url === "" || this.url.endsWith("/")) {
			throwException("Required property op_url must be set to a valid URL (with no trailing '/' character).");
			return null;
		}
		if (this.username === null || this.username === "") {
			throwException("Required property op_username must be set to a valid OpenPages login user name.");
			return null;
		}
		if (this.password === null || this.password === "") {
			throwException("Required property op_conn_password must be set to the password for the specified OpenPages login (op_username) property.");
			return null;
		}
		if (this.object === null || this.object === "") {
			throwException("Required property op_object must be set to a valid OpenPages object type.");
			return null;
		}

		// Ensure that if the API root was not specified that the default is used
		if (this.root === undefined || this.root === null || this.root === "null" || this.root == "") {
			this.root = "/grc/api";
		}

		if (!this.url.endsWith(this.root)) {
			this.url += this.fixPath(this.root);
		}

		var obj = this.object;
		this.getHttp().initialize(null);

		this.objectId = null;

		if (obj != null) {
			var thisType = this.getTypeByName(obj);
			if (thisType != null) {
				this.objectId = thisType.id;
				logmsg("INFO", "Object is " + obj + " and object id is " + this.objectId);
			}
		}

		// Process the parent type and the parent location properties from the properties file
		// to establish the default primary parent to use when the feed does not provide a
		// static or dynamically derived primaryParentId
		this.validPrimaryParentIds = new java.util.HashSet();
		this.invalidPrimaryParentIds = new java.util.HashSet();

		// Obtain the default currency ISO code to use in case the feed does not provide one
		// when a currency amount is included.
		this.defaultCurrencyIsoCode = this.getDefaultCurrencyIsoCode();

		// Obtain the registry setting for the Large String's maximum value
		this.largeStringMaxSize = this.getLargeStringMaxValue();

		if (this.object === "Mandate" && this.parentType !== "SOXBusEntity") {
			throwException("Invalid parent type set for Mandate.  Must be set to SOXBusEntity");
		}

		// log the property values obtained from the various properties file(s)
		logmsg("INFO", "The OpenPages Connector configuration properties used for this instance are:" +
			"\n\tURL (op_url):						  " + this.url +
			"\n\tUser Id (op_username):				 " + this.username +
			"\n\tGRC Object (op_object):				" + this.object +
			"\n\tQuery (op_query):					  " + this.query +
			"\n\tParent Object Type (op_parentType):	" + this.parentType +
			"\n\tParent Object Location (op_parentLoc): " + this.parentLoc +
			"\n\tDebug log (op_deBug):				  " + this.deBug +
			"\n\tURI Root (op_root):					" + this.root
		);

		if (mailSettings.smtpHost && mailSettings.smtpHost != "" && mailSettings.mailTo && mailSettings.mailTo != "") {
			system.setJavaProperty("mail.smtp.host", mailSettings.smtpHost);
			system.setJavaProperty("mail.smtp.port", mailSettings.smtpPort);

			//TEST:
			//sendEmailNotification("This is a test email from the OP Connector.");
		}
	},

	getDefaultPrimaryParentObjectId: function() {
		if (!this.defaultPrimaryParentObjectId) {
			var msg;

			var defaultParentObjectType = this.getParentObjectType(this.parentType);

			if (defaultParentObjectType !== null) {
				this.defaultPrimaryParentObjectId = this.getParentObjectIdFromTypeAndLoc(this.parentType, this.parentLoc);
				if (this.defaultPrimaryParentObjectId === null) {
					msg = "The Parent Object Location property (op_parentLoc='" + this.parentLoc +
						"') from the properties file is not valid. Verify that op_parentType '" +
						this.parentType + "' is a legitimate parent type for object '" + this.object +
						"' and that the specified parent location is correct.";
					logmsg("WARN", msg);
					sendEmailNotification(msg);
				}
			} else {
				msg = "The Parent Type property (op_parentType='" + this.parentType + "') from the " +
					"properties file is not valid.";
				logmsg("WARN", msg);
				sendEmailNotification(msg);
			}

			if (this.defaultPrimaryParentObjectId === null) {
				msg = "The default primaryParentId derived from the Parent Type property " +
					"(op_parentType) and the Parent Location property (op_parentLoc) " +
					"from the properties file is not valid. " +
					"Unable to establish a default primaryParentId for this assembly line run.";
				logmsg("WARN", msg);
				sendEmailNotification(msg);

				this.defaultPrimaryParentObjectId = "not_found";
			}
		}

		return this.defaultPrimaryParentObjectId === "not_found" ? null : this.defaultPrimaryParentObjectId;
	},

	setCurrent: function(entry) {
		this.current = entry;
	},

	getObjectType: function(entryOrType) {
		if (typeof entryOrType === "undefined") {
			entryOrType = params.object;
		}
		var objectType = null;

		if (entryOrType instanceof com.ibm.di.entry.Entry) {
			objectType = entry.getString("$grcObjectType");
			if (objectType == null) {
				objectType = entry.getString("objectType");
			}
			if (objectType == null) {
				typeAttVal = entry.getString("typeDefinitionId");
				if (typeAttVal !== null) {
					objectType = params.getTypeById(typeAttVal);
				}
			}
		} else
		if (typeof entryOrType == "string") {
			if (system.isValidInt(String(entryOrType))) {
				objectType = params.getTypeById(entryOrType);
			} else {
				objectType = String(entryOrType)
			}
		}

		//if (typeof objectType == "string" && objectType.toLowerCase().startsWith("file")) {
		//	objectType = 4; // EH hardcoding 4 for file type (attachment)
		//}

		if (objectType == null || objectType.trim().length == 0) {
			objectType = params.object;
		}

		if (objectType.toLowerCase().startsWith("file")) {
			objectType = "SOXDocument";
		}

		return objectType;
	},

	getCachedTemplate: function(objectType) {
		var key = objectType.trim().toLowerCase();
		return this.templates.get(key) || this.properties.get("OP_TMPL_" + key);
	},

	setCachedTemplate: function(objectType, template) {
		var key = objectType.trim().toLowerCase();
		this.templates[key] = template;
		this.properties.put("OP_TMPL_" + key, template);
	},

	typeToTemplate: function(fieldDefObj, objectType) {
		//fieldDefs = fieldDefObj.fieldDefinitions.fieldDefinition;
		var fieldDefs = this.getFieldDefinitions(fieldDefObj.name);

		var template = {
			fields: {
				field: []
			}
		};

		var fields = template.fields.field;

		//var fieldNames = fieldDefs.keySet().toArray();
		for (var fieldName in fieldDefs) {
			var fieldDef = fieldDefs.get(fieldName);
			if (typeof fieldDef == "object" && fieldDef.id) {
				var field = {
					id: fieldDef.id,
					name: fieldDef.name,
					dataType: fieldDef.dataType
				};
				if (field.dataType == "ENUM_TYPE") {
					field.enumValue = fieldDef.enumValues.enumValue[0];
				}
				fields.push(field);
			}
		}

		return template;
	},

	getTemplate: function(entryOrType) {
		var templateObj = null;

		if (this.templates == null) {
			this.templates = new java.util.HashMap();
		}

		var objectType = this.getObjectType(entryOrType);
		var objectDef = this.getTypeByName(objectType);
		var objectId = objectDef.id;

		var template = this.getCachedTemplate(objectType);

		if (template == null) {
			template = new java.util.HashMap();

			if (String(objectId) == "4") {
				templateObj = this.typeToTemplate(objectDef, objectType);
			} else {
			if (this.deBug) logmsg("DEBUG", "Retrieving template for " + objectType);
				try {
// // _timer.start("OpenPages Connector - getTemplate()" );
					templateObj = makeRequest({
						url: "/contents/template?typeId=" + objectId,
						where: "params.getTemplate"
					});
				} catch (ex) {
					//templateObj = null;   EH - trying to build template from objectDef
					//if (this.deBug) logmsg("DEBUG", "Exception occurred; details:\n" + ex);
					templateObj = this.typeToTemplate(objectDef, objectType);
				}
// // _timer.stop("OpenPages Connector - getTemplate()" );
			}

			if (templateObj == null || templateObj.length == 0) {
				throwException(message["No template found for GRC object type"] + ": " + objectType);
				return null;
			}

			var fds = templateObj.fields.field;
			for (var i = 0; fds != null && i < fds.length; i++) {
				var fd = fds[i];
				template.put(fd.name.trim().toLowerCase(), fd);
			}

			template.put("$grcObjectType", objectType);

			this.setCachedTemplate(objectType, template);
		}

		return template;
	},

	getFieldDefinition: function(objectType, fieldName) {
		if (!fieldName) {
			fieldName = objectType;
			objectType = this.object;
		}
		var fieldDefs = this.getFieldDefinitions(objectType);
		return fieldDefs.get(fieldName.toLowerCase().trim());
	},

	getFieldDefinitions: function(entryOrType) {
		var schema = null;

		if (typeof entryOrType === "undefined") {
			entryOrType = params.object;
		}

		if (this.fieldDefinitions == null) {
			this.fieldDefinitions = new java.util.HashMap();
		}

		var objectType = this.getObjectType(entryOrType);
		var fieldDefs = this.getCachedFieldDefinition(objectType);

		if (fieldDefs == null) {
			fieldDefs = new java.util.HashMap();

			if (this.deBug) logmsg("DEBUG", "Retrieving field definitions for " + objectType);
			try {
// _timer.start("OpenPages Connector - getFieldDefinitions()" );
				schema = makeRequest({
					url: "/types/" + objectType,
					where: "params.getFieldDefinitions"
				});
			} catch (ex) {
				schema = null;
				if (this.deBug) logmsg("DEBUG", "Exception occurred; details:\n" + ex);
			}
// _timer.stop("OpenPages Connector - getFieldDefinitions()" );

			if (schema == null || schema.fieldDefinitions == null) {
				throwException(message["No field definitions returned for GRC object type"] + ": " +
					objectType + "  RESPONSE: " + toJson(schema) +
					". A valid op_object must be specified; aborting assembly line run.");
				return null;
			}

			var fds = schema.fieldDefinitions.fieldDefinition;
			for (var i = 0; fds != null && i < fds.length; i++) {
				var fd = fds[i];
				fieldDefs.put(fd.name.trim().toLowerCase(), fd);
			}

			fieldDefs.put("$grcObjectType", objectType);

			this.setCachedFieldDefinition(objectType, fieldDefs);
		}

		return fieldDefs;
	},

	getCachedFieldDefinition: function(objectType) {
		if (!this.fieldDefinitions) {
			this.fieldDefinitions = new java.util.HashMap();
			return null;
		}

		if (objectType.toLowerCase().startsWith("file")) {
			objectType = "SOXDocument";
		}
		var key = objectType.trim().toLowerCase();
		var fieldDefs = this.fieldDefinitions.get(key);
		return fieldDefs || this.properties.get("OP_FIELDDEF_" + key);
	},


	setCachedFieldDefinition: function(objectType, fieldDef) {
		var key = objectType.trim().toLowerCase();
		this.fieldDefinitions.put(key, fieldDef);
		this.properties.put("OP_FIELDDEF_" + key, fieldDef);
	},

	getTypeById: function(id) {
		var ids = this.getTypesById(id);
		return ids.get(id);
	},

	getTypeByName: function(type) {
		var types = this.getTypesByName(type);
		if (type.toLowerCase().startsWith("file")) {
			return 4; // EH hardcoding type 4 here for file (attachement)
		}
		return types.get(type);
	},

	getTypesByName: function() {
		if (this.typesByName != null) {
			return this.typesByName;
		}

		this.getTypesById();
		return this.typesByName;
	},

	getCachedTypes: function() {
		if (!this.typesById) {
			this.typesById = this.properties.get("OPTypesByID");
			if (this.typesById) {
				//				this.typesByName = java.lang.System.getProperties().get("OPTypesByName");
				this.typesByName = this.properties.get("OPTypesByName");
			}
		}

		return this.typesById;
	},

	setCachedTypes: function(typesById, typesByName) {
		this.typesById = typesById;
		this.typesByName = typesByName;
		this.properties.put("OPTypesByID", typesById);
		this.properties.put("OPTypesByName", typesByName);
	},

	getTypesById: function() {
		var reply = null;

		if (this.getCachedTypes()) {
			return this.typesById;
		}

		var typesById = new java.util.HashMap();
		var typesByName = new java.util.HashMap();

		try {
// _timer.start("OpenPages Connector - getTypesById()" );
			reply = makeRequest({
				"verb": "GET",
				"url": "/types",
				"ctype": "application/json",
				"where": "params.getTypesById"
			});
		} catch (ex) {
// _timer.stop("OpenPages Connector - getTypesById()" );
			throw ex;
			reply = null;
			if (this.deBug) logmsg("DEBUG", "Exception occurred; details:\n" + ex);
		}
// _timer.stop("OpenPages Connector - getTypesById()" );

		if (reply == null || typeof reply.length === "undefined" || typeof reply.length == 0) {
			throwException(message["No types returned by OpenPages"] + " RESPONSE: - " +
				toJson(reply) +
				".\nEnsure that the OpenPages server is running and that the op_url, op_root, " +
				"op_username and op_conn_password properties are valid.");
		}

		for (var i = 0; i < reply.length; i++) {
			typesById.put(reply[i].id, reply[i]);
			typesByName.put(reply[i].name, reply[i]);
		}

		this.setCachedTypes(typesById, typesByName);

		return this.typesById;
	},

	getCachedObjectDetails: function(objectType) {
		return this.typeDetailsByName && this.typeDetailsByName.get(objectType);
	},

	setCachedObjectDetails: function(objectType, details) {
		if (!this.typeDetailsByName) {
			this.typeDetailsByName = new java.util.HashMap();
		}

		this.typeDetailsByName.put(objectType, details);
	},

	// Perform a lookup of the specified parent object type to verify that it exists.
	// Return the parent object type (as JSON), or null if the type does not exist.
	getParentObjectType: function(ptype) {
		var reply = null;

		if (!ptype || ptype === "") {
			logmsg("INFO", "No value specified for parent object type.");
			return null;
		}

		ptype = ptype.trim();

		var parentObjectTypeAsJson = this.getCachedObjectDetails(ptype);
		if (parentObjectTypeAsJson) {
			return parentObjectTypeAsJson;
		}

		if (this.deBug) logmsg("DEBUG", "Retrieving definition for parent object type " + ptype);
		try {
// _timer.start("OpenPages Connector - getParentObjectType()" );
			reply = makeRequest({
				url: "/types/" + ptype,
				where: "params.getParentObjectType"
			});

			if (reply !== null && reply.fieldDefinitions !== null) {
				parentObjectTypeAsJson = toJson(reply);

				this.setCachedObjectDetails(ptype, parentObjectTypeAsJson);
			}
		} catch (ex) {
			logmsg("WARN", "Non-fatal exception occurred while retrieving parent object type '" + ptype +
				"'; details:\n" + ex);
		}
// _timer.stop("OpenPages Connector - getParentObjectType()" );

		return parentObjectTypeAsJson;
	},

	// Given the parent type, perform a lookup to verify that it exists. Return the
	// parent object Id, or null if it does not exist. This method assumes that the
	// ptype parameter has been validated by the getParentType() function.
	getParentObjectIdFromTypeAndLoc: function(ptype, ploc) {
		var reply = null;
		var parentObjectId = null;

		if (!ptype || ptype === "") {
			logmsg("INFO", "No value specified for parent object type.");
			return null;
		}

		if (!ploc || ploc === "") {
			logmsg("INFO", "No value specified for parent object location.");
			return null;
		}

		ptype = ptype.trim();
		ploc = ploc.trim();
		ploc = this.fixPath(ploc); // ensures that the location starts with a '/'

		// Search for the parent object instance of the given ptype at the specified location.
		// There should be one and only one match if the provided location is correct.
		var queryUrl = "query?q=SELECT * FROM [" + ptype + "] WHERE [Location] LIKE '" + ploc + "'";
		if (this.deBug) logmsg("DEBUG", "Retrieving parent object with relative location: " + ploc);

		try {
// _timer.start("OpenPages Connector - getParentObjectIdFromTypeAndLoc()" );
			reply = makeRequest({
				url: queryUrl,
				where: "params.getParentObjectIdFromTypeAndLoc"
			});
			if (reply !== null && typeof reply.rows !== "undefined" && reply.rows.length === 1) {
				if (isPrimaryParentIdValid(reply.rows[0].fields.field[0].value)) {
					parentObjectId = reply.rows[0].fields.field[0].value;
				}
			}
		} catch (ex) {
			if (this.deBug) logmsg("DEBUG", "Exception occurred; details:\n" + ex);
		}
// _timer.stop("OpenPages Connector - getParentObjectIdFromTypeAndLoc()" );

		return parentObjectId;
	},

	getDefaultCurrencyIsoCode: function() {
		if (this.defaultCurrencyIsoCode) {
			return this.defaultCurrencyIsoCode;
		}

		var isoCode = this.properties.get("OPDefaultCurrencyIsoCode");
		if (isoCode) {
			this.defaultCurrencyIsoCode = isoCode;
			return isoCode;
		}

		var reply = null;
		isoCode = "USD";

		if (this.deBug) {
			logmsg("DEBUG", "Retrieving default (base) currency ISO code...");
		}

		try {
			reply = makeRequest({
				url: "/configuration/currencies/base",
				where: "this.getDefaultCurrencyIsoCode"
			});

			if (reply !== null && reply.isoCode !== null) {
				isoCode = reply.isoCode;
			}
		} catch (ex) {
			logmsg("WARN",
				"Non-fatal exception occurred while retrieving base currency ISO code;" +
				" using 'USD'. Exception details:\n" + ex);
		}

		this.defaultCurrencyIsoCode = isoCode;
		this.properties.put("OPDefaultCurrencyIsoCode", isoCode);

		return isoCode;
	},

	getLargeStringMaxValue: function() {
		if (this.largeStringMaxSize) {
			return this.largeStringMaxSize;
		}

		var largeStringMaxSize = this.properties.get("OPLargeStringMaxSize");
		if (largeStringMaxSize) {
			this.largeStringMaxSize = largeStringMaxSize;
			return largeStringMaxSize;
		}

		var reply = null;
		var doubleVal = 256000;

		if (this.deBug) logmsg("DEBUG", "Retrieving Large Text maximum value from OP registry...");
		// do a GET of this: "configuration/settings/%2FOpenPages%2FPlatform%2FRepository%2FResource%2FLarge Text%2FMaximum Size"
		try {
			reply = makeRequest({
				url: "configuration/settings/%2FOpenPages%2FPlatform%2FRepository%2FResource%2FLarge Text%2FMaximum Size",
				where: "params.getLargeStringMaxValue"
			});

			if (reply != null && reply.value != null) {
				largeStringMaxSize = reply.value;

				try {
					doubleVal = java.lang.Double.parseDouble(largeStringMaxSize);
				} catch (ex) {
					logmsg("WARN", "Unable to convert Large String Maximum Value of (" + largeStringMaxSize +
						") into a number; using hard-coded value of 256000.");
					doubleVal = 256000;
				}
			} else {
				logmsg("WARN", "No response on attempt to retrieve Large String Maximum Value registry setting;" +
					" using hard-coded value of 256000.");
			}
		} catch (ex) {
			logmsg("WARN", "Non-fatal exception occurred while retrieving Large String Maximum Value registry setting;" +
				" using hard-coded value of 256000. Exception details:\n" + ex);
		}

		this.largeStringMaxSize = doubleVal;
		this.properties.put("OPLargeStringMaxSize", doubleVal);

		return doubleVal;
	}
};

// result set handler - works similar to an Iterator
var resultSet = {
	set: new java.util.ArrayList(),
	index: 0,
	nextUrl: null,
	objectType: null,

	add: function(jobj) {
		this.set.add(jobj);
	},

	size: function() {
		return this.set.size();
	},

	clear: function() {
		this.set.clear();
		this.index = 0;
	},

	hasNext: function() {
		return (this.set !== null && (this.index < this.set.size() || this.nextUrl != null));
	},

	next: function() {
		if (this.set === null) {
			return null;
		} else {
			//if no results AND no next link, end of list
			if (this.index >= this.set.size() && this.nextUrl == null) {
				return null;
			}
			//else if no results but have next link, get result set
			else if (this.index >= this.set.size() && this.nextUrl != null) {
				this.getResultSet({
					url: "/" + this.nextUrl
				});
			}

			//return next entry
			var n = this.set.get(this.index);
			if (n == null) {
				return null;
			}
			return GrcObjectToEntry(this.set.get(this.index++));
		}
	},


	executeGrcObjectQuery: function(queryPath, ignoreCache) {
// _timer.start("OpenPages Connector - executeGrcObjectQuery()" );
		var reply = this.makeRequest({
			ignoreCache: ignoreCache,
			verb: "GET",
			ctype: "application/json;charset=utf-8",
			url: "/query?q=" + queryPath.replace(" ", "+") + "&caseInsensitive=true",
			where: "executeGrcObjectSetQuery"
		});
// _timer.stop("OpenPages Connector - executeGrcObjectQuery()" );
		return reply;
	},

	getResultSet: function(args) {
		var verb = args.verb || "GET"; // HTTP method, e.g. GET, POST, PUT, ...
		var url = args.url || ""; // url for the request. May be partial (only the path & query string params)
		// var body = args.body;	// HTTP body to be passed for the request
		var ctype = args.ctype || "application/json"; // Content-Type of the HTTP body
		var where = args.where || ""; // where this method is called from - for debugging purposes
		var reply = null;
		var query = args.query || "";

		if (query != "") {
			url = "/query?q=" + query.replace(" ", "+") + "&caseInsensitive=true";
		}

		this.clear();
		if (params.deBug) logmsg("DEBUG", "Issuing " + verb + " request to URL: " + url);

		try {
// _timer.start("OpenPages Connector - getResultSet()" );
			reply = makeRequest({
				verb: verb,
				url: url,
				ctype: ctype,
				where: where + "resultSet.getResultSet"
			});
		} catch (ex) {
			reply = null;
			logmsg("WARN", "Exception occurred while processing result set from REST request to OpenPages; continuing...");
			if (params.deBug) logmsg("DEBUG", "Exception occurred; details:\n" + ex);
		}
// _timer.stop("OpenPages Connector - getResultSet()" );

		var i;
		if (reply !== null) {
			if (typeof reply.rows !== "undefined") {
				var rows = reply.rows;
				for (i = 0; i < rows.length; i++) {
					this.add(rows[i]);
				}
			} else {
				this.add(reply);
			}

			// check for next link
			if (typeof reply.links !== "undefined") {
				this.nextUrl = null;
				for (i = 0; i < reply.links.length; i++) {
					if (reply.links[i].rel == "next") {
						this.nextUrl = reply.links[i].href;
					}
				}
			}
		}
	}
};

function ensureInitialized() {
	params.refresh();
	if (!initialized) {
		initializeConnector();
		selectConnectorEntries();
	}
}

// functions follow
function initializeConnector() {
	logmsg("INFO", "OpenPages Connector version: " + version);
	if (initialized) {
		terminate();
	}

	params.initialize();

	initialized = true;
}

function terminate() {
	initialized = false;
	params.getHttp().terminate();
}

function selectEntries() {
	ensureInitialized();
}

function selectConnectorEntries(args) {
	//if (!initialized) { notInitializedError(); }
	ensureInitialized();

	if (connector.getParam("object").toLowerCase().startsWith("file")) {
		return {};
	}

	var urlPath = "/query?q=";
	var selectClause, whereClause, query;
	var url;

	if (args) {
		urlPath = (args.urlPath) ? args.urlPath : urlPath;
		selectClause = args.selectClause;
		whereClause = args.whereClause;
	}

	if (!selectClause) {
		selectClause = "SELECT * from [" + params.object + "]";
		if (params.query && params.query.length > 0) {
			selectClause = params.query;
		}
	}

	url = urlPath;

	if (url.equalsIgnoreCase("/query?q=")) {
		query = selectClause;
		if (whereClause && query.indexOf(" WHERE ") < 0) {
			query += whereClause;
		}

		// EH Always add Resource Id to the list of fields returned - at least for the first object listed in the fields list
		query = addIdToQuery(query);

		//		url += java.net.URLEncoder.encode(query + "&caseInsensitive=true", "UTF-8");
		url += java.net.URLEncoder.encode(query, "UTF-8");
	}

	resultSet.getResultSet({
		verb: "GET",
		url: url,
		ctype: "application/json",
		where: "selectConnectorEntries"
	});

}

function addIdToQuery(query) {
	query = query.trim();
	var queryLC = query.toLowerCase();

	if (!queryLC.startsWith("select")) {
		return query;
	}

	var fromP = queryLC.indexOf(" from ");
	if (fromP < 0) {
		return query;
	}

	var attList = query.substring("select ".length, fromP).trim();
	var attListLC = attList.toLowerCase();

	if (attList == "*") {
		return query;
	}

	// Now determine which objects are being read based on the field list.
	// If required by args.needId then add .["Resource ID"] for first Object found

	// First first field specifier
	var p = attList.indexOf("].[");
	if (p < 0) {
		return query;
	}

	var objectName = attList.substring(1, p);

	var requiredAtt = "[" + objectName + "].[Resource ID]";
	if (attListLC.contains(requiredAtt.toLowerCase())) {
		return query;
	}

	attList += " " + requiredAtt + " as _UNIQUE_ID_";

	var newQuery = query.substring(0, "select ".length) +
		attList +
		query.substring(fromP);

	logmsg("DEBUG", "Adding " + requiredAtt) + " to query: " + newQuery;;
	return newQuery;
}

function getNextEntry() {
	ensureInitialized();

	var e = resultSet.next();
	if (e !== null) {
		entry.merge(e);
		result.setStatus(1);
	} else {
		result.setStatus(0);
	}

	return entry;
}

function queryReply() {
	var operation = entry.getString("operation") || "* not specified *";
	//entry.removeAllAttributes();

	switch (operation) {
		case "state":
			entry.removeAllAttributes();
			if (!initialized) {
				entry.state = "not initialized";
			} else {
				entry.state = "initialized";
			}
			break;
		case "get_conn":
			entry.removeAllAttributes();
			if (lastConn != null) {
				entry.merge(lastConn);
			}
			break;
		case "set_current":
			params.setCurrent(entry.getObject("current"));
			break;
		case "get_types":
			entry.removeAllAttributes();
			ensureInitialized();
			params.getTypesById();
			var types = {
				typesById: params.typesById,
				typesByName: params.typesByName
			}
			entry.types = types;
			break;
		case "get_fielddefinitions":
			ensureInitialized();
			params.getFieldDefinitions(entry);
			var fieldDefinitions = params.fieldDefinitions
			entry.removeAllAttributes();
			entry.field_definitions = fieldDefinitions;
			break;
		case "select":
			entry.removeAllAttributes();
			ensureInitialized();
			params.refresh();
			params.apply();
			selectConnectorEntries();
			break;
		default:
			throw "Cannot perform queryReply() operation: " + operation;
	}
}

function putEntry() {
	ensureInitialized();

	var grcObj = entryToGrcObject(entry, true /* creating new */ );
	var primaryParentId = "<undefined>";
	var objName = (grcObj.name == null || grcObj.name === "" ? "<no name provided>" : grcObj.name);

	if (params.deBug) logmsg("--->\n" + makeJson(grcObj));

	// Only create a new object if a valid primary parent Id is present
	if (typeof grcObj.primaryParentId === "undefined" || grcObj.primaryParentId === null ||
		params.invalidPrimaryParentIds.contains(grcObj.primaryParentId)) {
		if (typeof grcObj.primaryParentId !== "undefined" && grcObj.primaryParentId !== null) {
			primaryParentId = grcObj.primaryParentId;
		}
		logmsg("WARN", "A null or invalid primaryParentId was detected; not creating a new " +
			params.object + " object.");
	} else {
// _timer.start("OpenPages Connector - putEntry()" );
		if (entry.getString("$grcObjectType") == "SOXDocument") {
			logmsg("Adding SOXDocument: " + grcObj.name);
		}
		var response = makeRequest({
			"verb": "POST",
			"url": "/contents",
			"ctype": "application/json",
			"where": "putEntry",
			"body": makeJson(grcObj)
		});
// _timer.stop("OpenPages Connector - putEntry()" );

		// Now return the new Resource ID in the conn Entry by setting lastConn
		var fields = response.fields.field;
		for (var i = 0; i < fields.length; i++) {
			var field = fields[i];
			if (field.name == "Resource ID") {
				var newID = system.toInt(field.value)
				entry["Resource ID"] = newID;
			} else {
				entry[field.name] = field.value;
			}
		}
		lastConn = entry;
		logmsg("INFO", "Added new " + params.object + " named '" + entry.name + "'" + " with id: " + entry["Resource ID"]);
	}
}

function modEntry() {
	ensureInitialized();

	var grcObj = entryToGrcObject(entry, false /* modifying existing */ );
	var primaryParentId = "<undefined>";
	var objName = (grcObj.name == null || grcObj.name === "" ? "<no name provided>" : grcObj.name);
	var i;

	if (params.deBug) logmsg("--->\n" + makeJson(grcObj));

	// This if-clause only works for ucf_integration. The function is to modify and correct Requirements' primary
	// parent back to the Business Entity after adding other Sub-mandate parents (Parent-child association);
	// And collect a set of parents' attribute values and map them to Requirements' fields. Aug, 2016
	if (params.object == "Requirement") {
// _timer.start("OpenPages Connector - modEntry()" );
		var preReply = makeRequest({
			"verb": "GET",
			"url": "/contents/" + params.current.getString("Resource ID"),
			"ctype": "application/json"
		});
// _timer.stop("OpenPages Connector - modEntry()" );

		var preserveFields = ["UCF-Req:Supporting Requirements", "UCF-Req:Associated Mandates", "UCF-Req:Guidance"];
		var existingField = preReply.fields.field;

		var tempSuppReq = null;
		var tempADCommonName = null;
		var tempGuidance = null;

		for (i = 0; i < existingField.length; i++) {
			if (existingField[i].name == preserveFields[0]) {
				tempSuppReq = existingField[i].value
			} else if (existingField[i].name == preserveFields[1]) {
				tempADCommonName = existingField[i].value
			} else if (existingField[i].name == preserveFields[2]) {
				tempGuidance = existingField[i].value
			}

			var newField = grcObj.fields.field;

			for (i = 0; i < newField.length; i++) {
				if (newField[i].name == preserveFields[0]) {
					newField[i].value = (tempSuppReq.contains(newField[i].value)) ? tempSuppReq : tempSuppReq + newField[i].value
				} else if (newField[i].name == preserveFields[1]) {
					newField[i].value = (tempADCommonName.contains(newField[i].value)) ? tempADCommonName : tempADCommonName + newField[i].value
				} else if (newField[i].name == preserveFields[2]) {
					newField[i].value = (tempGuidance.contains(newField[i].value)) ? tempGuidance : tempGuidance + newField[i].value
				}
			}
		}
	}

	if (params.object == "Requirement") {
		feedProps.recoverPrimaryParentIdFromFeed(entry);
		grcObj.primaryParentId = feedProps.derivedPrimaryParentId;
		setGrcPrimaryParentIdFromFeedPropsOrDefault(grcObj, "primaryParentId");

	} else {
		if (typeof grcObj.primaryParentId !== "undefined" && grcObj.primaryParentId !== null) {
			primaryParentId = grcObj.primaryParentId;
		}
		logmsg("WARN", "A null or invalid primaryParentId was detected");
	}

// _timer.start("OpenPages Connector - modEntry()" );
	response = makeRequest({
		"verb": "PUT",
		"url": "/contents/" + params.current.getString("Resource ID"),
		"ctype": "application/json",
		"where": "modEntry",
		"body": makeJson(grcObj)
	});
// _timer.stop("OpenPages Connector - modEntry()" );

	logmsg("INFO", "Modified existing " + params.object + " named '" + entry.name + "'" + " with id: " + entry["Resource ID"]);

	// Now return the new Resource ID in the conn Entry by setting lastConn
	var fields = response.fields.field;
	for (var i = 0; i < fields.length; i++) {
		var field = fields[i];
		if (field.name == "Resource ID") {
			var newID = system.toInt(field.value)
			entry["Resource ID"] = newID;
		} else {
			entry[field.name] = field.value;
		}
	}
	lastConn = entry;
}

function findEntry() {
	ensureInitialized();

	var res = grcWhereClause(search);

	params.setCurrent(null);
	feedProps.clear(); // clear out the feed props for each new entry

	selectConnectorEntries({
		urlPath: res.path,
		whereClause: res.where,
		selectClause: res.query
	});

	if (resultSet.size() == 1) {
		var e = resultSet.next();
		entry.merge(e);
		result.setStatus(1);
		params.setCurrent(e);
	} else
	if (resultSet.size() > 1) {
		while (resultSet.hasNext()) {
			connector.addFindEntry(resultSet.next());
		}
		result.setStatus(1);
	} else {
		result.setStatus(0);
	}
}

function deleteEntry() {
	ensureInitialized();

	try {
		makeRequest({
			"verb": "DELETE",
			"url": "/contents/" + params.current.getString("Resource ID"),
			"ctype": "application/json",
			"where": "deleteEntry"
		});
	} catch (ex) {
		logmsg("ERROR", "Unable to delete existing object; an exception occured in the " +
			"OpenPages server: " + ex);
	}
}

function querySchema(objectType) {
	ensureInitialized();

	if (typeof objectType === "undefined" || objectType == null) {
		objectType = params.object;
	}

	if (objectType.toLowerCase().startsWith("file")) { // EH hardcoding for "file"
		var fields = [{
				name: "name",
				type: "String (f.ex. document.docx)"
			},
			{
				name: "extension",
				type: "String (f.ex. docx)"
			},
			{
				name: "type",
				type: "String (f.ex. word)"
			},
			{
				name: "description",
				type: "String"
			},
			{
				name: "content",
				type: "String or Byte Array"
			},
			{
				name: "primaryParentId",
				type: "Integer"
			}
		];
		for (var i = 0; i < fields.length; i++) {
			var e = system.newEntry();
			var field = fields[i];
			e.addAttributeValue("name", field.name);
			e.addAttributeValue("syntax", field.type);
			list.add(e);
		}
	} else {
		var fieldDefs = params.getFieldDefinitions(objectType);
		var keys = fieldDefs.keySet().toArray();
		java.util.Arrays.sort(keys);

		for (var key in keys) {
			list.add(newSchemaEntry(key, fieldDefs));
		}

		for (var i = grcSystemFieldNames.length - 1; i > 0; i--) {
			list.add(newSchemaEntry(grcSystemFieldNames[i], grcSystemFieldTypes[i]));
		}

		list.add(newSchemaEntry("$grcObject", "JavaScript Object"));
		list.add(newSchemaEntry("$grcObjectType", "String"));
		list.add(newSchemaEntry("$grcObjectJSON", "JSON"));
	}

	result.setStatus(1);
}

function newSchemaEntry(key, fieldDefs) {
	var e = new com.ibm.di.entry.Entry();

	if (typeof fieldDefs === "string" || typeof fieldDefs[key] === "string") {
		e.addAttributeValue("name", key);
		e.addAttributeValue("syntax", fieldDefs);
	} else {
		e.addAttributeValue("name", fieldDefs[key].name);
		e.addAttributeValue("syntax", getSchemaType(fieldDefs, key));
	}

	return e;
}

function grcWhereClause(search) {
	var where = "";
	var path = null;
	var query = null;
	var critList = search.getCriteria();
	var type = params.object;
	var boolOp = "AND";
	if (search.getType() == search.SEARCH_OR) {
		boolOp = "OR";
	}

	for (var crit in critList) {
		var fieldDef = params.getFieldDefinition(crit.name);
		if (fieldDef == null) {
			throw "The link criteria of the OpenPages connector specifies a field name (" + crit.name + ") that does not belong " +
				"to the chosen OpenPages object type (" + type + ").  Either the link criteria or the chosen OpenPages object " +
				"has changed and is out of sync with the other.  Check both settings and try again.";
		}

		if ("Resource ID".equalsIgnoreCase(fieldDef.name) &&
			crit.match == search.EXACT &&
			search.getType() == search.SEARCH_AND) {
			path = "contents/" + crit.value;
			query = null;
			where = null;
			break;
		}
		where += (where.length == 0) ? "" : " " + boolOp + " ";
		where += "[" + type + "].[" + fieldDef.name + "]";
		where += grcClause(crit, fieldDef);
	}

	return {
		where: " WHERE " + where,
		path: path,
		query: query
	};
}

function grcClause(criteria, fieldDef) {
	var match = criteria.match;
	var value = criteria.value;

	if (!"INTEGER_TYPE".equals(fieldDef.dataType) &&
		!"CURRENCY_TYPE".equals(fieldDef.dataType)) {
		value = "'" + criteria.value + "'";
	}

	if (match == com.ibm.di.server.SearchCriteria.EXACT ||
		match == com.ibm.di.server.SearchCriteria.EXCACT) {
		return " = " + value;
	} else
	if (match == com.ibm.di.server.SearchCriteria.FINAL_STRING) {
		return " LIKE '%" + criteria.value + "'"
	} else
	if (match == com.ibm.di.server.SearchCriteria.GREATER_THAN) {
		return " > " + value;
	} else
	if (match == com.ibm.di.server.SearchCriteria.GREATER_THAN_OR_EQUAL) {
		return " >= " + value;
	} else
	if (match == com.ibm.di.server.SearchCriteria.INITIAL_STRING) {
		return " LIKE '" + criteria.value + "%'"
	} else
	if (match == com.ibm.di.server.SearchCriteria.LESS_THAN) {
		return " < " + value;
	} else
	if (match == com.ibm.di.server.SearchCriteria.LESS_THAN_OR_EQUAL) {
		return " <= " + value;
	} else
	if (match == com.ibm.di.server.SearchCriteria.SUBSTRING) {
		return " LIKE '%" + criteria.value + "%'"
	} else {
		throw "Unknown match type: " + match;
	}
}

function getSchemaType(fieldDefs, key) {
	var type = "?undefined " + key + "?";
	var fieldDef = fieldDefs[key];
	if (typeof fieldDef !== "undefined" || fieldDef != null) {
		var fieldType = schemaType[fieldDef.dataType];
		if (fieldType != null) {
			type = fieldType;
			if ("true".equalsIgnoreCase(fieldDef.readOnly)) {
				type += " (read only)";
			} else
			if ("true".equalsIgnoreCase(fieldDef.required)) {
				type += " (required)";
			}
		}
	}
	return type;
}

function fixTypeObj(ext) {
	ext = ext || "txt";
	switch (ext) {
		case "xls":
			return {
				type: "application/vnd.ms-excel", id: 46, ext: ext
			};
		case "xlsx":
			return {
				type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", id: 53, ext: ext
			};
		case "docx":
			return {
				type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", id: 73, ext: ext
			};
		case "rtf":
			return {
				type: "text/richtext", id: 13, ext: ext
			};
		case "txt":
			return {
				type: "text/plain", id: 9, ext: ext
			};
		case "html":
			return {
				type: "text/html", id: 1, ext: ext
			};
		case "htm":
			return {
				type: "text/html", id: 2, ext: ext
			};
		case "pdf":
			return {
				type: "application/pdf", id: 44, ext: ext
			};
		case "ppt":
			return {
				type: "application/vnd.ms-powerpoint", id: 56, ext: ext
			};
		case "doc":
			return {
				type: "application/msword", id: 70, ext: ext
			};
		default:
			return {
				type: "application/msword", id: 70, ext: ext
			};
	}
}

// Funcion to add file details to a SOXDocument
function addFileDetails(grcObj, entry) {
	var name = entry.getString("name");
	var p = name.lastIndexOf(".");
	var ext = entry.getString("extension") || ((p > 0) ? name.substring(p + 1) : "txt");
	if (p > 0) {
		name = name.substring(0, p);
	}

	var type = entry.getString("type");

	var encode = true;
	typeobj = fixTypeObj(ext);

	var content = entry.getObject("content");
	if (encode) {
		if (typeof content != "[B") { // If not a byte array, then the request is wrong
			var errormsg = "The content Attribute must be a Byte Array for this type of file";
			logmsg("ERROR", "Error writing file object - " + errormsg);
			throw errormsg;
		}
		content = system.base64Encode(content);
	}

	grcObj.contentDefinition = {
		attribute: {
			type: typeobj.type
		},
		children: content
	};
	grcObj.fileTypeDefinition = {
		id: typeobj.id,
		mimeType: typeobj.type,
		fileExtension: typeobj.ext
	};

	return grcObj;
}

// Convert an Entry into a grc Object ready to be passed to the OpenPages REST API
function entryToGrcObject(entry, creatingNew) {
	if (typeof creatingNew === "undefined") {
		creatingNew = true;
	}

	var i, length;
	var grcObj = entry.getObject("$grcObject");

	// Place holder for future use (ucf_integration_control)
	var grcObjType = entry.getObject("$grcObjectType");
	if (grcObjType != null) {
		params.object = grcObjType;
		var thisType = params.getTypeByName(grcObjType);
		if (thisType != null) {
			params.objectId = thisType.id;
		}
	}

	params.getObjectType(entry);

	if (grcObj == null || typeof grcObj !== "object") {
		var readOnly = [];
		var required = [];

		if (params.object.toLowerCase().startsWith("file") ||
			params.object.equalsIgnoreCase("SOXDocument")) {
			var mandatoryFields = ["name", "content"];
			for (var i = 0; i < mandatoryFields.length; i++) {
				if (entry[mandatoryFields[i]] == null) {
					required.push(mandatoryFields[i]);
				}
			}

			if (required.length > 0) {
				var errmsg = "Required Attributes are missing from the output map: " + required.join(", ");
				logmsg("ERROR", errmsg);
				throw errmsg;
			} else {
				var name = entry.getString("Name") || "* Name not set *";
				var ext = entry.getString("extension") || "txt";

				var type = entry.getString("type");

				var encode = true;
				typeobj = fixTypeObj(ext);

				var content = entry.getObject("content");
				if (encode) {
					if (typeof content != "[B") { // If not a byte array, then the request is wrong
						var errormsg = "The content Attribute must be a Byte Array for this type of file";
						logmsg("ERROR", "Error writing file object - " + errormsg);
						throw errormsg;
					}
					content = system.base64Encode(content);
				}

				grcObj = {
					name: name,
					contentDefinition: {
						attribute: {
							type: typeobj.type
						},
						children: content
					},
					fileTypeDefinition: {
						id: typeobj.id,
						mimeType: typeobj.type,
						fileExtension: typeobj.ext
					},
					fields: {
						field: []
					},
					typeDefinitionId: "4"
				};

				var optionalFields = ["description", "primaryParentId"];
				for (var i = 0; i < optionalFields.length; i++) {
					var fieldName = optionalFields[i];
					if (entry[fieldName] != null) {
						grcObj[fieldName] = entry.getObject(fieldName);
					}
				}
			}
		} else {
			grcObj = {
				fields: {
					field: []
				}
			};
		}

		// Continue build the grcObj

		var fieldDefs = params.getFieldDefinitions(entry);
		var templates = params.getTemplate(entry);

		var objectType = fieldDefs.get("$grcObjectType");

		grcObj.typeDefinitionId = params.getTypeByName(objectType).id;

		// It is possible that the system field value for primaryParentId may not be specified.
		// If it is it will be used. If it is not, there may be feed-provided values for
		// "parentType" and "parentLocation" that can be used to derive the primaryParentId.
		// Obtain the static (or dynamically derived) value of the primaryParentId from the
		// feed now so that addGrcSystemField() can use the proper value.
		feedProps.obtainPrimaryParentIdFromFeed(entry);

		for (i = 0, length = grcSystemFieldNames.length; i < length; i++) {
			addGrcSystemField(grcObj, grcSystemFieldNames[i], entry);
		}

		var keys = templates.keySet().toArray();
		java.util.Arrays.sort(keys);

		for (var key in keys) {
			if (key.startsWith("$")) {
				continue;
			}
			var fieldDef = fieldDefs.get(key);
			var att = entry.getAttribute(fieldDef.name);

			if (fieldDef.readOnly && att != null) {
				readOnly.push(fieldDef);
			} else
			if (fieldDef.required && att == null && creatingNew) {
				if (!fieldDef.readOnly) {
					required.push(fieldDef);
				}
			} else if (att !== null) {
				addGrcField(grcObj, att, fieldDef);
			}
		}

		var fields;
		if (required.length > 0) {
			fields = [];
			for (i = 0; i < required.length; i++) {
				fields.push(required[i].name);
			}
			throwException(message["The following fields are required"] + ": " + fields.join(", "));
		}

		if (readOnly.length > 0) {
			fields = "";
			for (i = 0; i < readOnly.length; i++) {
				fields += (fields.length == 0 ? "" : ", ") + readOnly[i].name;
			}
			logmsg("WARN", message["The following fields are readOnly and cannot be written"] + ": " + fields);
		}

		if (entry.primaryParentId) {
			grcObj.primaryParentId = entry.getObject("primaryParentId");
		}

		if (objectType.equalsIgnoreCase("SOXDocument")) {
			grcObj = addFileDetails(grcObj, entry);
		}
	}
	
	// Remove illegal characters from the .name property
	if (grcObj.name) {
		var illegalChars = ["/"];
		for (var i = 0; i < illegalChars.length; i++) {
			grcObj.name = grcObj.name.replaceAll(illegalChars[i], "_");
		}
	}

	return grcObj;
}

// This function is for use when setting an entry's primaryParentId
function setGrcPrimaryParentIdFromFeedPropsOrDefault(grcObj, name) {

	// If a valid primaryParentId was included in the feed for this entry then use it
	if (feedProps.staticPrimaryParentId !== null) {
		grcObj[name] = feedProps.staticPrimaryParentId;
		logmsg("INFO", "Using the static primaryParentId value '" + feedProps.staticPrimaryParentId +
			"' supplied in the feed.");
	}

	// otherwise if a primaryParentId was derived from the feed properties then use it
	else if (feedProps.derivedPrimaryParentId !== null) {
		grcObj[name] = feedProps.derivedPrimaryParentId;
		logmsg("INFO", "Using the primaryParentId value '" + feedProps.derivedPrimaryParentId +
			"' derived from the feed's parentType and parentLocation values.");
	}

	// otherwise use the default parent object ID (if any)
	else {
		var defaultPrimaryParentObjectId = params.getDefaultPrimaryParentObjectId();

		if (defaultPrimaryParentObjectId) {
			grcObj[name] = defaultPrimaryParentObjectId;

			logmsg("INFO", "A primaryParentId was not supplied in or derived from the feed; using " +
				"the default primaryParentId value '" + defaultPrimaryParentObjectId +
				"' derived from the op_parentType and op_parentLoc properties. ");
		} else {
			logmsg("WARN", "A primaryParentId was not supplied in or derived from the feed, " +
				"and a default primaryParentId is not defined.");
		}
	}
}

function addGrcSystemField(grcObj, name, entry) {
	var att = entry[name];

	// Special handling is required for the "typeDefinitionId" and "primaryParentId" system fields
	if (att == null) {
		if ("typeDefinitionId".equalsIgnoreCase(name)) {
			grcObj[name] = params.objectId || grcObj.typeDefinitionId;
		} else if ("primaryParentId".equalsIgnoreCase(name)) {
			setGrcPrimaryParentIdFromFeedPropsOrDefault(grcObj, name);
		}
	}

	// The attribute value is not null but special handling is needed for "primaryParentId"
	// (the primaryParentId to use is set up via feedProps.obtainPrimaryParentIdFromFeed)
	else if ("primaryParentId".equalsIgnoreCase(name)) {
		setGrcPrimaryParentIdFromFeedPropsOrDefault(grcObj, name);
	}

	// no special handling needed for this field, just set it
	else {
		grcObj[name] = att.getValue();
	}
}

function truncateStringForGrcField(stringValue, maxAllowedLength) {
	var truncatedStr = stringValue;
	if (stringValue.length >= maxAllowedLength) {
		truncatedStr = stringValue.substring(0, Math.min(stringValue.length(), maxAllowedLength - 5));
		if (stringValue.length >= maxAllowedLength - 4) {
			truncatedStr += "...";
		}
	}
	return truncatedStr;
}

function addGrcField(grcObj, att, fieldDef) {
	var grcField = {
		dataType: fieldDef.dataType,
		id: fieldDef.id,
		name: fieldDef.name
	};
	var inError = [];
	var attValue = null;
	var field = grcObj.fields.field;
	var addedValue = false;
	var message = "";
	var truncatedStr, eval;

	if (params.deBug) logmsg("DEBUG", "--> Attempting to add " + att.toString() + "   field: " + fieldDef.id);

	if (att !== null && att.size() > 0) {
		attValue = att.getValue(0);
	}

	if (attValue != null) {
		try {
			switch (fieldDef.dataType) {
				case "STRING_TYPE": // string length limited to 4000 chars
					truncatedStr = truncateStringForGrcField(attValue, 4000);
					grcField.value = truncatedStr;
					addedValue = true;
					break;
				case "MEDIUM_STRING_TYPE": // string length limited to 32000 chars
					truncatedStr = truncateStringForGrcField(attValue, 32000);
					grcField.value = truncatedStr;
					addedValue = true;
					grcField.dataType = "STRING_TYPE"; //nan -  OP server doesn't recognize MEDIUM_STRING_TYPE
					break;
				case "LARGE_STRING_TYPE": // string length limited to OP registry setting for largeStringMaxSize
					truncatedStr = truncateStringForGrcField(attValue, params.largeStringMaxSize);
					grcField.value = truncatedStr;
					addedValue = true;
					break;
				case "ID_TYPE":
				case "BOOLEAN_TYPE":
				case "FLOAT_TYPE":
					grcField.value = attValue;
					addedValue = true;
					break;
				case "INTEGER_TYPE":
					grcField.value = attValue;
					addedValue = true;
					break;
				case "ENUM_TYPE":
					eval = enumValue(attValue, fieldDef);
					if (eval != null) {
						grcField.enumValue = enumValue(attValue, fieldDef);
						addedValue = true;
					} else {
						message = "Attempt to add value of '" + attValue +
							"' to enumerated field definition '" + fieldDef.name +
							"' was not allowed to object type '" + params.object + "'." +
							" The assembly line mapping will need to be modified.";
						logmsg("WARN", message);
						sendEmailNotification(message);
					}
					break;
				case "MULTI_VALUE_ENUM":
					grcField.enumValue = [];
					for (var i = 0; i < att.size(); i++) {
						eval = enumValue(att.getValue(i), fieldDef);
						if (eval != null) {
							grcField.enumValue.push(eval);
							addedValue = true;
						} else {
							message = "Attempt to add value of '" + attValue +
								"' to multi-enumerated field definition '" + fieldDef.name +
								"' was not allowed to object type '" + params.object + "'." +
								" The assembly line mapping will need to be modified.";
							logmsg("WARN", message);
							sendEmailNotification(message);
						}
					}
					break;
				case "DATE_TYPE":
					var dateValue;
					if (attValue instanceof java.util.Date) {
						dateValue = attValue;
					} else {
						dateValue = parseDateValue(attValue);
					}
					if (dateValue !== null) {
						// "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'" // works but TZ is not accurate

						// TDI 7.1.1 uses Java 6, so we cannot use format string "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"
						// (which *is* supported in Java 7 and newer). So, we are using format string
						// "yyyy-MM-dd'T'HH:mm:ss.SSSZ" and are manually inserting the colon into place at the
						// end of the string in the 4 digits that follow the last "-" or "+" character, and
						// (if present) we remove the ':' directly in front of the 'T'.
						// Example: convert 2013-10-07T07:36:13.000-0400 to 2013-10-07T07:36:13.000-04:00
						// Example: convert 2013-10-07:T07:36:13.000-0400 to 2013-10-07T07:36:13.000-04:00

						var sdf = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ");
						var timeDate = sdf.format(dateValue);
						timeDate = timeDate.replace(":T", "T");

						var timeDateStr = new java.lang.String(timeDate);
						var insertColonPos = timeDateStr.length() - 2;
						var firstPart = timeDateStr.substring(0, insertColonPos);
						var lastPart = timeDateStr.substring(insertColonPos, timeDateStr.length());

						grcField.value = new java.lang.String(firstPart + ":" + lastPart);
						addedValue = true;
					}
					break;
				case "CURRENCY_TYPE":
					// Mapping format required for a currency value in the feed must follow this example:
					//	  "123.45|AUD"
					// If no ISO code is supplied then the OP Base ISO code is used.

					var valueStr = new java.lang.String(attValue.trim());
					if (valueStr == "") {
						break;
					}

					var separatorIndex = valueStr.indexOf("|");
					var amount = "";
					var doubleVal = null;
					var isoCode = "";

					// parse out the amount and the ISO code from the provided attValue string
					if (separatorIndex !== -1) {
						amount = valueStr.substring(0, separatorIndex).trim();
						isoCode = valueStr.substring(separatorIndex + 1).trim();
					} else {
						amount = valueStr.trim();
					}

					// ensure that the amount is a valid double value
					try {
						doubleVal = java.lang.Double.parseDouble(amount);
					} catch (ex) {
						logmsg("ERROR", "Detected missing or invalid amount '" + amount + "' in the value " +
							"specified from the feed for CURRENCY_TYPE field '" + fieldDef.name +
							"'. Skipping this currency value.");
						break;
					}

					// ensure that the ISO code is not empty
					if (separatorIndex === -1 || isoCode === null || isoCode === "") {
						isoCode = params.defaultCurrencyIsoCode;
						logmsg("WARN", "Detected missing or invalid ISO code in the value " +
							"specified from the feed for CURRENCY_TYPE field '" + fieldDef.name +
							"'. Using the OpenPages default ISO code of '" + isoCode + "'.");
					}

					grcField.baseAmount = amount;
					grcField.localAmount = amount;

					// keep track of this field's ISO code for use when creating the JSON for OP
					feedProps.currencyIsoCodes.putIfAbsent(fieldDef.id, isoCode);

					addedValue = true;
					break;
			}
		} catch (ex) {
			inError.push(message["Error creating GRC field"] + " - " + ex + " --> " + att.toString());
		}
	}

	if (inError.length > 0) {
		throwException(toJson(inError));
	}

	if (addedValue) {
		field[field.length] = grcField;
	}

	return grcField;
}

function enumValue(attValue, fieldDef) {
	var enumValues = fieldDef.enumValues.enumValue;
	if (attValue == null) {
		return null;
	}

	attValue = attValue.trim();
	for (var i = enumValues.length - 1; i >= 0; i--) {
		var thisValue = enumValues[i];
		if (attValue.equalsIgnoreCase(thisValue.name) ||
			attValue.equalsIgnoreCase(thisValue.localizedLabel ||
				attValue.equalsIgnoreCase(thisValue.index))) {
			return {
				index: thisValue.index,
				hidden: thisValue.hidden,
				name: thisValue.name,
				id: thisValue.id,
				localizedLabel: thisValue.localizedLabel
			};
		}
	}

	return null;
}

function parseDateValue(attValue) {
	if (typeof attValue === "undefined" || attValue == null) {
		return null;
	}

	var dt = system.parseDate(attValue, "EEE MMM dd HH:mm:ss z yyyy");

	if (dt == null) {
		dt = system.parseDate(attValue, ISOdateMask1);
	}
	if (dt == null) {
		dt = system.parseDate(attValue, ISOdateMask2);
	}
	if (dt == null) {
		try {
			var df = java.text.DateFormat.getDateInstance();
			dt = df.parse(attValue);
		} catch (ex) {
			dt = null;
		}
	}

	return dt;
}

// requests the client cert from the service and installs it into the SDI keystore
function getCertificate() {
	com.ibm.di.security.GetSSLCertificate.installCertificateFrom(params.url, 443);
}

// examine the reply from OpenPages for any errors returned
function verifyResponse(replyEntry, url) {
	var respCode = replyEntry.getString("http.responseCode");
	if (respCode == "404") {
		// ignore NOT FOUND
	} else
	if (!respCode.startsWith("2")) {
		if (replyEntry.getString("http.bodyAsString").contains("-60002")) { // querying invalid object type
			logmsg(replyEntry.getString("http.bodyAsString") + " - for url: " + url);
			return;
		}
		throwException(message["Error from"] +
			" OpenPages server - code: " + respCode +
			"  message: " + replyEntry.getString("http.responseMsg") +
			"\nURL: " + url +
			"\nHTTP Body returned: " + replyEntry.getString("http.bodyAsString"));
	}
}

// Replaces \/ with /
function fixBody(body) {
	return String(body).replace(/\\\//g, "/");
	//	return String(body).replace(/[a-zA-Z0-9_.-]+(\\\/)[a-zA-Z0-9_.-]+/g, "/");
}

// workhorse function that handles all comms with OpenPages. It accepts a single
// argument that is a Javascript object containing the properties set in the first
// lines of the function. Note that many of these properties are optional and that
// default values are set by the script is not specified.
//
function makeRequest(args) {
	var verb = args.verb; // HTTP method, e.g. GET, POST, PUT, ...
	var url = args.url; // url for the request. May be partial (only the path & query string params)
	var body = args.body; // HTTP body to be passed for the request
	var ctype = args.ctype; // Content-Type of the HTTP body
	var where = args.where; // where this method is called from - for debugging purposes

	// set default values for missing params/properties
	if (verb == null) {
		verb = "GET";
	}
	if (url == null) {
		url = "";
	}
	if (ctype == null) {
		ctype = "application/json";
	}
	if (where == null) {
		where = "";
	}

	// prepend the base url if not found in the url passed to the function
	if (url.toLowerCase().indexOf(params.url.toLowerCase()) < 0) {
		url = params.url + params.fixPath(url);
	}

	requestEntry.removeAllAttributes();

	if (typeof body !== "undefined" && body !== null && body.trim().length > 0) {
		requestEntry["http.body"] = fixBody(body);
	}

	// set Connector parameters
	params.getHttp().setParam("method", verb.toUpperCase());
	params.getHttp().setParam("url", url);

	// prepare the request Entry (used for POST/PUT calls)
	requestEntry["http.Content-Type"] = ctype;
	requestEntry["http.Accept"] = "application/json";
	requestEntry["http.Connection"] = "keep-alive";
	requestEntry["http.remote_user"] = params.username;
	requestEntry["http.remote_pass"] = params.password;

	// the following are not used for now:
	//
	//	requestEntry["http.Accept-Encoding"] = "gzip, deflate";
	//	requestEntry["http.Accept-Language"] = "en-US,en;q=0.5";
	//	requestEntry["http.User-Agent"] = "IBM Security Directory Integrator";
	//	requestEntry["http.Authorization"] = "BASIC " + system.base64Encode(String(user + ":" + password).getBytes());

	// add any cookies received on previous calls
	if (cookies.size() > 0) {
		//		requestEntry["X-CouchDB-WWW-Authenticate"] = "Cookie";
		requestEntry.merge(cookies);
	}

	// if Detailed Log is enabled then write request details to the log
	if (params.deBug) {
		logDetails({
			msg: message["Request to"] + " OpenPages",
			obj: requestEntry,
			url: url,
			verb: verb,
			ctype: ctype,
			where: where
		});
	}

	var retry = 0;
	var maxRetry = 2;
	var retEntry = null;

	// this loop makes the actual request. If an SSL handshake error occurs, attempt to retrieve
	// and import the client certificate and inform the user that TDI must be restarted.
	//
	do {
		try {
			retEntry = params.getHttp().queryReply(requestEntry);
		} catch (ex) {
			if (ex instanceof javax.net.ssl.SSLHandshakeException && false) {
				if (retry == 0) {
					getCertificate();
				} else {
					throwException(message["You must restart the SDI server in order for the imported certificate to be trusted."])
				}
			} else {
				throw ex;
			}
		}
		/*
			// For some object types , template queries are different
			var code = retEntry.getString("http.responseCode");
			var msg = retEntry.getString("http.responseMsg");
			var p = url.indexOf("/template?typeId=");
			var body = retEntry.getString("http.bodyAsString");
			if(code == "400"
			&& body.contains("Bad Request - Document object template requires fileTypeId to be set.")
			&& p > 0 ){
				var p2 = url.lastIndexOf("=");
				url = url.substring(0,p) + "/" + url.substring(p2+1);
				params.getHttp().setParam("url", url);
				retEntry = null;
			}
		 */
		retry++;
	} while (retEntry === null && retry < maxRetry);

	// if Detailed Log is enabled, write reply details to the log
	if (params.deBug) {
		logDetails({
			"msg": message["Response from"] + " OpenPages",
			"entry": retEntry
		});
	}

	verifyResponse(retEntry, url);

	// parse the reply from OpenPages
	return parseReply(retEntry);
}

function parseReply(replyEntry) {
	var body = replyEntry.getString("http.bodyAsString");
	var code = replyEntry.getString("http.resultCode");

	if (body == null || body.trim().length == 0 || "404".equals(code)) {
		return;
	}

	try {
		//		if (params.deBug) logmsg("DEBUG", "body: " + body);
		var jobj = fromJson(body);

		// save any cookies passed back
		var setCookie = replyEntry.getAttribute("http.Set-Cookie");
		if (setCookie !== null) {
			for (var i = 0; i < setCookie.size(); i++) {
				var thisCookie = setCookie.getValue(i);
				var p = thisCookie.indexOf("=");
				if (p > 0) {
					cookies["http." + thisCookie.substring(0, p)] = thisCookie.substring(p + 1);
				}
			}
		}
	} catch (ex) {
		throwException(message["Unable to parse JSON return from"] + " OpenPages - " + ex);
	}

	return jobj;
}

// wrapper function for throwing exceptions. Otherwise exceptions thrown will be 'script' exceptions
function throwException(msg) {
	logmsg("ERROR", msg); // will also send an email notification
	throw new java.lang.IllegalArgumentException(msg);
}

// wrapper function for writing log messages
function logmsg(lvl, msg) {
	if (typeof lvl === "undefined") {
		lvl = "";
	}
	if (typeof msg === "undefined") {
		msg = lvl;
		lvl = "INFO";
	}

	// if Detailed Log is enabled then log output is also sent to the stdout
	if (params.deBug) {
		java.lang.System.out.println(msg);
	}

	try {
		task.logmsg(lvl, msg);
	} catch (ex) {
		main.logmsg(lvl, msg);
	}

	// send an email notification
	if (lvl === "ERROR") {
		sendEmailNotification(msg);
	}
}

// write request or reply details to the log
function logDetails(params) {
	var msg = params.msg;
	var obj = params.obj;
	var url = params.url;
	var verb = params.verb;
	var ctype = params.ctype;
	var where = params.where;

	if (msg == null) {
		msg = message["Unnamed entry"];
	}

	var s = new java.lang.StringBuffer();

	if (where != null) {
		s.append("\n@@@------> (" + where + ") " + msg);
	} else {
		s.append("\n---------> " + msg);
	}


	if (verb != null) {
		s.append("   " + verb.toUpperCase());
	}
	if (ctype != null) {
		s.append("   " + ctype);
	}
	if (url != null) {
		s.append("   " + url);
	}
	s.append("\n");

	if (obj != null) {
		if (obj instanceof com.ibm.di.entry.Entry) {
			var attNames = obj.getAttributeNames();
			for (var a in attNames) {
				// include all "http.*" attributes, except bodyAsBytes
				if (a.indexOf("http.") >= 0 &&
					!"http.bodyAsBytes".equalsIgnoreCase(a) &&
					!"http.remote_pass".equalsIgnoreCase(a)) {
					s += " " + a + ": " + obj[a] + "\n";
				}
			}
		} else {
			s.append(obj.toString());
		}
	}
	logmsg(s.toString());
}

function notInitializedError() {
	throwException("The OpenPages Connector must be initialized before use.");
}

/**
 * @return {null}
 */
function GrcObjectToEntry(jobj) {
	var entry = system.newEntry();
	var inError = [];
	var i;

	try {
		var type = null;

		var links = jobj.links;
		if (typeof links !== "undefined") {
			for (i = 0; i < links.length; i++) {
				if ("describedby".equals(links[i].rel.toLowerCase().trim())) {
					type = links[i].href.substring(9);
					var p = type.indexOf("?");
					type = type.substring(0, p);
				}
			}
			if (type !== null) {
				entry["$grcObjectType"] = type;
			}
		}

		var fields = jobj.fields ? jobj.fields.field : [];
		if (fields !== "undefined") {
			for (i = 0; i < fields.length; i++) {
				addGrcAttribute(entry, fields[i]);
			}
		}

		if (entry.size() > 0) {
			entry["$grcObject"] = jobj;
			entry["$grcObjectJSON"] = makeJson(jobj);
		}
	} catch (ex) {
		inError.push(message["Error parsing json from OpenPages"] + " - " + ex + "  -> " + makeJson(jobj));
	}

	if (inError.length > 0) {
		throwException(toJson(inError));
	}

	if (entry.size() === 0) {
		return null;
	} else {
		return entry;
	}
}

function addGrcAttribute(entry, field) {
	if (typeof field === "undefined" || field == null) {
		return;
	}

	var fieldName = field.name;
	var fieldValue = field.value;

	if (typeof fieldName !== "undefined" && fieldName != null && fieldName.trim().length > 0) {

		fieldName = fieldName.trim();

		try {
			switch (field.dataType) {
				case "STRING_TYPE":
				case "MEDIUM_STRING_TYPE":
				case "LARGE_STRING_TYPE":
				case "ID_TYPE":
				case "BOOLEAN_TYPE":
					if (fieldValue) {
						addAttributeValue(entry, fieldName, fieldValue);
					}
					break;
				case "FLOAT_TYPE": // Handles any floating point decimal value as a double value
					if (fieldValue) {
						var doubleVal = 0.0;
						try {
							doubleVal = java.lang.Double.parseDouble(fieldValue);
						} catch (ex) {
							doubleVal = "Error parsing floating point value: " + fieldValue;
						}
						addAttributeValue(entry, fieldName, doubleVal);
					}
					break;
				case "INTEGER_TYPE":
					if (fieldValue) {
						var intValue = 0;
						try {
							intValue = system.toInt(fieldValue);
						} catch (ex) {
							intValue = "Error parsing integer value: " + fieldValue;
						}
						addAttributeValue(entry, fieldName, intValue);
					} else {
						entry[fieldName] = null;
					}
					break;
				case "ENUM_TYPE":
					if (field.enumValue) {
						if (typeof field.enumValue.name !== "undefined") {
							addAttributeValue(entry, fieldName, field.enumValue.name);
						}

						if (field.enumValue.index) {
							addAttributeValue(entry, fieldName + "_index", field.enumValue.index);
						}
					}
					break;
				case "MULTI_VALUE_ENUM":
					if (typeof field.multiEnumValue !== "undefined") {
						var enums = field.multiEnumValue.enumValue;
						if (typeof enums !== "undefined" && enums.length > 0) {
							for (var i = 0; i < enums.length; i++) {
								addAttributeValue(entry, fieldName, enums[i].name, false);
							}
						}
					}
					break;
				case "DATE_TYPE":
					if (fieldValue) {
						if (fieldValue && fieldValue.endsWith("Z")) {
							fieldValue = fieldValue.substr(0, fieldValue.length - 1);
						}
						var dateValue = system.parseDate(fieldValue,
							"yyyy-MM-dd'T'HH:mm:ss.SSS");

						if (dateValue == null) {
							logmsg("WARN", message["Unable to parse DATE_TYPE value for"] + " " + fieldName + ": " + fieldValue);
						}
						addAttributeValue(entry, fieldName, dateValue);
					}
					break;
				case "CURRENCY_TYPE":
					addAmount(entry, fieldName, "", field.baseAmount, field.baseCurrency);
					addAmount(entry, fieldName, "_localAmount", field.localAmount, field.localCurrency);
					break;
			}
		} catch (ex) {
			if (params.deBug) logmsg("DEBUG", "--!!--> Error parsing GRC field: " + toJson(field) + " - " + ex);
		}
	}
}

function addAttributeValue(entry, attName, attValue, replace) {
	if (typeof attName === "undefined" || attName == null) {
		return;
	}

	if (typeof replace === "undefined" || !"false".equalsIgnoreCase(replace)) {
		replace = true;
	}

	if (typeof attValue === "undefined" || attValue == null) {
		entry[attName] = entry.returnJavaNull;
	} else if (replace) {
		entry.setAttribute(attName, attValue);
	} else {
		entry.addAttributeValue(attName, attValue);
	}
}

function addAmount(entry, attName, attSuffix, attValue, currency) {
	if (typeof attName === "undefined" || attName == null) {
		return;
	}

	var doubleVal;
	try {
		doubleVal = java.lang.Double.parseDouble(attValue);
	} catch (ex) {
		doubleVal = "Error parsing amount: " + attValue + " - " + ex;
	}

	addAttributeValue(entry, attName + attSuffix, doubleVal);

	if (typeof currency !== "undefined" && typeof currency.isoCode !== "undefined") {
		addAttributeValue(entry, attName + attSuffix + "_currency", currency.isoCode);
	}
}

function nl(pad) {
	if (params.deBug) {
		return "\n											".substring(0, (pad * 4) + 1);
	} else {
		return "";
	}
}

function makeEnumJson(enumVal) {
	var json = new java.lang.StringBuffer();

	json.append(nl(6) + '{"index" : ' + enumVal.index + ',' +
		nl(6) + '"hidden" : ' + enumVal.hidden + ',' +
		nl(6) + '"id" : "' + enumVal.id + '",' +
		nl(6) + '"name" : "' + enumVal.name + '",' +
		nl(6) + '"localizedLabel" : "' + enumVal.localizedLabel + '"}');

	return json.toString();
}

function makeCurrencyJson(field, prop) {
	var json = new java.lang.StringBuffer();

	// The baseCurrency and localCurrency properties contain properties of
	// their own; special handling is performed here
	if (prop == "baseCurrency" || prop == "localCurrency") {
		var thisField = field[prop];

		json.append('"' + prop + '" :' +
			nl(6) + '{"isoCode" : "' + thisField.isoCode + '",' +
			nl(6) + '"name" : "' + thisField.name + '",' +
			nl(6) + '"symbol" : "' + thisField.symbol + '",' +
			nl(6) + '"precision" : ' + thisField.precision + ',' +
			nl(6) + '"isBaseCurrency" : ' + thisField.isBaseCurrency + ',' +
			nl(6) + '"isEnabled" : ' + thisField.isEnabled + ',' +
			nl(6) + '"id" : "' + thisField.id + '"}');

		return json.toString();
	} else {
		// Ensure that the localAmount has a localCurrency, which is
		// required for setting or updating a currency amount in OP. It
		// gets added here automatically since the currency field definition
		// does not specify any metadata for the ISO code.
		var isoCode = feedProps.currencyIsoCodes.get(field.id);

		if (prop == "localAmount" && isoCode !== null) {

			json.append('"' + prop + '" : ' + field[prop] + ',' +
				nl(4) + '"localCurrency" : ' +
				nl(6) + '{"isoCode" : "' + isoCode + '"},');

			return json.toString();
		} else {
			// all other currency properties are 'simple'
			return '"' + prop + '" : ' + field[prop];
		}
	}
}

function makeValueJson(field, prop) {
	var json = new java.lang.StringBuffer();
	var thisField = field[prop];
	if ("MULTI_VALUE_ENUM".equals(field.dataType)) {
		json.append(nl(4) + '"multiEnumValue" : {' +
			nl(5) + '"enumValue" : [');
		for (var i = 0; i < thisField.length; i++) {
			json.append(makeEnumJson(thisField[i]) + ",");
		}
		json.setLength(json.length() - 1);
		json.append(nl(5) + "]" + nl(4) + "}");
	} else if ("ENUM_TYPE".equals(field.dataType)) {
		json.append(nl(4) + '"enumValue" : ' + makeEnumJson(thisField));
	} else if ("CURRENCY_TYPE".equals(field.dataType)) {
		json.append(nl(4) + makeCurrencyJson(field, prop));
	} else {
		json.append(nl(4) + '"value" : ' + toJson(thisField));
	}

	return json.toString();
}

function makeFieldsJson(fields) {
	var json = new java.lang.StringBuffer();

	for (var i = 0; i < fields.length; i++) {
		var field = fields[i];
		json.append(nl(3) + "{" +
			nl(4) + '"dataType" : "' + field.dataType + '",' +
			nl(4) + '"id" : "' + field.id + '",' +
			nl(4) + '"name" : "' + field.name + '",'
		);
		for (var prop in field) {
			if (!"dataType".equals(prop) &&
				!"id".equals(prop) &&
				!"name".equals(prop)) {
				json.append(makeValueJson(field, prop) + ",")
			}
		}
		json.setLength(json.length() - 1);
		json.append(nl(3) + "},");
	}

	if (json.length() > 0) {
		json.setLength(json.length() - 1);
	}
	return json.toString();
}

function makeJson(jobj) {
	if (connector.getParam("object").startsWith("file")) {
		return toJson(jobj);
	}

	return toJson(jobj); // EH I have short-circuited the logic of this function

	var trueJSON = toJson(jobj);

	// EH the code below looks crappy to me

	var json = new java.lang.StringBuffer("{");
	for (var prop in jobj) {
		if (typeof jobj[prop] !== "object") {
			json.append(nl(1) + '"' + prop + '" : "' + jobj[prop] + '",');
		}
	}

	json.append(nl(1) + '"fields" : { ' + nl(2) + '"field" : [');

	json.append(makeFieldsJson(jobj.fields.field));

	json.append(nl(2) + "]" + nl(1) + "}" + nl(0) + "}");

	var thisJSON = json.toString();

	//logmsg()

	return thisJSON;
}

function isPrimaryParentIdValid(id) {
	var isValid = false;
	var typeDefnId = null;
	var reply = null;

	if (params.deBug) logmsg("DEBUG", "Verifying that the specified parent id is valid: " + id);

	if (!id || id === "" || params.invalidPrimaryParentIds.contains(id)) {
		return false;
	}
	if (params.validPrimaryParentIds.contains(id)) {
		return true;
	}

	// the id must be a number
	try {
		system.toInt(id);
	} catch (e0) {
		params.invalidPrimaryParentIds.add(id);
		return false;
	}

	// The specified id is not yet known to the connector; try getting it to ensure it exists
	try {
// _timer.start("OpenPages Connector - isPrimaryParentIdValid()" );
		reply = makeRequest({
			"verb": "GET",
			url: "/contents/" + id,
			where: "isPrimaryParentIdValid"
		});
		typeDefnId = reply.typeDefinitionId;
	} catch (e1) {
		reply = null;
		if (params.deBug) logmsg("DEBUG", "Exception occurred; details:\n" + e1);
	}
// _timer.stop("OpenPages Connector - isPrimaryParentIdValid()" );

	if (reply === null || typeof reply.id === "undefined" || reply.id !== id) {
		isValid = false;
	}

	// Verify the object is a parent 'type' based on its typeDefinitionId and associations
	else {
		try {
// _timer.start("OpenPages Connector - isPrimaryParentIdValid()" );
			reply = makeRequest({
				"verb": "GET",
				url: "/types/" + params.object + "/associations/parents",
				where: "isPrimaryParentIdValid"
			});
		} catch (e2) {
			reply = null;
			isValid = false;
			if (params.deBug) logmsg("DEBUG", "Exception occurred; details:\n" + e2);
		}
// _timer.stop("OpenPages Connector - isPrimaryParentIdValid()" );

		// The entry with the matching id must have a relationship of "Parent"
		for (var i = 0; reply !== null && i < reply.length; i++) {
			if (reply[i].id === typeDefnId && reply[i].relationship.trim().toLowerCase() === "parent") {
				isValid = true;
				break;
			}
		}
	}

	if (isValid === true) {
		params.validPrimaryParentIds.add(id);
	} else {
		params.invalidPrimaryParentIds.add(id);
	}

	return isValid;
}

// Send an email if mail has been configured
function sendEmailNotification(error) {
	var didSend = false;
	var alreadySent = mailSettings.notificationsSent.contains(error);

	if (mailSettings.smtpHost != "" && alreadySent === false) {
		didSend = system.sendMail(mailSettings.mailFrom, mailSettings.mailTo,
			mailSettings.mailSubject,
			"Additional instances of this error will not be reported via email for the " +
			"current scheduled run.\n\nReported Issue:\n\n" + error,
			null);

		// remember this error to avoid mailing duplicates for this assembly line run
		mailSettings.notificationsSent.add(error);
		java.lang.Thread.sleep(100); // avoids overwhelming the SMTP server

		if (didSend !== null) {
			logmsg("WARN", "Attempt to send email was not successful for message [" + error + "]\n\tReason: " + didSend);
		}
	}
}

// Ancient history for this component
//
//var version = "20140910 1730" // started
//var version = "20140923 1830" // Added paged reads and fixed bugs with Brian Laskey
//var version = "20141001 1235" // Started work on putEntry
//var version = "20141002 1828" // getting Types and Templates now
//var version = "20141003 1111" // added uri root parameter
//var version = "20141007 1030" // iterator and add mode
//var version = "20141008 1344" // update mode started
//var version = "20141009 1710" // update mode working
//var version = "20141013 1421" // fixed GRC object creation
//var version = "20141013 2321" // added delete mode
//var version = "20141014 1412" // connector uses Type setting if typeDefinitionId not mapped for add operation
//var version = "20150617 1439" // added logic to process parent type and parent location properties
//var version = "20150619 1044" // added logic to process primaryParentId and prevent orphaned incidents
//var version = "20150625 1731" // added try/catch's for makeRequest()'s that did not yet have them
//var version = "20150714 1243" // added form fields and logic for sending email notifications from connectors
//var version = "20150717 1520" // Corrected the REST api call to confirm the parent association
//var version = "20150730 1335" // Extended logic that processes date/time values to use another format string
//var version = "20150805 1718" // Converted over to using connector.properties file
//var version = "20150807 1503" // Re-worked WARN messages regarding properties for invalid primaryParentId to also send email notification
//var version = "20150812 1337" // Restored original date/time format string and adjusted the logic to format it
//var version = "20150826 1332" // Added dynamic derivation of primaryParentId using mapped properties for parent type and location
//var version = "20150904 1155" // Enhanced currency handling to take a value and its associated ISO code
//var version = "20151102 1410" // Added support for: BOOLEAN_TYPE, FLOAT_TYPE, MEDIUM_STRING_TYPE, LARGE_STRING_TYPE
//var version = "20160421 1710" //Added plave holder for the future change of ucf_integration
//var version = "20160801 1210" //Added logic segment that merge all citation parents' guidence value for ucf_integration - control
//var version = "20160812 1050";  //Added logic segment that retrive all control parents' information for ucf_integration - control
//var version = "20200527 1136";  //Replaced ConcurrentHashMaps with HashMaps and fixed Connect/Next from CE
//var version = "20200529 1403";  //Connector now returns new Resource ID in conn Entry for adds (putEntry) - can access in After Add Hook
//var version = "20200502 1351"; // Added support for writing files (word, excel, etc)
//var version = "20200602 1456"; // Handling file types correctly now when adding as attachments to OpenPages
//var version = "20200604 2046"; // Fixed bug in entrytoGrcObject thanks to Blade
//var version = "20200605 1638"; // putEntry returns new Resource ID
//var version = "20200609 1903"; // made putEntry store the entire newly created entry (response from add) in the last_conn variable
//var version = "20200610 2018"; // trying to add support for complex queries (i.e. PARENT or CHILD joins)
//var version = "20200615 1544"; // fixed putEntry for adding objectType file so default is word doc
//var version = "20200625 1249"; // Added params.refresh() to start of ensureInitialized() function
//var version = "20200625 1300"; // Changed addGrcSystemField to not null out the typeDefinitionId property of grcObj
//var version = "20200625 1309"; // parseReply() now ignores the body if the http.resultCode is 404
//var version = "20200625 1346"; // fixed double incrementing of this.index in resultSet.next function