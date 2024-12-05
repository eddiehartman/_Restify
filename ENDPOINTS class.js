// ENDPOINTS class to parse the schema object
var ENDPOINTS = function(args) {
	_WHERE = "ENDPOINTS class";	// Global variable available for error reporting
	this.name = "ENDPOINTS";

	this.schema = args.openAPIschema || {};
	this.api = args.api || null;
	this.hm = new java.util.HashMap();
	this.resources = {};
	this.paths = {};
	this.uriList = system.splitString("", "");	// Empty array
	this.config = {};

	
	// Main processing starts here
	if (!this.api || this.schema == {}) {
		throw "ENDPOINTS constructure requires the OpenAPI schema and instantiated API object"
	}
	
	// Get the various URIs and parse into parts to analyze
	for (var uri in this.schema) {
		var arr = this.hm.get(uri);
		if (arr == null) {
			arr = [];
			this.hm.put(uri.substring(1), arr)
		}
		arr.push(this.schema[uri])
	}

	// Set up a sorted array of the paths returned
	this.uriList = this.hm.keySet().toArray();
	java.util.Arrays.sort(this.uriList);
	
	// The next step is to create
	
	// Now to parse each to retrieve the first part of the base - the resource item type
	for (var uri in this.uriList) {
		var parts = system.splitString(uri, "/");
		var type = parts[0].trim();
		for (var i = 1; i < parts.length; i++) {
			var bit = parts[i].trim();
			// Check if it's an identifier
			if (bit.startWith("{") && bit.endsWith("}")) {
				
			}
		}
	}
	
	
	// check it
	var keys = hm.keySet().toArray();
	java.util.Arrays.sort(keys);
	for (var key in keys) {
		task.logmsg("-----> " + key)
	}
	
	return hm
}