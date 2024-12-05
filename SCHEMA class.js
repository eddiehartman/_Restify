// The SCHEMA class is handy for requesting and parsing OpenAPI schema to a JS object for analysis
var SCHEMA = function(schemaStr, format) {
	_WHERE = "SCHEMA class";	// Global variable available for error reporting
	this.name = "SCHEMA";
	
	// Main init logic after method definitions

    // The name says it all. Returns a JS Obj
    this.parseOpenAPISchema = function(openApiSchema) {
		// Not sure if this is necessary
        openApiSchema = openApiSchema.trim();

        // Load Jackson libraries
        var ObjectMapper = com.fasterxml.jackson.databind.ObjectMapper;
        var objectMapper = new ObjectMapper();

        // Check if YAML and if so, convert to Json
        if ("YAML".equalsIgnoreCase(this.format)) {
            // Use SnakeYAML to convert the YAML to a map that the ObjectMapper can read
            var Yaml = Packages.org.yaml.snakeyaml.Yaml;
            // Create instances of Yaml and ObjectMapper
            var yaml = new Yaml();
            // Parse YAML into a Java Map
            var map = yaml.load(openApiSchema);

            // Convert Java Map to JSON string
            var jsonString = objectMapper.writeValueAsString(map)
        } else {
            jsonString = openApiSchema;
        }

        this.schemaObj = fromJson(jsonString);
        return this.schemaObj
    }

    // Returns the child elements (JS Obj) of the specified path
    // Root level if no argument or blank text passed
    this.getChildren = function(path) { 
        var children = {};
        var parent;
        
        if (!path) {
        	path = []
        }
        else 
        if (!(path instanceof Array)) {
        	path = [path]	
        }
        
        parent = this.schemaObj[path[0]];
        for (var i = 1; i < path.length && parent; i++) {
        	parent = parent[path[i]];
        }

		if (parent) {
			for (var child in parent) {
				children[child] = parent[child]
			}
		}

        return children;
    }
    
    // Main init logic
    this.schemaStr = schemaStr;
    this.format = format || "YAML";
    this.schemaObj = this.parseOpenAPISchema(schemaStr)
}