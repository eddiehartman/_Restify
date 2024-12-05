// The API class is handy for handling OpenAPI schema
var API = function(schemaStr) {
    this.schemaStr = schemaStr;
    this.apiObj = parseOpenAPISchema(schemaStr);

    // Returns the child elements of the specified path
    // Root level if no argument or blank text passed
    this.getChildren = function(path) {
        
    }
}